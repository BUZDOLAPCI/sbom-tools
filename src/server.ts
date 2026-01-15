import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getConfig } from './config.js';
import { sbomFromDependencies, sbomMerge, sbomDiff } from './tools/index.js';
import {
  SbomFromDependenciesInputSchema,
  SbomMergeInputSchema,
  SbomDiffInputSchema,
} from './types.js';

/**
 * Create and configure the MCP server with all SBOM tools
 */
export function createServer(): Server {
  const config = getConfig();

  const server = new Server(
    {
      name: config.SERVER_NAME,
      version: config.SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
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
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const timestamp = new Date().toISOString();

    try {
      switch (name) {
        case 'sbom_from_dependencies': {
          const parseResult = SbomFromDependenciesInputSchema.safeParse(args);
          if (!parseResult.success) {
            return {
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
                      retrieved_at: timestamp,
                    },
                  }),
                },
              ],
            };
          }
          const result = sbomFromDependencies(parseResult.data.deps, parseResult.data.format);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }

        case 'sbom_merge': {
          const parseResult = SbomMergeInputSchema.safeParse(args);
          if (!parseResult.success) {
            return {
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
                      retrieved_at: timestamp,
                    },
                  }),
                },
              ],
            };
          }
          const result = sbomMerge(parseResult.data.sboms, parseResult.data.format);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }

        case 'sbom_diff': {
          const parseResult = SbomDiffInputSchema.safeParse(args);
          if (!parseResult.success) {
            return {
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
                      retrieved_at: timestamp,
                    },
                  }),
                },
              ],
            };
          }
          const result = sbomDiff(parseResult.data.old_sbom, parseResult.data.new_sbom);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: {
                    code: 'INVALID_INPUT',
                    message: `Unknown tool: ${name}`,
                    details: {},
                  },
                  meta: {
                    retrieved_at: timestamp,
                  },
                }),
              },
            ],
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'INTERNAL_ERROR',
                message,
                details: {},
              },
              meta: {
                retrieved_at: timestamp,
              },
            }),
          },
        ],
      };
    }
  });

  return server;
}
