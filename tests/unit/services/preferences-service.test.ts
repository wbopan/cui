import fs from 'fs';
import path from 'path';
import os from 'os';
import { PreferencesService } from '@/services/preferences-service';
import type { Preferences } from '@/types';

describe('PreferencesService', () => {
  let testDir: string;
  let originalHome: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-prefs-test-'));
    originalHome = os.homedir();
    jest.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterAll(() => {
    (os.homedir as jest.MockedFunction<typeof os.homedir>).mockRestore();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    PreferencesService.resetInstance();
    const cuiDir = path.join(testDir, '.cui');
    if (fs.existsSync(cuiDir)) {
      fs.rmSync(cuiDir, { recursive: true, force: true });
    }
  });

  it('creates file on first update', async () => {
    const service = PreferencesService.getInstance();
    await service.initialize();
    await service.updatePreferences({ colorScheme: 'dark' });
    const dbPath = path.join(testDir, '.cui', 'preferences.json');
    expect(fs.existsSync(dbPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(data.preferences.colorScheme).toBe('dark');
  });

  it('returns defaults when file missing', async () => {
    const service = PreferencesService.getInstance();
    await service.initialize();
    const prefs = await service.getPreferences();
    expect(prefs.colorScheme).toBe('system');
    expect(prefs.language).toBe('en');
  });

  it('updates preferences', async () => {
    const service = PreferencesService.getInstance();
    await service.initialize();
    await service.updatePreferences({ language: 'fr' });
    const prefs = await service.getPreferences();
    expect(prefs.language).toBe('fr');
  });
});
