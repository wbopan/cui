import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService } from '@/services/config-service';

vi.mock('@/services/logger.js');

describe('ConfigService interface', () => {
  let testDir: string;
  let originalHome: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-config-test-'));
    originalHome = os.homedir();
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterAll(() => {
    (os.homedir as any<typeof os.homedir>).mockRestore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    ConfigService.resetInstance();
    const cuiDir = path.join(testDir, '.cui');
    if (fs.existsSync(cuiDir)) {
      fs.rmSync(cuiDir, { recursive: true, force: true });
    }
  });

  it('creates default interface section', async () => {
    const service = ConfigService.getInstance();
    await service.initialize();
    const config = service.getConfig();
    expect(config.interface.colorScheme).toBe('system');
    const file = JSON.parse(fs.readFileSync(path.join(testDir, '.cui', 'config.json'), 'utf-8'));
    expect(file.interface).toBeDefined();
  });

  it('updates interface settings via updateConfig', async () => {
    const service = ConfigService.getInstance();
    await service.initialize();
    await service.updateConfig({ interface: { language: 'fr', colorScheme: 'system' } });
    const config = service.getConfig();
    expect(config.interface.language).toBe('fr');
    expect(config.interface.colorScheme).toBe('system');
  });
});
