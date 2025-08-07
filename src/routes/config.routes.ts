import { Router, Request } from 'express';
import { ConfigService } from '@/services/config-service.js';
import type { CUIConfig } from '@/types/config.js';
import { createLogger } from '@/services/logger.js';

export function createConfigRoutes(service: ConfigService): Router {
  const router = Router();
  const logger = createLogger('ConfigRoutes');

  router.get('/', (req, res, next) => {
    try {
      res.json(service.getConfig());
    } catch (error) {
      logger.error('Failed to get config', error);
      next(error);
    }
  });

  router.put('/', async (req: Request<Record<string, never>, unknown, Partial<CUIConfig>>, res, next) => {
    try {
      await service.updateConfig(req.body);
      res.json(service.getConfig());
    } catch (error) {
      logger.error('Failed to update config', error);
      next(error);
    }
  });

  return router;
}
