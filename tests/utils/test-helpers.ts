import { vi } from 'vitest';
import { CUIServer } from '@/cui-server';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import { ConversationStatusManager } from '@/services/conversation-status-manager';
import { ConfigService } from '@/services/config-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';

/**
 * Mock Claude process that simulates realistic Claude CLI behavior
 */
export class MockClaudeProcess extends EventEmitter {
  public stdout: EventEmitter;
  public stderr: EventEmitter;
  public stdin: any;
  public pid: number;
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  public killed: boolean = false;
  public connected: boolean = true;
  public channel?: any;
  
  private messages: string[] = [];
  private currentMessageIndex: number = 0;
  private emitInterval?: NodeJS.Timeout;

  constructor(messages: string[] = []) {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = { 
      write: vi.fn(), 
      end: vi.fn(),
      destroy: vi.fn()
    };
    this.pid = Math.floor(Math.random() * 10000) + 1000;
    this.messages = messages;
    
    // Add common stream properties to stdout/stderr
    (this.stdout as any).readable = true;
    (this.stderr as any).readable = true;
  }

  kill(signal?: string): boolean {
    this.killed = true;
    this.signalCode = signal || 'SIGTERM';
    this.exitCode = signal === 'SIGKILL' ? 137 : 143;
    
    if (this.emitInterval) {
      clearInterval(this.emitInterval);
    }
    
    // Emit close event after a short delay
    setTimeout(() => {
      this.emit('close', this.exitCode, signal);
    }, 10);
    
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  unref(): void {
    // No-op for mock
  }

  ref(): void {
    // No-op for mock
  }

  send(message: any, sendHandle?: any, options?: any, callback?: any): boolean {
    // No-op for mock
    return true;
  }

  startEmittingMessages(intervalMs: number = 100): void {
    this.emitInterval = setInterval(() => {
      if (this.currentMessageIndex < this.messages.length) {
        const message = this.messages[this.currentMessageIndex];
        this.stdout.emit('data', Buffer.from(message + '\n'));
        this.currentMessageIndex++;
      } else {
        // All messages sent, close the process
        this.exitCode = 0;
        if (this.emitInterval) {
          clearInterval(this.emitInterval);
        }
        setTimeout(() => {
          this.emit('close', 0, null);
        }, 10);
      }
    }, intervalMs);
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }

  static createSuccessfulConversation(sessionId: string = 'test-session-123'): string[] {
    return [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: sessionId,
        cwd: '/test/dir',
        tools: ['Bash', 'Read', 'Write'],
        mcp_servers: [],
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'auto',
        apiKeySource: 'environment'
      }),
      JSON.stringify({
        type: 'user',
        session_id: sessionId,
        message: {
          role: 'user',
          content: 'Hello Claude'
        }
      }),
      JSON.stringify({
        type: 'assistant',
        session_id: sessionId,
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello! How can I help you today?'
            }
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 8
          }
        }
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: sessionId,
        cost_usd: 0.001,
        is_error: false,
        duration_ms: 1000,
        duration_api_ms: 800,
        num_turns: 1,
        total_cost: 0.001,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 8,
          server_tool_use: {
            web_search_requests: 0
          }
        }
      })
    ];
  }
}

/**
 * Test utilities for isolated testing environment
 */
export class TestHelpers {
  /**
   * Create a test server with isolated configuration
   */
  static createTestServer(config?: {
    port?: number;
  }): CUIServer {
    // Mock ConfigService for tests
    vi.spyOn(ConfigService, 'getInstance').mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockReturnValue({
        machine_id: 'test-machine-12345678',
        server: {
          host: 'localhost',
          port: config?.port || 3001
        },
        logging: {
          level: 'silent'
        }
      })
    });
    
    return new CUIServer();
  }

  /**
   * Create a test process manager
   */
  static createTestProcessManager(): ClaudeProcessManager {
    // Create a mock history reader
    const mockHistoryReader = new ClaudeHistoryReader();
    // Mock the getConversationWorkingDirectory method to return current directory
    vi.spyOn(mockHistoryReader, 'getConversationWorkingDirectory').mockResolvedValue(process.cwd());
    
    // Create a mock status tracker
    const mockStatusTracker = new ConversationStatusManager();
    
    const manager = new ClaudeProcessManager(mockHistoryReader, mockStatusTracker);
    
    
    return manager;
  }

  /**
   * Setup test logging
   */
  static setupTestLogging(enabled: boolean = true): void {
    // Note: Logging is now controlled by ConfigService
    // Tests run with silent logging by default
    // To enable debug logging for tests, modify the mocked ConfigService
    // or create a test config file
  }

  /**
   * Wait for a condition to be met with timeout
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await condition();
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  /**
   * Create a test server for integration tests (no mocking of internal services)
   */
  static createIntegrationTestServer(config?: {
    port?: number;
    host?: string;
  }): CUIServer {
    const randomPort = config?.port || (3000 + Math.floor(Math.random() * 1000));
    const host = config?.host || 'localhost';
    
    // Mock ConfigService for integration tests
    vi.spyOn(ConfigService, 'getInstance').mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockReturnValue({
        machine_id: 'test-machine-12345678',
        server: {
          host: host,
          port: randomPort
        },
        logging: {
          level: 'silent'
        }
      })
    });
    
    // Pass config overrides to ensure the server uses our test port/host
    return new CUIServer({ port: randomPort, host: host });
  }

  /**
   * Setup child_process.spawn mock for integration tests
   */
  static setupClaudeProcessMock(mockProcess: MockClaudeProcess): vi.SpyInstance {
    const mockSpawn = vi.fn();
    
    mockSpawn.mockImplementation((...args: any[]) => {
      const [command, spawnArgs, options] = args;
      if (command === 'claude') {
        // Start emitting messages automatically when process is spawned
        setTimeout(() => {
          mockProcess.startEmittingMessages(50); // Faster for tests
        }, 10);
        return mockProcess;
      }
      // For other commands, use the original spawn
      return spawn(command, spawnArgs, options);
    });

    return mockSpawn;
  }

  /**
   * Wait for streaming messages to be received
   */
  static async waitForStreamingMessages(
    streamingData: string[],
    expectedCount: number,
    timeoutMs: number = 3000
  ): Promise<void> {
    return this.waitFor(
      () => streamingData.length >= expectedCount,
      timeoutMs,
      50 // Check more frequently for faster tests
    );
  }

  static parseStreamingData(rawData: string): any[] {
    return rawData
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.warn('Failed to parse streaming line:', line);
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Create temporary test directory
   */
  static async createTempTestDir(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-test-'));
    return tempDir;
  }

  /**
   * Cleanup temporary test directory
   */
  static async cleanupTempDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  }
}