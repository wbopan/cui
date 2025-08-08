import { describe, it, expect, beforeEach } from 'vitest';
import { SessionInfoService } from '@/services/session-info-service';

describe('SessionInfoService with SQLite', () => {
  let service: SessionInfoService;

  beforeEach(async () => {
    SessionInfoService.resetInstance();
    service = new SessionInfoService(':memory:');
    await service.initialize();
  });

  it('should create and retrieve session info', async () => {
    const info = await service.getSessionInfo('sess1');
    expect(info.custom_name).toBe('');
    await service.updateCustomName('sess1', 'Test');
    const updated = await service.getSessionInfo('sess1');
    expect(updated.custom_name).toBe('Test');
  });

  it('should update session fields', async () => {
    await service.updateSessionInfo('sess2', { pinned: true });
    const info = await service.getSessionInfo('sess2');
    expect(info.pinned).toBe(true);
  });

  it('should delete session', async () => {
    await service.updateSessionInfo('sess3', { custom_name: 'Del' });
    await service.deleteSession('sess3');
    const all = await service.getAllSessionInfo();
    expect(all['sess3']).toBeUndefined();
  });

  it('should return all sessions', async () => {
    await service.updateSessionInfo('a', { custom_name: 'A' });
    await service.updateSessionInfo('b', { custom_name: 'B' });
    const all = await service.getAllSessionInfo();
    expect(Object.keys(all).sort()).toEqual(['a', 'b']);
  });

  it('should archive all sessions', async () => {
    await service.updateSessionInfo('a', { custom_name: 'A' });
    await service.updateSessionInfo('b', { custom_name: 'B' });
    const count = await service.archiveAllSessions();
    expect(count).toBe(2);
    const all = await service.getAllSessionInfo();
    expect(all['a'].archived).toBe(true);
    expect(all['b'].archived).toBe(true);
  });

  it('should sync missing sessions', async () => {
    const inserted = await service.syncMissingSessions(['x', 'y']);
    expect(inserted).toBe(2);
    const all = await service.getAllSessionInfo();
    expect(Object.keys(all).sort()).toEqual(['x', 'y']);
  });

  it('should provide stats', async () => {
    await service.updateSessionInfo('s', { custom_name: 'S' });
    const stats = await service.getStats();
    expect(stats.sessionCount).toBe(1);
    expect(stats.lastUpdated).toBeTypeOf('string');
  });
});

