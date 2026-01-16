import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { getConfig } from '../config.js';
import { sbomFromDependencies, sbomMerge, sbomDiff } from '../tools/index.js';
import {
  SbomFromDependenciesInputSchema,
  SbomMergeInputSchema,
  SbomDiffInputSchema,
} from '../types.js';

/**
 * MCP JSON-RPC request
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Tool definition
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface HttpTransportOptions {
  port?: number;
  host?: string;
}

/**
 * Tool definitions for MCP tools/list response
 */
const toolDefinitions: ToolDefinition[] = [
  {
    name: 'sbom_from_dependencies',
    description:
      'Create an SBOM (Software Bill of Materials) from a list of dependencies. Supports CycloneDX 1.5 and SPDX 2.3 formats.',
    inputSchema: {
      type: 'object',
      properties: {
        deps: {
          type: 'array',
          description: 'List of dependencies to include in the SBOM',
          items: {
            type: 'object',
            properties: {
              ecosystem: {
                type: 'string',
                description: 'Package ecosystem (e.g., npm, pypi, maven, cargo)',
              },
              name: {
                type: 'string',
                description: 'Package name',
              },
              version: {
                type: 'string',
                description: 'Package version',
              },
              license: {
                type: 'string',
                description: 'SPDX license identifier (optional)',
              },
            },
            required: ['ecosystem', 'name', 'version'],
          },
          minItems: 1,
        },
        format: {
          type: 'string',
          enum: ['cyclonedx', 'spdx'],
          description: 'Output SBOM format',
        },
      },
      required: ['deps', 'format'],
    },
  },
  {
    name: 'sbom_merge',
    description:
      'Merge multiple SBOMs into one, deduplicating components by name and version. Can merge SBOMs of different formats.',
    inputSchema: {
      type: 'object',
      properties: {
        sboms: {
          type: 'array',
          description: 'List of SBOMs to merge (CycloneDX or SPDX format)',
          items: {
            type: 'object',
          },
          minItems: 1,
        },
        format: {
          type: 'string',
          enum: ['cyclonedx', 'spdx'],
          description: 'Output SBOM format',
        },
      },
      required: ['sboms', 'format'],
    },
  },
  {
    name: 'sbom_diff',
    description:
      'Compare two SBOMs and return the differences: added components, removed components, and version changes.',
    inputSchema: {
      type: 'object',
      properties: {
        old_sbom: {
          type: 'object',
          description: 'The old/baseline SBOM to compare from',
        },
        new_sbom: {
          type: 'object',
          description: 'The new SBOM to compare to',
        },
      },
      required: ['old_sbom', 'new_sbom'],
    },
  },
];

/**
 * Handle a single JSON-RPC request
 */
async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;
  const config = getConfig();

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: config.SERVER_NAME,
              version: config.SERVER_VERSION,
            },
          },
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: toolDefinitions,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const args = params?.arguments as Record<string, unknown>;

        let result: unknown;

        switch (toolName) {
          case 'sbom_from_dependencies': {
            const parseResult = SbomFromDependenciesInputSchema.safeParse(args);
            if (!parseResult.success) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        ok: false,
                        error: {
                          code: 'INVALID_INPUT',
                          message: 'Invalid input parameters',
                          details: parseResult.error.flatten(),
                        },
                        meta: {
                          retrieved_at: new Date().toISOString(),
                        },
                      }),
                    },
                  ],
                },
              };
            }
            result = sbomFromDependencies(parseResult.data.deps, parseResult.data.format);
            break;
          }

          case 'sbom_merge': {
            const parseResult = SbomMergeInputSchema.safeParse(args);
            if (!parseResult.success) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        ok: false,
                        error: {
                          code: 'INVALID_INPUT',
                          message: 'Invalid input parameters',
                          details: parseResult.error.flatten(),
                        },
                        meta: {
                          retrieved_at: new Date().toISOString(),
                        },
                      }),
                    },
                  ],
                },
              };
            }
            result = sbomMerge(parseResult.data.sboms, parseResult.data.format);
            break;
          }

          case 'sbom_diff': {
            const parseResult = SbomDiffInputSchema.safeParse(args);
            if (!parseResult.success) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        ok: false,
                        error: {
                          code: 'INVALID_INPUT',
                          message: 'Invalid input parameters',
                          details: parseResult.error.flatten(),
                        },
                        meta: {
                          retrieved_at: new Date().toISOString(),
                        },
                      }),
                    },
                  ],
                },
              };
            }
            result = sbomDiff(parseResult.data.old_sbom, parseResult.data.new_sbom);
            break;
          }

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
              },
            };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    };
  }
}

/**
 * Read the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(res: ServerResponse): void {
  const config = getConfig();
  sendJson(res, 200, {
    ok: true,
    data: {
      status: 'healthy',
      server: config.SERVER_NAME,
      version: config.SERVER_VERSION,
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  });
}

/**
 * Handle not found
 */
function handleNotFound(res: ServerResponse): void {
  sendJson(res, 404, {
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found. Available endpoints: /mcp, /health',
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  });
}

/**
 * Handle method not allowed
 */
function handleMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, {
    ok: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed',
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  });
}

/**
 * Handle MCP JSON-RPC endpoint
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const request: JsonRpcRequest = JSON.parse(body);

    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      sendJson(res, 400, {
        jsonrpc: '2.0',
        id: request.id || 0,
        error: {
          code: -32600,
          message: 'Invalid Request: missing or invalid jsonrpc version',
        },
      });
      return;
    }

    const response = await handleJsonRpcRequest(request);
    sendJson(res, 200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    });
  }
}

/**
 * Create and configure the HTTP server
 */
export function createHttpServer(): Server {
  const httpServer = createServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    const method = req.method?.toUpperCase();

    try {
      switch (url.pathname) {
        case '/mcp':
          if (method === 'POST') {
            await handleMcpRequest(req, res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        case '/health':
          if (method === 'GET') {
            handleHealthCheck(res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        default:
          handleNotFound(res);
      }
    } catch (error) {
      console.error('Server error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      });
    }
  });

  return httpServer;
}

/**
 * Start the HTTP transport for the MCP server
 * Uses stateless JSON-RPC handling - no sessions required
 */
export function startHttpTransport(
  _createMcpServer?: () => unknown,
  options: HttpTransportOptions = {}
): { server: Server; stop: () => Promise<void> } {
  const config = getConfig();
  const port = options.port ?? config.HTTP_PORT;
  const host = options.host ?? config.HTTP_HOST;

  const httpServer = createHttpServer();

  httpServer.listen(port, host, () => {
    console.error(`HTTP server listening on http://${host}:${port}`);
    console.error(`MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`Health check: http://${host}:${port}/health`);
  });

  const stop = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  return { server: httpServer, stop };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use startHttpTransport instead
 */
export function createHttpTransport(
  options: HttpTransportOptions = {}
): { start: () => Promise<void>; stop: () => Promise<void> } {
  let stopFn: (() => Promise<void>) | null = null;

  const start = async (): Promise<void> => {
    const { stop } = startHttpTransport(undefined, options);
    stopFn = stop;
  };

  const stop = async (): Promise<void> => {
    if (stopFn) {
      await stopFn();
    }
  };

  return { start, stop };
}
