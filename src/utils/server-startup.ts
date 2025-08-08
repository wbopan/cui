import { Logger } from '../services/logger.js';

export interface ServerStartupOptions {
  host: string;
  port: number;
  authToken?: string;
  skipAuthToken?: boolean;
  logger: Logger;
}

/**
 * Display server startup information with rocket emoji and open browser
 */
export function displayServerStartup(options: ServerStartupOptions): void {
  const { host, port, authToken, skipAuthToken, logger } = options;
  const serverUrl = `http://${host}:${port}`;
  const authUrl = `http://127.0.0.1:${port}#token=${authToken}`;

  if (!skipAuthToken && authToken) {
    logger.info(`🚀 Server listening on ${serverUrl}`);
    logger.info(`🔗 Access with auth token: ${authUrl}`);
  } else {
    logger.info(`🚀 Server listening on ${serverUrl}`);
    logger.info('Authentication is disabled (--skip-auth-token)');
  }
}

 
