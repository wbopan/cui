import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, constants } from 'fs';
import ignore from 'ignore';
import { CUIError, FileSystemEntry } from '@/types/index.js';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';

const execAsync = promisify(exec);

/**
 * Service for secure file system operations
 */
export class FileSystemService {
  private logger: Logger;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB default
  private allowedBasePaths: string[] = []; // Empty means all paths allowed
  
  constructor(maxFileSize?: number, allowedBasePaths?: string[]) {
    this.logger = createLogger('FileSystemService');
    if (maxFileSize !== undefined) {
      this.maxFileSize = maxFileSize;
    }
    if (allowedBasePaths) {
      this.allowedBasePaths = allowedBasePaths.map(p => path.normalize(p));
    }
  }

  /**
   * List directory contents with security checks
   */
  async listDirectory(
    requestedPath: string, 
    recursive: boolean = false,
    respectGitignore: boolean = false
  ): Promise<{ path: string; entries: FileSystemEntry[]; total: number }> {
    this.logger.debug('List directory requested', { requestedPath, recursive, respectGitignore });
    
    try {
      // Validate and normalize path
      const safePath = await this.validatePath(requestedPath);
      
      // Check if path exists and is a directory
      const stats = await fs.stat(safePath);
      if (!stats.isDirectory()) {
        throw new CUIError('NOT_A_DIRECTORY', `Path is not a directory: ${requestedPath}`, 400);
      }
      
      // Initialize gitignore if requested
      let ig: ReturnType<typeof ignore> | null = null;
      if (respectGitignore) {
        ig = await this.loadGitignore(safePath);
      }
      
      // Get entries
      const entries: FileSystemEntry[] = recursive
        ? await this.listDirectoryRecursive(safePath, safePath, ig)
        : await this.listDirectoryFlat(safePath, ig);
      
      // Sort entries: directories first, then by name
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      this.logger.debug('Directory listed successfully', { 
        path: safePath, 
        entryCount: entries.length,
        recursive,
        respectGitignore
      });
      
      return {
        path: safePath,
        entries,
        total: entries.length
      };
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }
      
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
        throw new CUIError('PATH_NOT_FOUND', `Path not found: ${requestedPath}`, 404);
      } else if (errorCode === 'EACCES') {
        throw new CUIError('ACCESS_DENIED', `Access denied to path: ${requestedPath}`, 403);
      }
      
