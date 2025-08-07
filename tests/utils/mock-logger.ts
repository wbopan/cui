import { mock } from 'bun:test';

/**
 * Complete mock implementation of the CUI Logger that properly implements
 * the full interface including recursive child() methods.
 * 
 * This solves the issue where incomplete logger mocks in different test files
 * cause failures when tests run together due to Bun's global mock persistence.
 */

// Create a recursive logger mock factory
export function createMockLogger(): any {
  const logger = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    fatal: mock(() => {}),
    // child() must return another complete logger with child() method
    child: mock(() => createMockLogger())
  };
  return logger;
}

/**
 * Creates a complete mock for the logger module.
 * Use this in your test files instead of creating incomplete mocks.
 * 
 * @example
 * import { setupLoggerMock } from '@/tests/utils/mock-logger';
 * 
 * // In your test file
 * setupLoggerMock();
 */
export function setupLoggerMock() {
  mock.module('@/services/logger', () => ({
    createLogger: mock(() => createMockLogger()),
    logger: {
      child: mock(() => createMockLogger()),
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      fatal: mock(() => {})
    },
    CUILogger: mock(function() {
      return createMockLogger();
    })
  }));
}

/**
 * Returns the mock module configuration for logger.
 * Use this if you need to customize the mock further.
 */
export function getLoggerMockModule() {
  return {
    createLogger: mock(() => createMockLogger()),
    logger: {
      child: mock(() => createMockLogger()),
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      fatal: mock(() => {})
    },
    CUILogger: mock(function() {
      return createMockLogger();
    })
  };
}