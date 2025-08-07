import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createConfigRoutes } from '@/routes/config.routes';
import { ConfigService } from '@/services/config-service';

vi.mock('@/services/logger.js');

describe('Config Routes', () => {
  let app: express.Application;
  let service: ConfigService;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    service = ConfigService.getInstance();
    // mock initialized config
    (service as any).config = {
      machine_id: 'id',
      authToken: 'token',
      server: { host: 'localhost', port: 3001 },
      interface: { colorScheme: 'light', language: 'en' }
    };
    app.use('/api/config', createConfigRoutes(service));
  });

  it('GET / should return full config', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.machine_id).toBe('id');
    expect(res.body.authToken).toBe('token');
    expect(res.body.server.port).toBe(3001);
    expect(res.body.interface.colorScheme).toBe('light');
  });

  it('PUT / should update config including interface', async () => {
    vi.spyOn(service, 'updateConfig').mockResolvedValue();
    const res = await request(app)
      .put('/api/config')
      .send({ interface: { language: 'fr' } });
    expect(res.status).toBe(200);
    expect(service.updateConfig).toHaveBeenCalledWith({ interface: { language: 'fr' } });
  });
});
