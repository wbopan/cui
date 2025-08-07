import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ConversationStatusManager } from '@/services/conversation-status-manager';

describe('ConversationStatusManager', () => {
  let tracker: ConversationStatusManager;

  beforeEach(() => {
    tracker = new ConversationStatusManager();
  });

  afterEach(() => {
    tracker.removeAllListeners();
  });

  describe('session registration', () => {
    it('should register active session', () => {
      const streamingId = 'streaming-123';
      const claudeSessionId = 'claude-session-456';

      tracker.registerActiveSession(streamingId, claudeSessionId);

      expect(tracker.isSessionActive(claudeSessionId)).toBe(true);
      expect(tracker.getStreamingId(claudeSessionId)).toBe(streamingId);
      expect(tracker.getSessionId(streamingId)).toBe(claudeSessionId);
    });

    it('should emit session-started event when registering', () => {
      return new Promise<void>((resolve) => {
        const streamingId = 'streaming-123';
        const claudeSessionId = 'claude-session-456';

        tracker.on('session-started', ({ streamingId: emittedStreamingId, claudeSessionId: emittedClaudeSessionId }) => {
          expect(emittedStreamingId).toBe(streamingId);
          expect(emittedClaudeSessionId).toBe(claudeSessionId);
          resolve();
        });

        tracker.registerActiveSession(streamingId, claudeSessionId);
      });
    });

    it('should replace existing mapping for Claude session when re-registering', () => {
      const claudeSessionId = 'claude-session-456';
      const oldStreamingId = 'streaming-old';
      const newStreamingId = 'streaming-new';

      // Register initial session
      tracker.registerActiveSession(oldStreamingId, claudeSessionId);
      expect(tracker.getStreamingId(claudeSessionId)).toBe(oldStreamingId);
      expect(tracker.getSessionId(oldStreamingId)).toBe(claudeSessionId);

      // Re-register with new streaming ID
      tracker.registerActiveSession(newStreamingId, claudeSessionId);
      expect(tracker.getStreamingId(claudeSessionId)).toBe(newStreamingId);
      expect(tracker.getSessionId(newStreamingId)).toBe(claudeSessionId);
      expect(tracker.getSessionId(oldStreamingId)).toBeUndefined();
    });
  });

  describe('session unregistration', () => {
    it('should unregister active session', () => {
      const streamingId = 'streaming-123';
      const claudeSessionId = 'claude-session-456';

      tracker.registerActiveSession(streamingId, claudeSessionId);
      expect(tracker.isSessionActive(claudeSessionId)).toBe(true);

      tracker.unregisterActiveSession(streamingId);
      expect(tracker.isSessionActive(claudeSessionId)).toBe(false);
      expect(tracker.getStreamingId(claudeSessionId)).toBeUndefined();
      expect(tracker.getSessionId(streamingId)).toBeUndefined();
    });

    it('should emit session-ended event when unregistering', () => {
      return new Promise<void>((resolve) => {
        const streamingId = 'streaming-123';
        const claudeSessionId = 'claude-session-456';

        tracker.registerActiveSession(streamingId, claudeSessionId);

        tracker.on('session-ended', ({ streamingId: emittedStreamingId, claudeSessionId: emittedClaudeSessionId }) => {
          expect(emittedStreamingId).toBe(streamingId);
          expect(emittedClaudeSessionId).toBe(claudeSessionId);
          resolve();
        });

        tracker.unregisterActiveSession(streamingId);
      });
    });

    it('should handle unregistering unknown streaming ID gracefully', () => {
      const unknownStreamingId = 'unknown-streaming-id';
      
      // Should not throw error
      tracker.unregisterActiveSession(unknownStreamingId);
      
      // No sessions should be affected
      expect(tracker.getActiveSessionIds()).toHaveLength(0);
      expect(tracker.getActiveStreamingIds()).toHaveLength(0);
    });
  });

  describe('status queries', () => {
    it('should return correct conversation status for active session', () => {
      const streamingId = 'streaming-123';
      const claudeSessionId = 'claude-session-456';

      // Initially completed
      expect(tracker.getConversationStatus(claudeSessionId)).toBe('completed');

      // After registration, should be ongoing
      tracker.registerActiveSession(streamingId, claudeSessionId);
      expect(tracker.getConversationStatus(claudeSessionId)).toBe('ongoing');

      // After unregistration, should be completed again
      tracker.unregisterActiveSession(streamingId);
      expect(tracker.getConversationStatus(claudeSessionId)).toBe('completed');
    });

    it('should return completed status for unknown session', () => {
      expect(tracker.getConversationStatus('unknown-session')).toBe('completed');
    });

    it('should check session active status correctly', () => {
      const streamingId = 'streaming-123';
      const claudeSessionId = 'claude-session-456';

      expect(tracker.isSessionActive(claudeSessionId)).toBe(false);

      tracker.registerActiveSession(streamingId, claudeSessionId);
      expect(tracker.isSessionActive(claudeSessionId)).toBe(true);

      tracker.unregisterActiveSession(streamingId);
      expect(tracker.isSessionActive(claudeSessionId)).toBe(false);
    });
  });

  describe('bulk operations', () => {
    it('should get all active session IDs', () => {
      const sessions = [
        { streamingId: 'streaming-1', claudeSessionId: 'claude-1' },
        { streamingId: 'streaming-2', claudeSessionId: 'claude-2' },
        { streamingId: 'streaming-3', claudeSessionId: 'claude-3' }
      ];

      sessions.forEach(({ streamingId, claudeSessionId }) => {
        tracker.registerActiveSession(streamingId, claudeSessionId);
      });

      const activeSessionIds = tracker.getActiveSessionIds();
      expect(activeSessionIds).toHaveLength(3);
      expect(activeSessionIds).toEqual(expect.arrayContaining(['claude-1', 'claude-2', 'claude-3']));
    });

    it('should get all active streaming IDs', () => {
      const sessions = [
        { streamingId: 'streaming-1', claudeSessionId: 'claude-1' },
        { streamingId: 'streaming-2', claudeSessionId: 'claude-2' },
        { streamingId: 'streaming-3', claudeSessionId: 'claude-3' }
      ];

      sessions.forEach(({ streamingId, claudeSessionId }) => {
        tracker.registerActiveSession(streamingId, claudeSessionId);
      });

      const activeStreamingIds = tracker.getActiveStreamingIds();
      expect(activeStreamingIds).toHaveLength(3);
      expect(activeStreamingIds).toEqual(expect.arrayContaining(['streaming-1', 'streaming-2', 'streaming-3']));
    });

    it('should clear all mappings', () => {
      const sessions = [
        { streamingId: 'streaming-1', claudeSessionId: 'claude-1' },
        { streamingId: 'streaming-2', claudeSessionId: 'claude-2' }
      ];

      sessions.forEach(({ streamingId, claudeSessionId }) => {
        tracker.registerActiveSession(streamingId, claudeSessionId);
      });

      expect(tracker.getActiveSessionIds()).toHaveLength(2);

      tracker.clear();

      expect(tracker.getActiveSessionIds()).toHaveLength(0);
      expect(tracker.getActiveStreamingIds()).toHaveLength(0);
      expect(tracker.isSessionActive('claude-1')).toBe(false);
      expect(tracker.isSessionActive('claude-2')).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should provide correct statistics', () => {
      const sessions = [
        { streamingId: 'streaming-1', claudeSessionId: 'claude-1' },
        { streamingId: 'streaming-2', claudeSessionId: 'claude-2' }
      ];

      sessions.forEach(({ streamingId, claudeSessionId }) => {
        tracker.registerActiveSession(streamingId, claudeSessionId);
      });

      const stats = tracker.getStats();

      expect(stats.activeSessionsCount).toBe(2);
      expect(stats.activeStreamingIdsCount).toBe(2);
      expect(stats.activeSessions).toHaveLength(2);
      expect(stats.activeSessions).toEqual(expect.arrayContaining([
        { claudeSessionId: 'claude-1', streamingId: 'streaming-1' },
        { claudeSessionId: 'claude-2', streamingId: 'streaming-2' }
      ]));
    });

    it('should provide empty statistics when no sessions are active', () => {
      const stats = tracker.getStats();

      expect(stats.activeSessionsCount).toBe(0);
      expect(stats.activeStreamingIdsCount).toBe(0);
      expect(stats.activeSessions).toHaveLength(0);
    });
  });

  describe('conversation list API integration', () => {
    it('should provide correct status and streamingId for conversation list', () => {
      const mockConversations = [
        { sessionId: 'claude-session-1', summary: 'First conversation' },
        { sessionId: 'claude-session-2', summary: 'Second conversation' },
        { sessionId: 'claude-session-3', summary: 'Third conversation' }
      ];

      // Register one active session
      tracker.registerActiveSession('streaming-123', 'claude-session-2');

      // Simulate how the conversation list endpoint would process conversations
      const conversationsWithStatus = mockConversations.map(conversation => {
        const status = tracker.getConversationStatus(conversation.sessionId);
        const baseConversation = {
          ...conversation,
          status
        };

        // Add streamingId if conversation is ongoing
        if (status === 'ongoing') {
          const streamingId = tracker.getStreamingId(conversation.sessionId);
          if (streamingId) {
            return { ...baseConversation, streamingId };
          }
        }

        return baseConversation;
      });

      // Verify results
      expect(conversationsWithStatus).toHaveLength(3);
      
      // First conversation should be completed (no streamingId)
      expect(conversationsWithStatus[0]).toEqual({
        sessionId: 'claude-session-1',
        summary: 'First conversation',
        status: 'completed'
      });

      // Second conversation should be ongoing with streamingId
      expect(conversationsWithStatus[1]).toEqual({
        sessionId: 'claude-session-2',
        summary: 'Second conversation',
        status: 'ongoing',
        streamingId: 'streaming-123'
      });

      // Third conversation should be completed (no streamingId)
      expect(conversationsWithStatus[2]).toEqual({
        sessionId: 'claude-session-3',
        summary: 'Third conversation',
        status: 'completed'
      });
    });

    it('should handle case where getStreamingId returns undefined for ongoing status', () => {
      const mockConversation = { sessionId: 'claude-session-1', summary: 'Test conversation' };
      
      // Mock the case where status is ongoing but getStreamingId returns undefined
      // This could happen in edge cases or race conditions
      tracker.registerActiveSession('streaming-123', 'claude-session-1');
      tracker.unregisterActiveSession('streaming-123');
      
      // Force register session without proper cleanup (simulating race condition)
      (tracker as any).sessionToStreaming.set('claude-session-1', 'invalid-streaming-id');
      
      const status = tracker.getConversationStatus(mockConversation.sessionId);
      const streamingId = tracker.getStreamingId(mockConversation.sessionId);
      
      // Should be ongoing but streamingId should be invalid
      expect(status).toBe('ongoing');
      expect(streamingId).toBe('invalid-streaming-id');
      
      // The API logic should handle this gracefully
      const baseConversation = { ...mockConversation, status };
      let result: any = baseConversation;
      
      if (status === 'ongoing') {
        const actualStreamingId = tracker.getStreamingId(mockConversation.sessionId);
        if (actualStreamingId) {
          result = { ...baseConversation, streamingId: actualStreamingId };
        }
      }
      
      // Should include the invalid streamingId (real implementation would handle this)
      expect(result).toEqual({
        sessionId: 'claude-session-1',
        summary: 'Test conversation',
        status: 'ongoing',
        streamingId: 'invalid-streaming-id'
      });
    });
  });

  describe('edge cases', () => {
    it('should handle multiple registrations of same streaming ID with different Claude sessions', () => {
      const streamingId = 'streaming-123';
      const claudeSessionId1 = 'claude-session-1';
      const claudeSessionId2 = 'claude-session-2';

      tracker.registerActiveSession(streamingId, claudeSessionId1);
      expect(tracker.getSessionId(streamingId)).toBe(claudeSessionId1);
      expect(tracker.isSessionActive(claudeSessionId1)).toBe(true);

      // Register same streaming ID with different Claude session
      tracker.registerActiveSession(streamingId, claudeSessionId2);
      expect(tracker.getSessionId(streamingId)).toBe(claudeSessionId2);
      expect(tracker.isSessionActive(claudeSessionId1)).toBe(false);
      expect(tracker.isSessionActive(claudeSessionId2)).toBe(true);
    });

    it('should return undefined for non-existent lookups', () => {
      expect(tracker.getStreamingId('non-existent')).toBeUndefined();
      expect(tracker.getSessionId('non-existent')).toBeUndefined();
    });
  });
});