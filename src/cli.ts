#!/usr/bin/env node

import { createServer } from './server.js';
import { createStdioTransport, createHttpTransport } from './transport/index.js';
import { getConfig } from './config.js';

async function main(): Promise<void> {
  const config = getConfig();
  const server = createServer();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const transportArg = args.find((arg) => arg.startsWith('--transport='));
  const transport = transportArg
    ? transportArg.split('=')[1]
    : config.TRANSPORT;

  if (transport === 'http') {
    const httpTransport = createHttpTransport();
    await httpTransport.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.error('Shutting down...');
      await httpTransport.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    // Default to stdio transport
    const stdioTransport = createStdioTransport();
    await server.connect(stdioTransport);

    // Log to stderr to avoid interfering with stdio transport
    console.error(`${config.SERVER_NAME} v${config.SERVER_VERSION} running on stdio`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
