import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ConversationCache, ConversationChain } from '../../../src/services/conversation-cache';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock the logger module
vi.mock('../../../src/services/logger', () => ({
  createLogger: () => mockLogger
}));

// Mock RawJsonEntry type for testing
interface RawJsonEntry {
  type: string;
  uuid?: string;
  sessionId?: string;
  parentUuid?: string;
  timestamp?: string;
  message?: any;
  cwd?: string;
  durationMs?: number;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  summary?: string;
  leafUuid?: string;
}

describe('ConversationCache - File Level Caching', () => {
  let cache: ConversationCache;
  let mockFileModTimes: Map<string, number>;
  let mockConversations: ConversationChain[];
  let mockRawEntries: RawJsonEntry[];

  beforeEach(() => {
    cache = new ConversationCache();
    mockFileModTimes = new Map([
      ['/path/projects/project1/session1.jsonl', 1000],
      ['/path/projects/project2/session2.jsonl', 2000]
    ]);
    
    mockRawEntries = [
      {
        type: 'user',
        uuid: 'msg1',
        sessionId: 'session1',
        timestamp: '2023-01-01T00:00:00.000Z',
        message: 'Hello'
      },
      {
        type: 'assistant',
        uuid: 'msg2',
        sessionId: 'session1',
        parentUuid: 'msg1',
        timestamp: '2023-01-01T00:01:00.000Z',
        message: 'Hi there!'
      }
    ];
    
    mockConversations = [
      {
        sessionId: 'session1',
        messages: [],
        projectPath: '/test/path',
        summary: 'Test conversation',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        totalDuration: 100,
        model: 'claude-3'
      }
    ];
    
    // Clear mock calls between tests
    vi.clearAllMocks();
  });

  describe('file-level caching', () => {
    it('should cache individual file entries and avoid re-parsing unchanged files', async () => {
      let parseCallCount = 0;
      const fileParseCalls: string[] = [];
      
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        parseCallCount++;
        fileParseCalls.push(filePath);
        // Return different entries based on file path
        return filePath.includes('session1') ? [mockRawEntries[0]] : [mockRawEntries[1]];
      });

      const mockGetSourceProject = vi.fn().mockImplementation((filePath: string) => {
        return filePath.includes('project1') ? 'project1' : 'project2';
      });

      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // First request - should parse all files
      const firstResult = await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      expect(firstResult).toEqual(mockConversations);
      expect(mockParseFile).toHaveBeenCalledTimes(2); // Called for each file
      expect(fileParseCalls).toContain('/path/projects/project1/session1.jsonl');
      expect(fileParseCalls).toContain('/path/projects/project2/session2.jsonl');
      expect(mockProcessAllEntries).toHaveBeenCalledTimes(1);

      // Second request with same file mod times - should use cached file entries
      vi.clearAllMocks();
      parseCallCount = 0;
      fileParseCalls.length = 0;

      const secondResult = await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      expect(secondResult).toEqual(mockConversations);
      expect(mockParseFile).not.toHaveBeenCalled(); // No files re-parsed
      expect(mockProcessAllEntries).toHaveBeenCalledTimes(1); // Still processes entries
    });

    it('should re-parse only modified files when file modification times change', async () => {
      let parseCallCount = 0;
      const fileParseCalls: string[] = [];
      
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        parseCallCount++;
        fileParseCalls.push(filePath);
        return filePath.includes('session1') ? [mockRawEntries[0]] : [mockRawEntries[1]];
      });

      const mockGetSourceProject = vi.fn().mockImplementation((filePath: string) => {
        return filePath.includes('project1') ? 'project1' : 'project2';
      });

      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // First request - parse all files
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      expect(mockParseFile).toHaveBeenCalledTimes(2);

      // Modify only one file's modification time
      const modifiedFileModTimes = new Map(mockFileModTimes);
      modifiedFileModTimes.set('/path/projects/project1/session1.jsonl', 1500);

      vi.clearAllMocks();
      parseCallCount = 0;
      fileParseCalls.length = 0;

      // Second request with one file modified
      await cache.getOrParseConversations(
        modifiedFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Should only re-parse the modified file
      expect(mockParseFile).toHaveBeenCalledTimes(1);
      expect(fileParseCalls).toContain('/path/projects/project1/session1.jsonl');
      expect(fileParseCalls).not.toContain('/path/projects/project2/session2.jsonl');
      expect(mockProcessAllEntries).toHaveBeenCalledTimes(1);
    });

    it('should handle new files being added', async () => {
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        return filePath.includes('session3') ? [{ ...mockRawEntries[0], sessionId: 'session3' }] : mockRawEntries;
      });

      const mockGetSourceProject = vi.fn().mockImplementation((filePath: string) => {
        return filePath.includes('project3') ? 'project3' : 'project1';
      });

      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // First request - parse initial files
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Add a new file
      const newFileModTimes = new Map(mockFileModTimes);
      newFileModTimes.set('/path/projects/project3/session3.jsonl', 3000);

      vi.clearAllMocks();

      // Second request with new file
      await cache.getOrParseConversations(
        newFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Should parse only the new file (others are cached)
      expect(mockParseFile).toHaveBeenCalledTimes(1);
      expect(mockParseFile).toHaveBeenCalledWith('/path/projects/project3/session3.jsonl');
    });

    it('should handle file deletion by removing cached entries', async () => {
      const mockParseFile = vi.fn().mockResolvedValue(mockRawEntries);
      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // First request - parse all files
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Remove one file
      const reducedFileModTimes = new Map(mockFileModTimes);
      reducedFileModTimes.delete('/path/projects/project2/session2.jsonl');

      vi.clearAllMocks();

      // Second request with one file removed
      await cache.getOrParseConversations(
        reducedFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Should not re-parse existing file, but should process remaining entries
      expect(mockParseFile).not.toHaveBeenCalled();
      expect(mockProcessAllEntries).toHaveBeenCalledTimes(1);

      // Verify cache stats show the file was removed
      const stats = cache.getStats();
      expect(stats.cachedFileCount).toBe(1);
    });

    it('should handle file parsing errors gracefully', async () => {
      let callCount = 0;
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        callCount++;
        if (filePath.includes('session1') && callCount === 1) {
          throw new Error('Failed to parse file');
        }
        return mockRawEntries;
      });

      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // First request - one file should fail
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Should have attempted to parse both files, one failed
      expect(mockParseFile).toHaveBeenCalledTimes(2);
      expect(mockProcessAllEntries).toHaveBeenCalledTimes(1);

      // Check that the failed file is not in cache
      const stats = cache.getStats();
      expect(stats.cachedFileCount).toBe(1); // Only the successful one should be cached
    });
  });

  describe('concurrent request handling', () => {
    it('should handle multiple concurrent requests without duplicate parsing', async () => {
      let parseCallCount = 0;
      let parseStarted = false;
      
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        parseCallCount++;
        parseStarted = true;
        // Simulate parsing delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockRawEntries;
      });

      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // Start first request and give it time to start parsing
      const request1 = cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );
      
      // Wait a bit to ensure parsing starts
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(parseStarted).toBe(true);

      // Now start concurrent requests
      const request2 = cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      // Wait for all requests to complete
      const results = await Promise.all([request1, request2]);

      // Verify all requests got the same result
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toEqual(mockConversations);
      });

      // Parse function should only be called for the actual files (not duplicated)
      expect(mockParseFile).toHaveBeenCalledTimes(2); // Once per file, not per request
    });
  });

  describe('cache statistics', () => {
    it('should provide detailed file cache statistics', async () => {
      const mockParseFile = vi.fn().mockResolvedValue(mockRawEntries);
      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // Before any operations
      let stats = cache.getStats();
      expect(stats.isLoaded).toBe(false);
      expect(stats.cachedFileCount).toBe(0);
      expect(stats.totalCachedEntries).toBe(0);

      // After parsing
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      stats = cache.getStats();
      expect(stats.isLoaded).toBe(true);
      expect(stats.cachedFileCount).toBe(2);
      expect(stats.totalCachedEntries).toBeGreaterThan(0);
      expect(stats.fileCacheDetails).toHaveLength(2);
      expect(stats.fileCacheDetails[0]).toHaveProperty('filePath');
      expect(stats.fileCacheDetails[0]).toHaveProperty('entryCount');
      expect(stats.fileCacheDetails[0]).toHaveProperty('mtime');
    });

    it('should include parsing status in statistics', async () => {
      let isParsingActive = false;
      
      const mockParseFile = vi.fn().mockImplementation(async (filePath: string) => {
        // Small delay and then check - by this point parsing promise should be set
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Check stats while parsing
        const statsWhileParsing = cache.getStats();
        isParsingActive = statsWhileParsing.isCurrentlyParsing;
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return mockRawEntries;
      });

      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      const parsingPromise = cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );
      
      // Stats after parsing completes
      await parsingPromise;
      const statsAfterParsing = cache.getStats();
      
      // The parsing should have been active at some point during execution
      expect(isParsingActive).toBe(true);
      expect(statsAfterParsing.isCurrentlyParsing).toBe(false);
      expect(statsAfterParsing.isLoaded).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear all cache data when clear() is called', async () => {
      const mockParseFile = vi.fn().mockResolvedValue(mockRawEntries);
      const mockGetSourceProject = vi.fn().mockReturnValue('project1');
      const mockProcessAllEntries = vi.fn().mockReturnValue(mockConversations);

      // Build up cache
      await cache.getOrParseConversations(
        mockFileModTimes,
        mockParseFile,
        mockGetSourceProject,
        mockProcessAllEntries
      );

      let stats = cache.getStats();
      expect(stats.isLoaded).toBe(true);
      expect(stats.cachedFileCount).toBe(2);

      // Clear cache
      cache.clear();

      stats = cache.getStats();
      expect(stats.isLoaded).toBe(false);
      expect(stats.cachedFileCount).toBe(0);
      expect(stats.totalCachedEntries).toBe(0);
    });

    it('should verify file cache validity correctly', () => {
      // Test isFileCacheValid method
      expect(cache.isFileCacheValid('/some/file.jsonl', 1000)).toBe(false);

      // After updating cache, it should be valid
      cache.updateFileCache('/some/file.jsonl', mockRawEntries, 1000, 'project1');
      expect(cache.isFileCacheValid('/some/file.jsonl', 1000)).toBe(true);
      expect(cache.isFileCacheValid('/some/file.jsonl', 1001)).toBe(false);
    });
  });
});