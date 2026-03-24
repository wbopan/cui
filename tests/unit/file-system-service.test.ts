import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { FileSystemService } from '@/services/file-system-service';
import { CUIError } from '@/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileSystemService', () => {
  let service: FileSystemService;

  beforeEach(() => {
    service = new FileSystemService();
  });

  describe('Path validation', () => {
    it('should reject relative paths', async () => {
      await expect(service.listDirectory('../etc')).rejects.toThrow(
        new CUIError('INVALID_PATH', 'Path must be absolute', 400)
      );
    });

    it('should reject paths with traversal attempts', async () => {
      await expect(service.listDirectory('/home/../etc')).rejects.toThrow(
        new CUIError('PATH_TRAVERSAL_DETECTED', 'Invalid path: path traversal detected', 400)
      );
    });

    it('should reject paths with null bytes', async () => {
      await expect(service.listDirectory('/home/user\u0000/file')).rejects.toThrow(
        new CUIError('INVALID_PATH', 'Path contains null bytes', 400)
      );
    });

    it('should reject paths with invalid characters', async () => {
      await expect(service.listDirectory('/home/user<file>')).rejects.toThrow(
        new CUIError('INVALID_PATH', 'Path contains invalid characters', 400)
      );
    });

    it('should reject paths with hidden directories', async () => {
      await expect(service.listDirectory('/home/.hidden')).rejects.toThrow(
        new CUIError('INVALID_PATH', 'Path contains hidden files/directories', 400)
      );
    });

    it('should accept valid absolute paths', async () => {
      // This will fail with PATH_NOT_FOUND which is expected for non-existent paths
      await expect(service.listDirectory('/this/path/does/not/exist')).rejects.toThrow(
        new CUIError('PATH_NOT_FOUND', 'Path not found: /this/path/does/not/exist', 404)
      );
    });
  });

  describe('File size validation', () => {
    it('should respect custom max file size', async () => {
      const smallSizeService = new FileSystemService(10); // 10 bytes max
      // This test would need a real file to test properly
      // For now, we just verify the service was created with custom size
      expect(smallSizeService).toBeDefined();
    });
  });

  describe('Allowed base paths', () => {
    it('should restrict access to allowed paths only', async () => {
      const restrictedService = new FileSystemService(undefined, ['/home/user']);
      
      await expect(restrictedService.listDirectory('/etc/passwd')).rejects.toThrow(
        new CUIError('PATH_NOT_ALLOWED', 'Path is outside allowed directories', 403)
      );
    });

    it('should allow access within allowed paths', async () => {
      const restrictedService = new FileSystemService(undefined, ['/home/user']);
      
      // This will fail with PATH_NOT_FOUND which is expected
      await expect(restrictedService.listDirectory('/home/user/documents')).rejects.toThrow(
        new CUIError('PATH_NOT_FOUND', 'Path not found: /home/user/documents', 404)
      );
    });
  });

  describe('Recursive directory listing', () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a temporary test directory structure
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-test-'));
      
      // Create test structure
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.mkdir(path.join(testDir, 'src', 'components'));
      await fs.writeFile(path.join(testDir, 'README.md'), 'Test readme');
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export {};');
      await fs.writeFile(path.join(testDir, 'src', 'components', 'Button.tsx'), 'export {};');
    });

    afterEach(async () => {
      // Clean up test directory
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should list directory non-recursively by default', async () => {
      const result = await service.listDirectory(testDir);
      
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.name)).toEqual(expect.arrayContaining(['src', 'README.md']));
      expect(result.entries.find(e => e.name === 'src')?.type).toBe('directory');
      expect(result.entries.find(e => e.name === 'README.md')?.type).toBe('file');
    });

    it('should list directory recursively when requested', async () => {
      const result = await service.listDirectory(testDir, true);
      
      expect(result.entries).toHaveLength(5);
      expect(result.entries.map(e => e.name)).toEqual(expect.arrayContaining([
        'README.md',
        'src',
        path.join('src', 'components'),
        path.join('src', 'index.ts'),
        path.join('src', 'components', 'Button.tsx')
      ]));
    });
  });

  describe('Gitignore support', () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a temporary test directory structure
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-test-'));
      
      // Create test structure
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.mkdir(path.join(testDir, 'node_modules'));
      await fs.mkdir(path.join(testDir, 'dist'));
      await fs.writeFile(path.join(testDir, '.gitignore'), 'node_modules\ndist\n*.log');
      await fs.writeFile(path.join(testDir, 'README.md'), 'Test readme');
      await fs.writeFile(path.join(testDir, 'app.log'), 'Log file');
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export {};');
      await fs.writeFile(path.join(testDir, 'node_modules', 'package.json'), '{}');
      await fs.writeFile(path.join(testDir, 'dist', 'index.js'), 'module.exports = {};');
    });

    afterEach(async () => {
      // Clean up test directory
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should respect gitignore patterns when requested', async () => {
      const result = await service.listDirectory(testDir, false, true);
      
      const names = result.entries.map(e => e.name);
      expect(names).toContain('src');
      expect(names).toContain('README.md');
      expect(names).not.toContain('node_modules');
      expect(names).not.toContain('dist');
      expect(names).not.toContain('app.log');
    });

    it('should include ignored files when gitignore is not respected', async () => {
      const result = await service.listDirectory(testDir, false, false);
      
      const names = result.entries.map(e => e.name);
      expect(names).toContain('src');
      expect(names).toContain('README.md');
      expect(names).toContain('node_modules');
      expect(names).toContain('dist');
      expect(names).toContain('app.log');
    });

    it('should respect gitignore with recursive listing', async () => {
      const result = await service.listDirectory(testDir, true, true);
      
      const names = result.entries.map(e => e.name);
      expect(names).toContain('src');
      expect(names).toContain('README.md');
      expect(names).toContain(path.join('src', 'index.ts'));
      expect(names).not.toContain('node_modules');
      expect(names).not.toContain('dist');
      expect(names).not.toContain('app.log');
      expect(names).not.toContain(path.join('node_modules', 'package.json'));
      expect(names).not.toContain(path.join('dist', 'index.js'));
    });
  });

  describe('Git operations', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-git-test-'));
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should detect non-git directories', async () => {
      const isGit = await service.isGitRepository(testDir);
      expect(isGit).toBe(false);
    });

    it('should return null for git HEAD in non-git directory', async () => {
      const gitHead = await service.getCurrentGitHead(testDir);
      expect(gitHead).toBe(null);
    });
  });

  describe('File upload operations', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cui-upload-test-'));
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('ensureUploadsDirectory', () => {
      it('should create uploads directory if it does not exist', async () => {
        const uploadsPath = await service.ensureUploadsDirectory(testDir);

        expect(uploadsPath).toBe(path.join(testDir, 'uploads'));

        // Verify directory was created
        const stats = await fs.stat(uploadsPath);
        expect(stats.isDirectory()).toBe(true);
      });

      it('should return existing uploads directory if it already exists', async () => {
        // Create uploads directory first
        const expectedPath = path.join(testDir, 'uploads');
        await fs.mkdir(expectedPath);

        const uploadsPath = await service.ensureUploadsDirectory(testDir);

        expect(uploadsPath).toBe(expectedPath);
      });

      it('should throw error if uploads path exists but is not a directory', async () => {
        // Create a file named 'uploads' instead of a directory
        const filePath = path.join(testDir, 'uploads');
        await fs.writeFile(filePath, 'not a directory');

        await expect(service.ensureUploadsDirectory(testDir)).rejects.toThrow(
          new CUIError('NOT_A_DIRECTORY', 'uploads path exists but is not a directory', 400)
        );
      });

      it('should reject paths with hidden directories', async () => {
        await expect(service.ensureUploadsDirectory('/home/.hidden')).rejects.toThrow(
          new CUIError('INVALID_PATH', 'Path contains hidden files/directories', 400)
        );
      });
    });

    describe('uploadFile', () => {
      let uploadsDir: string;

      beforeEach(async () => {
        uploadsDir = path.join(testDir, 'uploads');
        await fs.mkdir(uploadsDir);
      });

      it('should upload a file successfully', async () => {
        const buffer = Buffer.from('test file content');
        const filename = 'test.txt';

        const result = await service.uploadFile(uploadsDir, buffer, filename);

        expect(result.path).toBe(path.join(uploadsDir, filename));
        expect(result.size).toBe(buffer.length);

        // Verify file was written
        const content = await fs.readFile(result.path, 'utf-8');
        expect(content).toBe('test file content');
      });

      it('should handle duplicate filenames by appending timestamp', async () => {
        const buffer = Buffer.from('test content');
        const filename = 'duplicate.txt';

        // Create first file
        await fs.writeFile(path.join(uploadsDir, filename), 'existing content');

        // Upload file with same name
        const result = await service.uploadFile(uploadsDir, buffer, filename);

        // Should have timestamp in filename
        expect(result.path).toMatch(/duplicate\.\d+\.txt$/);
        expect(result.path).not.toBe(path.join(uploadsDir, filename));

        // Verify new file was written
        const content = await fs.readFile(result.path, 'utf-8');
        expect(content).toBe('test content');
      });

      it('should reject files exceeding size limit', async () => {
        const smallSizeService = new FileSystemService(100); // 100 bytes max
        const largeBuffer = Buffer.alloc(200, 'x'); // 200 bytes

        await expect(
          smallSizeService.uploadFile(uploadsDir, largeBuffer, 'large.txt')
        ).rejects.toThrow(
          new CUIError('FILE_TOO_LARGE', expect.stringContaining('exceeds maximum allowed size'), 413)
        );
      });

      it('should reject filenames with path separators', async () => {
        const buffer = Buffer.from('test');

        await expect(
          service.uploadFile(uploadsDir, buffer, '../etc/passwd')
        ).rejects.toThrow(
          new CUIError('INVALID_FILENAME', 'Filename must not contain path separators', 400)
        );
      });

      it('should reject filenames with null bytes', async () => {
        const buffer = Buffer.from('test');

        await expect(
          service.uploadFile(uploadsDir, buffer, 'test\u0000.txt')
        ).rejects.toThrow(
          new CUIError('INVALID_FILENAME', 'Filename contains null bytes', 400)
        );
      });

      it('should reject filenames with invalid characters', async () => {
        const buffer = Buffer.from('test');

        await expect(
          service.uploadFile(uploadsDir, buffer, 'test<file>.txt')
        ).rejects.toThrow(
          new CUIError('INVALID_FILENAME', 'Filename contains invalid characters', 400)
        );
      });

      it('should reject hidden files', async () => {
        const buffer = Buffer.from('test');

        await expect(
          service.uploadFile(uploadsDir, buffer, '.hidden')
        ).rejects.toThrow(
          new CUIError('INVALID_FILENAME', 'Hidden files are not allowed', 400)
        );
      });

      it('should reject upload to non-directory path', async () => {
        // Create a file instead of directory
        const filePath = path.join(testDir, 'notadir');
        await fs.writeFile(filePath, 'content');

        const buffer = Buffer.from('test');

        await expect(
          service.uploadFile(filePath, buffer, 'test.txt')
        ).rejects.toThrow(
          new CUIError('NOT_A_DIRECTORY', expect.stringContaining('not a directory'), 400)
        );
      });

      it('should reject upload to non-existent path', async () => {
        const buffer = Buffer.from('test');
        const nonExistentPath = path.join(testDir, 'does-not-exist');

        await expect(
          service.uploadFile(nonExistentPath, buffer, 'test.txt')
        ).rejects.toThrow(
          new CUIError('PATH_NOT_FOUND', expect.stringContaining('not found'), 404)
        );
      });

      it('should handle various file extensions correctly', async () => {
        const testFiles = [
          'document.pdf',
          'image.png',
          'script.js',
          'data.json',
          'archive.zip'
        ];

        for (const filename of testFiles) {
          const buffer = Buffer.from('content');
          const result = await service.uploadFile(uploadsDir, buffer, filename);

          expect(result.path).toBe(path.join(uploadsDir, filename));
          expect(result.size).toBe(buffer.length);
        }
      });
    });
  });
});