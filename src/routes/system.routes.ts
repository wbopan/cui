import { Router } from 'express';
import { SystemStatusResponse, CUIError, CommandsResponse } from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { ClaudeProcessManager } from '@/services/claude-process-manager.js';
import { ClaudeHistoryReader } from '@/services/claude-history-reader.js';
import { createLogger, type Logger } from '@/services/logger.js';
import { getAvailableCommands } from '@/services/commands-service.js';
import { ConfigService } from '@/services/config-service.js';
import { execSync } from 'child_process';

export function createSystemRoutes(
  processManager: ClaudeProcessManager,
  historyReader: ClaudeHistoryReader
): Router {
  const router = Router();
  const logger = createLogger('SystemRoutes');

  // Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Hello endpoint
  router.get('/hello', (req, res) => {
    res.json({ message: 'Hello from CUI!' });
  });

  // Get system status
  router.get('/status', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('Get system status request', { requestId });
    
    try {
      const systemStatus = await getSystemStatus(processManager, historyReader, logger);
      
      logger.debug('System status retrieved', {
        requestId,
        ...systemStatus
      });
      
      res.json(systemStatus);
    } catch (error) {
      logger.debug('Get system status failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Get available commands
  router.get('/commands', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const workingDirectory = req.query.workingDirectory as string | undefined;
    
    logger.debug('Get commands request', { requestId, workingDirectory });
    
    try {
      const commands = getAvailableCommands(workingDirectory);
      
      const response: CommandsResponse = {
        commands
      };
      
      logger.debug('Commands retrieved', {
        requestId,
        commandCount: commands.length,
        workingDirectory
      });
      
      res.json(response);
    } catch (error) {
      logger.debug('Get commands failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  return router;
}

/**
 * Get system status including Claude version and active conversations
 */
async function getSystemStatus(
  processManager: ClaudeProcessManager,
  historyReader: ClaudeHistoryReader,
  logger: Logger
): Promise<SystemStatusResponse> {
  try {
    // Get Claude version
    let claudeVersion = 'unknown';
    let claudePath = 'unknown';
    
    try {
      claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
      claudeVersion = execSync('claude --version', { encoding: 'utf-8' }).trim();
      logger.debug('Claude version info retrieved', {
        version: claudeVersion,
        path: claudePath
      });
    } catch (error) {
      logger.warn('Failed to get Claude version information', { 
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined
      });
    }
    
    // Get machine ID from config
    const configService = ConfigService.getInstance();
    const config = configService.getConfig();
    const machineId = config.machine_id;
    
    return {
      claudeVersion,
      claudePath,
      configPath: historyReader.homePath,
      activeConversations: processManager.getActiveSessions().length,
      machineId
    };
  } catch (_error) {
    throw new CUIError('SYSTEM_STATUS_ERROR', 'Failed to get system status', 500);
  }
}