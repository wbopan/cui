import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createConversationRoutes } from '@/routes/conversation.routes';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import { SessionInfoService } from '@/services/session-info-service';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import { ToolMetricsService } from '@/services/ToolMetricsService';

vi.mock('@/services/logger.js');

describe('Conversation Routes - Unified Start/Resume Endpoint', () => {
  let app: express.Application;
  let processManager: vi.Mocked<ClaudeProcessManager>;
  let sessionInfoService: vi.Mocked<SessionInfoService>;
  let historyReader: vi.Mocked<ClaudeHistoryReader>;
  let conversationStatusManager: vi.Mocked<ConversationStatusManager>;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    processManager = {
      startConversation: vi.fn(),
    } as any;

    sessionInfoService = {
      updateSessionInfo: vi.fn(),
      getSessionInfo: vi.fn(),
      syncMissingSessions: vi.fn(),
    } as any;

    historyReader = {
      fetchConversation: vi.fn(),
    } as any;

    conversationStatusManager = {
      registerActiveSession: vi.fn(),
    } as any;

    const mockServices = {
      statusTracker: {} as any,
      toolMetricsService: {} as any,
    };

    app.use('/api/conversations', createConversationRoutes(
      processManager,
      historyReader,
      mockServices.statusTracker,
      sessionInfoService,
      conversationStatusManager,
      mockServices.toolMetricsService
    ));
    
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  describe('POST /api/conversations/start', () => {
    it('should start new conversation without resumedSessionId', async () => {
      const mockSystemInit = {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'new-session-123',
        cwd: '/path/to/project',
        tools: [],
        mcp_servers: [],
        model: 'claude-3',
        permissionMode: 'prompt',
        apiKeySource: 'env'
      };

      processManager.startConversation.mockResolvedValue({
        streamingId: 'stream-123',
        systemInit: mockSystemInit
      });

      sessionInfoService.updateSessionInfo.mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/conversations/start')
        .send({
          workingDirectory: '/path/to/project',
          initialPrompt: 'Hello Claude!'
        });

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('new-session-123');
      expect(processManager.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDirectory: '/path/to/project',
          initialPrompt: 'Hello Claude!',
          previousMessages: undefined
        })
      );
    });

    it('should handle resume with resumedSessionId and set continuation_session_id', async () => {
      const mockSystemInit = {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'new-session-123',
        cwd: '/path/to/git/repo',
        tools: [],
        mcp_servers: [],
        model: 'claude-3',
        permissionMode: 'prompt',
        apiKeySource: 'env'
      };

      const mockPreviousMessages = [
        { uuid: '1', type: 'user' as const, message: 'Previous message' }
      ];

      historyReader.fetchConversation.mockResolvedValue(mockPreviousMessages as any);
      sessionInfoService.getSessionInfo.mockResolvedValue({ permission_mode: 'default' } as any);

      processManager.startConversation.mockResolvedValue({
        streamingId: 'stream-123',
        systemInit: mockSystemInit
      });

      sessionInfoService.updateSessionInfo.mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/conversations/start')
        .send({
          resumedSessionId: 'original-session-456',
          initialPrompt: 'Continue the conversation',
          workingDirectory: '/path/to/git/repo'
        });

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('new-session-123');

      // Verify previous messages were fetched
      expect(historyReader.fetchConversation).toHaveBeenCalledWith('original-session-456');

      // Verify continuation_session_id was set on original session
      expect(sessionInfoService.updateSessionInfo).toHaveBeenCalledWith(
        'original-session-456',
        { continuation_session_id: 'new-session-123' }
      );

      // Verify process manager was called with previous messages
      expect(processManager.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDirectory: '/path/to/git/repo',
          initialPrompt: 'Continue the conversation',
          previousMessages: mockPreviousMessages,
          resumedSessionId: 'original-session-456'
        })
      );

      // Verify active session was registered with inherited messages
      expect(conversationStatusManager.registerActiveSession).toHaveBeenCalledWith(
        'stream-123',
        'new-session-123',
        expect.objectContaining({
          inheritedMessages: mockPreviousMessages
        })
      );
    });

    it('should handle missing workingDirectory validation', async () => {
      const response = await request(app)
        .post('/api/conversations/start')
        .send({
          initialPrompt: 'Hello Claude!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('workingDirectory is required');
    });

    it('should handle missing initialPrompt validation', async () => {
      const response = await request(app)
        .post('/api/conversations/start')
        .send({
          workingDirectory: '/path/to/project'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('initialPrompt is required');
    });

    it('should inherit permission mode from original session when resuming', async () => {
      const mockSystemInit = {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'new-session-123',
        cwd: '/path/to/git/repo',
        tools: [],
        mcp_servers: [],
        model: 'claude-3',
        permissionMode: 'bypassPermissions',
        apiKeySource: 'env'
      };

      historyReader.fetchConversation.mockResolvedValue([]);
      sessionInfoService.getSessionInfo.mockResolvedValue({ permission_mode: 'bypassPermissions' } as any);

      processManager.startConversation.mockResolvedValue({
        streamingId: 'stream-123',
        systemInit: mockSystemInit
      });

      const response = await request(app)
        .post('/api/conversations/start')
        .send({
          resumedSessionId: 'original-session-456',
          initialPrompt: 'Continue the conversation',
          workingDirectory: '/path/to/git/repo'
          // Note: not providing permissionMode, should inherit from original session
        });

      expect(response.status).toBe(200);
      expect(processManager.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionMode: 'bypassPermissions'
        })
      );
    });
  });

  describe('POST /api/conversations/archive-all', () => {
    beforeEach(() => {
      sessionInfoService.archiveAllSessions = vi.fn();
    });

    it('should archive all sessions successfully', async () => {
      sessionInfoService.archiveAllSessions.mockResolvedValue(5);

      const response = await request(app)
        .post('/api/conversations/archive-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        archivedCount: 5,
        message: 'Successfully archived 5 sessions'
      });
      expect(sessionInfoService.archiveAllSessions).toHaveBeenCalled();
    });

    it('should handle archiving zero sessions', async () => {
      sessionInfoService.archiveAllSessions.mockResolvedValue(0);

      const response = await request(app)
        .post('/api/conversations/archive-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        archivedCount: 0,
        message: 'Successfully archived 0 sessions'
      });
      expect(sessionInfoService.archiveAllSessions).toHaveBeenCalled();
    });

    it('should handle archiving one session with singular message', async () => {
      sessionInfoService.archiveAllSessions.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/conversations/archive-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        archivedCount: 1,
        message: 'Successfully archived 1 session'
      });
      expect(sessionInfoService.archiveAllSessions).toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      sessionInfoService.archiveAllSessions.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/conversations/archive-all')
        .send();

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
      expect(sessionInfoService.archiveAllSessions).toHaveBeenCalled();
    });
  });
});