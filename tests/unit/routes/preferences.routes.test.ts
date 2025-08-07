import request from 'supertest';
import express from 'express';
import { createPreferencesRoutes } from '@/routes/preferences.routes';
import { PreferencesService } from '@/services/preferences-service';

jest.mock('@/services/logger');

describe('Preferences Routes', () => {
  let app: express.Application;
  let service: jest.Mocked<PreferencesService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    service = {
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    } as any;

    app.use('/api/preferences', createPreferencesRoutes(service));
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(500).json({ error: 'err' });
    });
  });

  it('GET / should return preferences', async () => {
    service.getPreferences.mockResolvedValue({ colorScheme: 'light', language: 'en' });
    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(200);
    expect(res.body.colorScheme).toBe('light');
    expect(service.getPreferences).toHaveBeenCalled();
  });

  it('PUT / should update preferences', async () => {
    service.updatePreferences.mockResolvedValue({ colorScheme: 'dark', language: 'en' });
    const res = await request(app)
      .put('/api/preferences')
      .send({ colorScheme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.colorScheme).toBe('dark');
    expect(service.updatePreferences).toHaveBeenCalledWith({ colorScheme: 'dark' });
  });
});
