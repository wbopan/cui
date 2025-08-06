import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PreferencesService } from '../../../src/services/preferences-service';

describe('PreferencesService', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a fresh isolated directory for each test
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const threadId = Math.random().toString(36).substring(7);
    const pid = process.pid;
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), `cui-prefs-test-${timestamp}-${pid}-${threadId}-${random}-`));
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup test directory:', error);
      }
    }
  });

  it('creates file on first update', async () => {
    const service = new PreferencesService(testDir);
    await service.initialize();
    await service.updatePreferences({ colorScheme: 'dark' });
    const dbPath = path.join(testDir, '.cui', 'preferences.json');
    expect(fs.existsSync(dbPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(data.preferences.colorScheme).toBe('dark');
  });

  it('returns defaults when file missing', async () => {
    const service = new PreferencesService(testDir);
    await service.initialize();
    const prefs = await service.getPreferences();
    expect(prefs.colorScheme).toBe('system');
    expect(prefs.language).toBe('en');
  });

  it('updates preferences', async () => {
    const service = new PreferencesService(testDir);
    await service.initialize();
    await service.updatePreferences({ language: 'fr' });
    const prefs = await service.getPreferences();
    expect(prefs.language).toBe('fr');
  });
});
