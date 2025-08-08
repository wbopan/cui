#!/usr/bin/env node
import { CUIServer } from './cui-server.js';
import { createLogger } from './services/logger.js';
import { parseArgs } from './cli-parser.js';

const logger = createLogger('Server');

let globalServer: CUIServer | null = null;

async function main() {
  const cliConfig = parseArgs(process.argv);
  globalServer = new CUIServer(cliConfig);
  
  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (globalServer) {
      await globalServer.stop();
    }
    process.exit(0);
  };
  
  // Set up signal handlers before starting server
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  try {
    await globalServer.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});