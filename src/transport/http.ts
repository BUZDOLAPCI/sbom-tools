import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { getConfig } from '../config.js';

interface HttpTransportOptions {
  port?: number;
  host?: string;
}

/**
 * Simple HTTP transport for the MCP server
 * This provides a basic HTTP endpoint for tool invocations
 */
export function createHttpTransport(
  options: HttpTransportOptions = {}
): { start: () => Promise<void>; stop: () => Promise<void> } {
  const config = getConfig();
  const port = options.port ?? config.HTTP_PORT;
  const host = options.host ?? config.HTTP_HOST;

  let httpServer: ReturnType<typeof createServer> | null = null;

  const start = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'Only POST method is allowed',
            },
            meta: {
              retrieved_at: new Date().toISOString(),
            },
          }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          JSON.parse(body); // Validate JSON

          // The HTTP transport is a simplified interface
          // For full MCP compliance, use stdio transport
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            data: { message: 'HTTP transport is for basic health checks. Use stdio for full MCP functionality.' },
            meta: {
              retrieved_at: new Date().toISOString(),
            },
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: {
              code: 'PARSE_ERROR',
              message: `Failed to parse request: ${message}`,
            },
            meta: {
              retrieved_at: new Date().toISOString(),
            },
          }));
        }
      });

      httpServer.on('error', reject);
      httpServer.listen(port, host, () => {
        console.error(`HTTP server listening on http://${host}:${port}`);
        resolve();
      });
    });
  };

  const stop = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (httpServer) {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  };

  return { start, stop };
}