      this.logger.error('Error listing directory', error, { requestedPath });
      throw new CUIError('LIST_DIRECTORY_FAILED', `Failed to list directory: ${error}`, 500);
    }
  }

  /**
   * Read file contents with security checks
   */
  async readFile(requestedPath: string): Promise<{ path: string; content: string; size: number; lastModified: string; encoding: string }> {
    this.logger.debug('Read file requested', { requestedPath });
    
    try {
      // Validate and normalize path
      const safePath = await this.validatePath(requestedPath);
      
      // Check if path exists and is a file
      const stats = await fs.stat(safePath);
      if (!stats.isFile()) {
        throw new CUIError('NOT_A_FILE', `Path is not a file: ${requestedPath}`, 400);
      }
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new CUIError(
          'FILE_TOO_LARGE', 
          `File size (${stats.size} bytes) exceeds maximum allowed size (${this.maxFileSize} bytes)`, 
          400
        );
      }
      
      // Read file content
      const content = await fs.readFile(safePath, 'utf-8');
      
      // Check if content is valid UTF-8 text
      if (!this.isValidUtf8(content)) {
        throw new CUIError('BINARY_FILE', 'File appears to be binary or not valid UTF-8', 400);
      }
      
      this.logger.debug('File read successfully', { 
        path: safePath, 
        size: stats.size 
      });
      
      return {
        path: safePath,
        content,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        encoding: 'utf-8'
      };
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }
      
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
        throw new CUIError('FILE_NOT_FOUND', `File not found: ${requestedPath}`, 404);
      } else if (errorCode === 'EACCES') {
        throw new CUIError('ACCESS_DENIED', `Access denied to file: ${requestedPath}`, 403);
      }
      
      this.logger.error('Error reading file', error, { requestedPath });
      throw new CUIError('READ_FILE_FAILED', `Failed to read file: ${error}`, 500);
    }
  }

  /**
   * Validate and normalize a path to prevent path traversal attacks
   */
  private async validatePath(requestedPath: string): Promise<string> {
    // Require absolute paths
    if (!path.isAbsolute(requestedPath)) {
      throw new CUIError('INVALID_PATH', 'Path must be absolute', 400);
    }
    
    // Check for path traversal attempts before normalization
    if (requestedPath.includes('..')) {
      this.logger.warn('Path traversal attempt detected', { 
        requestedPath 
      });
      throw new CUIError('PATH_TRAVERSAL_DETECTED', 'Invalid path: path traversal detected', 400);
    }
    
    // Normalize the path to resolve . segments and clean up
    const normalizedPath = path.normalize(requestedPath);
    
    // Check against allowed base paths if configured
    if (this.allowedBasePaths.length > 0) {
      const isAllowed = this.allowedBasePaths.some(basePath => 
        normalizedPath.startsWith(basePath)
      );
      
      if (!isAllowed) {
        this.logger.warn('Path outside allowed directories', { 
          requestedPath, 
          normalizedPath,
          allowedBasePaths: this.allowedBasePaths 
        });
        throw new CUIError('PATH_NOT_ALLOWED', 'Path is outside allowed directories', 403);
      }
    }
    
    // Additional security checks
    const segments = normalizedPath.split(path.sep);
    
    for (const segment of segments) {
      if (!segment) continue;
      
      // Check for hidden files/directories
      if (segment.startsWith('.')) {
        this.logger.warn('Hidden file/directory detected', { 
          requestedPath, 
          segment 
        });
        throw new CUIError('INVALID_PATH', 'Path contains hidden files/directories', 400);
      }
      
      // Check for null bytes
      if (segment.includes('\u0000')) {
        this.logger.warn('Null byte detected in path', { 
          requestedPath, 
          segment 
        });
        throw new CUIError('INVALID_PATH', 'Path contains null bytes', 400);
      }
      
      // Check for invalid characters
      if (/[<>:|?*]/.test(segment)) {
        this.logger.warn('Invalid characters detected in path', { 
          requestedPath, 
          segment 
        });
        throw new CUIError('INVALID_PATH', 'Path contains invalid characters', 400);
      }
    }
    
    this.logger.debug('Path validated successfully', { 
      requestedPath, 
      normalizedPath 
    });
    
    return normalizedPath;
  }

  /**
   * Check if content appears to be valid UTF-8 text
   */
  private isValidUtf8(content: string): boolean {
    // Check for null bytes - common binary file indicator
    if (content.includes('\u0000')) {
      return false;
    }
    
    // Check for control characters (excluding tab, newline, and carriage return)
    for (let i = 0; i < content.length; i++) {
      const charCode = content.charCodeAt(i);
      // Allow tab (9), newline (10), and carriage return (13)
      // Reject other control characters (1-8, 11-12, 14-31)
      if ((charCode >= 1 && charCode <= 8) || 
          (charCode >= 11 && charCode <= 12) || 
          (charCode >= 14 && charCode <= 31)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * List directory contents without recursion
   */
  private async listDirectoryFlat(
    dirPath: string,
    ig: ReturnType<typeof ignore> | null
  ): Promise<FileSystemEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const entries: FileSystemEntry[] = [];
    
    for (const dirent of dirents) {
      // Check gitignore BEFORE any expensive operations
      if (ig && ig.ignores(dirent.name)) {
        continue;
      }
      
      const fullPath = path.join(dirPath, dirent.name);
      const stats = await fs.stat(fullPath);
      entries.push({
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : 'file',
        size: dirent.isFile() ? stats.size : undefined,
        lastModified: stats.mtime.toISOString()
      });
    }
    
    return entries;
  }

  /**
   * List directory contents recursively
   */
  private async listDirectoryRecursive(
    dirPath: string,
    basePath: string,
    ig: ReturnType<typeof ignore> | null
  ): Promise<FileSystemEntry[]> {
    const entries: FileSystemEntry[] = [];
    
    async function traverse(currentPath: string): Promise<void> {
      const dirents = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const dirent of dirents) {
        const fullPath = path.join(currentPath, dirent.name);
        const relativePath = path.relative(basePath, fullPath);
        
        // Check gitignore BEFORE any expensive operations
        if (ig && ig.ignores(relativePath)) {
          // Skip this entry entirely - don't stat, don't recurse into directories
          continue;
        }
        
        const stats = await fs.stat(fullPath);
        entries.push({
          name: relativePath,
          type: dirent.isDirectory() ? 'directory' : 'file',
          size: dirent.isFile() ? stats.size : undefined,
          lastModified: stats.mtime.toISOString()
        });
        
        // Recurse into subdirectories (already checked it's not ignored)
        if (dirent.isDirectory()) {
          await traverse(fullPath);
        }
      }
    }
    
    await traverse(dirPath);
    return entries;
  }

  /**
   * Load gitignore patterns from a directory and its parents
   */
  private async loadGitignore(dirPath: string): Promise<ReturnType<typeof ignore>> {
    const ig = ignore();
    
    // Load .gitignore from the directory
    try {
      const gitignorePath = path.join(dirPath, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      ig.add(content);
      this.logger.debug('Loaded .gitignore', { path: gitignorePath });
    } catch (error) {
      // .gitignore doesn't exist or can't be read - that's fine
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode !== 'ENOENT') {
        this.logger.debug('Error reading .gitignore', { error, path: dirPath });
      }
    }
    
    // Always ignore .git directory
    ig.add('.git');
    
    return ig;
  }

  /**
   * Check if a directory is a git repository
   */
  async isGitRepository(dirPath: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: dirPath });
      return true;
    } catch (error) {
      this.logger.debug('Directory is not a git repository', { dirPath, error });
      return false;
    }
  }

  /**
   * Get current git HEAD commit hash
   */
  async getCurrentGitHead(dirPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: dirPath });
      return stdout.trim();
    } catch (error) {
      this.logger.debug('Failed to get git HEAD', { dirPath, error });
      return null;
    }
  }

  /**
   * Validate that an executable exists and has executable permissions
   */
  async validateExecutable(executablePath: string): Promise<void> {
    this.logger.debug('Validating executable', { executablePath });

    try {
      // Check if file exists
      if (!existsSync(executablePath)) {
        throw new CUIError(
          'EXECUTABLE_NOT_FOUND',
          `Executable not found: ${executablePath}`,
          404
        );
      }

      // Check if file is executable
      try {
        await fs.access(executablePath, constants.X_OK);
      } catch (_error) {
        throw new CUIError(
          'NOT_EXECUTABLE',
          `File exists but is not executable: ${executablePath}`,
          403
        );
      }

      this.logger.debug('Executable validation successful', { executablePath });
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }
      
      this.logger.error('Error validating executable', error, { executablePath });
      throw new CUIError(
        'EXECUTABLE_VALIDATION_FAILED',
        `Failed to validate executable: ${error}`,
        500
      );
    }
  }
}