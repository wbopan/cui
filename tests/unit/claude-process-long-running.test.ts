import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import { ConversationConfig } from '@/types';
import * as path from 'path';
import * as fs from 'fs';

// Get mock Claude executable path
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

describe('ClaudeProcessManager - Long Running Process', () => {
  let manager: ClaudeProcessManager;
  let mockHistoryReader: ClaudeHistoryReader;
  let mockStatusTracker: ConversationStatusManager;

  beforeAll(() => {
    // Mock Claude is always available as it's checked into the repository
  });

  afterAll(async () => {
    // Final cleanup - ensure all processes are terminated
    if (manager) {
      const activeSessions = manager.getActiveSessions();
      for (const streamingId of activeSessions) {
        try {
          await manager.stopConversation(streamingId);
        } catch (error) {
          console.warn(`Failed to stop conversation ${streamingId} in afterAll:`, error);
        }
      }
    }
    
    // Extra time for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  beforeEach(async () => {
    const mockClaudePath = getMockClaudeExecutablePath();
    
    // Create a mock history reader
    mockHistoryReader = new ClaudeHistoryReader();
    // Mock the getConversationWorkingDirectory method
    vi.spyOn(mockHistoryReader, 'getConversationWorkingDirectory').mockResolvedValue(process.cwd());
    
    // Create a mock status tracker
    mockStatusTracker = new ConversationStatusManager();
    
    manager = new ClaudeProcessManager(mockHistoryReader, mockStatusTracker, mockClaudePath);
  });

  afterEach(async () => {
    // Clean up any active sessions
    const activeSessions = manager.getActiveSessions();
    for (const streamingId of activeSessions) {
      try {
        await manager.stopConversation(streamingId);
      } catch (error) {
        console.warn(`Failed to stop conversation ${streamingId}:`, error);
      }
    }
    
    // Give processes time to clean up
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('long-running process handling', () => {
    it('should handle long-running process with proper event handling', async () => {

      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'Hello Claude! Please respond with just "Hello" and nothing else.'
      };

      // Event tracking
      let outputEventCount = 0;
      let errorEventCount = 0;
      let processClosedReceived = false;
      let conversationCompleted = false;

      // Set up event listeners
      manager.on('claude-message', (data) => {
        expect(data).toBeDefined();
        expect(data.streamingId).toBeDefined();
        outputEventCount++;
      });

      manager.on('process-error', (data) => {
        expect(data).toBeDefined();
        expect(data.streamingId).toBeDefined();
        errorEventCount++;
      });

      manager.on('process-closed', (data) => {
        expect(data).toBeDefined();
        expect(data.streamingId).toBeDefined();
        processClosedReceived = true;
        conversationCompleted = true;
      });

      // Start conversation
      const { streamingId } = await manager.startConversation(config);
      
      expect(streamingId).toBeDefined();
      expect(typeof streamingId).toBe('string');
      expect(manager.isSessionActive(streamingId)).toBe(true);


      // Wait for the conversation to complete naturally
      // Use a polling approach to check if process is still active
      const maxWaitTime = 20000; // 20 seconds max
      const pollInterval = 100; // Check every 100ms
      let elapsedTime = 0;

      while (!conversationCompleted && elapsedTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        elapsedTime += pollInterval;
        
        // Check if session is still active
        if (!manager.isSessionActive(streamingId)) {
          conversationCompleted = true;
          break;
        }
      }

      // Give a bit more time for final events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));


      // Verify we received the expected events
      expect(outputEventCount).toBeGreaterThanOrEqual(1); // At least 1 output event
      expect(errorEventCount).toBeLessThanOrEqual(0); // At least 0 error events (stderr may not always occur)
      expect(processClosedReceived).toBe(true); // Process should have closed naturally
      expect(manager.isSessionActive(streamingId)).toBe(false); // Session should be inactive

    }, 25000); // 25 second timeout to allow for natural completion
  });
});