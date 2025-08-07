import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { setupLoggerMock, createMockLogger } from '../../utils/mock-logger';

// Use the complete logger mock
setupLoggerMock();
const mockLogger = createMockLogger();

import { GeminiService } from '@/services/gemini-service';

describe('GeminiService', () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    geminiService = new GeminiService();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      expect(geminiService).toBeInstanceOf(GeminiService);
    });
  });

  describe('checkHealth - uninitialized', () => {
    it('should return unhealthy when not initialized', async () => {
      const result = await geminiService.checkHealth();
      
      expect(result).toEqual({
        status: 'unhealthy',
        message: 'Gemini API key not configured',
        apiKeyValid: false
      });
    });
  });

  describe('transcribe - uninitialized', () => {
    it('should throw error when not initialized', async () => {
      await expect(geminiService.transcribe('audio', 'audio/wav'))
        .rejects
        .toMatchObject({
          code: 'GEMINI_API_KEY_MISSING',
          message: 'Gemini API key not configured'
        });
    });
  });

  describe('summarize - uninitialized', () => {
    it('should throw error when not initialized', async () => {
      await expect(geminiService.summarize('test text'))
        .rejects
        .toMatchObject({
          code: 'GEMINI_API_KEY_MISSING', 
          message: 'Gemini API key not configured'
        });
    });
  });
});

/*
 * NOTE: Full integration tests are covered in the routes tests (gemini.routes.test.ts)
 * 
 * This service uses ConfigService singleton and GoogleGenAI which are difficult to mock
 * properly in unit tests without complex hoisting patterns. The routes tests provide
 * comprehensive coverage by testing the service through its actual API endpoints,
 * which gives us confidence in the real-world behavior.
 * 
 * The routes tests cover:
 * - Service initialization with API keys
 * - Health check functionality  
 * - Audio transcription with various inputs
 * - Text summarization with error handling
 * - All error scenarios and edge cases
 * 
 * This focused unit test covers the basic uninitialized behavior which is easily testable.
 */