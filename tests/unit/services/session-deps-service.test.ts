import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SessionDepsService } from '@/services/session-deps-service';
import { JsonFileManager } from '@/services/json-file-manager';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import type { SessionDepsDatabase, SessionDepsInfo, ConversationSummary, ConversationMessage } from '@/types';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '@/services/logger';

// Mock dependencies
jest.mock('@/services/json-file-manager');
jest.mock('@/services/claude-history-reader', () => ({
  ClaudeHistoryReader: jest.fn()
}));
jest.mock('@/services/logger');
jest.mock('os');
jest.mock('fs');

describe('SessionDepsService', () => {
  let service: SessionDepsService;
  let mockJsonManager: any;
  let mockHistoryReader: any;
  const testHomedir = '/test/home';
  const expectedDbPath = path.join(testHomedir, '.ccui', 'session-deps.json');

  beforeEach(async () => {
    jest.clearAllMocks();
    SessionDepsService.resetInstance();
    
    // Mock os.homedir
    (os.homedir as jest.Mock).mockReturnValue(testHomedir);
    
    // Mock fs
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    // Mock logger
    const mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    (createLogger as jest.Mock).mockReturnValue(mockLogger);
    
    // Mock JsonFileManager
    mockJsonManager = {
      read: jest.fn(),
      update: jest.fn(),
    };
    mockJsonManager.read.mockResolvedValue({
      sessions: {},
      metadata: {
        schema_version: 1,
        created_at: '2024-01-01T00:00:00Z',
        last_updated: '2024-01-01T00:00:00Z',
        total_sessions: 0
      }
    });
    mockJsonManager.update.mockResolvedValue(undefined);
    (JsonFileManager as jest.MockedClass<typeof JsonFileManager>).mockImplementation(() => mockJsonManager);
    
    // Mock ClaudeHistoryReader
    mockHistoryReader = {
      getConversationDetails: jest.fn(),
    } as any;
    
    // Make sure constructor returns our mock
    const MockedClaudeHistoryReader = ClaudeHistoryReader as jest.MockedClass<typeof ClaudeHistoryReader>;
    MockedClaudeHistoryReader.mockImplementation(() => mockHistoryReader);
    
    service = SessionDepsService.getInstance();
    service.reinitializePaths();
    service.setHistoryReaderForTesting(mockHistoryReader);
    service.setJsonManagerForTesting(mockJsonManager as any);
  });

  afterEach(() => {
    SessionDepsService.resetInstance();
  });

  describe('Hash Calculation', () => {
    it('should calculate deterministic prefix hashes', async () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: 'Hello' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'session-1'
        },
        {
          uuid: '2',
          type: 'assistant',
          message: { role: 'assistant', content: 'Hi there!' },
          timestamp: '2024-01-01T00:01:00Z',
          sessionId: 'session-1'
        }
      ];

      // Mock the getConversationDetails to return our test messages
      mockHistoryReader.getConversationDetails.mockResolvedValue({
        messages,
        summary: 'Test conversation',
        projectPath: '/test/project',
        metadata: {
          totalCost: 0,
          totalDuration: 0,
          model: 'claude-3'
        }
      });

      // Mock database with empty sessions
      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          total_sessions: 0
        }
      });

      // Keep track of captured data from update calls
      let capturedData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        // Start with current data or default
        const currentData = capturedData || {
          sessions: {},
          metadata: {
            schema_version: 1,
            created_at: '2024-01-01T00:00:00Z',
            last_updated: '2024-01-01T00:00:00Z',
            total_sessions: 0
          }
        };
        capturedData = updater(currentData);
        return undefined;
      });

      // Initialize service
      await service.initialize();

      // Test hash calculation
      const conversations: ConversationSummary[] = [{
        sessionId: 'session-1',
        projectPath: '/test/project',
        summary: 'Test conversation',
        custom_name: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        messageCount: 2,
        totalCost: 0,
        totalDuration: 0,
        model: 'claude-3',
        status: 'completed',
        leaf_session: '',
        hash: ''
      }];

      await service.getEnhancedConversations(conversations);

      // Check if getConversationDetails was called
      expect(mockHistoryReader.getConversationDetails).toHaveBeenCalledWith('session-1');
      
      // Check if update was called
      expect(mockJsonManager.update).toHaveBeenCalled();

      // Verify hashes were calculated
      expect(capturedData).toBeTruthy();
      expect(capturedData!.sessions['session-1']).toBeTruthy();
      const capturedHashes = capturedData!.sessions['session-1'].prefix_hashes;
      expect(capturedHashes).toHaveLength(2);
      
      // Calculate expected hashes manually
      const message1Data = { role: 'user', content: 'Hello' };
      const hash1 = crypto.createHash('sha256').update('' + JSON.stringify(message1Data)).digest('hex');
      
      const message2Data = { role: 'assistant', content: 'Hi there!' };
      const hash2 = crypto.createHash('sha256').update(hash1 + JSON.stringify(message2Data)).digest('hex');
      
      expect(capturedHashes[0]).toBe(hash1);
      expect(capturedHashes[1]).toBe(hash2);
    });

    it('should handle different message formats correctly', async () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello with blocks' }] },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'session-2'
        }
      ];

      mockHistoryReader.getConversationDetails.mockResolvedValue({
        messages,
        summary: 'Test',
        projectPath: '/test',
        metadata: { totalCost: 0, totalDuration: 0, model: 'claude-3' }
      });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let capturedHashes: string[] = [];
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        const result = updater(data);
        if (result.sessions['session-2']) {
          capturedHashes = result.sessions['session-2'].prefix_hashes;
        }
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [{
        sessionId: 'session-2',
        projectPath: '/test',
        summary: 'Test',
        custom_name: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalCost: 0,
        totalDuration: 0,
        model: 'claude-3',
        status: 'completed',
        leaf_session: '',
        hash: ''
      }];

      await service.getEnhancedConversations(conversations);

      expect(capturedHashes).toHaveLength(1);
      
      // Text should be extracted from content blocks
      const expectedData = { role: 'user', content: 'Hello with blocks' };
      const expectedHash = crypto.createHash('sha256').update('' + JSON.stringify(expectedData)).digest('hex');
      expect(capturedHashes[0]).toBe(expectedHash);
    });

    it('should produce different hashes for different sequences', async () => {
      // Two sessions with different messages
      const session1Messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: 'Message A' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'session-A'
        }
      ];

      const session2Messages: ConversationMessage[] = [
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: 'Message B' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'session-B'
        }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({
          messages: session1Messages,
          summary: 'Test A',
          projectPath: '/test',
          metadata: { totalCost: 0, totalDuration: 0, model: 'claude-3' }
        })
        .mockResolvedValueOnce({
          messages: session2Messages,
          summary: 'Test B',
          projectPath: '/test',
          metadata: { totalCost: 0, totalDuration: 0, model: 'claude-3' }
        });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      const capturedSessions: Record<string, SessionDepsInfo> = {};
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        const result = updater(data);
        Object.assign(capturedSessions, result.sessions);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        {
          sessionId: 'session-A',
          projectPath: '/test',
          summary: 'Test A',
          custom_name: '',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 1,
          totalCost: 0,
          totalDuration: 0,
          model: 'claude-3',
          status: 'completed',
          leaf_session: '',
          hash: ''
        },
        {
          sessionId: 'session-B',
          projectPath: '/test',
          summary: 'Test B',
          custom_name: '',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 1,
          totalCost: 0,
          totalDuration: 0,
          model: 'claude-3',
          status: 'completed',
          leaf_session: '',
          hash: ''
        }
      ];

      await service.getEnhancedConversations(conversations);

      // Verify different messages produce different hashes
      expect(capturedSessions['session-A'].end_hash).not.toBe(capturedSessions['session-B'].end_hash);
    });
  });

  describe('Tree Building - CORRECTED ALGORITHM', () => {
    it('should identify direct parent-child relationships', async () => {
      // Simulate A(1,2) -> B(1,2,3)
      const sessionAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response 1' }, timestamp: '', sessionId: 'A' }
      ];

      const sessionBMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '3', type: 'user', message: { role: 'user', content: 'Message 2' }, timestamp: '', sessionId: 'B' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 3, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['B'].parent_session).toBe('A');
      expect(finalData!.sessions['A'].children_sessions).toContain('B');
    });

    it('should handle gaps: A(1) -> B(1,2,3) where no (1,2) exists', async () => {
      // Simulate A(1) -> B(1,2,3) with no intermediate session
      const sessionAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' }
      ];

      const sessionBMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '3', type: 'user', message: { role: 'user', content: 'Message 2' }, timestamp: '', sessionId: 'B' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 3, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['B'].parent_session).toBe('A');
      expect(finalData!.sessions['A'].children_sessions).toContain('B');
    });

    it('should select closest parent: A(1) <- C(1,2) <- B(1,2,3)', async () => {
      // Three sessions where C is the direct parent of B, not A
      const sessionAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' }
      ];

      const sessionCMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'C' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response 1' }, timestamp: '', sessionId: 'C' }
      ];

      const sessionBMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '3', type: 'user', message: { role: 'user', content: 'Message 2' }, timestamp: '', sessionId: 'B' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionCMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'C', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 3, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['B'].parent_session).toBe('C'); // Not A
      expect(finalData!.sessions['C'].parent_session).toBe('A');
      expect(finalData!.sessions['C'].children_sessions).toContain('B');
      expect(finalData!.sessions['A'].children_sessions).toContain('C');
    });

    it('should handle complex branching scenarios', async () => {
      // A(1) -> B(1,2) and A(1) -> C(1,3)
      const sessionAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' }
      ];

      const sessionBMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'B' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'Response B' }, timestamp: '', sessionId: 'B' }
      ];

      const sessionCMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'C' },
        { uuid: '3', type: 'assistant', message: { role: 'assistant', content: 'Response C' }, timestamp: '', sessionId: 'C' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionCMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'C', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['B'].parent_session).toBe('A');
      expect(finalData!.sessions['C'].parent_session).toBe('A');
      expect(finalData!.sessions['A'].children_sessions).toHaveLength(2);
      expect(finalData!.sessions['A'].children_sessions).toContain('B');
      expect(finalData!.sessions['A'].children_sessions).toContain('C');
    });
  });

  describe('Leaf Calculation', () => {
    it('should identify leaf as itself for leaf nodes', async () => {
      // Single session with no children
      const sessionAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['A'].leaf_session).toBe('A');
    });

    it('should find nearest leaf for branching scenarios', async () => {
      // A -> B -> C (leaf)
      //   -> D (leaf)
      // A's nearest leaf should be either C or D (deterministic choice)
      const messages = [
        { uuid: '1', type: 'user' as const, message: { role: 'user' as const, content: 'Msg 1' }, timestamp: '', sessionId: 'A' },
        { uuid: '2', type: 'user' as const, message: { role: 'user' as const, content: 'Msg 2' }, timestamp: '', sessionId: 'B' },
        { uuid: '3', type: 'user' as const, message: { role: 'user' as const, content: 'Msg 3' }, timestamp: '', sessionId: 'C' },
        { uuid: '4', type: 'user' as const, message: { role: 'user' as const, content: 'Msg 4' }, timestamp: '', sessionId: 'D' }
      ];

      // Setup messages so that: A(1) -> B(1,2) -> C(1,2,3) and A(1) -> D(1,4)
      const sessionAMessages = [messages[0]];
      const sessionBMessages = [messages[0], messages[1]];
      const sessionCMessages = [messages[0], messages[1], messages[2]];
      const sessionDMessages = [messages[0], messages[3]];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionCMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } })
        .mockResolvedValueOnce({ messages: sessionDMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        const data = { sessions: {}, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 } };
        finalData = updater(data);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'C', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 3, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'D', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      expect(finalData).toBeTruthy();
      // C and D are leaves
      expect(finalData!.sessions['C'].leaf_session).toBe('C');
      expect(finalData!.sessions['D'].leaf_session).toBe('D');
      // B's nearest leaf is C
      expect(finalData!.sessions['B'].leaf_session).toBe('C');
      // A's nearest leaf should be D (distance 1) since it's closer than C (distance 2)
      expect(finalData!.sessions['A'].leaf_session).toBe('D');
    });
  });

  describe('Incremental Updates', () => {
    it('should only update changed sessions', async () => {
      // Initial state with session A
      const initialData: SessionDepsDatabase = {
        sessions: {
          'A': {
            session_id: 'A',
            prefix_hashes: ['hash1'],
            end_hash: 'hash1',
            leaf_session: 'A',
            parent_session: undefined,
            children_sessions: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            message_count: 1
          }
        },
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          total_sessions: 1
        }
      };

      mockJsonManager.read.mockResolvedValue(initialData);

      // Session A hasn't changed, but we're adding session B
      const sessionBMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'New message' }, timestamp: '', sessionId: 'B' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: sessionBMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      let updateCallCount = 0;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        updateCallCount++;
        updater(initialData);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      // Should only fetch details for the new session B
      expect(mockHistoryReader.getConversationDetails).toHaveBeenCalledTimes(1);
      expect(mockHistoryReader.getConversationDetails).toHaveBeenCalledWith('B');
    });

    it('should correctly identify affected sessions', async () => {
      // A -> B, and we're updating A which should affect B
      const initialData: SessionDepsDatabase = {
        sessions: {
          'A': {
            session_id: 'A',
            prefix_hashes: ['hash1'],
            end_hash: 'hash1',
            leaf_session: 'B',
            parent_session: undefined,
            children_sessions: ['B'],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            message_count: 1
          },
          'B': {
            session_id: 'B',
            prefix_hashes: ['hash1', 'hash2'],
            end_hash: 'hash2',
            leaf_session: 'B',
            parent_session: 'A',
            children_sessions: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            message_count: 2
          }
        },
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          total_sessions: 2
        }
      };

      mockJsonManager.read.mockResolvedValue(initialData);

      // A now has 2 messages (was 1)
      const updatedAMessages: ConversationMessage[] = [
        { uuid: '1', type: 'user', message: { role: 'user', content: 'Message 1' }, timestamp: '', sessionId: 'A' },
        { uuid: '2', type: 'assistant', message: { role: 'assistant', content: 'New response' }, timestamp: '', sessionId: 'A' }
      ];

      mockHistoryReader.getConversationDetails
        .mockResolvedValueOnce({ messages: updatedAMessages, summary: '', projectPath: '', metadata: { totalCost: 0, totalDuration: 0, model: '' } });

      let finalData: SessionDepsDatabase | null = null;
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        finalData = updater(initialData);
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'A', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' },
        { sessionId: 'B', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 2, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      await service.getEnhancedConversations(conversations);

      // A should be updated because message count changed
      expect(mockHistoryReader.getConversationDetails).toHaveBeenCalledWith('A');
      expect(finalData).toBeTruthy();
      expect(finalData!.sessions['A'].message_count).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle missing conversation data', async () => {
      mockHistoryReader.getConversationDetails.mockRejectedValue(new Error('Conversation not found'));
      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });

      await service.initialize();

      const conversations: ConversationSummary[] = [
        { sessionId: 'missing', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      const enhanced = await service.getEnhancedConversations(conversations);

      // Should return with default values
      expect(enhanced[0].leaf_session).toBe('missing');
      expect(enhanced[0].hash).toBe('');
    });

    it('should handle database read errors gracefully', async () => {
      // Initialize successfully first
      mockJsonManager.read.mockResolvedValue({
        sessions: {},
        metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 0 }
      });
      await service.initialize();

      // Then mock read error for getEnhancedConversations
      mockJsonManager.read.mockRejectedValue(new Error('Database read error'));

      const conversations: ConversationSummary[] = [
        { sessionId: 'test', projectPath: '', summary: '', custom_name: '', createdAt: '', updatedAt: '', messageCount: 1, totalCost: 0, totalDuration: 0, model: '', status: 'completed', leaf_session: '', hash: '' }
      ];

      const enhanced = await service.getEnhancedConversations(conversations);

      // Should return conversations with fallback values
      expect(enhanced[0]).toEqual({
        ...conversations[0],
        leaf_session: 'test',  // Falls back to sessionId
        hash: ''  // Empty hash on error
      });
    });
  });

  describe('Performance', () => {
    it('should handle 1000 sessions efficiently', async () => {
      const startTime = Date.now();

      // Generate 1000 sessions
      const sessions: Record<string, SessionDepsInfo> = {};
      const conversations: ConversationSummary[] = [];

      for (let i = 0; i < 1000; i++) {
        const sessionId = `session-${i}`;
        sessions[sessionId] = {
          session_id: sessionId,
          prefix_hashes: [`hash-${i}`],
          end_hash: `hash-${i}`,
          leaf_session: sessionId,
          parent_session: i > 0 ? `session-${i - 1}` : undefined,
          children_sessions: i < 999 ? [`session-${i + 1}`] : [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          message_count: 1
        };

        conversations.push({
          sessionId,
          projectPath: '/test',
          summary: `Session ${i}`,
          custom_name: '',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 1,
          totalCost: 0,
          totalDuration: 0,
          model: 'claude-3',
          status: 'completed',
          leaf_session: '',
          hash: ''
        });
      }

      mockJsonManager.read.mockResolvedValue({
        sessions,
        metadata: {
          schema_version: 1,
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          total_sessions: 1000
        }
      });

      // Mock update to just return the data
      mockJsonManager.update.mockImplementation(async (updater: any) => {
        updater({ sessions, metadata: { schema_version: 1, created_at: '', last_updated: '', total_sessions: 1000 } });
      });

      await service.initialize();
      await service.getEnhancedConversations(conversations);

      const elapsedTime = Date.now() - startTime;

      // Should complete in under 100ms (generous margin for CI)
      expect(elapsedTime).toBeLessThan(100);
    });
  });
});