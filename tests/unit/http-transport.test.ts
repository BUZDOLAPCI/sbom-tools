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

    // Send an initialize request (stateless - no session required)
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
      },
      body: JSON.stringify(initRequest),
    });

    // The response should be successful (2xx status)
    expect(initResponse.status).toBe(200);

    const data = await initResponse.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result).toBeDefined();
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('sbom-tools');
  });

  it('should return 405 for non-POST methods on /mcp', async () => {
    await startServer(currentPort);

    const response = await fetch(`http://127.0.0.1:${currentPort}/mcp`, {
      method: 'GET',
    });

    expect(response.status).toBe(405);
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

  it('should complete full MCP handshake and list tools (stateless)', async () => {
    await startServer(currentPort);

    // Step 1: Send initialize request (stateless - no session tracking needed)
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
      },
      body: JSON.stringify(initRequest),
    });

    expect(initResponse.status).toBe(200);
    const initData = await initResponse.json();
    expect(initData.result).toBeDefined();
    expect(initData.result.protocolVersion).toBe('2024-11-05');

    // Step 2: Send tools/list request (stateless - no session header needed)
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
      },
      body: JSON.stringify(toolsRequest),
    });

    expect(toolsResponse.status).toBe(200);

    const toolsData = await toolsResponse.json();
    expect(toolsData.jsonrpc).toBe('2.0');
    expect(toolsData.id).toBe(2);
    expect(toolsData.result).toBeDefined();
    expect(toolsData.result.tools).toBeDefined();
    expect(Array.isArray(toolsData.result.tools)).toBe(true);

    const toolNames = toolsData.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('sbom_from_dependencies');
    expect(toolNames).toContain('sbom_merge');
    expect(toolNames).toContain('sbom_diff');
  });
});
