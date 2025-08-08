import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService } from '@/services/config-service';

vi.mock('@/services/logger.js');

describe('ConfigService file watch and external reload', () => {
  let testDir: string;
  let originalHome: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-config-watch-'));
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

  it('reloads valid external changes and emits change event', async () => {
    const service = ConfigService.getInstance();
    await service.initialize();
    const initial = service.getConfig();
    const configPath = path.join(testDir, '.cui', 'config.json');

    const onChange = vi.fn();
    (service as any).emitter.removeAllListeners?.('config-changed');
    service.onChange(onChange);

    // Write an external change
    const updated = {
      ...initial,
      interface: { ...initial.interface, language: 'de' }
    };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');

    // Wait until change observed (max 2s)
    const start = Date.now();
    let current = service.getConfig();
    while (current.interface.language !== 'de' && Date.now() - start < 2000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50));
      current = service.getConfig();
    }
    expect(current.interface.language).toBe('de');
    expect(onChange).toHaveBeenCalled();
    const args = onChange.mock.calls[0];
    expect(args[2]).toBe('external');
  });

  it('ignores invalid JSON external changes', async () => {
    const service = ConfigService.getInstance();
    await service.initialize();
    const initial = service.getConfig();
    const configPath = path.join(testDir, '.cui', 'config.json');

    const onChange = vi.fn();
    (service as any).emitter.removeAllListeners?.('config-changed');
    service.onChange(onChange);

    // Corrupt the file externally
    fs.writeFileSync(configPath, '{ invalid json', 'utf-8');
    // Wait briefly to allow watcher to run
    await new Promise((r) => setTimeout(r, 150));
    // Should not change config
    const current = service.getConfig();
    expect(current.machine_id).toBe(initial.machine_id);
    expect(onChange).not.toHaveBeenCalled();
  });
});


