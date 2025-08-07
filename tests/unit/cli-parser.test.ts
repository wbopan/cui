import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { parseArgs } from '@/cli-parser';
import { setupLoggerMock, createMockLogger } from '../utils/mock-logger';

// Use the complete logger mock
setupLoggerMock();
const mockLogger = createMockLogger();

describe('CLI Parser', () => {
  let mockExit: any;
  
  beforeEach(() => {
    // Mock process.exit
    mockExit = spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process exited with code ${code}`);
    });
    
    // Clear mock calls
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.warn.mockClear();
  });
  
  afterEach(() => {
    mockExit.mockRestore();
    mock.restore();
  });
  
  describe('Valid arguments', () => {
    it('should parse port correctly', () => {
      const result = parseArgs(['node', 'server.js', '--port', '3002']);
      expect(result).toEqual({ port: 3002 });
    });
    
    it('should parse host correctly', () => {
      const result = parseArgs(['node', 'server.js', '--host', '0.0.0.0']);
      expect(result).toEqual({ host: '0.0.0.0' });
    });
    
    it('should parse token correctly', () => {
      const result = parseArgs(['node', 'server.js', '--token', 'my-secret-token']);
      expect(result).toEqual({ token: 'my-secret-token' });
    });
    
    it('should parse skip-auth-token correctly', () => {
      const result = parseArgs(['node', 'server.js', '--skip-auth-token']);
      expect(result).toEqual({ skipAuthToken: true });
    });
    
    it('should parse multiple arguments correctly', () => {
      const result = parseArgs([
        'node', 'server.js',
        '--port', '3002',
        '--host', '0.0.0.0',
        '--token', 'custom-token',
        '--skip-auth-token'
      ]);
      expect(result).toEqual({
        port: 3002,
        host: '0.0.0.0',
        token: 'custom-token',
        skipAuthToken: true
      });
    });
    
    it('should return empty config when no arguments provided', () => {
      const result = parseArgs(['node', 'server.js']);
      expect(result).toEqual({});
    });
  });
  
  describe('Invalid port values', () => {
    it('should reject port greater than 65535', () => {
      expect(() => parseArgs(['node', 'server.js', '--port', '99999'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid port value: 99999');
    });
    
    it('should reject port 0', () => {
      expect(() => parseArgs(['node', 'server.js', '--port', '0'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid port value: 0');
    });
    
    it('should reject negative port', () => {
      expect(() => parseArgs(['node', 'server.js', '--port', '-1'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid port value: -1');
    });
    
    it('should reject non-numeric port', () => {
      expect(() => parseArgs(['node', 'server.js', '--port', 'abc'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid port value: abc');
    });
  });
  
  describe('Missing values', () => {
    it('should reject --port without value', () => {
      expect(() => parseArgs(['node', 'server.js', '--port'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('--port requires a value');
    });
    
    it('should reject --host without value', () => {
      expect(() => parseArgs(['node', 'server.js', '--host'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('--host requires a value');
    });
    
    it('should reject --token without value', () => {
      expect(() => parseArgs(['node', 'server.js', '--token'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('--token requires a value');
    });
  });
  
  describe('Unknown arguments', () => {
    it('should reject unknown arguments', () => {
      expect(() => parseArgs(['node', 'server.js', '--unknown'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Unknown argument: --unknown');
      expect(mockLogger.info).toHaveBeenCalledWith('Usage: cui-server [--port <number>] [--host <string>] [--token <string>] [--skip-auth-token]');
    });
    
    it('should reject typo in arguments', () => {
      expect(() => parseArgs(['node', 'server.js', '--skip-auth'])).toThrow('Process exited with code 1');
      expect(mockLogger.error).toHaveBeenCalledWith('Unknown argument: --skip-auth');
    });
  });
});