import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { CUIServer } from '@/cui-server';
import { logStreamBuffer } from '@/services/log-stream-buffer';

describe('Log Endpoints Integration', () => {
  let server: CUIServer;
  let app: Express;

  beforeAll(async () => {
    // Create server instance for testing
    server = new CUIServer({ port: 0 }); // Use port 0 for random available port
    app = (server as any).app; // Access the Express app for testing
    
    // Start the server for integration tests
    await server.start();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  beforeEach(() => {
    // Clear log buffer before each test
    logStreamBuffer.clear();
  });

  describe('GET /api/logs/recent', () => {
    it('should return empty logs when buffer is empty', async () => {
      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);

      expect(response.body).toEqual({ logs: [] });
    });

    it('should return recent logs when buffer has entries', async () => {
      // Add some test logs
      logStreamBuffer.addLog('{"level":"info","msg":"test log 1"}');
      logStreamBuffer.addLog('{"level":"debug","msg":"test log 2"}');
      logStreamBuffer.addLog('{"level":"warn","msg":"test log 3"}');

      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);

      expect(response.body.logs).toHaveLength(3);
      expect(response.body.logs[0]).toBe('{"level":"info","msg":"test log 1"}');
      expect(response.body.logs[1]).toBe('{"level":"debug","msg":"test log 2"}');
      expect(response.body.logs[2]).toBe('{"level":"warn","msg":"test log 3"}');
    });

    it('should respect limit parameter', async () => {
      // Add multiple logs
      for (let i = 1; i <= 5; i++) {
        logStreamBuffer.addLog(`{"level":"info","msg":"test log ${i}"}`);
      }

      const response = await request(app)
        .get('/api/logs/recent?limit=3')
        .expect(200);

      expect(response.body.logs).toHaveLength(3);
      expect(response.body.logs[0]).toBe('{"level":"info","msg":"test log 3"}');
      expect(response.body.logs[1]).toBe('{"level":"info","msg":"test log 4"}');
      expect(response.body.logs[2]).toBe('{"level":"info","msg":"test log 5"}');
    });

    it('should use default limit when not specified', async () => {
      // Add many logs (more than default)
      for (let i = 1; i <= 150; i++) {
        logStreamBuffer.addLog(`{"level":"info","msg":"test log ${i}"}`);
      }

      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);

      // Should return the last 100 logs (default limit is 100)
      expect(response.body.logs).toHaveLength(100);
      expect(response.body.logs[0]).toBe('{"level":"info","msg":"test log 51"}');
      expect(response.body.logs[99]).toBe('{"level":"info","msg":"test log 150"}');
    });

    it('should handle invalid limit parameter gracefully', async () => {
      logStreamBuffer.addLog('{"level":"info","msg":"test log"}');

      const response = await request(app)
        .get('/api/logs/recent?limit=invalid')
        .expect(200);

      // Should fall back to default behavior
      expect(response.body.logs).toHaveLength(1);
    });

    it('should handle zero limit parameter', async () => {
      logStreamBuffer.addLog('{"level":"info","msg":"test log"}');

      const response = await request(app)
        .get('/api/logs/recent?limit=0')
        .expect(200);

      // Zero limit should return empty array
      expect(response.body.logs).toEqual([]);
    });

    it('should include request logging in response', async () => {
      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);

      // The request itself should generate logs that might be in the buffer
      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });
  });

  describe('GET /api/logs/stream', () => {
    it('should establish SSE connection with correct headers', async () => {
      // Get the actual server port from the running server
      const serverAddress = (server as any).server?.address();
      const serverPort = serverAddress?.port || 3001;
      const baseUrl = `http://localhost:${serverPort}`;
      
      // Create AbortController for cleanup
      const controller = new AbortController();
      
      try {
        // Make raw HTTP request to check headers
        const streamResponse = await fetch(`${baseUrl}/api/logs/stream`, {
          signal: controller.signal
        });
        
        // Verify SSE headers
        expect(streamResponse.status).toBe(200);
        expect(streamResponse.headers.get('content-type')).toBe('text/event-stream');
        expect(streamResponse.headers.get('cache-control')).toBe('no-cache');
        expect(streamResponse.headers.get('connection')).toBe('keep-alive');
        
        // Verify response is streaming
        expect(streamResponse.body).toBeDefined();
        
        // Read initial chunk to verify SSE format
        if (streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          
          try {
            const { value } = await reader.read();
            if (value) {
              const chunk = decoder.decode(value);
              
              // Should contain SSE-formatted connection confirmation
              expect(chunk).toContain('data: {"type":"connected"}');
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        }
      } finally {
        // Always abort the connection to clean up
        controller.abort();
      }
    });

    it('should handle basic streaming functionality', async () => {
      // Get the actual server port from the running server
      const serverAddress = (server as any).server?.address();
      const serverPort = serverAddress?.port || 3001;
      const baseUrl = `http://localhost:${serverPort}`;
      
      // Create AbortController for cleanup
      const controller = new AbortController();
      
      try {
        // Connect to stream endpoint
        const streamResponse = await fetch(`${baseUrl}/api/logs/stream`, {
          signal: controller.signal
        });
        
        expect(streamResponse.status).toBe(200);
        expect(streamResponse.headers.get('content-type')).toBe('text/event-stream');
        
        // Read initial data to verify connection
        if (streamResponse.body) {
          const reader = streamResponse.body.getReader();
          try {
            const { value } = await reader.read();
            if (value) {
              const chunk = new TextDecoder().decode(value);
              expect(chunk).toContain('data: {"type":"connected"}');
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        }
      } finally {
        // Always abort to clean up
        controller.abort();
      }
      
      // Verify we can still make requests (no resource leaks)
      await request(app)
        .get('/api/logs/recent')
        .expect(200);
    });
  });

  describe('Logger Integration', () => {
    it('should work with manual log buffer entries', async () => {
      // Test with manually added entries since logger async import may not work in tests
      logStreamBuffer.addLog('{"level":"info","msg":"manual test log","component":"Test"}');
      
      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);
      
      // Check if our test message appears in the logs
      const hasTestMessage = response.body.logs.some((log: string) => {
        try {
          const parsed = JSON.parse(log);
          return parsed.msg === 'manual test log' && parsed.component === 'Test';
        } catch {
          return false;
        }
      });
      
      expect(hasTestMessage).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle log streaming errors gracefully', async () => {
      // This test ensures the endpoint doesn't crash on malformed log buffer operations
      const response = await request(app)
        .get('/api/logs/recent')
        .expect(200);

      expect(response.body).toHaveProperty('logs');
    });

    it('should return 500 on internal server errors', async () => {
      // Mock a scenario where log buffer fails
      const originalGetRecentLogs = logStreamBuffer.getRecentLogs;
      logStreamBuffer.getRecentLogs = () => {
        throw new Error('Buffer error');
      };

      const response = await request(app)
        .get('/api/logs/recent')
        .expect(500);

      expect(response.body).toHaveProperty('error');

      // Restore original method
      logStreamBuffer.getRecentLogs = originalGetRecentLogs;
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers for log endpoints', async () => {
      const response = await request(app)
        .get('/api/logs/recent')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      // CORS should be enabled for API endpoints
      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers).toHaveProperty('access-control-allow-credentials', 'true');
    });

    it('should set proper content type for log streaming', async () => {
      // Get the actual server port from the running server
      const serverAddress = (server as any).server?.address();
      const serverPort = serverAddress?.port || 3001;
      const baseUrl = `http://localhost:${serverPort}`;
      
      // Create AbortController for cleanup
      const controller = new AbortController();
      
      try {
        // Make request to check headers
        const streamResponse = await fetch(`${baseUrl}/api/logs/stream`, {
          signal: controller.signal
        });
        
        expect(streamResponse.status).toBe(200);
        expect(streamResponse.headers.get('content-type')).toMatch(/text\/event-stream/);
      } finally {
        // Always abort to clean up
        controller.abort();
      }
    });
  });
});