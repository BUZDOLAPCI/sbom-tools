#!/usr/bin/env node

import { createStandaloneServer } from './server.js';
import { getConfig } from './config.js';

async function main(): Promise<void> {
  const config = getConfig();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const transportArg = args.find((arg) => arg.startsWith('--transport='));
  const transport = transportArg
    ? (transportArg.split('=')[1] as 'stdio' | 'http')
    : (config.TRANSPORT as 'stdio' | 'http');

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
