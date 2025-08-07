import { Router } from 'express';
import { StreamManager } from '@/services/stream-manager.js';
import { createLogger } from '@/services/logger.js';
import { RequestWithRequestId } from '@/types/express.js';

export function createStreamingRoutes(streamManager: StreamManager): Router {
  const router = Router();
  const logger = createLogger('StreamingRoutes');

  router.get('/:streamingId', (req: RequestWithRequestId, res) => {
    const { streamingId } = req.params;
    const requestId = req.requestId;
    
    logger.debug('Stream connection request', {
      requestId,
      streamingId,
      headers: {
        'accept': req.headers.accept,
        'user-agent': req.headers['user-agent']
      }
    });
    
    streamManager.addClient(streamingId, res);
    
    // Log when stream closes
    res.on('close', () => {
      logger.debug('Stream connection closed', {
        requestId,
        streamingId
      });
    });
  });

  return router;
}