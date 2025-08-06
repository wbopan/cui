// No imports needed - using Jest globals
import { MessageFilter } from '@/services/message-filter';
import { ConversationMessage } from '@/types';

describe('MessageFilter', () => {
  let messageFilter: MessageFilter;

  beforeEach(() => {
    messageFilter = new MessageFilter();
  });

  describe('filterMessages', () => {
    it('should filter out user messages starting with "Caveat: "', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: 'Caveat: This should be filtered' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: 'This should not be filtered' },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('2');
    });

    it('should filter out user messages starting with "<command-name>"', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: '<command-name>clear</command-name>' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: 'Normal message' },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('2');
    });

    it('should filter out user messages starting with "<local-command-stdout>"', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: '<local-command-stdout>some output</local-command-stdout>' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: 'Regular message' },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('2');
    });

    it('should not filter assistant messages even if they start with filtered prefixes', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: { role: 'assistant', content: 'Caveat: This assistant message should NOT be filtered' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'assistant',
          message: { role: 'assistant', content: '<command-name>This should also not be filtered</command-name>' },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].uuid).toBe('1');
      expect(filtered[1].uuid).toBe('2');
    });

    it('should handle messages with content blocks', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Caveat: This should be filtered' }
            ]
          },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'This should not be filtered' }
            ]
          },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('2');
    });

    it('should handle messages with whitespace before filtered prefixes', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: '  Caveat: This should be filtered' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        },
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: '\n<command-name>clear</command-name>' },
          timestamp: '2024-01-01T00:00:01Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(0);
    });

    it('should keep messages without text content', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_use', id: 'tool1', name: 'read_file', input: { path: '/test' } }
            ]
          } as any,
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('1');
    });

    it('should handle empty message arrays', () => {
      const messages: ConversationMessage[] = [];
      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(0);
    });

    it('should handle system messages', () => {
      const messages: ConversationMessage[] = [
        {
          uuid: '1',
          type: 'system',
          message: { role: 'system', content: 'Caveat: System messages should not be filtered' } as any,
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test-session'
        }
      ];

      const filtered = messageFilter.filterMessages(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].uuid).toBe('1');
    });
  });
});