import { Router, Request } from 'express';
import { Preferences } from '@/types/index.js';
import { PreferencesService } from '@/services/preferences-service.js';
import { createLogger } from '@/services/logger.js';

export function createPreferencesRoutes(service: PreferencesService): Router {
  const router = Router();
  const logger = createLogger('PreferencesRoutes');

  router.get('/', async (req, res, next) => {
    try {
      const prefs = await service.getPreferences();
      res.json(prefs);
    } catch (error) {
      logger.error('Failed to get preferences', error);
      next(error);
    }
  });

  router.put('/', async (req: Request<Record<string, never>, unknown, Partial<Preferences>>, res, next) => {
    try {
      const updated = await service.updatePreferences(req.body);
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update preferences', error);
      next(error);
    }
  });

  return router;
}
