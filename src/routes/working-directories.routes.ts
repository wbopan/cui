import { Router, Request } from 'express';
import { WorkingDirectoriesResponse } from '@/types/index.js';
import { WorkingDirectoriesService } from '@/services/working-directories-service.js';
import { createLogger } from '@/services/logger.js';

export function createWorkingDirectoriesRoutes(
  workingDirectoriesService: WorkingDirectoriesService
): Router {
  const router = Router();
  const logger = createLogger('WorkingDirectoriesRoutes');

  // Get all working directories with smart suffixes
  router.get('/', async (req: Request<Record<string, never>, WorkingDirectoriesResponse>, res, next) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    logger.debug('Getting working directories', { requestId });
    
    try {
      const result = await workingDirectoriesService.getWorkingDirectories();
      
      logger.debug('Retrieved working directories', {
        requestId,
        totalDirectories: result.totalCount
      });
      
      res.json(result);
    } catch (error) {
      logger.error('Failed to get working directories', error, { requestId });
      next(error);
    }
  });

  return router;
}