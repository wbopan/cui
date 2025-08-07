import { ConversationMessage } from '@/types/index.js';
import { createLogger, type Logger } from './logger.js';
import Anthropic from '@anthropic-ai/sdk';

export interface ConversationChain {
  sessionId: string;
  messages: ConversationMessage[];
  projectPath: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  totalDuration: number;
  model: string;
}

interface RawJsonEntry {
  type: string;
  uuid?: string;
  sessionId?: string;
  parentUuid?: string;
  timestamp?: string;
  message?: Anthropic.Message | Anthropic.MessageParam;
  cwd?: string;
  durationMs?: number;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  summary?: string;
  leafUuid?: string;
}

interface FileCache {
  entries: RawJsonEntry[];     // Parsed JSONL entries from this file
  mtime: number;              // File modification time when cached
  sourceProject: string;      // Project directory name
}

interface ConversationCacheData {
  fileCache: Map<string, FileCache>; // filePath -> cached file data
  lastCacheTime: number;
}

/**
 * Service for managing conversation cache with file modification tracking
 */
export class ConversationCache {
  private cache: ConversationCacheData | null = null;
  private logger: Logger;
  private parsingPromise: Promise<ConversationChain[]> | null = null;

  constructor() {
    this.logger = createLogger('ConversationCache');
  }

  /**
   * Clear the conversation cache to force a refresh on next read
   */
  clear(): void {
    this.logger.debug('Clearing conversation cache');
    const previousStats = this.cache ? {
      cachedFileCount: this.cache.fileCache.size,
      totalEntries: Array.from(this.cache.fileCache.values())
        .reduce((sum, cache) => sum + cache.entries.length, 0)
    } : { cachedFileCount: 0, totalEntries: 0 };
    
    this.cache = null;
    this.parsingPromise = null;
    this.logger.info('Conversation cache cleared', { 
      previousStats,
      timestamp: new Date().toISOString() 
    });
  }

  /**
   * Get cached file entries, combining cached and newly parsed entries
   */
  async getCachedFileEntries(
    currentFileModTimes: Map<string, number>,
    parseFileFunction: (filePath: string) => Promise<RawJsonEntry[]>,
    getSourceProject: (filePath: string) => string
  ): Promise<(RawJsonEntry & { sourceProject: string })[]> {
    this.logger.debug('Getting cached file entries', {
      hasCachedData: !!this.cache,
      currentFileCount: currentFileModTimes.size
    });

    // Initialize cache if it doesn't exist
    if (!this.cache) {
      this.cache = {
        fileCache: new Map(),
        lastCacheTime: Date.now()
      };
    }

    const allEntries: (RawJsonEntry & { sourceProject: string })[] = [];
    let filesFromCache = 0;
    let filesReparsed = 0;

    // Process each file: use cache OR re-parse if changed
    for (const [filePath, currentMtime] of currentFileModTimes) {
      const cached = this.cache.fileCache.get(filePath);
      
      if (cached && cached.mtime === currentMtime) {
        // Use cached entries (skip expensive file I/O + JSON parsing)
        const entriesWithSource = cached.entries.map(entry => ({
          ...entry,
          sourceProject: cached.sourceProject
        }));
        allEntries.push(...entriesWithSource);
        filesFromCache++;
      } else {
        // Re-parse this file (expensive operation)
        try {
          const entries = await parseFileFunction(filePath);
          const sourceProject = getSourceProject(filePath);
          
          // Update cache for this file
          this.cache.fileCache.set(filePath, {
            entries,
            mtime: currentMtime,
            sourceProject
          });
          
          const entriesWithSource = entries.map(entry => ({
            ...entry,
            sourceProject
          }));
          allEntries.push(...entriesWithSource);
          filesReparsed++;
        } catch (error) {
          this.logger.warn('Failed to parse file, skipping', { filePath, error });
          // Remove from cache if it exists
          this.cache.fileCache.delete(filePath);
        }
      }
    }

    // Clean up cache entries for files that no longer exist
    for (const [cachedFilePath] of this.cache.fileCache) {
      if (!currentFileModTimes.has(cachedFilePath)) {
        this.logger.debug('Removing cache entry for deleted file', { filePath: cachedFilePath });
        this.cache.fileCache.delete(cachedFilePath);
      }
    }

    this.logger.debug('File cache processing complete', {
      totalFiles: currentFileModTimes.size,
      filesFromCache,
      filesReparsed,
      totalEntries: allEntries.length,
      cachedFileCount: this.cache.fileCache.size
    });

    return allEntries;
  }

