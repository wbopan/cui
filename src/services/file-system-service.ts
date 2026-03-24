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
   * Update the maximum file size limit
   */
  setMaxFileSize(maxFileSize: number): void {
    this.maxFileSize = maxFileSize;
    this.logger.debug('Max file size updated', { maxFileSize });
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
   * Download file with security checks (supports both text and binary files)
   * Returns file buffer, mime type, and metadata for download
   */
  async downloadFile(requestedPath: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
    size: number;
    lastModified: string;
  }> {
    this.logger.debug('Download file requested', { requestedPath });

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

      // Read file as buffer (supports both text and binary)
      const buffer = await fs.readFile(safePath);

      // Determine MIME type based on file extension
      const mimeType = this.getMimeType(safePath);

      // Get filename from path
      const filename = path.basename(safePath);

      this.logger.debug('File download prepared', {
        path: safePath,
        size: stats.size,
        mimeType,
        filename
      });

      return {
        buffer,
        mimeType,
        filename,
        size: stats.size,
        lastModified: stats.mtime.toISOString()
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

      this.logger.error('Error downloading file', error, { requestedPath });
      throw new CUIError('DOWNLOAD_FILE_FAILED', `Failed to download file: ${error}`, 500);
    }
  }

  /**
   * Ensure uploads directory exists within the given session CWD
   * Creates the directory if it doesn't exist
   */
  async ensureUploadsDirectory(sessionCwd: string): Promise<string> {
    this.logger.debug('Ensuring uploads directory exists', { sessionCwd });

    try {
      // Validate the session CWD path
      const safeCwd = await this.validatePath(sessionCwd);

      // Create uploads path within the session CWD
      const uploadsPath = path.join(safeCwd, 'uploads');

      // Check if uploads directory already exists
      try {
        const stats = await fs.stat(uploadsPath);
        if (stats.isDirectory()) {
          this.logger.debug('Uploads directory already exists', { uploadsPath });
          return uploadsPath;
        } else {
          throw new CUIError('NOT_A_DIRECTORY', 'uploads path exists but is not a directory', 400);
        }
      } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode !== 'ENOENT') {
          throw error;
        }
        // Directory doesn't exist, create it
      }

      // Create the uploads directory
      await fs.mkdir(uploadsPath, { recursive: true });

      this.logger.debug('Uploads directory created successfully', { uploadsPath });
      return uploadsPath;
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }

      this.logger.error('Error ensuring uploads directory', error, { sessionCwd });
      throw new CUIError('CREATE_UPLOADS_DIR_FAILED', `Failed to create uploads directory: ${error}`, 500);
    }
  }

  /**
   * Upload a file to the specified destination path with security checks
   * Handles duplicate filenames by appending timestamps
   */
  async uploadFile(
    destinationPath: string,
    buffer: Buffer,
    filename: string
  ): Promise<{ path: string; size: number }> {
    this.logger.debug('Upload file requested', { destinationPath, filename, size: buffer.length });

    try {
      // Validate filename doesn't contain path separators or invalid characters
      const baseFilename = path.basename(filename);
      if (baseFilename !== filename) {
        throw new CUIError('INVALID_FILENAME', 'Filename must not contain path separators', 400);
      }

      // Check for null bytes in filename
      if (filename.includes('\u0000')) {
        throw new CUIError('INVALID_FILENAME', 'Filename contains null bytes', 400);
      }

      // Check for invalid characters in filename
      if (/[<>:|?*]/.test(filename)) {
        throw new CUIError('INVALID_FILENAME', 'Filename contains invalid characters', 400);
      }

      // Reject hidden files (starting with .)
      if (filename.startsWith('.')) {
        throw new CUIError('INVALID_FILENAME', 'Hidden files are not allowed', 400);
      }

      // Check file size
      if (buffer.length > this.maxFileSize) {
        throw new CUIError(
          'FILE_TOO_LARGE',
          `File size (${buffer.length} bytes) exceeds maximum allowed size (${this.maxFileSize} bytes)`,
          413
        );
      }

      // Validate destination path
      const safeDestPath = await this.validatePath(destinationPath);

      // Ensure destination is a directory
      const stats = await fs.stat(safeDestPath);
      if (!stats.isDirectory()) {
        throw new CUIError('NOT_A_DIRECTORY', `Destination path is not a directory: ${destinationPath}`, 400);
      }

      // Construct final file path
      let finalPath = path.join(safeDestPath, filename);

      // Handle duplicate filenames by appending timestamp
      if (existsSync(finalPath)) {
        const ext = path.extname(filename);
        const nameWithoutExt = path.basename(filename, ext);
        const timestamp = Date.now();
        const newFilename = `${nameWithoutExt}.${timestamp}${ext}`;
        finalPath = path.join(safeDestPath, newFilename);

        this.logger.debug('Duplicate filename detected, using timestamp suffix', {
          originalFilename: filename,
          newFilename
        });
      }

      // Write file to disk
      await fs.writeFile(finalPath, buffer);

      this.logger.debug('File uploaded successfully', {
        path: finalPath,
        size: buffer.length
      });

      return {
        path: finalPath,
        size: buffer.length
      };
    } catch (error) {
      if (error instanceof CUIError) {
        throw error;
      }

      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
        throw new CUIError('PATH_NOT_FOUND', `Destination path not found: ${destinationPath}`, 404);
      } else if (errorCode === 'EACCES') {
        throw new CUIError('ACCESS_DENIED', `Access denied to destination: ${destinationPath}`, 403);
      }

      this.logger.error('Error uploading file', error, { destinationPath, filename });
      throw new CUIError('UPLOAD_FILE_FAILED', `Failed to upload file: ${error}`, 500);
    }
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      // Text
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',

      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',

      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

      // Archives
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',

      // Audio/Video
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',

      // Programming
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.rs': 'text/x-rust',
      '.go': 'text/x-go',
      '.rb': 'text/x-ruby',
      '.php': 'text/x-php',
      '.sh': 'application/x-sh',
      '.sql': 'application/sql'
    };

    return mimeTypes[ext] || 'application/octet-stream';
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