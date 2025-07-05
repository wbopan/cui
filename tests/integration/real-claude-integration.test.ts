import { CCUIServer } from '@/ccui-server';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EventSource } from 'eventsource';

/**
 * Integration test for real Claude CLI with fake home directory
 */
describe('Real Claude CLI Integration', () => {
  let server: CCUIServer;
  let tempHomeDir: string;
  let serverPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Create temporary fake home directory
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-test-home-'));
    
    // Use a random port to avoid conflicts with other services and tests
    serverPort = 8000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${serverPort}`;
    
    // Create server
    server = new CCUIServer({ port: serverPort });
    
    // Replace the HistoryReader with one that uses fake HOME first
    const { ClaudeHistoryReader } = require('@/services/claude-history-reader');
    const historyReader = new ClaudeHistoryReader();
    // Override the claudeHomePath to point to fake home
    historyReader.claudeHomePath = path.join(tempHomeDir, '.claude');
    (server as any).historyReader = historyReader;
    
    // Store the original process manager to get MCP config path after server starts
    const originalProcessManager = (server as any).processManager;
    
    // Replace the ProcessManager with one that uses fake HOME
    const claudePath = 'node_modules/.bin/claude';
    
    const newProcessManager = new ClaudeProcessManager(
      historyReader,
      claudePath,
      { HOME: tempHomeDir }
    );
    
    (server as any).processManager = newProcessManager;
    
    // Re-setup the ProcessManager integration since we replaced it
    (server as any).setupProcessManagerIntegration();
    
    // Start the server - this will generate MCP config and set it on our processManager
    await server.start();
    
    // Transfer the MCP config path from the original process manager
    // The server.start() creates MCP config but sets it on the original process manager
    const mcpConfigPath = originalProcessManager.mcpConfigPath;
    if (mcpConfigPath) {
      newProcessManager.setMCPConfigPath(mcpConfigPath);
    }
  }, 15000);

  afterAll(async () => {
    if (server) {
      await server.stop();
      // Longer delay to ensure all async operations complete and port is fully released
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Clean up temporary directory
    try {
      await fs.rm(tempHomeDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Restore all mocks to prevent interference with other tests
    jest.restoreAllMocks();
  }, 15000);

  describe('Claude CLI with API Error', () => {
    it('should handle real Claude CLI with API error in fake home and test resume functionality', async () => {
      const workingDirectory = process.cwd();
      const initialPrompt = 'Say 1+1=2 and quit';
      
      // 1. Start conversation with real Claude CLI
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
      
      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(`Start conversation failed: ${JSON.stringify(errorData)}`);
      }
      
      expect(startResponse.ok).toBe(true);
      const startData = await startResponse.json() as { streamingId: string; streamUrl: string };
      expect(startData).toHaveProperty('streamingId');
      expect(startData).toHaveProperty('streamUrl');
      
      const streamingId = startData.streamingId;
      
      // 2. Connect to stream and collect messages  
      const messages: any[] = [];
      let hasApiError = false;
      let streamClosed = false;
      
      // Use EventSource for better performance (like existing streaming test)
      const streamUrl = `${baseUrl}${startData.streamUrl}`;
      const eventSource = new EventSource(streamUrl);
      
      // Set up promise to wait for API error detection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('Streaming timeout - API error not detected'));
        }, 15000);
        
        eventSource.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            messages.push(data);
            
            // Check for API error in message content
            const content = JSON.stringify(data);
            if (content.includes('Invalid API key') || 
                content.includes('API key') ||
                content.includes('login') ||
                content.includes('authentication')) {
              hasApiError = true;
            }
            
            // Exit early once we have the API error
            if (data.type === 'closed' || hasApiError) {
              streamClosed = true;
              clearTimeout(timeout);
              eventSource.close();
              resolve();
            }
          } catch (error) {
            clearTimeout(timeout);
            eventSource.close();
            reject(error);
          }
        };
        
        eventSource.onerror = (error: any) => {
          if (!streamClosed) {
            clearTimeout(timeout);
            eventSource.close();
            reject(error);
          }
        };
      });
      
      // 3. Verify we received API error in streaming
      expect(messages.length).toBeGreaterThan(0);
      expect(hasApiError).toBe(true);
      
      // 4. Test the list and get conversation APIs (they work with existing conversations)
      const listResponse = await fetch(`${baseUrl}/api/conversations`);
      expect(listResponse.ok).toBe(true);
      
      const listData = await listResponse.json() as { conversations: any[], total: number };
      expect(listData.conversations).toBeDefined();
      expect(Array.isArray(listData.conversations)).toBe(true);
      
      // 5. If we have conversations, test the get conversation API
      if (listData.conversations.length > 0) {
        const firstConversation = listData.conversations[0];
        const detailsResponse = await fetch(`${baseUrl}/api/conversations/${firstConversation.sessionId}`);
        expect(detailsResponse.ok).toBe(true);
        
        const conversationDetails = await detailsResponse.json() as any;
        expect(conversationDetails).toBeDefined();
        expect(conversationDetails.messages).toBeDefined();
        
        // 6. Extract actual Claude session ID from JSONL files for resume test
        let actualClaudeSessionId = firstConversation.sessionId; // fallback
        const originalMessageCount = conversationDetails.messages.length;
        
        // Get the real session ID from the JSONL file in the fake home
        try {
          const fs = require('fs');
          const path = require('path');
          const claudeDir = path.join(tempHomeDir, '.claude');
          const projectsDir = path.join(claudeDir, 'projects');
          const projectDirs = fs.readdirSync(projectsDir);
          
          if (projectDirs.length > 0) {
            const firstProjectDir = path.join(projectsDir, projectDirs[0]);
            const projectContents = fs.readdirSync(firstProjectDir);
            const jsonlFiles = projectContents.filter((f: string) => f.endsWith('.jsonl'));
            
            if (jsonlFiles.length > 0) {
              // Extract session ID from the JSONL filename (it should be the session ID)
              const jsonlFilename = jsonlFiles[0];
              const sessionIdFromFile = jsonlFilename.replace('.jsonl', '');
              actualClaudeSessionId = sessionIdFromFile;
            }
          }
        } catch (error) {
          // Fallback to API session ID if we can't read JSONL
        }
        
        
        // 7. Resume the conversation (should fail fast with API error)
        const resumeResponse = await fetch(`${baseUrl}/api/conversations/resume`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: actualClaudeSessionId,
            message: 'Continue the conversation with another prompt'
          })
        });
        
        // With our improved error handling, resume should fail immediately
        expect(resumeResponse.ok).toBe(false);
        expect(resumeResponse.status).toBe(500);
        const resumeError = await resumeResponse.json() as { error: string; code?: string };
        expect(resumeError.error).toContain('Claude CLI process exited before sending system initialization message');
        // Can be either "Invalid API key" or "No conversation found" depending on Claude CLI behavior
        expect(resumeError.error).toMatch(/Invalid API key|No conversation found/);
        expect(resumeError.code).toBe('CLAUDE_PROCESS_EXITED_EARLY');
        
        // 8. Verify that resume correctly failed immediately (no streaming needed)
        
        // 9. Verify conversation details are still accessible (original conversation unaffected)
        
        const updatedDetailsResponse = await fetch(`${baseUrl}/api/conversations/${actualClaudeSessionId}`);
        expect(updatedDetailsResponse.ok).toBe(true);
        
        const updatedConversationDetails = await updatedDetailsResponse.json() as any;
        expect(updatedConversationDetails.messages).toBeDefined();
        
        // The conversation details should still contain the original conversation
        // (resume failure doesn't affect the original conversation)
        expect(updatedConversationDetails.messages.length).toBeGreaterThanOrEqual(originalMessageCount);
        
      }
    }, 30000);
  });
});
