import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, createAuthMiddleware, clearRateLimitStore } from '@/middleware/auth';
import { ConfigService } from '@/services/config-service.js';

vi.mock('@/services/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    clearRateLimitStore();

    vi.spyOn(ConfigService, 'getInstance').mockReturnValue({
      getConfig: vi.fn(() => ({ authToken: 'test-token-123' }))
    } as any);
    
    req = {
      headers: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as Partial<Request>;
    
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as Partial<Response>;
    
    next = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('authMiddleware', () => {
    it('should skip auth in test environment by default', () => {
      process.env.NODE_ENV = 'test';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should enforce auth in test environment when ENABLE_AUTH_IN_TESTS is set', () => {
      process.env.NODE_ENV = 'test';
      process.env.ENABLE_AUTH_IN_TESTS = 'true';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      
      delete process.env.ENABLE_AUTH_IN_TESTS;
    });

    it('should reject request without Authorization header', () => {
      process.env.NODE_ENV = 'production';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should reject request with invalid Authorization header format', () => {
      process.env.NODE_ENV = 'production';
      req.headers!.authorization = 'InvalidFormat token';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with wrong token', () => {
      process.env.NODE_ENV = 'production';
      req.headers!.authorization = 'Bearer wrong-token';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should accept request with valid token', () => {
      process.env.NODE_ENV = 'production';
      req.headers!.authorization = 'Bearer test-token-123';
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle missing IP address gracefully', () => {
      process.env.NODE_ENV = 'production';
      req.ip = undefined;
      req.connection = {};
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle authentication error', () => {
      process.env.NODE_ENV = 'production';
      req.headers!.authorization = 'Bearer test-token-123';
      
      // Mock ConfigService to throw error
      vi.mocked(ConfigService.getInstance).mockImplementation(() => {
        throw new Error('Config error');
      });
      
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
  });

  describe('createAuthMiddleware', () => {
    it('should use override token when provided', () => {
      process.env.NODE_ENV = 'production';
      const middleware = createAuthMiddleware('override-token');
      
      req.headers!.authorization = 'Bearer override-token';
      
      middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject wrong token with override', () => {
      process.env.NODE_ENV = 'production';
      const middleware = createAuthMiddleware('override-token');
      
      req.headers!.authorization = 'Bearer wrong-token';
      
      middleware(req as Request, res as Response, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should use config token when override not provided', () => {
      process.env.NODE_ENV = 'production';
      const middleware = createAuthMiddleware();
      
      req.headers!.authorization = 'Bearer test-token-123';
      
      middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should rate limit after multiple failed attempts', () => {
      // Make 10 failed attempts (MAX_ATTEMPTS)
      for (let i = 0; i < 10; i++) {
        req.headers!.authorization = 'Bearer wrong-token';
        authMiddleware(req as Request, res as Response, next);
      }
      
      // All should return 401
      expect(res.status).toHaveBeenCalledTimes(10);
      expect(res.status).toHaveBeenCalledWith(401);
      
      // 11th attempt should be rate limited
      vi.clearAllMocks();
      authMiddleware(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Too many authentication attempts. Try again later.' 
      });
    });

    it('should track attempts per IP', () => {
      // First IP - failed attempts
      req.ip = '192.168.1.1';
      for (let i = 0; i < 5; i++) {
        req.headers!.authorization = 'Bearer wrong-token';
        authMiddleware(req as Request, res as Response, next);
      }
      
      // Second IP - should not be rate limited
      vi.clearAllMocks();
      req.ip = '192.168.1.2';
      req.headers!.authorization = 'Bearer test-token-123';
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reset rate limit after time window', async () => {
      // Make failed attempts
      for (let i = 0; i < 10; i++) {
        req.headers!.authorization = 'Bearer wrong-token';
        authMiddleware(req as Request, res as Response, next);
      }
      
      // Wait for rate limit window to expire (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be able to try again
      vi.clearAllMocks();
      req.headers!.authorization = 'Bearer test-token-123';
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should clear rate limit store', () => {
      // Add some failed attempts
      for (let i = 0; i < 5; i++) {
        req.headers!.authorization = 'Bearer wrong-token';
        authMiddleware(req as Request, res as Response, next);
      }
      
      // Clear the store
      clearRateLimitStore();
      
      // Should be able to make requests again
      vi.clearAllMocks();
      req.headers!.authorization = 'Bearer test-token-123';
      authMiddleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
    });

    it('should handle missing authorization header for rate limiting', () => {
      // Make multiple requests without auth header
      for (let i = 0; i < 10; i++) {
        delete req.headers!.authorization;
        authMiddleware(req as Request, res as Response, next);
      }
      
      // 11th attempt should be rate limited
      vi.clearAllMocks();
      authMiddleware(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });
});