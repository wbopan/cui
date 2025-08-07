import pino, { Logger as PinoLogger } from 'pino';
import { PassThrough } from 'stream';
import { LogFormatter } from './log-formatter.js';

export interface LogContext {
  component?: string;
  sessionId?: string;
  streamingId?: string;
  requestId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Wrapper class for Pino logger that provides an intuitive API
 * Translates logger.method('message', context) to Pino's logger.method(context, 'message')
 */
// Re-export CUILogger as Logger for backward compatibility
export type Logger = CUILogger;

export class CUILogger {
  constructor(private pinoLogger: PinoLogger) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, context?: any): void {
    if (context !== undefined) {
      this.pinoLogger.debug(context, message);
    } else {
      this.pinoLogger.debug(message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, context?: any): void {
    if (context !== undefined) {
      this.pinoLogger.info(context, message);
    } else {
      this.pinoLogger.info(message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, context?: any): void {
    if (context !== undefined) {
      this.pinoLogger.warn(context, message);
    } else {
      this.pinoLogger.warn(message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, error?: Error | unknown, context?: any): void {
    if (error instanceof Error) {
      const logData = { err: error, ...context };
      this.pinoLogger.error(logData, message);
    } else if (error !== undefined && context !== undefined) {
      // error is actually context, context is extra data
      const logData = { ...error, ...context };
      this.pinoLogger.error(logData, message);
    } else if (error !== undefined) {
      // error is context
      this.pinoLogger.error(error, message);
    } else {
      this.pinoLogger.error(message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fatal(message: string, error?: Error | unknown, context?: any): void {
    if (error instanceof Error) {
      const logData = { err: error, ...context };
      this.pinoLogger.fatal(logData, message);
    } else if (error !== undefined && context !== undefined) {
      // error is actually context, context is extra data
      const logData = { ...error, ...context };
      this.pinoLogger.fatal(logData, message);
    } else if (error !== undefined) {
      // error is context
      this.pinoLogger.fatal(error, message);
    } else {
      this.pinoLogger.fatal(message);
    }
  }

  // Support for creating child loggers
  child(context: LogContext): CUILogger {
    return new CUILogger(this.pinoLogger.child(context));
  }
}

/**
 * Centralized logger service using Pino
 * Provides consistent logging across all CUI components
 * Log level is controlled by LOG_LEVEL environment variable
 */
class LoggerService {
  private static instance: LoggerService;
  private baseLogger: PinoLogger;
  private logInterceptStream: PassThrough;
  private childLoggers: Map<string, PinoLogger> = new Map();

  private constructor() {
    // Get log level from environment variable, default to 'info'
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    // Create a pass-through stream to intercept logs
    this.logInterceptStream = new PassThrough();
    
    // Forward logs to the log buffer (lazy loaded to avoid circular dependency)
    this.logInterceptStream.on('data', (chunk) => {
      const logLine = chunk.toString().trim();
      if (logLine) {
        // Lazy load to avoid circular dependency
        import('@/services/log-stream-buffer').then(({ logStreamBuffer }) => {
          logStreamBuffer.addLog(logLine);
        }).catch(() => {
          // Silently ignore if log buffer is not available
        });
      }
    });
    
    const formatter = new LogFormatter();
    formatter.pipe(process.stdout);
    
    // Create multi-stream configuration with formatter
    const streams = [
      { level: logLevel as pino.Level, stream: formatter },
      { level: logLevel as pino.Level, stream: this.logInterceptStream }
    ];
    
    this.baseLogger = pino({
      level: logLevel,
      formatters: {
        level: (label) => {
          return { level: label };
        }
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      // Enable in test environment if debug level, otherwise suppress
      enabled: process.env.NODE_ENV !== 'test' || logLevel === 'debug'
    }, pino.multistream(streams));
  }

  /**
   * Get the singleton logger instance
   */
  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * Create a child logger with context
   */
  child(context: LogContext): CUILogger {
    const contextKey = JSON.stringify(context);
    if (!this.childLoggers.has(contextKey)) {
      this.childLoggers.set(contextKey, this.baseLogger.child(context));
    }
    return new CUILogger(this.childLoggers.get(contextKey)!);
  }

  /**
   * Get the base logger
   */
  getLogger(): CUILogger {
    return new CUILogger(this.baseLogger);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (context) {
      this.baseLogger.child(context).debug(message);
    } else {
      this.baseLogger.debug(message);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (context) {
      this.baseLogger.child(context).info(message);
    } else {
      this.baseLogger.info(message);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (context) {
      this.baseLogger.child(context).warn(message);
    } else {
      this.baseLogger.warn(message);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const logData = error ? { err: error } : {};
    if (context) {
      this.baseLogger.child({ ...context, ...logData }).error(message);
    } else {
      this.baseLogger.error(logData, message);
    }
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    const logData = error ? { err: error } : {};
    if (context) {
      this.baseLogger.child({ ...context, ...logData }).fatal(message);
    } else {
      this.baseLogger.fatal(logData, message);
    }
  }
}

// Export singleton instance
export const logger = LoggerService.getInstance();

// Export factory function for creating component loggers
export function createLogger(component: string, baseContext?: LogContext): CUILogger {
  const context = { component, ...baseContext };
  return logger.child(context);
}