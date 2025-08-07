import { Router, Request } from 'express';
import { logStreamBuffer } from '@/services/log-stream-buffer.js';
import { createLogger } from '@/services/logger.js';
import { RequestWithRequestId } from '@/types/express.js';

export function createLogRoutes(): Router {
  const router = Router();
  const logger = createLogger('LogRoutes');

  // Get recent logs
  router.get('/recent', (req: Request<Record<string, never>, unknown, Record<string, never>, { limit?: number }> & RequestWithRequestId, res) => {
    const requestId = req.requestId;
    const limit = req.query.limit !== undefined ? req.query.limit : 100;
    
    logger.debug('Get recent logs request', {
      requestId,
      limit
    });
    
    try {
      const logs = logStreamBuffer.getRecentLogs(limit);
      res.json({ logs });
    } catch (error) {
      logger.error('Failed to get recent logs', error, { requestId });
      res.status(500).json({ error: 'Failed to retrieve logs' });
    }
  });
  
  // Stream logs via SSE
  router.get('/stream', (req: RequestWithRequestId, res) => {
    const requestId = req.requestId;
    
    logger.debug('Log stream connection request', {
      requestId,
      headers: {
        'accept': req.headers.accept,
        'user-agent': req.headers['user-agent']
      }
    });
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable proxy buffering
    });
    
    // Send initial connection confirmation
    res.write('data: {"type":"connected"}\n\n');
    
    // Create log listener
    const logListener = (logLine: string) => {
      res.write(`data: ${logLine}\n\n`);
    };
    
    // Subscribe to log events
    logStreamBuffer.on('log', logListener);
    
    // Handle client disconnect
    req.on('close', () => {
      logger.debug('Log stream connection closed', { requestId });
      logStreamBuffer.removeListener('log', logListener);
    });
    
    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);
    
    // Clean up heartbeat on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  return router;
}