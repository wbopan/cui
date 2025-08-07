import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';

/**
 * Simple JSON file manager with race condition protection
 * Uses file locking and atomic writes to prevent data corruption
 */
export class JsonFileManager<T> {
  private logger: Logger;
  private filePath: string;
  private lockPath: string;
  private writeQueue: Array<() => Promise<void>> = [];
  private isWriting = false;

  constructor(filePath: string, private defaultData: T) {
    this.logger = createLogger('JsonFileManager');
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
  }

  /**
   * Read data from JSON file
   * Returns default data if file doesn't exist
   */
  async read(): Promise<T> {
    try {
      // Wait for any pending writes to complete
      await this.waitForWrite();

      if (!fs.existsSync(this.filePath)) {
        this.logger.debug('File does not exist, returning default data', { filePath: this.filePath });
        return JSON.parse(JSON.stringify(this.defaultData)); // Deep copy
      }

      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      // this.logger.debug('Successfully read JSON file', { filePath: this.filePath });
      return data;
    } catch (error) {
      this.logger.error('Failed to read JSON file', { filePath: this.filePath, error });
      // Return default data on error for graceful degradation
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  }

  /**
   * Write data to JSON file atomically
   * Uses temporary file and rename to prevent corruption
   */
  async write(data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to write queue
      this.writeQueue.push(async () => {
        try {
          await this.performWrite(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      // Process queue if not already processing
      if (!this.isWriting) {
        this.processWriteQueue();
      }
    });
  }

  /**
   * Update data using a callback function
   * Reads current data, applies update, and writes back
   */
  async update(updateFn: (data: T) => T): Promise<void> {
    const currentData = await this.read();
    const updatedData = updateFn(currentData);
    await this.write(updatedData);
  }

  /**
   * Perform atomic write operation
   */
  private async performWrite(data: T): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;

    try {
      // Create lock file to prevent concurrent writes
      await this.acquireLock();

      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
        this.logger.debug('Created directory', { dir });
      }

      // Write to temporary file
      const jsonContent = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(tempPath, jsonContent, 'utf-8');

      // Atomic rename (moves temp file to final location)
      await fs.promises.rename(tempPath, this.filePath);

    } catch (error) {
      this.logger.error('Failed to write JSON file', { filePath: this.filePath, error });
      
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempPath)) {
          await fs.promises.unlink(tempPath);
        }
      } catch (cleanupError) {
        this.logger.warn('Failed to cleanup temp file', { tempPath, error: cleanupError });
      }
      
      throw error;
    } finally {
      // Release lock
      await this.releaseLock();
    }
  }

  /**
   * Process write queue sequentially
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting) return;
    
    this.isWriting = true;
    
    try {
      while (this.writeQueue.length > 0) {
        const writeOperation = this.writeQueue.shift();
        if (writeOperation) {
          await writeOperation();
        }
      }
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Wait for any pending writes to complete
   */
  private async waitForWrite(): Promise<void> {
    while (this.isWriting) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Acquire file lock
   */
  private async acquireLock(): Promise<void> {
    const maxRetries = 50; // 5 seconds total
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Try to create lock file exclusively
        await fs.promises.writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'EEXIST') {
          // Lock file exists, check if process is still running
          try {
            const lockContent = await fs.promises.readFile(this.lockPath, 'utf-8');
            const lockPid = parseInt(lockContent.trim());
            
            // Check if process is still running
            try {
              process.kill(lockPid, 0); // Signal 0 just checks if process exists
              // Process exists, wait and retry
              await new Promise(resolve => setTimeout(resolve, 100));
              retries++;
              continue;
            } catch (_processError) {
              // Process doesn't exist, remove stale lock
              await fs.promises.unlink(this.lockPath);
              this.logger.debug('Removed stale lock', { lockPath: this.lockPath });
              continue;
            }
          } catch (_readError) {
            // Can't read lock file, remove it
            try {
              await fs.promises.unlink(this.lockPath);
            } catch (_unlinkError) {
              // Ignore unlink errors
            }
            continue;
          }
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to acquire lock after maximum retries');
  }

  /**
   * Release file lock
   */
  private async releaseLock(): Promise<void> {
    try {
      if (fs.existsSync(this.lockPath)) {
        await fs.promises.unlink(this.lockPath);
      }
    } catch (error) {
      this.logger.warn('Failed to release lock', { lockPath: this.lockPath, error });
    }
  }
}