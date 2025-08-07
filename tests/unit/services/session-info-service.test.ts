import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { SessionInfo, SessionInfoDatabase } from '@/types';
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
    mkdirSync: mock(() => {}),
    readFileSync: mock(() => '{"sessions":{},"metadata":{"schema_version":3,"created_at":"2024-01-01T00:00:00.000Z","last_updated":"2024-01-01T00:00:00.000Z"}}'),
    writeFileSync: mock(() => {}),
    statSync: mock(() => ({ size: 1024 }))
  }
}));

import { SessionInfoService } from '@/services/session-info-service';

describe('SessionInfoService', () => {
  let service: SessionInfoService;

  const defaultDatabase: SessionInfoDatabase = {
    sessions: {},
    metadata: {
      schema_version: 3,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    }
  };

  beforeEach(() => {
    // Reset mocks
    mockJsonManager.read.mockClear();
    mockJsonManager.update.mockClear();
    mockJsonManager.write.mockClear();

    // Create service instance
    service = new SessionInfoService('/tmp/test-config');
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      
      await service.initialize();
      
      expect(mockJsonManager.read).toHaveBeenCalled();
    });

    it('should throw error if initialization fails', async () => {
      mockJsonManager.read.mockRejectedValue(new Error('Permission denied'));

      try {
        await service.initialize();
        fail('Expected initialization to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Session info database initialization failed');
      }
    });
  });

  describe('getSessionInfo', () => {
    it('should return session info for existing session', async () => {
      const testSessionData = {
        ...defaultDatabase,
        sessions: {
          'test-session-1': {
            custom_name: 'My Test Session',
            pinned: false,
            archived: false,
            continuation_session_id: '',
            initial_commit_head: '',
            permission_mode: 'default' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 3
          }
        }
      };

      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      await service.initialize();

      mockJsonManager.read.mockResolvedValue(testSessionData);
      
      const sessionInfo = await service.getSessionInfo('test-session-1');
      
      expect(sessionInfo.custom_name).toBe('My Test Session');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
    });

    it('should return default values on read error', async () => {
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      await service.initialize();

      mockJsonManager.read.mockRejectedValue(new Error('Database error'));
      
      const sessionInfo = await service.getSessionInfo('test-session');
      
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
    });
  });

  describe('updateCustomName', () => {
    it('should update session name', async () => {
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      await service.initialize();

      mockJsonManager.update.mockImplementation(async (updateFn: any) => {
        const data = { ...defaultDatabase };
        return updateFn(data);
      });

      await service.updateCustomName('new-session', 'New Session Name');
      
      expect(mockJsonManager.update).toHaveBeenCalled();
    });

    it('should throw error on update failure', async () => {
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      await service.initialize();

      mockJsonManager.update.mockRejectedValue(new Error('Write error'));
      
      try {
        await service.updateCustomName('test-session', 'Test Session');
        fail('Expected updateCustomName to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update session info');
      }
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      // Create a fresh service instance for this test
      const freshService = new SessionInfoService('/tmp/test-config-delete');
      
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      
      // Mock update for both initialization (ensureMetadata) and deleteSession
      mockJsonManager.update.mockImplementation(async (updateFn: any) => {
        const data = { ...defaultDatabase };
        return updateFn(data);
      });
      
      await freshService.initialize();
      await freshService.deleteSession('test-session');
      
      expect(mockJsonManager.update).toHaveBeenCalled();
    });
  });

  describe('getAllSessionInfo', () => {
    it('should return all sessions', async () => {
      // Create a fresh service instance for this test
      const freshService = new SessionInfoService('/tmp/test-config-getall');
      
      const testDatabase = {
        ...defaultDatabase,
        sessions: {
          'session-1': {
            custom_name: 'First Session',
            pinned: false,
            archived: false,
            continuation_session_id: '',
            initial_commit_head: '',
            permission_mode: 'default' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 3
          }
        }
      };

      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      
      // Mock update for initialization (ensureMetadata)
      mockJsonManager.update.mockImplementation(async (updateFn: any) => {
        const data = { ...defaultDatabase };
        return updateFn(data);
      });
      
      await freshService.initialize();

      mockJsonManager.read.mockResolvedValue(testDatabase);
      
      const allSessionInfo = await freshService.getAllSessionInfo();
      
      expect(Object.keys(allSessionInfo)).toHaveLength(1);
      expect(allSessionInfo['session-1'].custom_name).toBe('First Session');
    });

    it('should return empty object on error', async () => {
      // Create a fresh service instance for this test
      const freshService = new SessionInfoService('/tmp/test-config-error');
      
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      
      // Mock update for initialization (ensureMetadata)
      mockJsonManager.update.mockImplementation(async (updateFn: any) => {
        const data = { ...defaultDatabase };
        return updateFn(data);
      });
      
      await freshService.initialize();

      mockJsonManager.read.mockRejectedValue(new Error('Read error'));
      
      const allSessionInfo = await freshService.getAllSessionInfo();
      
      expect(allSessionInfo).toEqual({});
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      // Create a fresh service instance for this test
      const freshService = new SessionInfoService('/tmp/test-config-stats');
      
      mockJsonManager.read.mockResolvedValue(defaultDatabase);
      
      // Mock update for initialization (ensureMetadata)
      mockJsonManager.update.mockImplementation(async (updateFn: any) => {
        const data = { ...defaultDatabase };
        return updateFn(data);
      });
      
      await freshService.initialize();

      const testDatabase = {
        ...defaultDatabase,
        sessions: {
          'session-1': {
            custom_name: 'Session 1',
            pinned: false,
            archived: false,
            continuation_session_id: '',
            initial_commit_head: '',
            permission_mode: 'default' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 3
          }
        }
      };

      mockJsonManager.read.mockResolvedValue(testDatabase);
      
      const stats = await freshService.getStats();
      
      expect(stats.sessionCount).toBe(1);
      expect(stats.dbSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeDefined();
    });
  });
});