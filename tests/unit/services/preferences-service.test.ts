import { describe, it, expect, beforeAll, afterAll, beforeEach, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PreferencesService } from '../../../src/services/preferences-service';

describe('PreferencesService', () => {
  let testDir: string;
  let originalHome: string;

  beforeAll(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const pid = process.pid;
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), `cui-prefs-test-${timestamp}-${pid}-${random}-`));
    originalHome = os.homedir();
    spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterAll(async () => {
    // Reset singleton first
    PreferencesService.resetInstance();
    
    // Restore mock
    if ((os.homedir as any).mockRestore) {
      (os.homedir as any).mockRestore();
    }
    
    // Wait for any pending operations
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup test directory:', error);
      }
    }
  });

  beforeEach(async () => {
    // Ensure mock is properly restored and reapplied
    if ((os.homedir as any).mockRestore) {
      (os.homedir as any).mockRestore();
    }
    spyOn(os, 'homedir').mockReturnValue(testDir);
    
    PreferencesService.resetInstance();
    
    // Small delay for async cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
    
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
