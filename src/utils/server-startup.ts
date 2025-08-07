import { exec } from 'child_process';
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
    
    // Try to open the URL in the default browser
    openInBrowser(authUrl, logger);
  } else {
    logger.info(`🚀 Server listening on ${serverUrl}`);
    logger.info('Authentication is disabled (--skip-auth-token)');
    
    // Open without token when auth is disabled
    openInBrowser(serverUrl, logger);
  }
}

/**
 * Open URL in the default browser
 */
export function openInBrowser(url: string, logger: Logger): void {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "" "${url}"`;
      break;
    default: // Linux and others
      command = `xdg-open "${url}"`;
      break;
  }

  exec(command, (error) => {
    if (error) {
      logger.debug('Failed to open browser automatically', { error: error.message });
    } else {
      logger.debug('Opened URL in browser', { url });
    }
  });
}
