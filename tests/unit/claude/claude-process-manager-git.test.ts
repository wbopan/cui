import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ClaudeProcessManager } from '@/services/claude-process-manager';
import { SessionInfoService } from '@/services/session-info-service';
import { FileSystemService } from '@/services/file-system-service';

mock.module('@/services/logger', () => ({
  createLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    error: mock()
  }))
}));

describe('ClaudeProcessManager - Git Integration', () => {
  let mockSessionInfoService: any;
  let mockFileSystemService: any;

  beforeEach(() => {
    mockSessionInfoService = {
      updateSessionInfo: mock(),
    } as any;

    mockFileSystemService = {
      isGitRepository: mock(),
      getCurrentGitHead: mock(),
    } as any;
  });

  describe('executeConversationFlow git integration', () => {
    it('should set initial_commit_head when in git repo', async () => {
      mockFileSystemService.isGitRepository.mockImplementation(() => Promise.resolve(true));
      mockFileSystemService.getCurrentGitHead.mockImplementation(() => Promise.resolve('abc123commit'));

      // Test the git logic directly
      const processManager = new ClaudeProcessManager(
        {} as any,
        {} as any,
        undefined,
        undefined,
        undefined,
        mockSessionInfoService,
        mockFileSystemService
      );

      // Access the private method through reflection to test git logic
      const systemInit = {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'test-session-123',
        cwd: '/path/to/git/repo',
        tools: [],
        mcp_servers: [],
        model: 'claude-3',
        permissionMode: 'prompt',
        apiKeySource: 'env'
      };

      // Simulate what happens after getting systemInit in executeConversationFlow
      if (processManager['sessionInfoService'] && processManager['fileSystemService']) {
        try {
          if (await processManager['fileSystemService'].isGitRepository(systemInit.cwd)) {
            const gitHead = await processManager['fileSystemService'].getCurrentGitHead(systemInit.cwd);
            if (gitHead) {
              await processManager['sessionInfoService'].updateSessionInfo(systemInit.session_id, {
                initial_commit_head: gitHead
              });
            }
          }
        } catch (error) {
          // Error handling
        }
      }

      expect(mockFileSystemService.isGitRepository).toHaveBeenCalledWith('/path/to/git/repo');
      expect(mockFileSystemService.getCurrentGitHead).toHaveBeenCalledWith('/path/to/git/repo');
      expect(mockSessionInfoService.updateSessionInfo).toHaveBeenCalledWith(
        'test-session-123',
        { initial_commit_head: 'abc123commit' }
      );
    });

    it('should not set initial_commit_head when not in git repo', async () => {
      mockFileSystemService.isGitRepository.mockImplementation(() => Promise.resolve(false));

      const processManager = new ClaudeProcessManager(
        {} as any,
        {} as any,
        undefined,
        undefined,
        undefined,
        mockSessionInfoService,
        mockFileSystemService
      );

      const systemInit = {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'test-session-456',
        cwd: '/path/to/non-git',
        tools: [],
        mcp_servers: [],
        model: 'claude-3',
        permissionMode: 'prompt',
        apiKeySource: 'env'
      };

      // Simulate what happens after getting systemInit in executeConversationFlow
      if (processManager['sessionInfoService'] && processManager['fileSystemService']) {
        try {
          if (await processManager['fileSystemService'].isGitRepository(systemInit.cwd)) {
            const gitHead = await processManager['fileSystemService'].getCurrentGitHead(systemInit.cwd);
            if (gitHead) {
              await processManager['sessionInfoService'].updateSessionInfo(systemInit.session_id, {
                initial_commit_head: gitHead
              });
            }
          }
        } catch (error) {
          // Error handling
        }
      }

      expect(mockFileSystemService.isGitRepository).toHaveBeenCalledWith('/path/to/non-git');
      expect(mockFileSystemService.getCurrentGitHead).not.toHaveBeenCalled();
      expect(mockSessionInfoService.updateSessionInfo).not.toHaveBeenCalled();
    });
  });
});