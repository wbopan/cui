import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import { ConversationListQuery } from '@/types';
import { createLogger } from '@/services/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock logger instance
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
};

// Mock SessionInfoService
const mockSessionInfoService = {
  getSessionInfo: vi.fn()
};

// Mock ToolMetricsService
const mockToolMetricsService = {
  calculateMetricsFromMessages: vi.fn(() => ({
    linesAdded: 0,
    linesRemoved: 0,
    editCount: 0,
    writeCount: 0
  }))
};

// Mock logger
vi.mock('@/services/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}));

// Mock SessionInfoService
vi.mock('@/services/session-info-service.js', () => ({
  SessionInfoService: {
    getInstance: vi.fn(() => mockSessionInfoService)
  }
}));

// Mock ToolMetricsService
vi.mock('@/services/ToolMetricsService.js', () => ({
  ToolMetricsService: vi.fn(() => mockToolMetricsService)
}));

describe('ClaudeHistoryReader', () => {
  let reader: ClaudeHistoryReader;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set up default mock session info
    mockSessionInfoService.getSessionInfo.mockResolvedValue({
      custom_name: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 2,
      pinned: false,
      archived: false,
      continuation_session_id: '',
      initial_commit_head: ''
    });
    
    // Create temporary Claude home directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-test-'));
    await fs.mkdir(path.join(tempDir, 'projects'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should use default home directory', () => {
      const defaultReader = new ClaudeHistoryReader();
      expect(defaultReader.homePath).toBe(path.join(os.homedir(), '.claude'));
    });
  });

  describe('listConversations', () => {
    it('should return empty result when projects directory does not exist', async () => {
      // Remove the projects directory
      await fs.rm(path.join(tempDir, 'projects'), { recursive: true, force: true });
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      const result = await reader.listConversations();
      
      expect(result).toEqual({
        conversations: [],
        total: 0
      });
    });

    it('should handle filesystem errors gracefully', async () => {
      // Create a file where we expect a directory to cause an error
      const fileInsteadOfDir = path.join(tempDir, 'projects');
      await fs.rm(fileInsteadOfDir, { recursive: true, force: true });
      await fs.writeFile(fileInsteadOfDir, 'not a directory');
      
      const invalidReader = new ClaudeHistoryReader();
      (invalidReader as any).claudeHomePath = tempDir;
      
      // Should handle filesystem errors gracefully and return empty result
      const result = await invalidReader.listConversations();
      expect(result).toEqual({
        conversations: [],
        total: 0
      });
    });

    it('should process project directories and conversations correctly', async () => {
      // Create project directory structure
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create conversation JSONL file with realistic Claude format
      const sessionId = '4f35e220-c435-4cf7-b9b9-f40426042847';
      const conversationFile = path.join(projectDir, 'conversation.jsonl');
      
      const conversationContent = `{"type":"summary","summary":"Example Development Session","leafUuid":"04d6794d-6350-4d37-abe4-f6f643fdf83d"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/project","sessionId":"${sessionId}","version":"1.0.3","type":"user","message":{"role":"user","content":"Please help me add a new config file to my project"},"uuid":"9ff29d57-8b28-4da9-8e7f-b0e4e7e2ba46","timestamp":"2025-05-26T07:27:40.079Z"}
{"parentUuid":"9ff29d57-8b28-4da9-8e7f-b0e4e7e2ba46","isSidechain":false,"userType":"external","cwd":"/Users/username/project","sessionId":"${sessionId}","version":"1.0.3","message":{"id":"msg_01Example123","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"text","text":"I'll help you add a new config file."}],"stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":200}},"durationMs":2500,"type":"assistant","uuid":"04d6794d-6350-4d37-abe4-f6f643fdf83d","timestamp":"2025-05-26T07:27:42.579Z"}`;
      
      await fs.writeFile(conversationFile, conversationContent);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      const result = await reader.listConversations();
      
      expect(result.conversations).toHaveLength(1);
      expect(result.total).toBe(1);
      
      const conversation = result.conversations[0];
      expect(conversation.sessionId).toBe(sessionId);
      expect(conversation.projectPath).toBe('/Users/username/project'); // Should use cwd from message
      expect(conversation.summary).toBe('Example Development Session'); // Should use summary linked via leafUuid
      expect(conversation.messageCount).toBe(2); // user + assistant message
      expect(conversation.createdAt).toBeDefined();
      expect(conversation.updatedAt).toBeDefined();
      // Total cost calculation has been removed
      expect(conversation.totalDuration).toBe(2500); // From assistant message
      expect(conversation.model).toBe('claude-opus-4-20250514'); // From assistant message
      expect(conversation.status).toBe('completed'); // CLI conversations are always completed
    });

    it('should apply filters correctly', async () => {
      // Create multiple project directories
      const project1Dir = path.join(path.join(tempDir, 'projects'), '-Users-username-project1');
      const project2Dir = path.join(path.join(tempDir, 'projects'), '-Users-username-project2');
      await fs.mkdir(project1Dir, { recursive: true });
      await fs.mkdir(project2Dir, { recursive: true });
      
      // Create conversations in different projects
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      const conversation1Content = `{"type":"summary","summary":"Project 1 Session","leafUuid":"msg1"}
{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z","sessionId":"${session1}","cwd":"/Users/username/project1"}`;
      
      const conversation2Content = `{"type":"summary","summary":"Project 2 Session","leafUuid":"msg2"}
{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg2","timestamp":"2024-01-02T00:00:00Z","sessionId":"${session2}","cwd":"/Users/username/project2"}`;
      
      await fs.writeFile(path.join(project1Dir, 'conv1.jsonl'), conversation1Content);
      await fs.writeFile(path.join(project2Dir, 'conv2.jsonl'), conversation2Content);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      // Test filtering by project path
      const filtered = await reader.listConversations({
        projectPath: '/Users/username/project1'
      });
      
      expect(filtered.conversations).toHaveLength(1);
      expect(filtered.conversations[0].sessionId).toBe(session1);
    });

    it('should apply pagination correctly', async () => {
      // Create multiple conversations in a single file (more realistic)
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create file with 5 different sessions
      let content = '';
      for (let i = 0; i < 5; i++) {
        const sessionId = `session-${i}`;
        content += `{"type":"summary","summary":"Test Session ${i}","leafUuid":"msg${i}"}
`;
        content += `{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello ${i}"},"uuid":"msg${i}","timestamp":"2024-01-0${i + 1}T00:00:00Z","sessionId":"${sessionId}"}
`;
      }
      
      await fs.writeFile(path.join(projectDir, 'conversations.jsonl'), content.trim());
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      // Test pagination
      const paginated = await reader.listConversations({
        limit: 3,
        offset: 1
      });
      
      expect(paginated.conversations).toHaveLength(3);
      expect(paginated.total).toBe(5);
    });

    it('should sort conversations correctly', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-sort-test');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create conversations with different timestamps in a single file
      const sessions = [
        { id: 'session-1', date: '2024-01-03T00:00:00Z' },
        { id: 'session-2', date: '2024-01-01T00:00:00Z' },
        { id: 'session-3', date: '2024-01-02T00:00:00Z' }
      ];
      
      let content = '';
      for (const session of sessions) {
        content += `{"type":"summary","summary":"Test Session","leafUuid":"msg-${session.id}"}
`;
        content += `{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg-${session.id}","timestamp":"${session.date}","sessionId":"${session.id}"}
`;
      }
      
      await fs.writeFile(path.join(projectDir, 'conversations.jsonl'), content.trim());
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      // Test sorting by created date ascending
      const sorted = await reader.listConversations({
        sortBy: 'created',
        order: 'asc'
      });
      
      expect(sorted.conversations[0].sessionId).toBe('session-2'); // earliest
      expect(sorted.conversations[2].sessionId).toBe('session-1'); // latest
    });

    it('should filter by archived status', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-test');
      await fs.mkdir(projectDir, { recursive: true });
      
      const session1 = 'archived-session';
      const session2 = 'active-session';
      
      // Create two separate conversation files
      const conversation1Content = `{"type":"summary","summary":"Archived Session","leafUuid":"msg1"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test","sessionId":"${session1}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z"}`;
      
      const conversation2Content = `{"type":"summary","summary":"Active Session","leafUuid":"msg2"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test","sessionId":"${session2}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg2","timestamp":"2024-01-02T00:00:00Z"}`;
      
      // Mock session info service to return different archived statuses
      // Clear the default mock first
      mockSessionInfoService.getSessionInfo.mockReset();
      mockSessionInfoService.getSessionInfo.mockImplementation((sessionId: string) => {
        if (sessionId === session1) {
          return Promise.resolve({
            custom_name: '',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            version: 2,
            pinned: false,
            archived: true,
            continuation_session_id: '',
            initial_commit_head: ''
          });
        }
        return Promise.resolve({
          custom_name: '',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          version: 2,
          pinned: false,
          archived: false,
          continuation_session_id: '',
          initial_commit_head: ''
        });
      });
      
      // Write files after setting up the mock
      await fs.writeFile(path.join(projectDir, 'conv1.jsonl'), conversation1Content);
      await fs.writeFile(path.join(projectDir, 'conv2.jsonl'), conversation2Content);
      
      // Create the reader AFTER setting up the mocks
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      // Directly replace the sessionInfoService instance with our mock
      (reader as any).sessionInfoService = mockSessionInfoService;
      
      // Test filtering by archived status
      const archivedOnly = await reader.listConversations({ archived: true });
      expect(archivedOnly.conversations).toHaveLength(1);
      expect(archivedOnly.conversations[0].sessionId).toBe(session1);
      
      const activeOnly = await reader.listConversations({ archived: false });
      expect(activeOnly.conversations).toHaveLength(1);
      expect(activeOnly.conversations[0].sessionId).toBe(session2);
    });

    it('should filter by continuation session status', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-test2');
      await fs.mkdir(projectDir, { recursive: true });
      
      const session1 = 'continuation-session';
      const session2 = 'standalone-session';
      
      // Create two separate conversation files
      const conversation1Content = `{"type":"summary","summary":"Continuation Session","leafUuid":"msg1"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test2","sessionId":"${session1}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z"}`;
      
      const conversation2Content = `{"type":"summary","summary":"Standalone Session","leafUuid":"msg2"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test2","sessionId":"${session2}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg2","timestamp":"2024-01-02T00:00:00Z"}`;
      
      // Mock session info service to return different continuation statuses
      mockSessionInfoService.getSessionInfo.mockReset();
      mockSessionInfoService.getSessionInfo.mockImplementation((sessionId: string) => {
        if (sessionId === session1) {
          return Promise.resolve({
            custom_name: '',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            version: 2,
            pinned: false,
            archived: false,
            continuation_session_id: 'some-continuation-id',
            initial_commit_head: ''
          });
        }
        return Promise.resolve({
          custom_name: '',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          version: 2,
          pinned: false,
          archived: false,
          continuation_session_id: '',
          initial_commit_head: ''
        });
      });
      
      // Write files after setting up the mock
      await fs.writeFile(path.join(projectDir, 'conv1.jsonl'), conversation1Content);
      await fs.writeFile(path.join(projectDir, 'conv2.jsonl'), conversation2Content);
      
      // Create the reader and replace sessionInfoService with mock
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      (reader as any).sessionInfoService = mockSessionInfoService;
      
      // Test filtering by continuation status
      const withContinuation = await reader.listConversations({ hasContinuation: true });
      expect(withContinuation.conversations).toHaveLength(1);
      expect(withContinuation.conversations[0].sessionId).toBe(session1);
      
      const withoutContinuation = await reader.listConversations({ hasContinuation: false });
      expect(withoutContinuation.conversations).toHaveLength(1);
      expect(withoutContinuation.conversations[0].sessionId).toBe(session2);
    });

    it('should filter by pinned status', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-test3');
      await fs.mkdir(projectDir, { recursive: true });
      
      const session1 = 'pinned-session';
      const session2 = 'unpinned-session';
      
      // Create two separate conversation files
      const conversation1Content = `{"type":"summary","summary":"Pinned Session","leafUuid":"msg1"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test3","sessionId":"${session1}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z"}`;
      
      const conversation2Content = `{"type":"summary","summary":"Unpinned Session","leafUuid":"msg2"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/username/test3","sessionId":"${session2}","version":"1.0.3","type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg2","timestamp":"2024-01-02T00:00:00Z"}`;
      
      // Mock session info service to return different pinned statuses
      mockSessionInfoService.getSessionInfo.mockReset();
      mockSessionInfoService.getSessionInfo.mockImplementation((sessionId: string) => {
        if (sessionId === session1) {
          return Promise.resolve({
            custom_name: '',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            version: 2,
            pinned: true,
            archived: false,
            continuation_session_id: '',
            initial_commit_head: ''
          });
        }
        return Promise.resolve({
          custom_name: '',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          version: 2,
          pinned: false,
          archived: false,
          continuation_session_id: '',
          initial_commit_head: ''
        });
      });
      
      // Write files after setting up the mock
      await fs.writeFile(path.join(projectDir, 'conv1.jsonl'), conversation1Content);
      await fs.writeFile(path.join(projectDir, 'conv2.jsonl'), conversation2Content);
      
      // Create the reader and replace sessionInfoService with mock
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      (reader as any).sessionInfoService = mockSessionInfoService;
      
      // Test filtering by pinned status
      const pinnedOnly = await reader.listConversations({ pinned: true });
      expect(pinnedOnly.conversations).toHaveLength(1);
      expect(pinnedOnly.conversations[0].sessionId).toBe(session1);
      
      const unpinnedOnly = await reader.listConversations({ pinned: false });
      expect(unpinnedOnly.conversations).toHaveLength(1);
      expect(unpinnedOnly.conversations[0].sessionId).toBe(session2);
    });
  });

  describe('fetchConversation', () => {
    it('should throw error if conversation not found', async () => {
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;
      
      await expect(reader.fetchConversation('non-existent')).rejects.toThrow('Conversation non-existent not found');
    });

    it('should parse JSONL file correctly', async () => {
      // Create project directory
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-test');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionId = 'test-session-123';
      const conversationFile = path.join(projectDir, 'conversation.jsonl');
      
      const fileContent = `{"type":"summary","summary":"Test conversation","leafUuid":"msg1"}
{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z","sessionId":"${sessionId}"}
{"parentUuid":"msg1","type":"assistant","message":{"role":"assistant","content":"Hi there","id":"msg_123"},"uuid":"msg2","timestamp":"2024-01-01T00:00:01Z","sessionId":"${sessionId}","durationMs":1000}`;

      await fs.writeFile(conversationFile, fileContent);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;

      const messages = await reader.fetchConversation(sessionId);
      
      expect(messages).toHaveLength(2); // Summary line should be filtered out
      expect(messages[0].type).toBe('user');
      expect(messages[0].uuid).toBe('msg1');
      expect(messages[0].sessionId).toBe(sessionId);
      expect(messages[1].type).toBe('assistant');
      expect(messages[1].uuid).toBe('msg2');
      expect(messages[1].durationMs).toBe(1000);
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-malformed');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionId = 'test-session-malformed';
      const conversationFile = path.join(projectDir, 'conversation.jsonl');
      
      const fileContent = `{"type":"summary","summary":"Test malformed conversation","leafUuid":"msg2"}
{"parentUuid":null,"type":"user","message":{"role":"user","content":"Hello"},"uuid":"msg1","timestamp":"2024-01-01T00:00:00Z","sessionId":"${sessionId}"}
{invalid json line}
{"parentUuid":"msg1","type":"assistant","message":{"role":"assistant","content":"Hi there","id":"msg_123"},"uuid":"msg2","timestamp":"2024-01-01T00:00:01Z","sessionId":"${sessionId}","durationMs":1000}`;

      await fs.writeFile(conversationFile, fileContent);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;

      const messages = await reader.fetchConversation(sessionId);
      
      // Should return only valid lines and handle malformed JSON gracefully
      expect(messages).toHaveLength(2); // Only valid lines
      expect(messages[0].uuid).toBe('msg1');
      expect(messages[1].uuid).toBe('msg2');
      
      // Verify that the malformed line was skipped (implicitly tested by length check)
      // Note: Logging is disabled in test environment, so we don't test logger calls
    });

    it('should parse single line JSONL with complex content and maintain tool use input properties', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-example-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionId = '4f35e220-c435-4cf7-b9b9-f40426042847';
      const conversationFile = path.join(projectDir, 'conversation.jsonl');
      
      const complexJsonLine = `{"parentUuid": "b72a5272-ecd5-4b58-b8e6-87483e9acad6", "isSidechain": false, "userType": "external", "cwd": "/Users/example/project", "sessionId": "${sessionId}", "version": "1.0.3", "message": {"id": "msg_02Example456", "type": "message", "role": "assistant", "model": "claude-opus-4-20250514", "content": [{"type": "text", "text": "Let me check the current directory structure."}, {"type": "tool_use", "id": "toolu_02LSExample", "name": "LS", "input": {"path": "/Users/example/project"}}], "stop_reason": "tool_use", "stop_sequence": null, "usage": {"input_tokens": 150, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 1200, "output_tokens": 80, "service_tier": "standard"}}, "costUSD": 0.00180, "durationMs": 1800, "type": "assistant", "uuid": "2c333acb-b9f2-41bf-b2d1-d20f0fa413e5", "timestamp": "2025-05-26T07:27:44.400Z"}`;

      await fs.writeFile(conversationFile, complexJsonLine);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;

      const messages = await reader.fetchConversation(sessionId);
      
      expect(messages).toHaveLength(1);
      
      const message = messages[0];
      expect(message.type).toBe('assistant');
      expect(message.uuid).toBe('2c333acb-b9f2-41bf-b2d1-d20f0fa413e5');
      expect(message.parentUuid).toBe('b72a5272-ecd5-4b58-b8e6-87483e9acad6');
      expect(message.sessionId).toBe(sessionId);
      expect(message.durationMs).toBe(1800);
      
      // Verify message content structure - this is an assistant message (Anthropic.Message)
      const assistantMessage = message.message as any; // Type assertion for test compatibility
      expect(assistantMessage.id).toBe('msg_02Example456');
      expect(assistantMessage.role).toBe('assistant');
      expect(assistantMessage.model).toBe('claude-opus-4-20250514');
      expect(assistantMessage.content).toHaveLength(2);
      
      // Verify text content
      const textContent = assistantMessage.content[0] as any;
      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe('Let me check the current directory structure.');
      
      // Verify tool use content with maintained input properties
      const toolUseContent = assistantMessage.content[1] as any;
      expect(toolUseContent.type).toBe('tool_use');
      expect(toolUseContent.id).toBe('toolu_02LSExample');
      expect(toolUseContent.name).toBe('LS');
      expect(toolUseContent.input).toEqual({
        path: '/Users/example/project'
      });
      
      // Verify usage information
      expect(assistantMessage.usage.input_tokens).toBe(150);
      expect(assistantMessage.usage.output_tokens).toBe(80);
      expect(assistantMessage.usage.service_tier).toBe('standard');
    });

    it('should handle file read errors', async () => {
      // Create a reader with invalid path to trigger read error
      const invalidReader = new ClaudeHistoryReader();
      (invalidReader as any).claudeHomePath = '/invalid/path';
      
      await expect(invalidReader.fetchConversation('any-session')).rejects.toThrow("Conversation any-session not found");
    });
  });

  describe('getConversationMetadata', () => {
    it('should extract metadata from conversation file', async () => {
      const projectDir = path.join(path.join(tempDir, 'projects'), '-Users-username-metadata-test');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionId = 'metadata-session';
      const conversationFile = path.join(projectDir, 'metadata.jsonl');
      
      const fileContent = `{"type":"summary","summary":"Metadata Test Session","leafUuid":"msg1"}
{"parentUuid":null,"cwd":"/Users/username/project","message":{"role":"user","content":"Hello","model":"claude-opus-4-20250514"},"durationMs":2000,"sessionId":"${sessionId}","type":"user","uuid":"msg1"}
{"parentUuid":"msg1","durationMs":1500,"sessionId":"${sessionId}","type":"assistant","message":{"role":"assistant","content":"Hi","model":"claude-opus-4-20250514"},"uuid":"msg2"}`;

      await fs.writeFile(conversationFile, fileContent);
      
      reader = new ClaudeHistoryReader();
      (reader as any).claudeHomePath = tempDir;

      const metadata = await reader.getConversationMetadata(sessionId);
      
      expect(metadata).not.toBeNull();
      expect(metadata!.summary).toBe('Metadata Test Session');
      expect(metadata!.projectPath).toBe('/Users/username/project');
      expect(metadata!.model).toBe('claude-opus-4-20250514');
      // Total cost calculation has been removed
      expect(metadata!.totalDuration).toBe(3500); // 2000 + 1500
    });

    it('should return null for non-existent conversation', async () => {
      const metadata = await reader.getConversationMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('private methods', () => {
    describe('decodeProjectPath', () => {
      it('should decode project path correctly', () => {
        const encoded = '-Users-username-project-name';
        const decoded = (reader as any).decodeProjectPath(encoded);
        expect(decoded).toBe('/Users/username/project/name');
      });

      it('should handle paths without dashes', () => {
        const encoded = 'project';
        const decoded = (reader as any).decodeProjectPath(encoded);
        expect(decoded).toBe('project');
      });

      it('should handle complex paths with multiple segments', () => {
        const encoded = '-home-user-Documents-my-project-folder';
        const decoded = (reader as any).decodeProjectPath(encoded);
        expect(decoded).toBe('/home/user/Documents/my/project/folder');
      });
    });
  });

  describe('filter and pagination utilities', () => {
    it('should handle null/undefined filters', () => {
      const conversations = [
        { sessionId: '1', projectPath: '/test', summary: 'Test', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', messageCount: 1 }
      ];

      const result = (reader as any).applyFilters(conversations, undefined);
      expect(result).toEqual(conversations);

      const result2 = (reader as any).applyPagination(conversations, undefined);
      expect(result2).toEqual(conversations);
    });

    it('should handle default pagination values', () => {
      const conversations = Array(30).fill(0).map((_, i) => ({
        sessionId: `session-${i}`,
        projectPath: '/test',
        summary: `Test ${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 1
      }));

      const result = (reader as any).applyPagination(conversations, {});
      expect(result).toHaveLength(20); // default limit
    });

    it('should handle sort by updated date', () => {
      const conversations = [
        {
          sessionId: '1',
          projectPath: '/test',
          summary: 'Test 1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
          messageCount: 1
        },
        {
          sessionId: '2',
          projectPath: '/test',
          summary: 'Test 2',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 1
        }
      ];

      const sorted = (reader as any).applyFilters(conversations, {
        sortBy: 'updated',
        order: 'desc'
      });
      
      expect(sorted[0].sessionId).toBe('1'); // most recently updated
    });
  });
});