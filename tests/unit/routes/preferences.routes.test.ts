import { describe, it, expect, beforeEach, mock } from 'bun:test';
import request from 'supertest';

mock.module('@/services/logger', () => ({
  createLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    error: mock(),
    warn: mock()
  }))
}));
import express from 'express';
import { createPreferencesRoutes } from '@/routes/preferences.routes';
import { PreferencesService } from '@/services/preferences-service';

describe('Preferences Routes', () => {
  let app: express.Application;
  let service: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    service = {
      getPreferences: mock(),
      updatePreferences: mock(),
    } as any;

    app.use('/api/preferences', createPreferencesRoutes(service));
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(500).json({ error: 'err' });
    });
  });

  it('GET / should return preferences', async () => {
    service.getPreferences.mockImplementation(() => Promise.resolve({ colorScheme: 'light', language: 'en' }));
    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(200);
    expect(res.body.colorScheme).toBe('light');
    expect(service.getPreferences).toHaveBeenCalled();
  });

  it('PUT / should update preferences', async () => {
    service.updatePreferences.mockImplementation(() => Promise.resolve({ colorScheme: 'dark', language: 'en' }));
    const res = await request(app)
      .put('/api/preferences')
      .send({ colorScheme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.colorScheme).toBe('dark');
    expect(service.updatePreferences).toHaveBeenCalledWith({ colorScheme: 'dark' });
  });
});