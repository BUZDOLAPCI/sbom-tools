#!/usr/bin/env node

import { createStandaloneServer } from './server.js';
import { getConfig } from './config.js';

function printHelp(): void {
  console.log(`
sbom-tools - SBOM Tools MCP Server

Usage: sbom-tools [options]

Options:
  --stdio              Use stdio transport instead of HTTP
  --transport=<type>   Set transport type: 'http' (default) or 'stdio'
  --port=<number>      Set HTTP port (default: 8080)
  --help, -h           Show this help message

By default, the server starts in HTTP mode on port 8080.
`);
}

async function main(): Promise<void> {
  const config = getConfig();

  // Parse command line arguments
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Determine transport: --stdio flag takes precedence, then --transport=, then config default
  let transport: 'stdio' | 'http' = config.TRANSPORT as 'stdio' | 'http';
  if (args.includes('--stdio')) {
    transport = 'stdio';
  } else {
    const transportArg = args.find((arg) => arg.startsWith('--transport='));
    if (transportArg) {
      transport = transportArg.split('=')[1] as 'stdio' | 'http';
    }
  }

  const { stop } = await createStandaloneServer({ transport });

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
