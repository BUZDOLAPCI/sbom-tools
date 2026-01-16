import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { startHttpTransport } from '../../src/transport/http.js';
import { createServer } from '../../src/server.js';
import { Server as HttpServer } from 'node:http';

describe('HTTP Transport /mcp endpoint', () => {
  let httpServer: HttpServer | undefined;
  let stopServer: (() => Promise<void>) | undefined;
  let currentPort = 18080;

  // Use a different port for each test to avoid conflicts
  beforeEach(() => {
    currentPort += 1;
  });

  afterEach(async () => {
    if (stopServer) {
      try {
        await stopServer();
      } catch {
        // Ignore errors when stopping
      }
      stopServer = undefined;
      httpServer = undefined;
    }
    // Give time for port to be released
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  async function startServer(port: number): Promise<{ httpServer: HttpServer; stop: () => Promise<void> }> {
    const result = startHttpTransport(createServer, { port, host: '127.0.0.1' });
    httpServer = result.server;
    stopServer = result.stop;

    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      if (httpServer!.listening) {
        resolve();
      } else {
        httpServer!.once('listening', resolve);
      }
    });

    return result;
  }

  it('should start HTTP server and expose /mcp endpoint', async () => {
    const { server } = await startServer(currentPort);
    expect(server.listening).toBe(true);
  });

  it('should respond to initialize request on /mcp', async () => {
    await startServer(currentPort);

    // Send an initialize request to establish the session
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    const initResponse = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(initRequest),
    });

    // The response should be successful (2xx status)
    expect(initResponse.status).toBeGreaterThanOrEqual(200);
    expect(initResponse.status).toBeLessThan(300);

    // Get session ID from the initialize response
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
  });

  it('should handle CORS preflight requests', async () => {
    await startServer(currentPort);

    const response = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('should respond to health check endpoint', async () => {
    await startServer(currentPort);

    const response = await fetch(`http://127.0.0.1:${currentPort}/health`);

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.server).toBe('sbom-tools');
  });

  it('should return 404 for unknown endpoints', async () => {
    await startServer(currentPort);

    const response = await fetch(`http://127.0.0.1:${currentPort}/unknown`);

    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('should complete full MCP handshake and list tools', async () => {
    await startServer(currentPort);

    // Step 1: Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    const initResponse = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(initRequest),
    });

    expect(initResponse.status).toBeGreaterThanOrEqual(200);
    expect(initResponse.status).toBeLessThan(300);

    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Read the response to ensure the initialize completes
    const initText = await initResponse.text();
    expect(initText).toBeTruthy();

    // Step 2: Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };

    const notifResponse = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify(initializedNotification),
    });

    // Notification responses can be 202 Accepted or similar
    expect(notifResponse.status).toBeGreaterThanOrEqual(200);
    expect(notifResponse.status).toBeLessThan(300);

    // Step 3: Send tools/list request
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    const toolsResponse = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify(toolsRequest),
    });

    expect(toolsResponse.status).toBeGreaterThanOrEqual(200);
    expect(toolsResponse.status).toBeLessThan(300);

    const toolsText = await toolsResponse.text();
    expect(toolsText).toBeTruthy();

    // Parse the response - may be in SSE or JSON format
    let foundTools = false;
    const lines = toolsText.split('\n');

    for (const line of lines) {
      // Handle SSE format (data: prefix)
      const jsonLine = line.startsWith('data: ') ? line.slice(6) : line;
      if (!jsonLine.trim()) continue;

      try {
        const parsed = JSON.parse(jsonLine);
        if (parsed.result && parsed.result.tools) {
          foundTools = true;
          expect(Array.isArray(parsed.result.tools)).toBe(true);

          const toolNames = parsed.result.tools.map((t: { name: string }) => t.name);
          expect(toolNames).toContain('sbom_from_dependencies');
          expect(toolNames).toContain('sbom_merge');
          expect(toolNames).toContain('sbom_diff');
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    expect(foundTools).toBe(true);
  }, 15000); // Increase timeout for this test
});
