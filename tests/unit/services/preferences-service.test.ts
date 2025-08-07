import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { DEFAULT_PREFERENCES } from '../../../src/types/preferences';
import { setupLoggerMock, createMockLogger } from '../../utils/mock-logger';

// Use the complete logger mock
setupLoggerMock();
const mockLogger = createMockLogger();

// Create mock JsonFileManager instance
const mockJsonManager = {
  read: mock(),
  update: mock(),
  write: mock(),
};

// Mock the JsonFileManager module
mock.module('@/services/json-file-manager', () => ({
  JsonFileManager: mock(() => mockJsonManager)
}));

// Mock fs module to avoid file system operations
mock.module('fs', () => ({
  default: {
    existsSync: mock(() => true),
    mkdirSync: mock(() => {})
  }
}));

import { PreferencesService } from '../../../src/services/preferences-service';

describe('PreferencesService', () => {
  let service: PreferencesService;

  beforeEach(() => {
    // Reset mocks
    mockJsonManager.read.mockClear();
    mockJsonManager.update.mockClear();
    mockJsonManager.write.mockClear();

    // Create service instance
    service = new PreferencesService('/tmp/test-config');
  });

  it('creates file on first update', async () => {
    // Mock successful read for initialization
    mockJsonManager.read.mockResolvedValue({
      preferences: DEFAULT_PREFERENCES,
      metadata: {
        schema_version: 1,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }
    });

    // Mock update to simulate updating preferences
    mockJsonManager.update.mockImplementation(async (updateFn: any) => {
      const data = {
        preferences: DEFAULT_PREFERENCES,
        metadata: {
          schema_version: 1,
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }
      };
      const updated = updateFn(data);
      return updated;
    });

    await service.initialize();
    await service.updatePreferences({ colorScheme: 'dark' });
    
    expect(mockJsonManager.read).toHaveBeenCalledTimes(1);
    expect(mockJsonManager.update).toHaveBeenCalledTimes(1);
  });

  it('returns defaults when file missing', async () => {
    // Mock read to return default data
    mockJsonManager.read.mockResolvedValue({
      preferences: DEFAULT_PREFERENCES,
      metadata: {
        schema_version: 1,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }
    });

    await service.initialize();
    const prefs = await service.getPreferences();
    
    expect(prefs.colorScheme).toBe('system');
    expect(prefs.language).toBe('en');
    expect(mockJsonManager.read).toHaveBeenCalledTimes(2);
  });

  it('updates preferences', async () => {
    // Mock read for initialization
    mockJsonManager.read.mockResolvedValue({
      preferences: DEFAULT_PREFERENCES,
      metadata: {
        schema_version: 1,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }
    });

    // Mock update to return updated preferences
    let updatedPrefs = DEFAULT_PREFERENCES;
    mockJsonManager.update.mockImplementation(async (updateFn: any) => {
      const data = {
        preferences: DEFAULT_PREFERENCES,
        metadata: {
          schema_version: 1,
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }
      };
      const updated = updateFn(data);
      updatedPrefs = updated.preferences;
      return updated;
    });

    // Mock subsequent read to return updated data
    mockJsonManager.read.mockImplementation(async () => ({
      preferences: updatedPrefs,
      metadata: {
        schema_version: 1,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }
    }));

    await service.initialize();
    await service.updatePreferences({ language: 'fr' });
    const prefs = await service.getPreferences();
    
    expect(prefs.language).toBe('fr');
    expect(mockJsonManager.update).toHaveBeenCalledTimes(1);
  });
});
