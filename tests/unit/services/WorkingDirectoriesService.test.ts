import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { WorkingDirectoriesService } from '@/services/working-directories-service';
import { ClaudeHistoryReader } from '@/services/claude-history-reader.js';
import { createLogger } from '@/services/logger.js';
import { ConversationSummary } from '@/types';

vi.mock('@/services/claude-history-reader.js');

// Helper to create a ConversationSummary with default values
const createConversation = (overrides: Partial<ConversationSummary>): ConversationSummary => ({
  sessionId: 'default-id',
  projectPath: '/default/path',
  summary: 'Default summary',
  sessionInfo: {
    custom_name: '',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    version: 4,
    pinned: false,
    archived: false,
    continuation_session_id: '',
    initial_commit_head: '',
    permission_mode: 'default'
  },
  createdAt: '2024-01-01T10:00:00Z',
  updatedAt: '2024-01-01T10:00:00Z',
  messageCount: 1,
  totalDuration: 100,
  model: 'claude-3',
  status: 'completed' as const,
  ...overrides
});

describe('WorkingDirectoriesService', () => {
  let service: WorkingDirectoriesService;
  let mockHistoryReader: vi.Mocked<ClaudeHistoryReader>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockHistoryReader = new ClaudeHistoryReader() as vi.Mocked<ClaudeHistoryReader>;
    logger = createLogger('test');
    service = new WorkingDirectoriesService(mockHistoryReader, logger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorkingDirectories', () => {
    it('should return empty array when no conversations exist', async () => {
      mockHistoryReader.listConversations.mockResolvedValue({ conversations: [], total: 0 });

      const result = await service.getWorkingDirectories();

      expect(result).toEqual({
        directories: [],
        totalCount: 0
      });
    });

    it('should aggregate directories from conversations', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/user/project1',
          summary: 'Test 1',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z',
          messageCount: 1,
          totalDuration: 100
        }),
        createConversation({
          sessionId: '2',
          projectPath: '/home/user/project1',
          summary: 'Test 2',
          createdAt: '2024-01-02T10:00:00Z',
          updatedAt: '2024-01-02T10:00:00Z',
          messageCount: 2,
          totalDuration: 200
        }),
        createConversation({
          sessionId: '3',
          projectPath: '/home/user/project2',
          summary: 'Test 3',
          createdAt: '2024-01-03T10:00:00Z',
          updatedAt: '2024-01-03T10:00:00Z',
          messageCount: 1,
          totalDuration: 150
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      expect(result.totalCount).toBe(2);
      expect(result.directories).toHaveLength(2);
      
      const project1 = result.directories.find(d => d.path === '/home/user/project1');
      expect(project1).toBeDefined();
      expect(project1!.conversationCount).toBe(2);
      expect(project1!.lastDate).toBe('2024-01-02T10:00:00Z');
      
      const project2 = result.directories.find(d => d.path === '/home/user/project2');
      expect(project2).toBeDefined();
      expect(project2!.conversationCount).toBe(1);
      expect(project2!.lastDate).toBe('2024-01-03T10:00:00Z');
    });

    it('should sort directories by lastDate descending', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/user/old',
          summary: 'Old',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z'
        }),
        createConversation({
          sessionId: '2',
          projectPath: '/home/user/new',
          summary: 'New',
          createdAt: '2024-01-05T10:00:00Z',
          updatedAt: '2024-01-05T10:00:00Z'
        }),
        createConversation({
          sessionId: '3',
          projectPath: '/home/user/middle',
          summary: 'Middle',
          createdAt: '2024-01-03T10:00:00Z',
          updatedAt: '2024-01-03T10:00:00Z'
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      expect(result.directories[0].path).toBe('/home/user/new');
      expect(result.directories[1].path).toBe('/home/user/middle');
      expect(result.directories[2].path).toBe('/home/user/old');
    });

    it('should compute simple shortnames for unique directories', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/user/web',
          summary: 'Web',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z'
        }),
        createConversation({
          sessionId: '2',
          projectPath: '/home/user/api',
          summary: 'API',
          createdAt: '2024-01-02T10:00:00Z',
          updatedAt: '2024-01-02T10:00:00Z'
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      const web = result.directories.find(d => d.path === '/home/user/web');
      expect(web!.shortname).toBe('web');
      
      const api = result.directories.find(d => d.path === '/home/user/api');
      expect(api!.shortname).toBe('api');
    });

    it('should compute smart suffixes for conflicting directories', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/alice/project',
          summary: 'Alice project',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z'
        }),
        createConversation({
          sessionId: '2',
          projectPath: '/home/bob/project',
          summary: 'Bob project',
          createdAt: '2024-01-02T10:00:00Z',
          updatedAt: '2024-01-02T10:00:00Z'
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      const alice = result.directories.find(d => d.path === '/home/alice/project');
      expect(alice!.shortname).toBe('alice/project');
      
      const bob = result.directories.find(d => d.path === '/home/bob/project');
      expect(bob!.shortname).toBe('bob/project');
    });

    it('should handle single directory', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/user/only-project',
          summary: 'Only',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z'
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      expect(result.directories).toHaveLength(1);
      expect(result.directories[0].shortname).toBe('only-project');
    });

    it('should handle conversations without projectPath', async () => {
      const mockConversations: ConversationSummary[] = [
        createConversation({
          sessionId: '1',
          projectPath: '/home/user/project',
          summary: 'With path',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z'
        }),
        createConversation({
          sessionId: '2',
          projectPath: '', // Empty path
          summary: 'No path',
          createdAt: '2024-01-02T10:00:00Z',
          updatedAt: '2024-01-02T10:00:00Z'
        })
      ];

      mockHistoryReader.listConversations.mockResolvedValue({ conversations: mockConversations, total: mockConversations.length });

      const result = await service.getWorkingDirectories();

      expect(result.directories).toHaveLength(1);
      expect(result.directories[0].path).toBe('/home/user/project');
    });

    it('should handle error from history reader', async () => {
      const error = new Error('Failed to read history');
      mockHistoryReader.listConversations.mockRejectedValue(error);

      await expect(service.getWorkingDirectories()).rejects.toThrow('Failed to read history');
    });
  });
});