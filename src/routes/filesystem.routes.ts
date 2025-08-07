import { Router, Request } from 'express';
import { 
  CUIError,
  FileSystemListQuery,
  FileSystemListResponse,
  FileSystemReadQuery,
  FileSystemReadResponse 
} from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { FileSystemService } from '@/services/file-system-service.js';
import { createLogger } from '@/services/logger.js';

export function createFileSystemRoutes(
  fileSystemService: FileSystemService
): Router {
  const router = Router();
  const logger = createLogger('FileSystemRoutes');

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

  return router;
}