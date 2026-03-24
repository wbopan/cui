import { Router, Request } from 'express';
import * as path from 'path';
import multer from 'multer';
import {
  CUIError,
  FileSystemListQuery,
  FileSystemListResponse,
  FileSystemReadQuery,
  FileSystemReadResponse,
  FileSystemDownloadQuery,
  FileSystemUploadQuery,
  FileUploadResponse
} from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { FileSystemService } from '@/services/file-system-service.js';
import { ClaudeHistoryReader } from '@/services/claude-history-reader.js';
import { createLogger } from '@/services/logger.js';

export function createFileSystemRoutes(
  fileSystemService: FileSystemService,
  historyReader: ClaudeHistoryReader
): Router {
  const router = Router();
  const logger = createLogger('FileSystemRoutes');

  // Configure multer for file uploads (store in memory)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
      files: 10 // Max 10 files per request
    }
  });

  // Helper to strictly parse boolean query params (accepts "true"/"false" and booleans)
  const parseBooleanParam = (value: unknown, paramName: string): boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    throw new CUIError('INVALID_PARAM', `${paramName} must be boolean (true/false)`, 400);
  };


  // List directory contents
  router.get('/list', async (req: Request<Record<string, never>, FileSystemListResponse, Record<string, never>, FileSystemListQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('List directory request', {
      requestId,
      path: req.query.path,
      recursive: req.query.recursive,
      respectGitignore: req.query.respectGitignore
    });
    
    try {
      // Validate required parameters
      if (!req.query.path) {
        throw new CUIError('MISSING_PATH', 'path query parameter is required', 400);
      }
      
      // Parse boolean query parameters
      const recursive = parseBooleanParam(req.query.recursive, 'recursive') ?? false;
      const respectGitignore = parseBooleanParam(req.query.respectGitignore, 'respectGitignore') ?? false;
      
      const result = await fileSystemService.listDirectory(
        req.query.path,
        recursive,
        respectGitignore
      );
      
      logger.debug('Directory listed successfully', {
        requestId,
        path: result.path,
        entryCount: result.entries.length
      });
      
      res.json(result);
    } catch (error) {
      logger.debug('List directory failed', {
        requestId,
        path: req.query.path,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Read file contents
  router.get('/read', async (req: Request<Record<string, never>, FileSystemReadResponse, Record<string, never>, FileSystemReadQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('Read file request', {
      requestId,
      path: req.query.path
    });

    try {
      // Validate required parameters
      if (!req.query.path) {
        throw new CUIError('MISSING_PATH', 'path query parameter is required', 400);
      }

      const result = await fileSystemService.readFile(req.query.path);

      logger.debug('File read successfully', {
        requestId,
        path: result.path,
        size: result.size
      });

      res.json(result);
    } catch (error) {
      logger.debug('Read file failed', {
        requestId,
        path: req.query.path,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Download file (supports binary files, restricted to conversation cwd)
  router.get('/download', async (req: Request<Record<string, never>, never, Record<string, never>, FileSystemDownloadQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('Download file request', {
      requestId,
      path: req.query.path,
      sessionId: req.query.sessionId
    });

    try {
      // Validate required parameters
      if (!req.query.path) {
        throw new CUIError('MISSING_PATH', 'path query parameter is required', 400);
      }
      if (!req.query.sessionId) {
        throw new CUIError('MISSING_SESSION_ID', 'sessionId query parameter is required', 400);
      }

      // Get conversation metadata to find the cwd
      const metadata = await historyReader.getConversationMetadata(req.query.sessionId);
      if (!metadata) {
        throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
      }

      // Get the cwd from the first message of the conversation
      const messages = await historyReader.fetchConversation(req.query.sessionId);
      if (messages.length === 0) {
        throw new CUIError('NO_MESSAGES', 'No messages found in conversation', 404);
      }

      const conversationCwd = messages[0].cwd || metadata.projectPath;
      if (!conversationCwd) {
        throw new CUIError('NO_CWD', 'Could not determine conversation working directory', 400);
      }

      // Normalize paths for comparison
      const normalizedCwd = path.normalize(conversationCwd);
      const normalizedPath = path.normalize(req.query.path);

      // Security check: Ensure requested path is within conversation's cwd
      if (!normalizedPath.startsWith(normalizedCwd)) {
        logger.warn('Download attempt outside conversation cwd', {
          requestId,
          sessionId: req.query.sessionId,
          requestedPath: normalizedPath,
          conversationCwd: normalizedCwd
        });
        throw new CUIError(
          'PATH_OUTSIDE_CWD',
          'Download is restricted to files within the conversation working directory',
          403
        );
      }

      // Download the file
      const fileData = await fileSystemService.downloadFile(req.query.path);

      // Set response headers for download
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.filename)}"`);
      res.setHeader('Content-Length', fileData.size);
      res.setHeader('Last-Modified', new Date(fileData.lastModified).toUTCString());

      logger.debug('File download successful', {
        requestId,
        path: req.query.path,
        filename: fileData.filename,
        size: fileData.size,
        mimeType: fileData.mimeType,
        sessionId: req.query.sessionId,
        cwd: normalizedCwd
      });

      // Send the file buffer
      res.send(fileData.buffer);
    } catch (error) {
      logger.debug('Download file failed', {
        requestId,
        path: req.query.path,
        sessionId: req.query.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // List uploaded files in the conversation's uploads directory
  router.get('/uploads', async (req: Request<Record<string, never>, never, Record<string, never>, { sessionId: string }> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('List uploads request', {
      requestId,
      sessionId: req.query.sessionId
    });

    try {
      // Validate required parameters
      if (!req.query.sessionId) {
        throw new CUIError('MISSING_SESSION_ID', 'sessionId query parameter is required', 400);
      }

      // Get conversation metadata to find the cwd
      const metadata = await historyReader.getConversationMetadata(req.query.sessionId);
      if (!metadata) {
        throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
      }

      // Get the cwd from the first message of the conversation
      const messages = await historyReader.fetchConversation(req.query.sessionId);
      if (messages.length === 0) {
        throw new CUIError('NO_MESSAGES', 'No messages found in conversation', 404);
      }

      const conversationCwd = messages[0].cwd || metadata.projectPath;
      if (!conversationCwd) {
        throw new CUIError('NO_CWD', 'Could not determine conversation working directory', 400);
      }

      // Get the uploads directory path
      const uploadsPath = path.join(conversationCwd, 'uploads');

      // Check if uploads directory exists
      try {
        await fileSystemService.listDirectory(uploadsPath, false, false);
      } catch (error) {
        // If directory doesn't exist, return empty list
        if (error instanceof CUIError && error.code === 'PATH_NOT_FOUND') {
          logger.debug('Uploads directory does not exist', {
            requestId,
            sessionId: req.query.sessionId,
            uploadsPath
          });
          res.json({ files: [] });
          return;
        }
        throw error;
      }

      // List files in uploads directory
      const result = await fileSystemService.listDirectory(uploadsPath, false, false);

      // Filter to only include files (not directories)
      const files = result.entries
        .filter(entry => entry.type === 'file')
        .map(entry => ({
          name: entry.name,
          path: path.join(uploadsPath, entry.name),
          size: entry.size,
          lastModified: entry.lastModified
        }));

      logger.debug('Uploads listed successfully', {
        requestId,
        sessionId: req.query.sessionId,
        fileCount: files.length
      });

      res.json({ files });
    } catch (error) {
      logger.debug('List uploads failed', {
        requestId,
        sessionId: req.query.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Upload files (restricted to conversation cwd/uploads directory)
  router.post('/upload', upload.array('files'), async (req: Request<Record<string, never>, FileUploadResponse, Record<string, never>, FileSystemUploadQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('Upload file request', {
      requestId,
      sessionId: req.query.sessionId,
      fileCount: req.files ? (req.files as Express.Multer.File[]).length : 0
    });

    try {
      // Validate required parameters
      if (!req.query.sessionId) {
        throw new CUIError('MISSING_SESSION_ID', 'sessionId query parameter is required', 400);
      }

      // Check if files were uploaded
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new CUIError('NO_FILES', 'No files were uploaded', 400);
      }

      // Get conversation metadata to find the cwd
      const metadata = await historyReader.getConversationMetadata(req.query.sessionId);
      if (!metadata) {
        throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
      }

      // Get the cwd from the first message of the conversation
      const messages = await historyReader.fetchConversation(req.query.sessionId);
      if (messages.length === 0) {
        throw new CUIError('NO_MESSAGES', 'No messages found in conversation', 404);
      }

      const conversationCwd = messages[0].cwd || metadata.projectPath;
      if (!conversationCwd) {
        throw new CUIError('NO_CWD', 'Could not determine conversation working directory', 400);
      }

      // Ensure uploads directory exists
      const uploadsDir = await fileSystemService.ensureUploadsDirectory(conversationCwd);

      // Use custom destination path if provided, but ensure it's within cwd
      let destinationPath = uploadsDir;
      if (req.query.destinationPath) {
        // If custom path is provided, it should be relative to cwd
        const customPath = path.isAbsolute(req.query.destinationPath)
          ? req.query.destinationPath
          : path.join(conversationCwd, req.query.destinationPath);

        const normalizedCwd = path.normalize(conversationCwd);
        const normalizedCustomPath = path.normalize(customPath);

        // Security check: Ensure custom path is within conversation's cwd
        if (!normalizedCustomPath.startsWith(normalizedCwd)) {
          logger.warn('Upload attempt outside conversation cwd', {
            requestId,
            sessionId: req.query.sessionId,
            requestedPath: normalizedCustomPath,
            conversationCwd: normalizedCwd
          });
          throw new CUIError(
            'PATH_OUTSIDE_CWD',
            'Upload is restricted to paths within the conversation working directory',
            403
          );
        }

        destinationPath = normalizedCustomPath;
      }

      // Upload all files
      const uploadedFiles: FileUploadResponse['files'] = [];
      const errors: FileUploadResponse['errors'] = [];

      for (const file of req.files as Express.Multer.File[]) {
        try {
          const result = await fileSystemService.uploadFile(
            destinationPath,
            file.buffer,
            file.originalname
          );

          uploadedFiles.push({
            originalName: file.originalname,
            uploadedPath: result.path,
            size: result.size
          });

          logger.debug('File uploaded successfully', {
            requestId,
            originalName: file.originalname,
            uploadedPath: result.path,
            size: result.size,
            sessionId: req.query.sessionId
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('File upload failed', error, {
            requestId,
            filename: file.originalname,
            sessionId: req.query.sessionId
          });

          errors.push({
            filename: file.originalname,
            error: errorMessage
          });
        }
      }

      // Prepare response
      const response: FileUploadResponse = {
        success: uploadedFiles.length > 0,
        files: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined
      };

      logger.debug('Upload request completed', {
        requestId,
        sessionId: req.query.sessionId,
        successCount: uploadedFiles.length,
        errorCount: errors.length
      });

      res.status(uploadedFiles.length > 0 ? 200 : 400).json(response);
    } catch (error) {
      logger.debug('Upload request failed', {
        requestId,
        sessionId: req.query.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  return router;
}