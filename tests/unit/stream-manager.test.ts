import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { StreamManager } from '@/services/stream-manager';
import { Response } from 'express';
import { StreamEvent, AssistantStreamMessage } from '@/types';
import { EventEmitter } from 'events';

// Mock Express Response
const createMockResponse = (): vi.Mocked<Response> => {
  const res = new EventEmitter() as any;
  res.setHeader = vi.fn();
  res.write = vi.fn();
  res.end = vi.fn();
  // Use a property descriptor to make writableEnded assignable
  let _writableEnded = false;
  Object.defineProperty(res, 'writableEnded', {
    get: () => _writableEnded,
    set: (value) => { _writableEnded = value; },
    configurable: true
  });
  res.destroyed = false;
  return res;
};

describe('StreamManager', () => {
  let manager: StreamManager;
  let mockResponse: vi.Mocked<Response>;

  beforeEach(() => {
    manager = new StreamManager();
    mockResponse = createMockResponse();
  });

  afterEach(() => {
    // Clean up any active StreamManager resources (intervals, clients)
    manager.disconnectAll();
    vi.clearAllMocks();
  });

  describe('addClient', () => {
    it('should add client and configure headers', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    });

    it('should send connection confirmation', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: .*"type":"connected".*\n\n$/)
      );
    });

    it('should track client count', () => {
      const streamingId = 'test-streaming-123';
      
      expect(manager.getClientCount(streamingId)).toBe(0);
      
      manager.addClient(streamingId, mockResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
    });

    it('should handle multiple clients for same session', () => {
      const streamingId = 'test-streaming-123';
      const mockResponse2 = createMockResponse();
      
      manager.addClient(streamingId, mockResponse);
      manager.addClient(streamingId, mockResponse2);
      
      expect(manager.getClientCount(streamingId)).toBe(2);
    });

    it('should auto-remove client on close event', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
      
      mockResponse.emit('close');
      expect(manager.getClientCount(streamingId)).toBe(0);
    });

    it('should auto-remove client on error event', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
      
      mockResponse.emit('error', new Error('Connection error'));
      expect(manager.getClientCount(streamingId)).toBe(0);
    });
  });

  describe('removeClient', () => {
    it('should remove specific client', () => {
      const streamingId = 'test-streaming-123';
      const mockResponse2 = createMockResponse();
      
      manager.addClient(streamingId, mockResponse);
      manager.addClient(streamingId, mockResponse2);
      expect(manager.getClientCount(streamingId)).toBe(2);
      
      manager.removeClient(streamingId, mockResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
    });

    it('should remove session when no clients remain', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);
      expect(manager.getActiveSessions()).toContain(streamingId);
      
      manager.removeClient(streamingId, mockResponse);
      expect(manager.getActiveSessions()).not.toContain(streamingId);
    });

    it('should emit client-disconnected event', () => {
      return new Promise<void>((resolve) => {
        const streamingId = 'test-streaming-123';
        
        manager.on('client-disconnected', (event) => {
          expect(event.streamingId).toBe(streamingId);
          resolve();
        });
        
        manager.addClient(streamingId, mockResponse);
        manager.removeClient(streamingId, mockResponse);
      });
    });
  });

  describe('broadcast', () => {
    it('should send event to all clients in session', () => {
      const streamingId = 'test-streaming-123';
      const mockResponse2 = createMockResponse();
      const streamMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'claude-session-456', // Claude's internal session ID
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } as any
      };
      
      manager.addClient(streamingId, mockResponse);
      manager.addClient(streamingId, mockResponse2);
      
      manager.broadcast(streamingId, streamMessage);
      
      const expectedData = `data: ${JSON.stringify(streamMessage)}\n\n`;
      expect(mockResponse.write).toHaveBeenCalledWith(expectedData);
      expect(mockResponse2.write).toHaveBeenCalledWith(expectedData);
    });

    it('should handle non-existent session gracefully', () => {
      const event: StreamEvent = {
        type: 'error',
        error: 'Test error',
        streamingId: 'non-existent',
        timestamp: new Date().toISOString()
      };
      
      expect(() => manager.broadcast('non-existent', event)).not.toThrow();
    });

    it('should clean up dead clients during broadcast', () => {
      const streamingId = 'test-streaming-123';
      
      // Set up the mock to throw error after being added
      manager.addClient(streamingId, mockResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
      
      // Now set up the mock to throw error on write
      mockResponse.write.mockImplementation(() => {
        throw new Error('Connection closed');
      });
      
      const streamMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'claude-session-456',
        message: { role: 'assistant', content: [{ type: 'text', text: 'test' }] } as any
      };
      
      manager.broadcast(streamingId, streamMessage);
      expect(manager.getClientCount(streamingId)).toBe(0);
    });

    it('should handle writableEnded responses', () => {
      const streamingId = 'test-streaming-123';
      
      // Create response that will be ended after adding
      const endedResponse = createMockResponse();
      
      // Add client first (this succeeds)
      manager.addClient(streamingId, endedResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
      
      // Now mark it as ended
      (endedResponse as any).writableEnded = true;
      
      const streamMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'claude-session-456',
        message: { role: 'assistant', content: [{ type: 'text', text: 'test' }] } as any
      };
      
      // Broadcasting should detect the ended response and clean it up
      manager.broadcast(streamingId, streamMessage);
      expect(manager.getClientCount(streamingId)).toBe(0);
    });
  });

  describe('closeSession', () => {
    it('should send close event to all clients', () => {
      const streamingId = 'test-streaming-123';
      const mockResponse2 = createMockResponse();
      
      manager.addClient(streamingId, mockResponse);
      manager.addClient(streamingId, mockResponse2);
      
      manager.closeSession(streamingId);
      
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: .*"type":"closed".*\n\n$/)
      );
      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: .*"type":"closed".*\n\n$/)
      );
    });

    it('should end all client connections', () => {
      const streamingId = 'test-streaming-123';
      const mockResponse2 = createMockResponse();
      
      manager.addClient(streamingId, mockResponse);
      manager.addClient(streamingId, mockResponse2);
      
      manager.closeSession(streamingId);
      
      expect(mockResponse.end).toHaveBeenCalled();
      expect(mockResponse2.end).toHaveBeenCalled();
    });

    it('should remove session from active sessions', () => {
      const streamingId = 'test-streaming-123';
      
      manager.addClient(streamingId, mockResponse);
      expect(manager.getActiveSessions()).toContain(streamingId);
      
      manager.closeSession(streamingId);
      expect(manager.getActiveSessions()).not.toContain(streamingId);
    });

    it('should handle errors during client close gracefully', () => {
      const streamingId = 'test-streaming-123';
      
      // Add client first
      manager.addClient(streamingId, mockResponse);
      
      // Then set up the mock to throw error on subsequent writes
      mockResponse.write.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      expect(() => manager.closeSession(streamingId)).not.toThrow();
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions', () => {
      expect(manager.getActiveSessions()).toEqual([]);
    });

    it('should return active session IDs', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      manager.addClient(session1, mockResponse);
      manager.addClient(session2, createMockResponse());
      
      const sessions = manager.getActiveSessions();
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
      expect(sessions).toHaveLength(2);
    });
  });

  describe('getTotalClientCount', () => {
    it('should return 0 when no clients', () => {
      expect(manager.getTotalClientCount()).toBe(0);
    });

    it('should return total client count across all sessions', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      const mockResponse2 = createMockResponse();
      const mockResponse3 = createMockResponse();
      
      manager.addClient(session1, mockResponse);
      manager.addClient(session1, mockResponse2);
      manager.addClient(session2, mockResponse3);
      
      expect(manager.getTotalClientCount()).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle destroyed response objects', () => {
      const streamingId = 'test-streaming-123';
      const destroyedResponse = createMockResponse();
      
      // Add client first (this succeeds)
      manager.addClient(streamingId, destroyedResponse);
      expect(manager.getClientCount(streamingId)).toBe(1);
      
      // Now mark it as destroyed
      destroyedResponse.destroyed = true;
      
      const streamMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'claude-session-456',
        message: { role: 'assistant', content: [{ type: 'text', text: 'test' }] } as any
      };
      
      // Broadcasting should detect the destroyed response and clean it up
      manager.broadcast(streamingId, streamMessage);
      expect(manager.getClientCount(streamingId)).toBe(0);
    });

    it('should handle large event payloads', () => {
      const streamingId = 'test-streaming-123';
      const largeContent = Array(1000).fill(0).map((_, i) => `Line ${i}: This is a very long line with lots of content to make the payload large enough to test streaming capabilities.`).join('\n');
      const largeStreamMessage: AssistantStreamMessage = {
        type: 'assistant',
        session_id: 'claude-session-456',
        message: { role: 'assistant', content: [{ type: 'text', text: largeContent }] } as any
      };
      
      manager.addClient(streamingId, mockResponse);
      manager.broadcast(streamingId, largeStreamMessage);
      
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^data: .*${largeContent.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\n\\n$`))
      );
    });
  });
});