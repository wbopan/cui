import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionInfoService } from '@/services/session-info-service';
import type { SessionInfo, SessionInfoDatabase } from '@/types';

describe('SessionInfoService', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a fresh isolated directory for each test
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const threadId = Math.random().toString(36).substring(7);
    const pid = process.pid;
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), `cui-session-test-${timestamp}-${pid}-${threadId}-${random}-`));
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

  describe('initialization', () => {
    it('should create database file on first write operation', async () => {
      const service = new SessionInfoService(testDir);
      
      // Config directory should not exist initially
      expect(fs.existsSync(path.join(testDir, '.cui'))).toBe(false);
      
      await service.initialize();
      
      // Config directory should be created
      expect(fs.existsSync(path.join(testDir, '.cui'))).toBe(true);
      
      // File should be created when there's a write operation
      await service.updateCustomName('test-session', 'Test Name');
      
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create config directory if it does not exist', async () => {
      const service = new SessionInfoService(testDir);
      const cuiDir = path.join(testDir, '.cui');
      
      expect(fs.existsSync(cuiDir)).toBe(false);
      
      await service.initialize();
      
      expect(fs.existsSync(cuiDir)).toBe(true);
    });

    it('should initialize with default database structure', async () => {
      const service = new SessionInfoService(testDir);
      
      await service.initialize();
      
      // Trigger a write to create the file
      await service.updateCustomName('test-session', 'Test Name');
      
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
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
      const service = new SessionInfoService(testDir);
      
      // Create initial database
      await service.initialize();
      await service.updateCustomName('test-session-1', 'Test Name');
      
      // Create new service with same directory
      const newService = new SessionInfoService(testDir);
      await newService.initialize();
      
      const sessionInfo = await newService.getSessionInfo('test-session-1');
      expect(sessionInfo.custom_name).toBe('Test Name');
    });

    it('should throw error if initialization fails', async () => {
      const service = new SessionInfoService(testDir);
      
      // Mock fs to throw error
      spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      try {
        await service.initialize();
        fail('Expected initialization to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Session info database initialization failed');
      }
      
      // Restore mock
      (fs.mkdirSync as any).mockRestore();
    });

    it('should prevent multiple initializations', async () => {
      const service = new SessionInfoService(testDir);
      
      await service.initialize();
      
      // Second initialization should not throw
      await service.initialize(); // Test passes if no error thrown
    });
  });

  describe('getSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      spyOn(service['jsonManager'], 'read').mockImplementation(() => Promise.reject(mockError));
      
      const sessionInfo = await service.getSessionInfo('test-session');
      
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      expect(sessionInfo.archived).toBe(false);
      expect(sessionInfo.continuation_session_id).toBe('');
      expect(sessionInfo.initial_commit_head).toBe('');
      
      // Restore mock
    });

    it('should return default values when creation fails', async () => {
      const sessionId = 'creation-fail-session';
      
      // Mock read to return empty sessions (session doesn't exist)
      spyOn(service['jsonManager'], 'read').mockImplementation(() => Promise.resolve({
        sessions: {},
        metadata: {
          schema_version: 3,
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }
      }));
      
      // Mock update to throw error (creation fails)
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(new Error('Update failed')));
      
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
    });
  });

  describe('updateCustomName', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData: SessionInfoDatabase = JSON.parse(dbContent);
      
      expect(new Date(dbData.metadata.last_updated).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });

    it('should throw error on update failure', async () => {
      const testSessionId = 'test-session';
      const testCustomName = 'Test Session';
      
      // Mock JsonFileManager to throw error
      const mockError = new Error('Write error');
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(mockError));
      
      try {
        await service.updateCustomName(testSessionId, testCustomName);
        fail('Expected updateCustomName to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update session info');
      }
      
      // Restore mock
    });
  });

  describe('updateSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(mockError));
      
      try {
        await service.updateSessionInfo(testSessionId, { custom_name: 'Test' });
        fail('Expected updateSessionInfo to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update session info');
      }
      
      // Restore mock
    });
  });

  describe('deleteSession', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      await service.deleteSession('non-existent-session'); // Test passes if no error thrown
    });

    it('should throw error on deletion failure', async () => {
      const testSessionId = 'test-session';
      
      // Mock JsonFileManager to throw error
      const mockError = new Error('Delete error');
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(mockError));
      
      try {
        await service.deleteSession(testSessionId);
        fail('Expected deleteSession to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to delete session info');
      }
      
      // Restore mock
    });
  });

  describe('getAllSessionInfo', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      spyOn(service['jsonManager'], 'read').mockImplementation(() => Promise.reject(mockError));
      
      const allSessionInfo = await service.getAllSessionInfo();
      
      expect(allSessionInfo).toEqual({});
      
      // Restore mock
    });
  });

  describe('getStats', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      const freshService = new SessionInfoService(testDir);
      const stats = await freshService.getStats();
      
      expect(stats.sessionCount).toBe(0);
      // Note: dbSize might be > 0 if file exists from ensureMetadata
      expect(stats.dbSize).toBeGreaterThanOrEqual(0);
      expect(stats.lastUpdated).toBeDefined();
    });

    it('should return default stats on error', async () => {
      // Mock JsonFileManager to throw error
      const mockError = new Error('Stats error');
      spyOn(service['jsonManager'], 'read').mockImplementation(() => Promise.reject(mockError));
      
      const stats = await service.getStats();
      
      expect(stats.sessionCount).toBe(0);
      expect(stats.dbSize).toBe(0);
      expect(stats.lastUpdated).toBeDefined();
      
      // Restore mock
    });
  });

  describe('archiveAllSessions', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
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
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(mockError));

      try {
        await service.archiveAllSessions();
        fail('Expected archiveAllSessions to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to archive all sessions');
      }

      // Restore mock
    });
  });

  describe('multiple instances behavior', () => {
    it('should allow multiple instances with the same directory', async () => {
      const service1 = new SessionInfoService(testDir);
      await service1.initialize();
      await service1.updateCustomName('test-session', 'Test Name');
      
      // Create second instance using same directory
      const service2 = new SessionInfoService(testDir);
      await service2.initialize();
      
      const sessionInfo = await service2.getSessionInfo('test-session');
      expect(sessionInfo.custom_name).toBe('Test Name');
    });
  });

  describe('schema migrations', () => {
    it('should create missing metadata', async () => {
      const service = new SessionInfoService(testDir);
      
      // Create database file without metadata
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify({
        sessions: {
          'test-session': {
            custom_name: 'Test Session',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            version: 1
          }
        }
        // Note: no metadata field
      }));
      
      await service.initialize();
      
      // Verify metadata was created
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData = JSON.parse(dbContent);
      
      expect(dbData.metadata).toBeDefined();
      expect(dbData.metadata.schema_version).toBe(3);
      expect(dbData.metadata.created_at).toBeDefined();
      expect(dbData.metadata.last_updated).toBeDefined();
    });

    it('should migrate from schema version 1 to 3', async () => {
      const service = new SessionInfoService(testDir);
      
      // Create database file with schema version 1
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify({
        sessions: {
          'session-1': {
            custom_name: 'Session 1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            version: 1
          },
          'session-2': {
            custom_name: 'Session 2',
            created_at: '2024-01-02T00:00:00.000Z',
            updated_at: '2024-01-02T00:00:00.000Z',
            version: 1
          }
        },
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      }));
      
      await service.initialize();
      
      // Verify sessions were migrated
      const session1 = await service.getSessionInfo('session-1');
      const session2 = await service.getSessionInfo('session-2');
      
      // Check version 2 fields
      expect(session1.pinned).toBe(false);
      expect(session1.archived).toBe(false);
      expect(session1.continuation_session_id).toBe('');
      expect(session1.initial_commit_head).toBe('');
      
      // Check version 3 fields
      expect(session1.permission_mode).toBe('default');
      expect(session1.version).toBe(3);
      
      expect(session2.pinned).toBe(false);
      expect(session2.archived).toBe(false);
      expect(session2.continuation_session_id).toBe('');
      expect(session2.initial_commit_head).toBe('');
      expect(session2.permission_mode).toBe('default');
      expect(session2.version).toBe(3);
      
      // Verify metadata was updated
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData = JSON.parse(dbContent);
      expect(dbData.metadata.schema_version).toBe(3);
    });

    it('should migrate from schema version 2 to 3', async () => {
      const service = new SessionInfoService(testDir);
      
      // Create database file with schema version 2
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify({
        sessions: {
          'session-1': {
            custom_name: 'Session 1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            version: 2,
            pinned: true,
            archived: false,
            continuation_session_id: 'next-session',
            initial_commit_head: 'abc123'
          }
        },
        metadata: {
          schema_version: 2,
          created_at: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      }));
      
      await service.initialize();
      
      // Verify session was migrated
      const session1 = await service.getSessionInfo('session-1');
      
      // Version 2 fields should be preserved
      expect(session1.pinned).toBe(true);
      expect(session1.archived).toBe(false);
      expect(session1.continuation_session_id).toBe('next-session');
      expect(session1.initial_commit_head).toBe('abc123');
      
      // Version 3 fields should be added
      expect(session1.permission_mode).toBe('default');
      expect(session1.version).toBe(3);
      
      // Verify metadata was updated
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      const dbData = JSON.parse(dbContent);
      expect(dbData.metadata.schema_version).toBe(3);
    });

    it('should handle migration errors gracefully', async () => {
      const service = new SessionInfoService(testDir);
      
      // Create database file with schema version 1
      const dbPath = path.join(testDir, '.cui', 'session-info.json');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify({
        sessions: {},
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      }));
      
      // Mock update to throw error during migration
      const mockError = new Error('Migration error');
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(mockError));
      
      // Initialize should throw the migration error
      try {
        await service.initialize();
        fail('Expected initialize to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Session info database initialization failed: Migration error');
      }
      
      // Restore mock
    });
  });

  describe('getStats with file system errors', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
      await service.initialize();
    });

    it('should handle stat error when file does not exist', async () => {
      // Mock statSync to throw error (file doesn't exist)
      spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      
      const stats = await service.getStats();
      
      expect(stats.sessionCount).toBe(0);
      expect(stats.dbSize).toBe(0); // Should be 0 when stat fails
      expect(stats.lastUpdated).toBeDefined();
      
      // Restore mock
    });
  });

  describe('testing helper methods', () => {
    it('should reinitialize paths with custom config directory', () => {
      const service = new SessionInfoService(testDir);
      const originalDbPath = service.getDbPath();
      const originalConfigDir = service.getConfigDir();
      
      // Create a different test directory
      const newTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-new-test-'));
      
      // Reinitialize paths with new directory
      service.reinitializePaths(newTestDir);
      
      // Verify paths have changed
      const newDbPath = service.getDbPath();
      const newConfigDir = service.getConfigDir();
      
      expect(newDbPath).not.toBe(originalDbPath);
      expect(newConfigDir).not.toBe(originalConfigDir);
      expect(newDbPath).toContain(newTestDir);
      expect(newConfigDir).toContain(newTestDir);
      
      // Clean up
      fs.rmSync(newTestDir, { recursive: true, force: true });
    });

    it('should return correct database and config paths', async () => {
      const service = new SessionInfoService(testDir);
      await service.initialize();
      
      const dbPath = service.getDbPath();
      const configDir = service.getConfigDir();
      
      expect(dbPath).toBe(path.join(testDir, '.cui', 'session-info.json'));
      expect(configDir).toBe(path.join(testDir, '.cui'));
    });
  });

  describe('concurrent access scenarios', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
      await service.initialize();
    });

    it('should handle concurrent updates to the same session', async () => {
      const sessionId = 'concurrent-session';
      
      // Create multiple concurrent update promises
      const updates = Array(5).fill(0).map((_, index) => 
        service.updateSessionInfo(sessionId, {
          custom_name: `Update ${index}`,
          pinned: index % 2 === 0
        })
      );
      
      // Wait for all updates to complete
      const results = await Promise.all(updates);
      
      // All updates should succeed
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.version).toBe(3);
      });
      
      // Final state should be from one of the updates
      const finalSession = await service.getSessionInfo(sessionId);
      expect(finalSession.custom_name).toMatch(/^Update \d$/);
    });

    it('should handle concurrent reads while updating', async () => {
      const sessionId = 'read-write-session';
      
      // Create initial session
      await service.updateSessionInfo(sessionId, { custom_name: 'Initial' });
      
      // Start an update and multiple reads concurrently
      const updatePromise = service.updateSessionInfo(sessionId, { 
        custom_name: 'Updated',
        pinned: true 
      });
      
      const readPromises = Array(3).fill(0).map(() => 
        service.getSessionInfo(sessionId)
      );
      
      // Wait for all operations
      const [updateResult, ...readResults] = await Promise.all([
        updatePromise,
        ...readPromises
      ]);
      
      // Update should succeed
      expect(updateResult.custom_name).toBe('Updated');
      expect(updateResult.pinned).toBe(true);
      
      // Reads should return either old or new state (both are valid during concurrent access)
      readResults.forEach(result => {
        expect(['Initial', 'Updated']).toContain(result.custom_name);
        expect([false, true]).toContain(result.pinned);
      });
    });
  });

  describe('file system error handling', () => {
    let service: SessionInfoService;

    beforeEach(async () => {
      service = new SessionInfoService(testDir);
      await service.initialize();
    });

    it('should handle read errors during getSessionInfo', async () => {
      const sessionId = 'error-session';
      
      // Create a session first
      await service.updateSessionInfo(sessionId, { custom_name: 'Test' });
      
      // Mock read to fail
      spyOn(service['jsonManager'], 'read').mockImplementation(() => Promise.reject(new Error('Read failed')));
      
      // Should return defaults on error
      const sessionInfo = await service.getSessionInfo(sessionId);
      
      expect(sessionInfo.custom_name).toBe('');
      expect(sessionInfo.version).toBe(3);
      expect(sessionInfo.pinned).toBe(false);
      
      // Restore mock
    });

    it('should handle write errors during updateSessionInfo', async () => {
      const sessionId = 'write-error-session';
      
      // Mock update to fail
      spyOn(service['jsonManager'], 'update').mockImplementation(() => Promise.reject(new Error('Write failed')));
      
      // Should throw error
      await expect(
        service.updateSessionInfo(sessionId, { custom_name: 'Test' })
      ).rejects.toThrow('Failed to update session info: Write failed');
      
      // Restore mock
    });

    it('should handle permission errors during initialization', async () => {
      // Create fresh service
      const freshService = new SessionInfoService(testDir);
      
      // Mock existsSync to return false so mkdirSync is called
      spyOn(fs, 'existsSync').mockReturnValue(false);
      
      // Mock mkdirSync to fail with permission error
      spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      
      // Should throw initialization error
      try {
        await freshService.initialize();
        fail('Expected initialize to throw');
      } catch (error) {
        expect((error as Error).message).toContain('Session info database initialization failed: EACCES: permission denied');
      }
      
      // Restore mock
    });
  });
});
