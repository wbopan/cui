import { describe, it, expect, beforeEach, mock } from 'bun:test';
import request from 'supertest';

mock.module('@/services/logger', () => ({
  createLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    error: mock(),
    warn: mock()
  }))
}));
import express from 'express';
import { createFileSystemRoutes } from '@/routes/filesystem.routes';
import { FileSystemService } from '@/services/file-system-service';
import { CUIError } from '@/types';

describe('FileSystem Routes', () => {
  let app: express.Application;
  let fileSystemService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock FileSystemService
    fileSystemService = {
      listDirectory: mock(),
      readFile: mock(),
    } as any;

    // Add request ID middleware
    app.use((req: any, res, next) => {
      req.requestId = 'test-request-id';
      next();
    });

    app.use('/api/filesystem', createFileSystemRoutes(fileSystemService));
    
    // Error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      const message = err instanceof Error ? err.message : String(err);
      res.status(err.statusCode || 500).json({ error: message });
    });
  });

  describe('GET /api/filesystem/list', () => {
    it('should list directory contents successfully', async () => {
      const mockResult = {
        path: '/test/path',
        entries: [
          { name: 'file1.txt', type: 'file' as const, size: 100, lastModified: '2024-01-01T00:00:00Z' },
          { name: 'folder1', type: 'directory' as const, lastModified: '2024-01-01T00:00:00Z' }
        ],
        total: 2
      };

      fileSystemService.listDirectory.mockImplementation(() => Promise.resolve(mockResult));

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(fileSystemService.listDirectory).toHaveBeenCalledWith('/test/path', false, false);
    });

    it('should list directory with recursive option', async () => {
      const mockResult = {
        path: '/test/path',
        entries: [
          { name: 'file1.txt', type: 'file' as const, size: 100, lastModified: '2024-01-01T00:00:00Z' },
          { name: 'folder1/file2.txt', type: 'file' as const, size: 200, lastModified: '2024-01-01T00:00:00Z' }
        ],
        total: 2
      };

      fileSystemService.listDirectory.mockImplementation(() => Promise.resolve(mockResult));

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path', recursive: 'true' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(fileSystemService.listDirectory).toHaveBeenCalledWith('/test/path', 'true', false);
    });

    it('should list directory with respectGitignore option', async () => {
      const mockResult = {
        path: '/test/path',
        entries: [
          { name: 'file1.txt', type: 'file' as const, size: 100, lastModified: '2024-01-01T00:00:00Z' }
        ],
        total: 1
      };

      fileSystemService.listDirectory.mockImplementation(() => Promise.resolve(mockResult));

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path', respectGitignore: 'true' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(fileSystemService.listDirectory).toHaveBeenCalledWith('/test/path', false, 'true');
    });

    it('should list directory with both recursive and respectGitignore options', async () => {
      const mockResult = {
        path: '/test/path',
        entries: [],
        total: 0
      };

      fileSystemService.listDirectory.mockImplementation(() => Promise.resolve(mockResult));

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path', recursive: 'true', respectGitignore: 'true' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(fileSystemService.listDirectory).toHaveBeenCalledWith('/test/path', 'true', 'true');
    });

    it('should return 400 when path parameter is missing', async () => {
      const response = await request(app)
        .get('/api/filesystem/list');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('path query parameter is required');
      expect(fileSystemService.listDirectory).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      fileSystemService.listDirectory.mockImplementation(() => 
        Promise.reject(new CUIError('PERMISSION_DENIED', 'Permission denied', 403))
      );

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/restricted/path' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Permission denied');
    });

    it('should handle generic errors', async () => {
      fileSystemService.listDirectory.mockImplementation(() => 
        Promise.reject(new Error('Unexpected error'))
      );

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Unexpected error');
    });

    it('should handle non-Error objects thrown as errors', async () => {
      fileSystemService.listDirectory.mockImplementation(() => Promise.reject('String error'));

      const response = await request(app)
        .get('/api/filesystem/list')
        .query({ path: '/test/path' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('String error');
    });
  });

  describe('GET /api/filesystem/read', () => {
    it('should read file contents successfully', async () => {
      const mockResult = {
        path: '/test/file.txt',
        content: 'Hello, World!',
        size: 13,
        lastModified: '2024-01-01T00:00:00Z',
        encoding: 'utf-8'
      };

      fileSystemService.readFile.mockImplementation(() => Promise.resolve(mockResult));

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/test/file.txt' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should return 400 when path parameter is missing', async () => {
      const response = await request(app)
        .get('/api/filesystem/read');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('path query parameter is required');
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('should handle file not found error', async () => {
      fileSystemService.readFile.mockImplementation(() => 
        Promise.reject(new CUIError('FILE_NOT_FOUND', 'File not found', 404))
      );

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/nonexistent/file.txt' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('File not found');
    });

    it('should handle permission denied error', async () => {
      fileSystemService.readFile.mockImplementation(() => 
        Promise.reject(new CUIError('PERMISSION_DENIED', 'Permission denied', 403))
      );

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/restricted/file.txt' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Permission denied');
    });

    it('should handle file too large error', async () => {
      fileSystemService.readFile.mockImplementation(() => 
        Promise.reject(new CUIError('FILE_TOO_LARGE', 'File is too large', 413))
      );

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/huge/file.bin' });

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('File is too large');
    });

    it('should handle generic errors', async () => {
      fileSystemService.readFile.mockImplementation(() => 
        Promise.reject(new Error('Disk read error'))
      );

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/test/file.txt' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Disk read error');
    });

    it('should handle non-Error objects thrown as errors', async () => {
      fileSystemService.readFile.mockImplementation(() => Promise.reject('String error'));

      const response = await request(app)
        .get('/api/filesystem/read')
        .query({ path: '/test/file.txt' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('String error');
    });
  });
});