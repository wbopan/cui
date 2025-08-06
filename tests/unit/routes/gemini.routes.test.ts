import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import request from 'supertest';

// Mock the logger
mock.module('@/services/logger', () => ({
  createLogger: mock(() => ({
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  })),
}));
import express from 'express';
import { createGeminiRoutes } from '@/routes/gemini.routes';
import { GeminiService } from '@/services/gemini-service';
import { CUIError } from '@/types';
import type { RequestWithRequestId } from '@/types/express';

describe('Gemini Routes', () => {
  let app: express.Application;
  let mockGeminiService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Add requestId middleware for consistent testing
    app.use((req: RequestWithRequestId, res, next) => {
      req.requestId = 'test-request-123';
      next();
    });

    mockGeminiService = {
      checkHealth: mock(),
      transcribe: mock(),
      summarize: mock(),
      initialize: mock(),
    } as any;

    app.use('/api/gemini', createGeminiRoutes(mockGeminiService));
    
    // Error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      if (err instanceof CUIError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    });
  });

  afterEach(() => {
    // No cleanup needed
  });

  describe('GET /api/gemini/health', () => {
    it('should return health status successfully', async () => {
      const mockHealthResponse = {
        status: 'healthy' as const,
        message: 'Gemini API is accessible',
        apiKeyValid: true
      };

      mockGeminiService.checkHealth.mockImplementation(() => Promise.resolve(mockHealthResponse));

      const response = await request(app)
        .get('/api/gemini/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHealthResponse);
      expect(mockGeminiService.checkHealth).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy status when API key is missing', async () => {
      const mockHealthResponse = {
        status: 'unhealthy' as const,
        message: 'Gemini API key not configured',
        apiKeyValid: false
      };

      mockGeminiService.checkHealth.mockImplementation(() => Promise.resolve(mockHealthResponse));

      const response = await request(app)
        .get('/api/gemini/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHealthResponse);
    });

    it('should handle service errors', async () => {
      mockGeminiService.checkHealth.mockImplementation(() => Promise.reject(new Error('Service error')));

      const response = await request(app)
        .get('/api/gemini/health');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('POST /api/gemini/transcribe', () => {
    it('should transcribe uploaded audio file successfully', async () => {
      const mockTranscribeResponse = {
        text: 'Hello world, this is a test transcription.'
      };

      mockGeminiService.transcribe.mockImplementation(() => Promise.resolve(mockTranscribeResponse));

      const response = await request(app)
        .post('/api/gemini/transcribe')
        .attach('audio', Buffer.from('fake-audio-data'), {
          filename: 'test.wav',
          contentType: 'audio/wav'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTranscribeResponse);
      expect(mockGeminiService.transcribe).toHaveBeenCalledWith(
        Buffer.from('fake-audio-data').toString('base64'),
        'audio/wav'
      );
    });

    it('should transcribe base64 audio successfully', async () => {
      const mockTranscribeResponse = {
        text: 'Hello world from base64 audio.'
      };

      mockGeminiService.transcribe.mockImplementation(() => Promise.resolve(mockTranscribeResponse));

      const response = await request(app)
        .post('/api/gemini/transcribe')
        .send({
          audio: 'base64encodedaudio',
          mimeType: 'audio/mp3'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTranscribeResponse);
      expect(mockGeminiService.transcribe).toHaveBeenCalledWith(
        'base64encodedaudio',
        'audio/mp3'
      );
    });

    it('should reject non-audio files', async () => {
      const response = await request(app)
        .post('/api/gemini/transcribe')
        .attach('audio', Buffer.from('fake-text-data'), {
          filename: 'test.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Only audio files are allowed');
    });

    it('should reject requests with no audio provided', async () => {
      const response = await request(app)
        .post('/api/gemini/transcribe')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No audio provided');
    });

    it('should reject requests with missing mimeType for base64', async () => {
      const response = await request(app)
        .post('/api/gemini/transcribe')
        .send({
          audio: 'base64encodedaudio'
          // Missing mimeType
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No audio provided');
    });

    it('should handle transcription service errors', async () => {
      mockGeminiService.transcribe.mockImplementation(() => 
        Promise.reject(new CUIError('GEMINI_TRANSCRIBE_ERROR', 'Failed to transcribe audio', 500))
      );

      const response = await request(app)
        .post('/api/gemini/transcribe')
        .send({
          audio: 'base64encodedaudio',
          mimeType: 'audio/wav'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to transcribe audio');
    });

    it('should handle API key missing error', async () => {
      mockGeminiService.transcribe.mockImplementation(() => 
        Promise.reject(new CUIError('GEMINI_API_KEY_MISSING', 'Gemini API key not configured', 400))
      );

      const response = await request(app)
        .post('/api/gemini/transcribe')
        .send({
          audio: 'base64encodedaudio',
          mimeType: 'audio/wav'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Gemini API key not configured');
    });

    it('should handle file size limits', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');

      const response = await request(app)
        .post('/api/gemini/transcribe')
        .attach('audio', largeBuffer, {
          filename: 'large.wav',
          contentType: 'audio/wav'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('File too large');
    });
  });

  describe('POST /api/gemini/summarize', () => {
    it('should summarize text successfully', async () => {
      const mockSummarizeResponse = {
        title: 'Test Conversation Summary',
        keypoints: [
          'Discussed API implementation',
          'Reviewed error handling',
          'Planned next steps'
        ]
      };

      mockGeminiService.summarize.mockImplementation(() => Promise.resolve(mockSummarizeResponse));

      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'This is a long conversation about API implementation and error handling strategies.'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSummarizeResponse);
      expect(mockGeminiService.summarize).toHaveBeenCalledWith(
        'This is a long conversation about API implementation and error handling strategies.'
      );
    });

    it('should reject requests with no text provided', async () => {
      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No text provided');
    });

    it('should reject requests with empty text', async () => {
      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No text provided');
    });

    it('should handle summarization service errors', async () => {
      mockGeminiService.summarize.mockImplementation(() => 
        Promise.reject(new CUIError('GEMINI_SUMMARIZE_ERROR', 'Failed to summarize text', 500))
      );

      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'Test text to summarize'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to summarize text');
    });

    it('should handle API key missing error', async () => {
      mockGeminiService.summarize.mockImplementation(() => 
        Promise.reject(new CUIError('GEMINI_API_KEY_MISSING', 'Gemini API key not configured', 400))
      );

      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'Test text to summarize'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Gemini API key not configured');
    });

    it('should handle invalid response format error', async () => {
      mockGeminiService.summarize.mockImplementation(() => 
        Promise.reject(new CUIError('GEMINI_SUMMARIZE_ERROR', 'Invalid response format', 500))
      );

      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'Test text to summarize'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Invalid response format');
    });

    it('should handle generic service errors', async () => {
      mockGeminiService.summarize.mockImplementation(() => Promise.reject(new Error('Generic error')));

      const response = await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'Test text to summarize'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Generic error');
    });
  });

  describe('Request logging', () => {
    it('should log requests with requestId for health endpoint', async () => {
      mockGeminiService.checkHealth.mockImplementation(() => Promise.resolve({
        status: 'healthy',
        message: 'OK',
        apiKeyValid: true
      }));

      await request(app)
        .get('/api/gemini/health');

      // The logging is mocked, so we just verify the service was called
      expect(mockGeminiService.checkHealth).toHaveBeenCalled();
    });

    it('should log requests with requestId for transcribe endpoint', async () => {
      mockGeminiService.transcribe.mockImplementation(() => Promise.resolve({ text: 'test' }));

      await request(app)
        .post('/api/gemini/transcribe')
        .send({
          audio: 'base64audio',
          mimeType: 'audio/wav'
        });

      expect(mockGeminiService.transcribe).toHaveBeenCalled();
    });

    it('should log requests with requestId for summarize endpoint', async () => {
      mockGeminiService.summarize.mockImplementation(() => Promise.resolve({
        title: 'Test',
        keypoints: ['Point 1']
      }));

      await request(app)
        .post('/api/gemini/summarize')
        .send({
          text: 'Test text'
        });

      expect(mockGeminiService.summarize).toHaveBeenCalled();
    });
  });
});