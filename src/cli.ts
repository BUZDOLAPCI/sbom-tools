#!/usr/bin/env node

import { startHttpTransport } from './transport/http.js';
import { createServer } from './server.js';

function printHelp(): void {
  console.log(`
sbom-tools - SBOM Tools MCP Server

Usage: sbom-tools [options]

Options:
  --port=<number>      Set HTTP port (default: 8080)
  --help, -h           Show this help message

The server runs in HTTP-only mode on port 8080 by default.
MCP endpoint: /mcp
Health check: /health
`);
}

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Parse port from arguments
  let port = 8080;
  const portArg = args.find((arg) => arg.startsWith('--port='));
  if (portArg) {
    const parsedPort = parseInt(portArg.split('=')[1], 10);
    if (!isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  }

  // Start HTTP server directly
  const { stop } = startHttpTransport(createServer, { port });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down...');
    await stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
