import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { CUIServer } from '@/cui-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('FileSystem Routes Integration - Upload', () => {
  let server: CUIServer;
  let app: Express;
  let testCwd: string;
  let sessionId: string;

  beforeAll(async () => {
    // Create server instance for testing
    server = new CUIServer({ port: 0 }); // Use port 0 for random available port
    app = (server as any).app; // Access the Express app for testing

    // Start the server for integration tests
    await server.start();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  beforeEach(async () => {
    // Create a temporary test directory
    testCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-upload-integration-'));

    // Initialize git repository
    await execAsync('git init', { cwd: testCwd });
    await execAsync('git config user.email "test@example.com"', { cwd: testCwd });
    await execAsync('git config user.name "Test User"', { cwd: testCwd });

    // Create a test file and commit
    await fs.writeFile(path.join(testCwd, 'README.md'), '# Test Project');
    await execAsync('git add .', { cwd: testCwd });
    await execAsync('git commit -m "Initial commit"', { cwd: testCwd });

    // Start a test conversation to get a valid sessionId
    const startResponse = await request(app)
      .post('/api/conversations')
      .send({
        workingDirectory: testCwd,
        initialPrompt: 'test prompt'
      })
      .expect(200);

    sessionId = startResponse.body.sessionId;

    // Wait a bit for conversation to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    // Stop the conversation if it exists
    if (sessionId) {
      try {
        await request(app)
          .delete(`/api/conversations/${sessionId}`)
          .expect(200);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Clean up test directory
    if (testCwd) {
      await fs.rm(testCwd, { recursive: true, force: true });
    }
  });

  describe('POST /api/filesystem/upload', () => {
    it('should upload a single file successfully', async () => {
      const fileContent = 'Hello, this is a test file!';
      const filename = 'test.txt';

      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from(fileContent), filename)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].originalName).toBe(filename);
      expect(response.body.files[0].size).toBe(fileContent.length);
      expect(response.body.files[0].uploadedPath).toContain('uploads');

      // Verify file was actually created
      const uploadedContent = await fs.readFile(response.body.files[0].uploadedPath, 'utf-8');
      expect(uploadedContent).toBe(fileContent);
    });

    it('should upload multiple files successfully', async () => {
      const files = [
        { name: 'file1.txt', content: 'Content 1' },
        { name: 'file2.txt', content: 'Content 2' },
        { name: 'file3.txt', content: 'Content 3' }
      ];

      const req = request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`);

      for (const file of files) {
        req.attach('files', Buffer.from(file.content), file.name);
      }

      const response = await req.expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.files).toHaveLength(3);

      // Verify all files were created
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = response.body.files[i];
        expect(uploadedFile.originalName).toBe(files[i].name);

        const uploadedContent = await fs.readFile(uploadedFile.uploadedPath, 'utf-8');
        expect(uploadedContent).toBe(files[i].content);
      }
    });

    it('should create uploads directory if it does not exist', async () => {
      const uploadsDir = path.join(testCwd, 'uploads');

      // Verify uploads directory doesn't exist yet
      await expect(fs.access(uploadsDir)).rejects.toThrow();

      // Upload a file
      await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from('test'), 'test.txt')
        .expect(200);

      // Verify uploads directory was created
      const stats = await fs.stat(uploadsDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle duplicate filenames by appending timestamp', async () => {
      const fileContent = 'test content';
      const filename = 'duplicate.txt';

      // First upload
      const response1 = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from(fileContent), filename)
        .expect(200);

      const firstPath = response1.body.files[0].uploadedPath;

      // Second upload with same filename
      const response2 = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from(fileContent), filename)
        .expect(200);

      const secondPath = response2.body.files[0].uploadedPath;

      // Paths should be different
      expect(firstPath).not.toBe(secondPath);
      expect(secondPath).toMatch(/duplicate\.\d+\.txt$/);

      // Both files should exist
      await expect(fs.access(firstPath)).resolves.toBeUndefined();
      await expect(fs.access(secondPath)).resolves.toBeUndefined();
    });

    it('should reject upload without sessionId', async () => {
      const response = await request(app)
        .post('/api/filesystem/upload')
        .attach('files', Buffer.from('test'), 'test.txt')
        .expect(400);

      expect(response.body.error).toContain('sessionId');
    });

    it('should reject upload without files', async () => {
      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .expect(400);

      expect(response.body.error).toContain('No files');
    });

    it('should reject upload with invalid sessionId', async () => {
      const response = await request(app)
        .post('/api/filesystem/upload?sessionId=invalid-session-id')
        .attach('files', Buffer.from('test'), 'test.txt')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should reject files exceeding size limit', async () => {
      // Create a file larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');

      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', largeBuffer, 'large.txt')
        .expect(413);

      expect(response.body.error).toContain('large');
    });

    it('should reject hidden files', async () => {
      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from('test'), '.hidden')
        .expect(200);

      // Upload succeeds but file should fail with error
      expect(response.body.success).toBe(false);
      expect(response.body.files).toHaveLength(0);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].error).toContain('Hidden files');
    });

    it('should handle mixed success and failure uploads', async () => {
      const req = request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', Buffer.from('valid content'), 'valid.txt')
        .attach('files', Buffer.from('hidden content'), '.hidden');

      const response = await req.expect(200);

      expect(response.body.success).toBe(true); // At least one succeeded
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].originalName).toBe('valid.txt');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].filename).toBe('.hidden');
    });

    it('should upload binary files correctly', async () => {
      // Create a simple PNG-like binary data
      const binaryData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a // PNG header
      ]);

      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`)
        .attach('files', binaryData, 'image.png')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.files[0].size).toBe(binaryData.length);

      // Verify binary data was preserved
      const uploadedData = await fs.readFile(response.body.files[0].uploadedPath);
      expect(uploadedData).toEqual(binaryData);
    });

    it('should restrict uploads to conversation cwd', async () => {
      // Try to upload with a custom path outside cwd
      const response = await request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}&destinationPath=/etc`)
        .attach('files', Buffer.from('test'), 'test.txt')
        .expect(403);

      expect(response.body.error).toContain('restricted');
    });

    it('should handle various file extensions', async () => {
      const files = [
        'document.pdf',
        'image.jpg',
        'script.js',
        'data.json',
        'archive.zip',
        'video.mp4'
      ];

      const req = request(app)
        .post(`/api/filesystem/upload?sessionId=${sessionId}`);

      for (const filename of files) {
        req.attach('files', Buffer.from('content'), filename);
      }

      const response = await req.expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.files).toHaveLength(files.length);

      // Verify all files have correct names
      const uploadedNames = response.body.files.map((f: any) => f.originalName);
      expect(uploadedNames).toEqual(files);
    });
  });
});
