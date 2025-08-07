import { createLogger } from './services/logger.js';

export interface CLIConfig {
  port?: number;
  host?: string;
  token?: string;
  skipAuthToken?: boolean;
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[]): CLIConfig {
  const logger = createLogger('CLIParser');
  const args = argv.slice(2);
  const config: CLIConfig = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--port':
        if (i + 1 < args.length) {
          const portValue = parseInt(args[++i], 10);
          if (!isNaN(portValue) && portValue > 0 && portValue <= 65535) {
            config.port = portValue;
          } else {
            logger.error(`Invalid port value: ${args[i]}`);
            process.exit(1);
          }
        } else {
          logger.error('--port requires a value');
          process.exit(1);
        }
        break;
        
      case '--host':
        if (i + 1 < args.length) {
          config.host = args[++i];
        } else {
          logger.error('--host requires a value');
          process.exit(1);
        }
        break;
        
      case '--token':
        if (i + 1 < args.length) {
          config.token = args[++i];
        } else {
          logger.error('--token requires a value');
          process.exit(1);
        }
        break;
        
      case '--skip-auth-token':
        config.skipAuthToken = true;
        break;
        
      default:
        logger.error(`Unknown argument: ${arg}`);
        logger.info('Usage: cui-server [--port <number>] [--host <string>] [--token <string>] [--skip-auth-token]');
        process.exit(1);
    }
  }
  
  return config;
}