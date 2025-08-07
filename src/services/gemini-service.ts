import { GoogleGenAI, Type } from '@google/genai';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { CUIError } from '@/types/index.js';
import { createLogger, type Logger } from '@/services/logger.js';
import { ConfigService } from './config-service.js';

// Set up proxy support using environment variables (production only)
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxyUrl && process.env.NODE_ENV !== 'test') {
  const dispatcher = new ProxyAgent({ uri: new URL(proxyUrl).toString() });
  setGlobalDispatcher(dispatcher);
}

export interface GeminiHealthResponse {
  status: 'healthy' | 'unhealthy';
  message: string;
  apiKeyValid: boolean;
}

export interface GeminiTranscribeRequest {
  audio: string; // base64 encoded audio
  mimeType: string; // audio mime type
}

export interface GeminiTranscribeResponse {
  text: string;
}

export interface GeminiSummarizeRequest {
  text: string;
}

export interface GeminiSummarizeResponse {
  title: string;
  keypoints: string[];
}

export class GeminiService {
  private logger: Logger;
  private genAI: GoogleGenAI | null = null;
  private model: string;

  constructor() {
    this.logger = createLogger('GeminiService');
    this.model = 'gemini-2.5-flash';
  }

  async initialize(): Promise<void> {
    const config = ConfigService.getInstance().getConfig();
    const apiKey = config.gemini?.apiKey || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      this.logger.warn('Gemini API key not configured');
      return;
    }

    try {
      this.genAI = new GoogleGenAI({
        apiKey: apiKey
      });

      if (config.gemini?.model) {
        this.model = config.gemini.model;
      }

      this.logger.info('Gemini service initialized', { model: this.model });
    } catch (error) {
      this.logger.error('Failed to initialize Gemini service', { error });
      throw new CUIError('GEMINI_INIT_ERROR', 'Failed to initialize Gemini service', 500);
    }
  }

  async checkHealth(): Promise<GeminiHealthResponse> {
    if (!this.genAI) {
      return {
        status: 'unhealthy',
        message: 'Gemini API key not configured',
        apiKeyValid: false
      };
    }

    try {
      // Test the API with a simple request
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{
            text: 'Say hello and nothing else'
          }]
        }]
      });

      if (response.text) {
        return {
          status: 'healthy',
          message: 'Gemini API is accessible',
          apiKeyValid: true
        };
      }

      return {
        status: 'unhealthy',
        message: 'Unexpected response from Gemini API',
        apiKeyValid: true
      };
    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        apiKeyValid: false
      };
    }
  }

  async transcribe(audio: string, mimeType: string): Promise<GeminiTranscribeResponse> {
    if (!this.genAI) {
      throw new CUIError('GEMINI_API_KEY_MISSING', 'Gemini API key not configured', 400);
    }

    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: audio
              }
            },
            {
              text: 'Transcribe the above audio instructions, which are likely related to software development and may include a mix of different languages and technical terms (e.g., code references, file paths, API names). Transcribe verbatim with correct punctuation, do not add explanations or non-verbal cues. Return the raw transcribed text only:'
            }
          ]
        }]
      });

      const text = response.text;
      if (!text) {
        throw new CUIError('GEMINI_TRANSCRIBE_ERROR', 'No transcription returned', 500);
      }

      this.logger.debug('Audio transcribed successfully', { textLength: text.length });
      return { text: text.trim() };
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }
      this.logger.error('Transcription failed', { error });
      throw new CUIError('GEMINI_TRANSCRIBE_ERROR', 'Failed to transcribe audio', 500);
    }
  }

  async summarize(text: string): Promise<GeminiSummarizeResponse> {
    if (!this.genAI) {
      throw new CUIError('GEMINI_API_KEY_MISSING', 'Gemini API key not configured', 400);
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'A concise title summarizing the conversation'
        },
        keypoints: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          },
          description: 'List of key points from the text'
        }
      },
      required: ['title', 'keypoints']
    };

    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{
            text: `Please summarize the following text into a title and key points:\n\n${text}`
          }]
        }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new CUIError('GEMINI_SUMMARIZE_ERROR', 'No response text returned', 500);
      }
      
      const result = JSON.parse(responseText);
      
      if (!result.title || !Array.isArray(result.keypoints)) {
        throw new CUIError('GEMINI_SUMMARIZE_ERROR', 'Invalid response format', 500);
      }

      this.logger.debug('Text summarized successfully', { 
        titleLength: result.title.length,
        keypointCount: result.keypoints.length 
      });

      return result;
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }
      this.logger.error('Summarization failed', { error });
      throw new CUIError('GEMINI_SUMMARIZE_ERROR', 'Failed to summarize text', 500);
    }
  }
}

// Export singleton instance
export const geminiService = new GeminiService();