  /**
   * Update a specific file's cache entry
   */
  updateFileCache(
    filePath: string,
    entries: RawJsonEntry[],
    mtime: number,
    sourceProject: string
  ): void {
    if (!this.cache) {
      this.cache = {
        fileCache: new Map(),
        lastCacheTime: Date.now()
      };
    }

    this.cache.fileCache.set(filePath, {
      entries,
      mtime,
      sourceProject
    });

    this.logger.debug('File cache updated', {
      filePath,
      entryCount: entries.length,
      sourceProject,
      mtime: new Date(mtime).toISOString()
    });
  }

  /**
   * Clear cache entry for a specific file
   */
  clearFileCache(filePath: string): void {
    if (this.cache?.fileCache.has(filePath)) {
      this.cache.fileCache.delete(filePath);
      this.logger.debug('File cache cleared', { filePath });
    }
  }

  /**
   * Check if a specific file's cache entry is valid
   */
  isFileCacheValid(filePath: string, currentMtime: number): boolean {
    if (!this.cache) {
      return false;
    }

    const cached = this.cache.fileCache.get(filePath);
    return cached ? cached.mtime === currentMtime : false;
  }

  /**
   * Get or parse conversations with file-level caching and concurrency protection
   */
  async getOrParseConversations(
    currentFileModTimes: Map<string, number>,
    parseFileFunction: (filePath: string) => Promise<RawJsonEntry[]>,
    getSourceProject: (filePath: string) => string,
    processAllEntries: (allEntries: (RawJsonEntry & { sourceProject: string })[]) => ConversationChain[]
  ): Promise<ConversationChain[]> {
    this.logger.debug('Request for conversations received', {
      hasCachedData: !!this.cache,
      isCurrentlyParsing: !!this.parsingPromise,
      currentFileCount: currentFileModTimes.size
    });

    // If already parsing, wait for it to complete
    if (this.parsingPromise) {
      this.logger.debug('Parsing already in progress, waiting for completion');
      try {
        const result = await this.parsingPromise;
        this.logger.debug('Concurrent parsing completed, returning result', {
          conversationCount: result.length
        });
        return result;
      } catch (error) {
        this.logger.error('Concurrent parsing failed', error);
        // Clear the failed promise and fall through to retry
        this.parsingPromise = null;
      }
    }

    this.parsingPromise = this.executeFileBasedParsing(
      currentFileModTimes,
      parseFileFunction,
      getSourceProject,
      processAllEntries
    );

    try {
      const result = await this.parsingPromise;
      this.parsingPromise = null;
      return result;
    } catch (error) {
      this.parsingPromise = null;
      throw error;
    }
  }

  /**
   * Execute file-based parsing with proper logging
   */
  private async executeFileBasedParsing(
    currentFileModTimes: Map<string, number>,
    parseFileFunction: (filePath: string) => Promise<RawJsonEntry[]>,
    getSourceProject: (filePath: string) => string,
    processAllEntries: (allEntries: (RawJsonEntry & { sourceProject: string })[]) => ConversationChain[]
  ): Promise<ConversationChain[]> {
    const parseStartTime = Date.now();
    
    this.logger.debug('Executing file-based parsing');
    
    // Get all entries using file-level caching
    const allEntries = await this.getCachedFileEntries(
      currentFileModTimes,
      parseFileFunction,
      getSourceProject
    );
    
    // Process entries into conversations (cheap in-memory operation)
    const conversations = processAllEntries(allEntries);
    const parseElapsed = Date.now() - parseStartTime;

    this.logger.debug('File-based parsing completed', {
      conversationCount: conversations.length,
      totalEntries: allEntries.length,
      parseElapsedMs: parseElapsed
    });

    return conversations;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    isLoaded: boolean;
    cachedFileCount: number;
    totalCachedEntries: number;
    lastCacheTime: number | null;
    cacheAge: number | null;
    isCurrentlyParsing: boolean;
    fileCacheDetails: { filePath: string; entryCount: number; mtime: string }[];
  } {
    if (!this.cache) {
      return {
        isLoaded: false,
        cachedFileCount: 0,
        totalCachedEntries: 0,
        lastCacheTime: null,
        cacheAge: null,
        isCurrentlyParsing: !!this.parsingPromise,
        fileCacheDetails: []
      };
    }

    const totalCachedEntries = Array.from(this.cache.fileCache.values())
      .reduce((sum, cache) => sum + cache.entries.length, 0);

    const fileCacheDetails = Array.from(this.cache.fileCache.entries())
      .map(([filePath, cache]) => ({
        filePath,
        entryCount: cache.entries.length,
        mtime: new Date(cache.mtime).toISOString()
      }));

    return {
      isLoaded: true,
      cachedFileCount: this.cache.fileCache.size,
      totalCachedEntries,
      lastCacheTime: this.cache.lastCacheTime,
      cacheAge: Date.now() - this.cache.lastCacheTime,
      isCurrentlyParsing: !!this.parsingPromise,
      fileCacheDetails
    };
  }
}