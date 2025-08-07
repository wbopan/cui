import { WorkingDirectory, WorkingDirectoriesResponse } from '@/types/index.js';
import { ClaudeHistoryReader } from './claude-history-reader.js';
import { Logger } from './logger.js';

export class WorkingDirectoriesService {
  private logger: Logger;

  constructor(
    private historyReader: ClaudeHistoryReader,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'WorkingDirectoriesService' });
  }

  async getWorkingDirectories(): Promise<WorkingDirectoriesResponse> {
    try {
      // Get all conversations from history
      const { conversations } = await this.historyReader.listConversations();
      
      // Build directory map with metadata
      const directoryMap = new Map<string, {
        lastDate: Date;
        count: number;
      }>();

      for (const conversation of conversations) {
        const path = conversation.projectPath;
        if (!path) continue;

        const existing = directoryMap.get(path);
        const conversationDate = new Date(conversation.updatedAt);

        if (!existing || conversationDate > existing.lastDate) {
          directoryMap.set(path, {
            lastDate: conversationDate,
            count: (existing?.count || 0) + 1
          });
        } else {
          existing.count++;
        }
      }

      // Convert to array and compute shortnames
      const paths = Array.from(directoryMap.keys());
      const shortnames = this.computeShortnames(paths);

      // Build response
      const directories: WorkingDirectory[] = [];
      for (const [path, metadata] of directoryMap.entries()) {
        directories.push({
          path,
          shortname: shortnames.get(path) || path.split('/').pop() || path,
          lastDate: metadata.lastDate.toISOString().replace(/\.\d{3}Z$/, 'Z'), // Remove milliseconds for consistency
          conversationCount: metadata.count
        });
      }

      // Sort by lastDate descending
      directories.sort((a, b) => 
        new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
      );

      this.logger.debug('Retrieved working directories', { 
        totalDirectories: directories.length 
      });

      return {
        directories,
        totalCount: directories.length
      };
    } catch (error) {
      this.logger.error('Failed to get working directories', error);
      throw error;
    }
  }

  /**
   * Compute shortest unique suffixes for a list of paths
   * 
   * Examples:
   * - ["/home/alice/project", "/home/bob/project"] -> ["alice/project", "bob/project"]
   * - ["/home/user/web", "/home/user/api"] -> ["web", "api"]
   * - ["/single/path"] -> ["path"]
   */
  private computeShortnames(paths: string[]): Map<string, string> {
    const result = new Map<string, string>();
    
    // Handle edge cases
    if (paths.length === 0) return result;
    if (paths.length === 1) {
      const segments = paths[0].split('/').filter(s => s);
      result.set(paths[0], segments[segments.length - 1] || paths[0]);
      return result;
    }

    // Split all paths into segments
    const pathSegments = paths.map(path => ({
      path,
      segments: path.split('/').filter(s => s)
    }));

    // For each path, find the shortest unique suffix
    for (const { path, segments } of pathSegments) {
      let suffixLength = 1;
      let shortname = '';

      // Keep adding segments until we have a unique suffix
      while (suffixLength <= segments.length) {
        const suffix = segments.slice(-suffixLength).join('/');
        
        // Check if this suffix is unique among all paths
        const isUnique = pathSegments.every(other => 
          other.path === path || 
          other.segments.slice(-suffixLength).join('/') !== suffix
        );

        if (isUnique) {
          shortname = suffix;
          break;
        }
        
        suffixLength++;
      }

      // If we couldn't find a unique suffix (shouldn't happen), use full path
      result.set(path, shortname || path);
    }

    return result;
  }
}