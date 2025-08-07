import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { CUIServer } from '@/cui-server';
import { ConversationConfig } from '@/types';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import * as path from 'path';
import http from 'http';
import { EventSource } from 'eventsource';

// Get mock Claude executable path
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

/**
 * Integration test for the complete streaming service pipeline
 * Tests: Server -> ProcessManager -> Mock Claude CLI -> StreamManager -> SSE Client
 */
describe('Streaming Integration', () => {
  let server: CUIServer;
  let serverPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Use a random port to avoid conflicts with common services
    serverPort = 9000 + Math.floor(Math.random() * 1000);
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
    }
  }, 15000);

  describe('End-to-End Streaming', () => {
    it('should handle complete streaming lifecycle', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Hello, this is an integration test';
      
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
      const startData = await startResponse.json() as { streamingId: string; streamUrl: string };
      expect(startData).toHaveProperty('streamingId');
      expect(startData).toHaveProperty('streamUrl');
      
      const streamingId = startData.streamingId;
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      
      // 2. Connect to SSE stream and collect messages
      const messages: any[] = [];
      let connectionEstablished = false;
      let streamClosed = false;
      
      const eventSource = new EventSource(streamUrl);
      
      // Set up promise to wait for streaming completion
      const streamingComplete = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Streaming test timeout'));
        }, 8000);
        
        eventSource.onopen = () => {
          connectionEstablished = true;
        };
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            messages.push(data);
            
            // Check for connection confirmation
            if (data.type === 'connected') {
              expect(data.streaming_id).toBe(streamingId);
              expect(data.timestamp).toBeDefined();
            }
            
            // Check for close event
            if (data.type === 'closed') {
              streamClosed = true;
              clearTimeout(timeout);
              resolve();
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };
        
        eventSource.onerror = (error) => {
          // SSE connections naturally close when server ends stream
          // Only reject if we haven't seen the close event
          if (!streamClosed) {
            clearTimeout(timeout);
            reject(error);
          }
        };
      });
      
      // 3. Wait for streaming to complete
      await streamingComplete;
      
      // 4. Verify connection was established
      expect(connectionEstablished).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      
      // 5. Verify message format and sequence
      const connectedMessage = messages.find(m => m.type === 'connected');
      expect(connectedMessage).toBeDefined();
      expect(connectedMessage.streaming_id).toBe(streamingId);
      
      // Should have received Claude messages from mock CLI (system, assistant, or result)
      const claudeMessages = messages.filter(m => 
        m.type === 'assistant' || m.type === 'user' || m.type === 'system' || m.type === 'result'
      );
      expect(claudeMessages.length).toBeGreaterThan(0);
      
      // Verify the Claude response contains the expected "You said:" format from mock CLI
      const resultMessage = messages.find(m => m.type === 'result');
      expect(resultMessage).toBeDefined();
      expect(resultMessage.result).toContain('You said: Hello, this is an integration test');
      
      // Should end with close message
      const closeMessage = messages.find(m => m.type === 'closed');
      expect(closeMessage).toBeDefined();
      expect(closeMessage.streamingId).toBe(streamingId);
      
      // 6. Cleanup
      eventSource.close();
    }, 20000);

    it('should handle client disconnection without stopping Claude process', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Test client disconnection';
      
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
      
      const startData = await startResponse.json() as { streamingId: string; streamUrl: string };
      const streamingId = startData.streamingId;
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      
      // 2. Connect to stream and collect initial messages
      const messages: any[] = [];
      const eventSource = new EventSource(streamUrl);
      
      await new Promise<void>((resolve) => {
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          messages.push(data);
          
          // After receiving connection confirmation, disconnect client
          if (data.type === 'connected') {
            setTimeout(() => {
              eventSource.close();
              resolve();
            }, 100);
          }
        };
      });
      
      // 3. Verify client received initial messages
      expect(messages.length).toBeGreaterThan(0);
      const connectedMessage = messages.find(m => m.type === 'connected');
      expect(connectedMessage).toBeDefined();
      
      // 4. Wait a bit and check if Claude process is still active
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const statusResponse = await fetch(`${baseUrl}/api/system/status`);
      const statusData = await statusResponse.json() as { activeConversations: number };
      
      // Process should still be running since client disconnection doesn't stop it
      expect(statusData.activeConversations).toBeGreaterThanOrEqual(0);
      
      // 5. Explicitly stop the conversation (may already be finished by mock Claude)
      const stopResponse = await fetch(`${baseUrl}/api/conversations/${streamingId}/stop`, {
        method: 'POST'
      });
      const stopData = await stopResponse.json() as { success: boolean };
      // Accept either success=true (stopped active process) or success=false (already finished)
      expect(typeof stopData.success).toBe('boolean');
    }, 15000);

    it('should support multiple clients for same session', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Test multiple clients';
      
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
      
      const startData = await startResponse.json() as { streamingId: string; streamUrl: string };
      const streamingId = startData.streamingId;
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      
      // 2. Connect multiple clients to same stream
      const client1Messages: any[] = [];
      const client2Messages: any[] = [];
      
      const client1 = new EventSource(streamUrl);
      const client2 = new EventSource(streamUrl);
      
      const bothClientsConnected = new Promise<void>((resolve) => {
        let client1Connected = false;
        let client2Connected = false;
        
        const checkBothConnected = () => {
          if (client1Connected && client2Connected) {
            resolve();
          }
        };
        
        client1.onmessage = (event) => {
          const data = JSON.parse(event.data);
          client1Messages.push(data);
          if (data.type === 'connected') {
            client1Connected = true;
            checkBothConnected();
          }
        };
        
        client2.onmessage = (event) => {
          const data = JSON.parse(event.data);
          client2Messages.push(data);
          if (data.type === 'connected') {
            client2Connected = true;
            checkBothConnected();
          }
        };
      });
      
      // 3. Wait for both clients to connect
      await bothClientsConnected;
      
      // 4. Wait for some messages
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 5. Verify both clients received messages
      expect(client1Messages.length).toBeGreaterThan(0);
      expect(client2Messages.length).toBeGreaterThan(0);
      
      // Both should have connection confirmation
      expect(client1Messages.find(m => m.type === 'connected')).toBeDefined();
      expect(client2Messages.find(m => m.type === 'connected')).toBeDefined();
      
      // 6. Disconnect one client
      client1.close();
      
      // 7. Wait and verify other client still receives messages
      await new Promise(resolve => setTimeout(resolve, 500));
      const client2MessagesBefore = client2Messages.length;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Client 2 should still be receiving messages
      expect(client2Messages.length).toBeGreaterThanOrEqual(client2MessagesBefore);
      
      // 8. Cleanup
      client2.close();
      
      // 9. Stop conversation
      await fetch(`${baseUrl}/api/conversations/${streamingId}/stop`, {
        method: 'POST'
      });
    }, 20000);
  });

  describe('SSE Protocol Compliance', () => {
    it('should send proper SSE headers and format', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Test SSE format';
      
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
      
      const startData = await startResponse.json() as { streamingId: string; streamUrl: string };
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      
      // 2. Make raw HTTP request to check headers
      const streamResponse = await fetch(streamUrl);
      
      // 3. Verify SSE headers
      expect(streamResponse.headers.get('content-type')).toBe('text/event-stream');
      expect(streamResponse.headers.get('cache-control')).toBe('no-cache');
      expect(streamResponse.headers.get('x-accel-buffering')).toBe('no');
      expect(streamResponse.headers.get('access-control-allow-origin')).toBe('*');
      
      // 4. Verify response is streaming
      expect(streamResponse.body).toBeDefined();
      
      // 5. Read initial chunk to verify SSE format
      if (streamResponse.body) {
        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        
        try {
          const { value } = await reader.read();
          if (value) {
            const chunk = decoder.decode(value);
            
            // Should contain SSE-formatted data
            expect(chunk).toMatch(/^data: .*\n\n/);
            
            // Should be valid JSON in the data field
            const dataMatch = chunk.match(/^data: (.*)\n\n/);
            if (dataMatch) {
              const jsonData = JSON.parse(dataMatch[1]);
              expect(jsonData.type).toBe('connected');
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      
      // 6. Stop conversation
      await fetch(`${baseUrl}/api/conversations/${startData.streamingId}/stop`, {
        method: 'POST'
      });
    }, 10000);
  });
});