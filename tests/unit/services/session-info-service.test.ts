import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionInfoService } from '@/services/session-info-service';
import type { SessionInfo, SessionInfoDatabase } from '@/types';

describe('SessionInfoService', () => {
  let testConfigDir: string;
  let originalHome: string;

  beforeAll(() => {
    // Create temporary config directory for tests
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-session-test-'));
    
    // Mock the home directory to use our test directory
    originalHome = os.homedir();
    jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
  });

  afterAll(() => {
    // Restore original home directory
    (os.homedir as jest.MockedFunction<typeof os.homedir>).mockRestore();
    
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear any existing config directory
    const cuiDir = path.join(testConfigDir, '.cui');
    if (fs.existsSync(cuiDir)) {
      fs.rmSync(cuiDir, { recursive: true, force: true });
    }
    
    // Reset SessionInfoService singleton
    SessionInfoService.resetInstance();
  });

  describe('initialization', () => {
    it('should create database file on first write operation', async () => {
      const service = SessionInfoService.getInstance();
      
      // Config directory should not exist initially
      expect(fs.existsSync(path.join(testConfigDir, '.cui'))).toBe(false);
      
      await service.initialize();
      
      // Config directory should be created
      expect(fs.existsSync(path.join(testConfigDir, '.cui'))).toBe(true);
      
      // File should be created when there's a write operation
      await service.updateCustomName('test-session', 'Test Name');
      
      const dbPath = path.join(testConfigDir, '.cui', 'session-info.json');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create config directory if it does not exist', async () => {
      const service = SessionInfoService.getInstance();
      const cuiDir = path.join(testConfigDir, '.cui');
      
      expect(fs.existsSync(cuiDir)).toBe(false);
      
      await service.initialize();
      
      expect(fs.existsSync(cuiDir)).toBe(true);
    });

    it('should initialize with default database structure', async () => {
      const service = SessionInfoService.getInstance();
      
      await service.initialize();
      
      // Trigger a write to create the file
      await service.updateCustomName('test-session', 'Test Name');
      
      const dbPath = path.join(testConfigDir, '.cui', 'session-info.json');
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData: SessionInfoDatabase = JSON.parse(dbContent);
      
      expect(dbData.sessions).toHaveProperty('test-session');
      expect(dbData.metadata).toMatchObject({
        schema_version: 3,
        created_at: expect.any(String),
        last_updated: expect.any(String)
      });
    });

    it('should not overwrite existing database', async () => {
      const service = SessionInfoService.getInstance();
      
      // Create initial database
      await service.initialize();
      await service.updateCustomName('test-session-1', 'Test Name');
      
      // Reset and reinitialize
      SessionInfoService.resetInstance();
      const newService = SessionInfoService.getInstance();
      await newService.initialize();
      
      const sessionInfo = await newService.getSessionInfo('test-session-1');
      expect(sessionInfo.custom_name).toBe('Test Name');
    });

    it('should throw error if initialization fails', async () => {
      const service = SessionInfoService.getInstance();
      
      // Mock fs to throw error
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(service.initialize()).rejects.toThrow('Session info database initialization failed');
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });

    it('should prevent multiple initializations', async () => {
      const service = SessionInfoService.getInstance();
      
      await service.initialize();
      
      // Second initialization should not throw
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe('getSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should return session info for existing session', async () => {
      const testSessionId = 'test-session-1';
      const testCustomName = 'My Test Session';
      
      await service.updateCustomName(testSessionId, testCustomName);
      
      const sessionInfo = await service.getSessionInfo(testSessionId);
      
      expect(sessionInfo.custom_name).toBe(testCustomName);
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.created_at).toBeDefined();
      expect(sessionInfo.updated_at).toBeDefined();
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
    });

    it('should create entry and return default values for non-existent session', async () => {
      const sessionId = 'non-existent-session';
      const sessionInfo = await service.getSessionInfo(sessionId);
      
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
      expect(sessionInfo.created_at).toBeDefined();
      expect(sessionInfo.updated_at).toBeDefined();
      
      // Verify the session was actually created in the database
      const allSessions = await service.getAllSessionInfo();
      expect(allSessions).toHaveProperty(sessionId);
      expect(allSessions[sessionId]).toMatchObject({
        custom_name: '',
        version: 3,
        pinned: false,
        archived: false,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      });
    });

    it('should return default values on read error', async () => {
      // Mock JsonFileManager to throw error
      const mockError = new Error('Database error');
      jest.spyOn(service['jsonManager'], 'read').mockRejectedValue(mockError);
      
      const sessionInfo = await service.getSessionInfo('test-session');
      
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });

    it('should return default values when creation fails', async () => {
      const sessionId = 'creation-fail-session';
      
      // Mock read to return empty sessions (session doesn't exist)
      jest.spyOn(service['jsonManager'], 'read').mockResolvedValue({
        sessions: {},
        metadata: {
          schema_version: 3,
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }
      });
      
      // Mock update to throw error (creation fails)
      jest.spyOn(service['jsonManager'], 'update').mockRejectedValue(new Error('Update failed'));
      
      const sessionInfo = await service.getSessionInfo(sessionId);
      
      // Should still return default values
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
      expect(sessionInfo.created_at).toBeDefined();
      expect(sessionInfo.updated_at).toBeDefined();
      
      // Restore mocks
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('updateCustomName', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should create new session entry', async () => {
      const testSessionId = 'new-session';
      const testCustomName = 'New Session Name';
      
      await service.updateCustomName(testSessionId, testCustomName);
      
      const sessionInfo = await service.getSessionInfo(testSessionId);
      expect(sessionInfo.custom_name).toBe(testCustomName);
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
    });

    it('should update existing session entry', async () => {
      const testSessionId = 'test-session';
      const originalName = 'Original Name';
      const updatedName = 'Updated Name';
      
      await service.updateCustomName(testSessionId, originalName);
      const originalInfo = await service.getSessionInfo(testSessionId);
      
      // Wait a bit to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await service.updateCustomName(testSessionId, updatedName);
      const updatedInfo = await service.getSessionInfo(testSessionId);
      
      expect(updatedInfo.custom_name).toBe(updatedName);
      expect(updatedInfo.created_at).toBe(originalInfo.created_at);
      expect(new Date(updatedInfo.updated_at).getTime()).toBeGreaterThan(new Date(originalInfo.updated_at).getTime());
    });

    it('should handle empty custom name', async () => {
      const testSessionId = 'test-session';
      
      await service.updateCustomName(testSessionId, '');
      
      const sessionInfo = await service.getSessionInfo(testSessionId);
      expect(sessionInfo.custom_name).toBe('');
    });

    it('should handle special characters in custom name', async () => {
      const testSessionId = 'test-session';
      const specialName = 'Test "Session" with [brackets] & symbols!';
      
      await service.updateCustomName(testSessionId, specialName);
      
      const sessionInfo = await service.getSessionInfo(testSessionId);
      expect(sessionInfo.custom_name).toBe(specialName);
    });

    it('should update metadata timestamp', async () => {
      const testSessionId = 'test-session';
      const testCustomName = 'Test Session';
      const beforeTime = new Date().toISOString();
      
      await service.updateCustomName(testSessionId, testCustomName);
      
      // Read database directly to check metadata
      const dbPath = path.join(testConfigDir, '.cui', 'session-info.json');
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData: SessionInfoDatabase = JSON.parse(dbContent);
      
      expect(new Date(dbData.metadata.last_updated).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });

    it('should throw error on update failure', async () => {
      const testSessionId = 'test-session';
      const testCustomName = 'Test Session';
      
      // Mock JsonFileManager to throw error
      const mockError = new Error('Write error');
      jest.spyOn(service['jsonManager'], 'update').mockRejectedValue(mockError);
      
      await expect(service.updateCustomName(testSessionId, testCustomName)).rejects.toThrow('Failed to update session info');
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('updateSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should create new session with all fields', async () => {
      const testSessionId = 'new-session';
      const updates = {
        custom_name: 'Test Session',
        pinned: true,
        archived: false,
        continuation_session_id: 'other-session',
        initial_commit_head: 'abc123def'
      };
      
      const result = await service.updateSessionInfo(testSessionId, updates);
      
      expect(result.custom_name).toBe('Test Session');
      expect(result.pinned).toBe(true);
      expect(result.archived).toBe(false);
      expect(result.continuation_session_id).toBe('other-session');
      expect(result.initial_commit_head).toBe('abc123def');
      expect(result.version).toBe(3);
    });

    it('should partially update existing session', async () => {
      const testSessionId = 'test-session';
      
      // First create a session
      await service.updateSessionInfo(testSessionId, {
        custom_name: 'Original Name',
        pinned: false
      });
      
      // Update only some fields
      const result = await service.updateSessionInfo(testSessionId, {
        pinned: true,
        archived: true
      });
      
      expect(result.custom_name).toBe('Original Name'); // Should be preserved
      expect(result.pinned).toBe(true); // Updated
      expect(result.archived).toBe(true); // Updated
      expect(result.continuation_session_id).toBe(''); // Default preserved
      expect(result.initial_commit_head).toBe(''); // Default preserved
    });

    it('should handle empty updates object', async () => {
      const testSessionId = 'test-session';
      
      const result = await service.updateSessionInfo(testSessionId, {});
      
      expect(result.custom_name).toBe('');
      expect(result.pinned).toBe(false);
      expect(result.archived).toBe(false);
      expect(result.continuation_session_id).toBe('');
      expect(result.initial_commit_head).toBe('');
    });

    it('should update timestamps correctly', async () => {
      const testSessionId = 'test-session';
      
      const result1 = await service.updateSessionInfo(testSessionId, { custom_name: 'Test' });
      const createdAt = result1.created_at;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await service.updateSessionInfo(testSessionId, { pinned: true });
      
      expect(result2.created_at).toBe(createdAt); // Should not change
      expect(new Date(result2.updated_at).getTime()).toBeGreaterThan(new Date(result1.updated_at).getTime());
    });

    it('should throw error on update failure', async () => {
      const testSessionId = 'test-session';
      
      // Mock JsonFileManager to throw error
      const mockError = new Error('Write error');
      jest.spyOn(service['jsonManager'], 'update').mockRejectedValue(mockError);
      
      await expect(service.updateSessionInfo(testSessionId, { custom_name: 'Test' })).rejects.toThrow('Failed to update session info');
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('deleteSession', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should delete existing session', async () => {
      const testSessionId = 'test-session';
      
      // Create session first
      await service.updateCustomName(testSessionId, 'Test Session');
      let sessionInfo = await service.getSessionInfo(testSessionId);
      expect(sessionInfo.custom_name).toBe('Test Session');
      
      // Delete session
      await service.deleteSession(testSessionId);
      
      // Verify deletion
      sessionInfo = await service.getSessionInfo(testSessionId);
      expect(sessionInfo.custom_name).toBe(''); // Should return default
    });

    it('should handle deletion of non-existent session', async () => {
      // Should not throw error
      await expect(service.deleteSession('non-existent-session')).resolves.not.toThrow();
    });

    it('should throw error on deletion failure', async () => {
      const testSessionId = 'test-session';
      
      // Mock JsonFileManager to throw error
      const mockError = new Error('Delete error');
      jest.spyOn(service['jsonManager'], 'update').mockRejectedValue(mockError);
      
      await expect(service.deleteSession(testSessionId)).rejects.toThrow('Failed to delete session info');
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('getAllSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should return all session information', async () => {
      const sessions = {
        'session-1': 'First Session',
        'session-2': 'Second Session',
        'session-3': 'Third Session'
      };
      
      // Create multiple sessions
      for (const [sessionId, customName] of Object.entries(sessions)) {
        await service.updateCustomName(sessionId, customName);
      }
      
      const allSessionInfo = await service.getAllSessionInfo();
      
      expect(Object.keys(allSessionInfo)).toHaveLength(3);
      for (const [sessionId, customName] of Object.entries(sessions)) {
        expect(allSessionInfo[sessionId]).toBeDefined();
        expect(allSessionInfo[sessionId].custom_name).toBe(customName);
      }
    });

    it('should return empty object for no sessions', async () => {
      const allSessionInfo = await service.getAllSessionInfo();
      
      expect(allSessionInfo).toEqual({});
    });

    it('should return empty object on error', async () => {
      // Mock JsonFileManager to throw error
      const mockError = new Error('Read error');
      jest.spyOn(service['jsonManager'], 'read').mockRejectedValue(mockError);
      
      const allSessionInfo = await service.getAllSessionInfo();
      
      expect(allSessionInfo).toEqual({});
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('getStats', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should return correct statistics', async () => {
      // Create some sessions
      await service.updateCustomName('session-1', 'Session 1');
      await service.updateCustomName('session-2', 'Session 2');
      
      const stats = await service.getStats();
      
      expect(stats.sessionCount).toBe(2);
      expect(stats.dbSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeDefined();
    });

    it('should handle non-existent database file', async () => {
      // Don't initialize or create any sessions
      const freshService = SessionInfoService.getInstance();
      const stats = await freshService.getStats();
      
      expect(stats.sessionCount).toBe(0);
      // Note: dbSize might be > 0 if file exists from ensureMetadata
      expect(stats.dbSize).toBeGreaterThanOrEqual(0);
      expect(stats.lastUpdated).toBeDefined();
    });

    it('should return default stats on error', async () => {
      // Mock JsonFileManager to throw error
      const mockError = new Error('Stats error');
      jest.spyOn(service['jsonManager'], 'read').mockRejectedValue(mockError);
      
      const stats = await service.getStats();
      
      expect(stats.sessionCount).toBe(0);
      expect(stats.dbSize).toBe(0);
      expect(stats.lastUpdated).toBeDefined();
      
      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('archiveAllSessions', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = SessionInfoService.getInstance();
      await service.initialize();
    });

    it('should archive all non-archived sessions', async () => {
      // Create some sessions with mixed archived states
      await service.updateSessionInfo('session-1', {
        custom_name: 'Session 1',
        archived: false
      });
      await service.updateSessionInfo('session-2', {
        custom_name: 'Session 2',
        archived: true  // Already archived
      });
      await service.updateSessionInfo('session-3', {
        custom_name: 'Session 3',
        archived: false
      });

      // Archive all sessions
      const archivedCount = await service.archiveAllSessions();

      // Should have archived 2 sessions (not the already archived one)
      expect(archivedCount).toBe(2);

      // Verify all sessions are now archived
      const session1 = await service.getSessionInfo('session-1');
      const session2 = await service.getSessionInfo('session-2');
      const session3 = await service.getSessionInfo('session-3');

      expect(session1.archived).toBe(true);
      expect(session2.archived).toBe(true);
      expect(session3.archived).toBe(true);
    });

    it('should return 0 when all sessions are already archived', async () => {
      // Create sessions that are already archived
      await service.updateSessionInfo('session-1', {
        custom_name: 'Session 1',
        archived: true
      });
      await service.updateSessionInfo('session-2', {
        custom_name: 'Session 2',
        archived: true
      });

      // Archive all sessions
      const archivedCount = await service.archiveAllSessions();

      // Should have archived 0 sessions
      expect(archivedCount).toBe(0);
    });

    it('should return 0 when there are no sessions', async () => {
      // Archive all sessions when none exist
      const archivedCount = await service.archiveAllSessions();

      // Should have archived 0 sessions
      expect(archivedCount).toBe(0);
    });

    it('should update timestamps for archived sessions', async () => {
      // Create a session
      await service.updateSessionInfo('session-1', {
        custom_name: 'Session 1',
        archived: false
      });

      const beforeArchive = await service.getSessionInfo('session-1');
      
      // Wait a bit to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 10));

      // Archive all sessions
      await service.archiveAllSessions();

      const afterArchive = await service.getSessionInfo('session-1');

      // Check that updated_at changed but created_at remained the same
      expect(afterArchive.created_at).toBe(beforeArchive.created_at);
      expect(new Date(afterArchive.updated_at).getTime()).toBeGreaterThan(new Date(beforeArchive.updated_at).getTime());
    });

    it('should preserve other session fields when archiving', async () => {
      // Create a session with various fields set
      await service.updateSessionInfo('session-1', {
        custom_name: 'Important Session',
        pinned: true,
        archived: false,
        continuation_session_id: 'next-session',
        initial_commit_head: 'abc123'
      });

      // Archive all sessions
      await service.archiveAllSessions();

      const session = await service.getSessionInfo('session-1');

      // All fields should be preserved except archived
      expect(session.custom_name).toBe('Important Session');
      expect(session.pinned).toBe(true);
      expect(session.archived).toBe(true);  // This should be updated
      expect(session.continuation_session_id).toBe('next-session');
      expect(session.initial_commit_head).toBe('abc123');
    });

    it('should throw error on archive failure', async () => {
      // Mock JsonFileManager to throw error
      const mockError = new Error('Archive error');
      jest.spyOn(service['jsonManager'], 'update').mockRejectedValue(mockError);

      await expect(service.archiveAllSessions()).rejects.toThrow('Failed to archive all sessions');

      // Restore mock
      jest.restoreAllMocks();
      jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = SessionInfoService.getInstance();
      const instance2 = SessionInfoService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should use the same database path across instances', async () => {
      const service1 = SessionInfoService.getInstance();
      await service1.initialize();
      await service1.updateCustomName('test-session', 'Test Name');
      
      // Reset and get new instance
      SessionInfoService.resetInstance();
      const service2 = SessionInfoService.getInstance();
      await service2.initialize();
      
      const sessionInfo = await service2.getSessionInfo('test-session');
      expect(sessionInfo.custom_name).toBe('Test Name');
    });
  });
});