import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { LogStreamBuffer } from '@/services/log-stream-buffer';

describe('LogStreamBuffer', () => {
  let buffer: LogStreamBuffer;

  beforeEach(() => {
    buffer = new LogStreamBuffer(5); // Small buffer size for testing
  });

  afterEach(() => {
    buffer.removeAllListeners();
  });

  describe('constructor', () => {
    it('should initialize with default buffer size', () => {
      const defaultBuffer = new LogStreamBuffer();
      expect(defaultBuffer).toBeInstanceOf(LogStreamBuffer);
    });

    it('should initialize with custom buffer size', () => {
      const customBuffer = new LogStreamBuffer(100);
      expect(customBuffer).toBeInstanceOf(LogStreamBuffer);
    });
  });

  describe('addLog', () => {
    it('should add log entries to buffer', () => {
      buffer.addLog('test log 1');
      buffer.addLog('test log 2');

      const logs = buffer.getRecentLogs();
      expect(logs).toEqual(['test log 1', 'test log 2']);
    });

    it('should emit log event when adding entries', () => {
      return new Promise<void>((resolve) => {
        const testLog = 'test log entry';
        
        buffer.on('log', (logLine) => {
          expect(logLine).toBe(testLog);
          resolve();
        });

        buffer.addLog(testLog);
      });
    });

    it('should maintain buffer size limit', () => {
      // Add more logs than buffer size
      for (let i = 1; i <= 7; i++) {
        buffer.addLog(`log ${i}`);
      }

      const logs = buffer.getRecentLogs();
      expect(logs).toHaveLength(5); // Buffer size limit
      expect(logs).toEqual(['log 3', 'log 4', 'log 5', 'log 6', 'log 7']);
    });

    it('should handle JSONL log entries', () => {
      const jsonLog = '{"level":"info","time":"2025-07-04T09:25:46.406Z","msg":"test message"}';
      buffer.addLog(jsonLog);

      const logs = buffer.getRecentLogs();
      expect(logs).toEqual([jsonLog]);
    });
  });

  describe('getRecentLogs', () => {
    beforeEach(() => {
      buffer.addLog('log 1');
      buffer.addLog('log 2');
      buffer.addLog('log 3');
    });

    it('should return all logs when no limit specified', () => {
      const logs = buffer.getRecentLogs();
      expect(logs).toEqual(['log 1', 'log 2', 'log 3']);
    });

    it('should return limited number of logs', () => {
      const logs = buffer.getRecentLogs(2);
      expect(logs).toEqual(['log 2', 'log 3']);
    });

    it('should return all logs when limit is larger than buffer', () => {
      const logs = buffer.getRecentLogs(10);
      expect(logs).toEqual(['log 1', 'log 2', 'log 3']);
    });

    it('should return empty array when buffer is empty', () => {
      const emptyBuffer = new LogStreamBuffer();
      const logs = emptyBuffer.getRecentLogs();
      expect(logs).toEqual([]);
    });

    it('should return copy of logs (not reference)', () => {
      const logs1 = buffer.getRecentLogs();
      const logs2 = buffer.getRecentLogs();
      
      expect(logs1).toEqual(logs2);
      expect(logs1).not.toBe(logs2); // Different array instances
    });
  });

  describe('clear', () => {
    it('should clear all logs from buffer', () => {
      buffer.addLog('log 1');
      buffer.addLog('log 2');
      
      expect(buffer.getRecentLogs()).toHaveLength(2);
      
      buffer.clear();
      
      expect(buffer.getRecentLogs()).toEqual([]);
    });

    it('should allow adding logs after clearing', () => {
      buffer.addLog('log 1');
      buffer.clear();
      buffer.addLog('log 2');
      
      const logs = buffer.getRecentLogs();
      expect(logs).toEqual(['log 2']);
    });
  });

  describe('event handling', () => {
    it('should support multiple event listeners', () => {
      return new Promise<void>((resolve) => {
        let listener1Called = false;
        let listener2Called = false;

        buffer.on('log', () => {
          listener1Called = true;
          checkCompletion();
        });

        buffer.on('log', () => {
          listener2Called = true;
          checkCompletion();
        });

        function checkCompletion() {
          if (listener1Called && listener2Called) {
            resolve();
          }
        }

        buffer.addLog('test log');
      });
    });

    it('should handle event listener removal', () => {
      const listener = vi.fn();
      
      buffer.on('log', listener);
      buffer.addLog('test 1');
      
      buffer.removeListener('log', listener);
      buffer.addLog('test 2');
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('test 1');
    });
  });

  describe('buffer overflow behavior', () => {
    it('should maintain most recent logs when buffer overflows', () => {
      const buffer = new LogStreamBuffer(3);
      
      buffer.addLog('log 1');
      buffer.addLog('log 2');
      buffer.addLog('log 3');
      buffer.addLog('log 4'); // Should push out 'log 1'
      buffer.addLog('log 5'); // Should push out 'log 2'
      
      const logs = buffer.getRecentLogs();
      expect(logs).toEqual(['log 3', 'log 4', 'log 5']);
    });

    it('should continue emitting events during overflow', () => {
      const buffer = new LogStreamBuffer(2);
      const emittedLogs: string[] = [];
      
      buffer.on('log', (log) => {
        emittedLogs.push(log);
      });
      
      buffer.addLog('log 1');
      buffer.addLog('log 2');
      buffer.addLog('log 3'); // Overflow
      
      expect(emittedLogs).toEqual(['log 1', 'log 2', 'log 3']);
      expect(buffer.getRecentLogs()).toEqual(['log 2', 'log 3']);
    });
  });

  describe('concurrent access', () => {
    it('should handle rapid log additions', () => {
      const logs: string[] = [];
      
      // Add many logs rapidly
      for (let i = 0; i < 20; i++) {
        buffer.addLog(`rapid log ${i}`);
      }
      
      const recentLogs = buffer.getRecentLogs();
      expect(recentLogs).toHaveLength(5); // Buffer size limit
      expect(recentLogs[0]).toBe('rapid log 15');
      expect(recentLogs[4]).toBe('rapid log 19');
    });
  });
});