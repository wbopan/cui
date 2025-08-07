import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@/services/config-service.js';
import { createLogger } from '@/services/logger.js';

const logger = createLogger('AuthMiddleware');

// Rate limiting storage (in-memory for simplicity)
const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_ATTEMPTS = 10;

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now >= data.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Clear all rate limit entries (for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Check if IP has exceeded rate limit
 */
function isRateLimited(ip: string): boolean {
  cleanupRateLimit();
  
  const data = rateLimitStore.get(ip);
  if (!data) {
    return false;
  }
  
  return data.attempts >= MAX_ATTEMPTS && Date.now() < data.resetTime;
}

/**
 * Record failed auth attempt
 */
function recordFailedAttempt(ip: string): void {
  cleanupRateLimit();
  
  const now = Date.now();
  const data = rateLimitStore.get(ip);
  
  if (!data || now >= data.resetTime) {
    rateLimitStore.set(ip, {
      attempts: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
  } else {
    data.attempts++;
  }
}

/**
 * Creates authentication middleware for API endpoints
 * @param tokenOverride - Optional token to use instead of config token
 * @returns Express middleware function
 */
export function createAuthMiddleware(tokenOverride?: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    authMiddlewareImpl(req, res, next, tokenOverride);
  };
}

/**
 * Authentication middleware for API endpoints
 * Validates Bearer token against config
 * Disabled in test environment unless ENABLE_AUTH_IN_TESTS is set
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  authMiddlewareImpl(req, res, next);
}

function authMiddlewareImpl(req: Request, res: Response, next: NextFunction, tokenOverride?: string): void {
  // Skip auth in test environment unless explicitly enabled for auth tests
  if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_AUTH_IN_TESTS) {
    next();
    return;
  }
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Check rate limiting
  if (isRateLimited(clientIp)) {
    logger.warn('Rate limit exceeded', { ip: clientIp });
    res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
    return;
  }
  
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      recordFailedAttempt(clientIp);
      logger.debug('Missing or invalid Authorization header', { ip: clientIp });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Get expected token from config or use override
    const expectedToken = tokenOverride ?? ConfigService.getInstance().getConfig().authToken;
    
    // Validate token
    if (token !== expectedToken) {
      recordFailedAttempt(clientIp);
      logger.warn('Invalid auth token', { ip: clientIp });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    // Token is valid, proceed
    logger.debug('Authentication successful', { ip: clientIp });
    next();
  } catch (error) {
    recordFailedAttempt(clientIp);
    logger.error('Authentication error', { error, ip: clientIp });
    res.status(401).json({ error: 'Unauthorized' });
  }
}