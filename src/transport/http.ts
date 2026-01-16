import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';

interface HttpTransportOptions {
  port?: number;
  host?: string;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: Server;
}

// Session store for MCP connections
const sessions = new Map<string, Session>();

/**
 * Start the HTTP transport for the MCP server
 * Uses raw Node.js HTTP server with StreamableHTTPServerTransport for MCP SDK compatibility
 */
export function startHttpTransport(
  createMcpServer: () => Server,
  options: HttpTransportOptions = {}
): { server: HttpServer; stop: () => Promise<void> } {
  const config = getConfig();
  const port = options.port ?? config.HTTP_PORT;
  const host = options.host ?? config.HTTP_HOST;

  const httpServer = createHttpServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    switch (url.pathname) {
      case '/mcp':
        await handleMcpRequest(req, res, createMcpServer);
        break;
      case '/health':
        handleHealthCheck(res);
        break;
      default:
        handleNotFound(res);
    }
  });

  httpServer.listen(port, host, () => {
    console.error(`HTTP server listening on http://${host}:${port}`);
    console.error(`MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`Health check: http://${host}:${port}/health`);
  });

  const stop = async (): Promise<void> => {
    // Close all active sessions
    for (const [sessionId, session] of sessions) {
      try {
        await session.transport.close();
        await session.server.close();
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
    }
    sessions.clear();

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
 * Handle MCP protocol requests
 * Uses StreamableHTTPServerTransport for proper MCP SDK compatibility
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: () => Server
): Promise<void> {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Get or create session
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (req.method === 'POST') {
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      // Create new session
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      const server = createMcpServer();

      // Connect server to transport
      await server.connect(transport);

      session = { transport, server };
      sessions.set(newSessionId, session);

      // Set session ID in response header
      res.setHeader('mcp-session-id', newSessionId);
    }

    // Handle the request using the transport
    // StreamableHTTPServerTransport.handleRequest expects raw Node.js req/res
    await session.transport.handleRequest(req, res);
  } else if (req.method === 'GET') {
    // SSE endpoint for server-to-client notifications
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid or missing session ID for SSE connection',
        },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      }));
    }
  } else if (req.method === 'DELETE') {
    // Close session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.close();
        await session.server.close();
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
      sessions.delete(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        data: { message: 'Session closed' },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      }));
    }
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed. Use POST, GET, or DELETE.',
      },
      meta: {
        retrieved_at: new Date().toISOString(),
      },
    }));
  }
}

/**
 * Handle health check requests
 */
function handleHealthCheck(res: ServerResponse): void {
  const config = getConfig();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    data: {
      status: 'healthy',
      server: config.SERVER_NAME,
      version: config.SERVER_VERSION,
      activeSessions: sessions.size,
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  }));
}

/**
 * Handle 404 not found
 */
function handleNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found. Available endpoints: /mcp, /health',
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  }));
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
    // Import createServer dynamically to avoid circular dependency
    const { createServer: createMcpServer } = await import('../server.js');
    const { stop } = startHttpTransport(createMcpServer, options);
    stopFn = stop;
  };

  const stop = async (): Promise<void> => {
    if (stopFn) {
      await stopFn();
    }
  };

  return { start, stop };
}
