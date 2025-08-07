import { Router } from 'express';
import multer from 'multer';
import { GeminiService } from '@/services/gemini-service.js';
import { CUIError } from '@/types/index.js';
import { createLogger } from '@/services/logger.js';
import type { RequestWithRequestId } from '@/types/express.js';
import type { GeminiTranscribeRequest, GeminiSummarizeRequest } from '@/types/index.js';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

export function createGeminiRoutes(geminiService: GeminiService): Router {
  const router = Router();
  const logger = createLogger('GeminiRoutes');

  // Health check endpoint
  router.get('/health', async (req: RequestWithRequestId, res, next) => {
    try {
      logger.debug('Health check requested', { requestId: req.requestId });
      const result = await geminiService.checkHealth();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Transcribe endpoint - accepts both file upload and base64
  router.post('/transcribe', upload.single('audio'), async (req: RequestWithRequestId, res, next) => {
    try {
      logger.debug('Transcribe requested', { requestId: req.requestId });

      let audio: string;
      let mimeType: string;

      if (req.file) {
        // Handle file upload
        audio = req.file.buffer.toString('base64');
        mimeType = req.file.mimetype;
        logger.debug('Processing uploaded audio file', { 
          mimeType, 
          size: req.file.size,
          requestId: req.requestId 
        });
      } else if (req.body.audio && req.body.mimeType) {
        // Handle base64 input
        const transcribeRequest = req.body as GeminiTranscribeRequest;
        audio = transcribeRequest.audio;
        mimeType = transcribeRequest.mimeType;
        logger.debug('Processing base64 audio', { 
          mimeType,
          audioLength: audio.length,
          requestId: req.requestId 
        });
      } else {
        throw new CUIError('INVALID_REQUEST', 'No audio provided', 400);
      }

      const result = await geminiService.transcribe(audio, mimeType);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Summarize endpoint
  router.post('/summarize', async (req: RequestWithRequestId, res, next) => {
    try {
      logger.debug('Summarize requested', { requestId: req.requestId });

      const summarizeRequest = req.body as GeminiSummarizeRequest;
      
      if (!summarizeRequest.text) {
        throw new CUIError('INVALID_REQUEST', 'No text provided', 400);
      }

      logger.debug('Summarizing text', { 
        textLength: summarizeRequest.text.length,
        requestId: req.requestId 
      });

      const result = await geminiService.summarize(summarizeRequest.text);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}