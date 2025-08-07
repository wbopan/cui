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
});