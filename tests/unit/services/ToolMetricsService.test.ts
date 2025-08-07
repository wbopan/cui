import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ToolMetricsService } from '@/services/ToolMetricsService';
import { EventEmitter } from 'events';
import { StreamEvent, AssistantStreamMessage } from '@/types';
import Anthropic from '@anthropic-ai/sdk';

describe('ToolMetricsService', () => {
  let service: ToolMetricsService;
  let mockProcessManager: EventEmitter;

  beforeEach(() => {
    service = new ToolMetricsService();
    mockProcessManager = new EventEmitter();
  });

  afterEach(() => {
    // Clean up event listeners
    mockProcessManager.removeAllListeners();
  });

  describe('listenToClaudeMessages', () => {
    it('should start listening to claude-message events', () => {
      service.listenToClaudeMessages(mockProcessManager);
      
      // Verify listener is attached
      expect(mockProcessManager.listenerCount('claude-message')).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('should return undefined for unknown session', () => {
      const metrics = service.getMetrics('unknown-session');
      expect(metrics).toBeUndefined();
    });

    it('should return metrics after processing tool use', () => {
      service.listenToClaudeMessages(mockProcessManager);

      const editMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: {
                file_path: '/test.txt',
                old_string: 'line1\nline2\nline3',
                new_string: 'line1\nline2\nline3\nline4\nline5'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: editMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 3,
        linesRemoved: 1,
        editCount: 1,
        writeCount: 0
      });
    });
  });


  describe('tool processing', () => {
    beforeEach(() => {
      service.listenToClaudeMessages(mockProcessManager);
    });

    it('should process Edit tool with lines added', () => {
      const editMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: {
                file_path: '/test.txt',
                old_string: 'hello',
                new_string: 'hello\nworld\ntest'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: editMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 3,
        linesRemoved: 1,
        editCount: 1,
        writeCount: 0
      });
    });

    it('should process Edit tool with lines removed', () => {
      const editMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: {
                file_path: '/test.txt',
                old_string: 'line1\nline2\nline3\nline4',
                new_string: 'line1\nline4'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: editMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 0,
        linesRemoved: 2,
        editCount: 1,
        writeCount: 0
      });
    });

    it('should process Write tool', () => {
      const writeMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: {
                file_path: '/test.txt',
                content: 'line1\nline2\nline3\nline4\nline5'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: writeMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 5,
        linesRemoved: 0,
        editCount: 0,
        writeCount: 1
      });
    });

    it('should process MultiEdit tool', () => {
      const multiEditMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'MultiEdit',
              input: {
                file_path: '/test.txt',
                edits: [
                  {
                    old_string: 'foo',
                    new_string: 'foo\nbar'
                  },
                  {
                    old_string: 'baz\nqux',
                    new_string: 'baz'
                  }
                ]
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: multiEditMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 3,
        linesRemoved: 3,
        editCount: 2,
        writeCount: 0
      });
    });

    it('should accumulate metrics across multiple tool uses', () => {
      const session = 'test-session';

      // First edit
      mockProcessManager.emit('claude-message', {
        streamingId: 'stream-1',
        message: {
          type: 'assistant',
          session_id: session,
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Write',
                input: {
                  file_path: '/file1.txt',
                  content: 'line1\nline2'
                }
              }
            ],
            model: 'claude-3',
            stop_reason: null,
            stop_sequence: null,
            usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
          }
        } as AssistantStreamMessage
      });

      // Second edit
      mockProcessManager.emit('claude-message', {
        streamingId: 'stream-1',
        message: {
          type: 'assistant',
          session_id: session,
          message: {
            id: 'msg-2',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-2',
                name: 'Edit',
                input: {
                  file_path: '/file2.txt',
                  old_string: 'old',
                  new_string: 'new\nline'
                }
              }
            ],
            model: 'claude-3',
            stop_reason: null,
            stop_sequence: null,
            usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
          }
        } as AssistantStreamMessage
      });

      const metrics = service.getMetrics(session);
      expect(metrics).toEqual({
        linesAdded: 4, // 2 from Write + 2 from Edit
        linesRemoved: 1, // 1 from Edit
        editCount: 1,
        writeCount: 1
      });
    });

    it('should handle empty content gracefully', () => {
      const writeMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: {
                file_path: '/empty.txt',
                content: ''
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: writeMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 0,
        linesRemoved: 0,
        editCount: 0,
        writeCount: 1
      });
    });

    it('should ignore non-tool-use content blocks', () => {
      const message: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I will help you with that.',
              citations: null
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: message });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toBeUndefined();
    });

    it('should ignore non-assistant messages', () => {
      const userMessage: StreamEvent = {
        type: 'user',
        session_id: 'test-session',
        message: {
          role: 'user',
          content: 'Please help me'
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: userMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toBeUndefined();
    });
  });

  describe('calculateMetricsFromMessages', () => {
    it('should calculate metrics from historical messages', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Write',
                input: {
                  file_path: '/file1.txt',
                  content: 'line1\nline2\nline3'
                }
              }
            ],
            model: 'claude-3',
            stop_reason: null,
            stop_sequence: null,
            usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
          } as Anthropic.Message
        },
        {
          type: 'assistant',
          message: {
            id: 'msg-2',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-2',
                name: 'Edit',
                input: {
                  file_path: '/file2.txt',
                  old_string: 'old\nline',
                  new_string: 'new'
                }
              }
            ],
            model: 'claude-3',
            stop_reason: null,
            stop_sequence: null,
            usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
          } as Anthropic.Message
        }
      ];

      const metrics = service.calculateMetricsFromMessages(messages);
      expect(metrics).toEqual({
        linesAdded: 4,
        linesRemoved: 2,
        editCount: 1,
        writeCount: 1
      });
    });

    it('should handle messages without content', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Just a string',
            model: 'claude-3',
            stop_reason: null,
            stop_sequence: null,
            usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
          } as any // This is intentionally invalid to test error handling
        }
      ];

      const metrics = service.calculateMetricsFromMessages(messages);
      expect(metrics).toEqual({
        linesAdded: 0,
        linesRemoved: 0,
        editCount: 0,
        writeCount: 0
      });
    });

    it('should handle empty message array', () => {
      const metrics = service.calculateMetricsFromMessages([]);
      expect(metrics).toEqual({
        linesAdded: 0,
        linesRemoved: 0,
        editCount: 0,
        writeCount: 0
      });
    });
  });

  describe('line counting', () => {
    it('should count lines correctly with trailing newline', () => {
      service.listenToClaudeMessages(mockProcessManager);

      const writeMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: {
                file_path: '/test.txt',
                content: 'line1\nline2\nline3\n'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: writeMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics?.linesAdded).toBe(3); // Should not count the empty line after trailing newline
    });

    it('should handle single line without newline', () => {
      service.listenToClaudeMessages(mockProcessManager);

      const writeMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: {
                file_path: '/test.txt',
                content: 'single line'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: writeMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics?.linesAdded).toBe(1);
    });

    it('should handle edit with no net line change but content change', () => {
      service.listenToClaudeMessages(mockProcessManager);

      const editMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: {
                file_path: '/test.txt',
                old_string: 'foo\nbar',
                new_string: 'baz\nqux'
              }
            }
          ],
          model: 'claude-3',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard' as const
          }
        }
      };

      mockProcessManager.emit('claude-message', { streamingId: 'stream-1', message: editMessage });

      const metrics = service.getMetrics('test-session');
      expect(metrics).toEqual({
        linesAdded: 2,
        linesRemoved: 2,
        editCount: 1,
        writeCount: 0
      });
    });
  });
});