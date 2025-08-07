import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import { ConversationConfig } from '@/types';
import * as path from 'path';

// Get mock Claude executable path
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

describe('ClaudeProcessManager', () => {
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
    
    // Reduced cleanup time
    await new Promise(resolve => setTimeout(resolve, 50));
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
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  describe('constructor', () => {
    it('should initialize', () => {
      expect(manager).toBeDefined();
      expect(manager.getActiveSessions()).toEqual([]);
    });
  });

  describe('buildStartArgs', () => {
    it('should build correct arguments with all options', () => {
      const config: ConversationConfig = {
        workingDirectory: '/test/dir',
        initialPrompt: 'Hello Claude',
        model: 'claude-opus-4-20250514',
        allowedTools: ['Bash', 'Read'],
        disallowedTools: ['WebSearch'],
        systemPrompt: 'You are helpful'
      };

      const args = (manager as any).buildStartArgs(config);
      
      // Test all functionality in one test to reduce overhead
      expect(args).toContain('-p');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-20250514');
      expect(args).toContain('--allowedTools');
      expect(args).toContain('Bash,Read');
      expect(args).toContain('--disallowedTools');
      expect(args).toContain('WebSearch');
      expect(args).toContain('--system-prompt');
      expect(args).toContain('You are helpful');
      expect(args).toContain('Hello Claude');
    });
  });

  describe('startConversation', () => {
    it('should start a conversation and return streaming ID', async () => {
      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test'
      };

      const { streamingId, systemInit } = await manager.startConversation(config);
      
      expect(streamingId).toBeDefined();
      expect(typeof streamingId).toBe('string');
      expect(streamingId.length).toBeGreaterThan(0);
      expect(systemInit).toBeDefined();
      expect(systemInit.type).toBe('system');
      expect(systemInit.subtype).toBe('init');
      
      // Session should be tracked as active
      expect(manager.getActiveSessions()).toContain(streamingId);
      expect(manager.isSessionActive(streamingId)).toBe(true);
    }, 2000);

    it('should emit claude-message events', async () => {
      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test'
      };

      let messageReceived = false;
      manager.on('claude-message', (data) => {
        expect(data).toBeDefined();
        expect(data.streamingId).toBeDefined();
        messageReceived = true;
      });

      await manager.startConversation(config);
      
      // Reduced wait time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(messageReceived).toBe(true);
    }, 2000);

    it('should handle invalid working directory', async () => {
      const config: ConversationConfig = {
        workingDirectory: '/nonexistent/directory/that/does/not/exist',
        initialPrompt: 'Hello Claude'
      };

      await expect(manager.startConversation(config)).rejects.toThrow();
    }, 3000);
  });


  describe('stopConversation', () => {
    it('should stop active conversation', async () => {
      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test'
      };
      
      const { streamingId } = await manager.startConversation(config);
      expect(manager.isSessionActive(streamingId)).toBe(true);
      
      const result = await manager.stopConversation(streamingId);
      expect(result).toBe(true);
      expect(manager.isSessionActive(streamingId)).toBe(false);
    }, 2000);

    it('should return false if session not found', async () => {
      const result = await manager.stopConversation('non-existent');
      expect(result).toBe(false);
    });

    it('should emit process-closed event', async () => {
      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test'
      };

      let processClosedEmitted = false;
      manager.on('process-closed', (data) => {
        expect(data).toBeDefined();
        expect(data.streamingId).toBeDefined();
        processClosedEmitted = true;
      });

      const { streamingId } = await manager.startConversation(config);
      await manager.stopConversation(streamingId);
      
      // Reduced wait time
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(processClosedEmitted).toBe(true);
    }, 2000);
  });

  describe('environment variables', () => {
    it('should set PWD and INIT_CWD to match working directory', async () => {
      const testDir = path.join(process.cwd(), 'tests');
      const config: ConversationConfig = {
        workingDirectory: testDir,
        initialPrompt: 'test environment'
      };

      let systemInitMessage: any;
      manager.once('claude-message', ({ message }) => {
        if (message.type === 'system' && message.subtype === 'init') {
          systemInitMessage = message;
        }
      });

      await manager.startConversation(config);
      
      // Wait for the system init message
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(systemInitMessage).toBeDefined();
      expect(systemInitMessage.env_pwd).toBe(testDir);
      expect(systemInitMessage.env_init_cwd).toBe(testDir);
    }, 2000);

    it('should set PWD and INIT_CWD for resumed conversations', async () => {
      const testDir = path.join(process.cwd(), 'src');
      
      // Mock the history reader to return our test directory
      vi.spyOn(mockHistoryReader, 'getConversationWorkingDirectory').mockResolvedValue(testDir);

      let systemInitMessage: any;
      manager.once('claude-message', ({ message }) => {
        if (message.type === 'system' && message.subtype === 'init') {
          systemInitMessage = message;
        }
      });

      await manager.startConversation({
        resumedSessionId: 'test-session-id',
        initialPrompt: 'resume test',
        workingDirectory: testDir
      });
      
      // Wait for the system init message
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(systemInitMessage).toBeDefined();
      expect(systemInitMessage.env_pwd).toBe(testDir);
      expect(systemInitMessage.env_init_cwd).toBe(testDir);
    }, 2000);
  });

  describe('session management', () => {
    it('should track multiple active sessions', async () => {
      const config1: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test1'
      };
      
      const config2: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test2'
      };

      const { streamingId: streamingId1 } = await manager.startConversation(config1);
      const { streamingId: streamingId2 } = await manager.startConversation(config2);
      
      // Verify both sessions were created with unique IDs
      expect(streamingId1).not.toBe(streamingId2);
      expect(manager.isSessionActive(streamingId2)).toBe(true);
    }, 3000);

    it('should return empty array when no sessions', () => {
      expect(manager.getActiveSessions()).toEqual([]);
    });

    it('should correctly report session status', async () => {
      const config: ConversationConfig = {
        workingDirectory: process.cwd(),
        initialPrompt: 'test'
      };

      expect(manager.isSessionActive('non-existent')).toBe(false);
      
      const { streamingId } = await manager.startConversation(config);
      expect(manager.isSessionActive(streamingId)).toBe(true);
      
      await manager.stopConversation(streamingId);
      expect(manager.isSessionActive(streamingId)).toBe(false);
    }, 2000);
  });

  describe('error handling', () => {
    it('should throw error for invalid working directory', async () => {
      const config: ConversationConfig = {
        workingDirectory: '/nonexistent/directory/that/does/not/exist',
        initialPrompt: 'test'
      };

      await expect(manager.startConversation(config)).rejects.toThrow();
    }, 2000);
  });
});