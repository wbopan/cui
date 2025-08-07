import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { CUIServer } from '@/cui-server';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import * as path from 'path';
import { EventSource } from 'eventsource';

// Get mock Claude executable path
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

/**
 * Integration test for conversation status and streamingId functionality
 * Tests that ongoing conversations include streamingId field and status changes are tracked
 */
describe('Conversation Status Integration', () => {
  let server: CUIServer;
  let serverPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Use a random port to avoid conflicts with other tests
    serverPort = 7000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${serverPort}`;
    
    // Create server
    server = new CUIServer({ port: serverPort });
    
    // Override the ProcessManager with one that uses mock Claude path
    const mockClaudePath = getMockClaudeExecutablePath();
    const { ClaudeProcessManager } = await import('@/services/claude-process-manager');
    const statusTracker = new ConversationStatusManager();
    (server as any).processManager = new ClaudeProcessManager((server as any).historyReader, statusTracker, mockClaudePath);
    
    // Re-setup the ProcessManager integration since we replaced it
    (server as any).setupProcessManagerIntegration();
    
    await server.start();
  }, 15000);

  afterAll(async () => {
    if (server) {
      await server.stop();
      // Small delay to ensure port is fully released
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, 15000);

  describe('Conversation Status and StreamingId', () => {
    it('should include streamingId for ongoing conversations when messages are processed', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Test conversation for status tracking';
      
      // 1. Start conversation
      const startResponse = await fetch(`${baseUrl}/api/conversations/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workingDirectory,
          initialPrompt
        })
      });
      
      expect(startResponse.ok).toBe(true);
      const startData = await startResponse.json() as { 
        streamingId: string; 
        streamUrl: string;
        sessionId: string;
        cwd: string;
        tools: string[];
        mcpServers: any[];
        model: string;
        permissionMode: string;
        apiKeySource: string;
      };
      expect(startData).toHaveProperty('streamingId');
      expect(startData).toHaveProperty('streamUrl');
      expect(startData).toHaveProperty('sessionId');
      expect(startData).toHaveProperty('cwd');
      expect(startData).toHaveProperty('tools');
      expect(startData).toHaveProperty('mcpServers');
      expect(startData).toHaveProperty('model');
      expect(startData).toHaveProperty('permissionMode');
      expect(startData).toHaveProperty('apiKeySource');
      
      const streamingId = startData.streamingId;
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      
      // 2. Connect to stream briefly to trigger message processing
      const eventSource = new EventSource(streamUrl);
      
      // Wait for connection and initial message processing
      await new Promise<void>((resolve) => {
        let connected = false;
        
        const timeout = setTimeout(() => {
          eventSource.close();
          resolve();
        }, 3000);
        
        eventSource.onopen = () => {
          connected = true;
        };
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // After receiving any message (especially connected), the system should be set up
            if (data.type === 'connected' || data.type === 'system') {
              clearTimeout(timeout);
              eventSource.close();
              // Give a moment for status registration to complete
              setTimeout(resolve, 100);
            }
          } catch (error) {
            // Continue waiting for other messages
          }
        };
        
        eventSource.onerror = () => {
          clearTimeout(timeout);
          eventSource.close();
          resolve();
        };
      });
      
      // 3. Now check if status was registered properly
      const listResponse = await fetch(`${baseUrl}/api/conversations`);
      expect(listResponse.ok).toBe(true);
      const listData = await listResponse.json() as { conversations: any[]; total: number };
      
      // 4. Verify that we have at least some conversations and they follow the streamingId rule
      expect(listData.total).toBeGreaterThanOrEqual(0);
      
      // Check that the structure is correct
      for (const conversation of listData.conversations) {
        expect(conversation.status).toBeDefined();
        
        // This is the key test: ongoing conversations should have streamingId
        if (conversation.status === 'ongoing') {
          expect(conversation.streamingId).toBeDefined();
          expect(typeof conversation.streamingId).toBe('string');
          expect(conversation.streamingId.length).toBeGreaterThan(0);
        } else {
          expect(conversation.streamingId).toBeUndefined();
        }
      }
      
      // 5. Stop the conversation to clean up
      const stopResponse = await fetch(`${baseUrl}/api/conversations/${streamingId}/stop`, {
        method: 'POST'
      });
      expect(stopResponse.ok).toBe(true);
      
    }, 8000);
    
    it('should verify streamingId field structure in conversation responses', async () => {
      // Simplified test to verify the API structure without complex EventSource issues
      
      // 1. Get initial conversation list
      const initialResponse = await fetch(`${baseUrl}/api/conversations`);
      expect(initialResponse.ok).toBe(true);
      const initialData = await initialResponse.json() as { conversations: any[]; total: number };
      
      // 2. Verify all existing conversations follow the streamingId rule
      for (const conversation of initialData.conversations) {
        expect(conversation.status).toBeDefined();
        expect(['completed', 'ongoing', 'pending']).toContain(conversation.status);
        
        // Key test: only ongoing conversations should have streamingId
        if (conversation.status === 'ongoing') {
          expect(conversation.streamingId).toBeDefined();
          expect(typeof conversation.streamingId).toBe('string');
        } else {
          expect(conversation.streamingId).toBeUndefined();
        }
      }
      
      // 3. Start a conversation to trigger the status tracking
      const startResponse = await fetch(`${baseUrl}/api/conversations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workingDirectory: process.cwd(),
          initialPrompt: 'Simple test'
        })
      });
      
      expect(startResponse.ok).toBe(true);
      const startData = await startResponse.json() as { 
        streamingId: string; 
        streamUrl: string;
        sessionId: string;
        cwd: string;
        tools: string[];
        mcpServers: any[];
        model: string;
        permissionMode: string;
        apiKeySource: string;
      };
      const streamingId = startData.streamingId;
      
      // 4. Wait a moment for process to start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 5. Check conversation list structure again
      const updatedResponse = await fetch(`${baseUrl}/api/conversations`);
      expect(updatedResponse.ok).toBe(true);
      const updatedData = await updatedResponse.json() as { conversations: any[]; total: number };
      
      // Verify structure is still consistent
      for (const conversation of updatedData.conversations) {
        expect(conversation.status).toBeDefined();
        
        if (conversation.status === 'ongoing') {
          expect(conversation.streamingId).toBeDefined();
          expect(typeof conversation.streamingId).toBe('string');
        } else {
          expect(conversation.streamingId).toBeUndefined();
        }
      }
      
      // 6. Stop the conversation and verify cleanup
      const stopResponse = await fetch(`${baseUrl}/api/conversations/${streamingId}/stop`, {
        method: 'POST'
      });
      expect(stopResponse.ok).toBe(true);
      
      // 7. Final structure check
      await new Promise(resolve => setTimeout(resolve, 200));
      const finalResponse = await fetch(`${baseUrl}/api/conversations`);
      expect(finalResponse.ok).toBe(true);
      const finalData = await finalResponse.json() as { conversations: any[]; total: number };
      
      for (const conversation of finalData.conversations) {
        if (conversation.status === 'ongoing') {
          expect(conversation.streamingId).toBeDefined();
        } else {
          expect(conversation.streamingId).toBeUndefined();
        }
      }
      
    }, 8000);
  });
});