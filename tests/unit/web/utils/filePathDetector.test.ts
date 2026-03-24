import { describe, it, expect } from 'vitest';
import {
  extractFilePathsFromMessage,
  extractFilePathsFromConversation,
  getUniqueFilePaths,
  type DetectedFile
} from '@/web/utils/filePathDetector.js';

describe('filePathDetector', () => {
  describe('extractFilePathsFromMessage', () => {
    it('should extract file paths from Write tool use', () => {
      const message = {
        uuid: 'msg-1',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/home/user/test.ts' }
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/home/user/test.ts');
      expect(files[0].filename).toBe('test.ts');
      expect(files[0].toolUses).toHaveLength(1);
      expect(files[0].toolUses[0].tool).toBe('Write');
    });

    it('should extract file paths from Edit tool use', () => {
      const message = {
        uuid: 'msg-2',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/home/user/config.json' }
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/home/user/config.json');
    });

    it('should extract notebook paths from NotebookEdit tool use', () => {
      const message = {
        uuid: 'msg-3',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'NotebookEdit',
              input: { notebook_path: '/home/user/analysis.ipynb' }
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/home/user/analysis.ipynb');
    });

    it('should extract Windows paths from tool use', () => {
      const message = {
        uuid: 'msg-4',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: 'C:\\Users\\test\\file.txt' }
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('C:\\Users\\test\\file.txt');
    });

    it('should extract paths from text content with standard paths', () => {
      const message = {
        uuid: 'msg-5',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'I edited /home/user/src/app.ts to add functionality'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/home/user/src/app.ts');
    });

    it('should extract paths with spaces when quoted', () => {
      const message = {
        uuid: 'msg-6',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Modified "/home/user/My Documents/report.pdf" successfully'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/home/user/My Documents/report.pdf');
    });

    it('should extract paths with parentheses and brackets', () => {
      const message = {
        uuid: 'msg-7',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Check /home/user/projects/app-v2/src/[id].tsx for details'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files.length).toBeGreaterThanOrEqual(1);
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/projects/app-v2/src/[id].tsx');
    });

    it('should extract dotfiles', () => {
      const message = {
        uuid: 'msg-8',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Updated /home/user/project/.gitignore and /home/user/project/.eslintrc.json'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files.length).toBeGreaterThanOrEqual(2);
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/project/.gitignore');
      expect(paths).toContain('/home/user/project/.eslintrc.json');
    });

    it('should extract files without extensions (uppercase constants)', () => {
      const message = {
        uuid: 'msg-9',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Check /home/user/project/README and /home/user/project/LICENSE files'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files.length).toBeGreaterThanOrEqual(2);
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/project/README');
      expect(paths).toContain('/home/user/project/LICENSE');
    });

    it('should NOT extract URLs', () => {
      const message = {
        uuid: 'msg-10',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Visit https://example.com/path/to/file.js or http://test.com/index.html'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      const paths = files.map(f => f.path);
      expect(paths).not.toContain('https://example.com/path/to/file.js');
      expect(paths).not.toContain('http://test.com/index.html');
    });

    it('should NOT extract version numbers', () => {
      const message = {
        uuid: 'msg-11',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Updated to version /1.0.0/ and /v2.3.4/'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      const paths = files.map(f => f.path);
      expect(paths).not.toContain('/1.0.0/');
      expect(paths).not.toContain('/v2.3.4/');
    });

    it('should NOT extract single-level system paths', () => {
      const message = {
        uuid: 'msg-12',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Check /usr and /bin directories'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      const paths = files.map(f => f.path);
      expect(paths).not.toContain('/usr');
      expect(paths).not.toContain('/bin');
    });

    it('should handle multiple paths in one message', () => {
      const message = {
        uuid: 'msg-13',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Modified /home/user/src/app.ts and /home/user/src/utils.ts'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files.length).toBeGreaterThanOrEqual(2);
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/src/app.ts');
      expect(paths).toContain('/home/user/src/utils.ts');
    });

    it('should filter paths by conversation cwd', () => {
      const message = {
        uuid: 'msg-14',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'text',
              text: 'Modified /home/user/project/src/app.ts and /other/path/file.js'
            }
          ]
        },
        cwd: '/home/user/project'
      };

      const files = extractFilePathsFromMessage(message, '/home/user/project');
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/project/src/app.ts');
      expect(paths).not.toContain('/other/path/file.js');
    });

    it('should return empty array for system messages', () => {
      const message = {
        uuid: 'msg-15',
        type: 'system' as const,
        message: {
          content: [
            {
              type: 'text',
              text: '/home/user/test.ts'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(0);
    });

    it('should handle messages without content', () => {
      const message = {
        uuid: 'msg-16',
        type: 'assistant' as const,
        message: {}
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(0);
    });

    it('should deduplicate paths within same message', () => {
      const message = {
        uuid: 'msg-17',
        type: 'assistant' as const,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/home/user/test.ts' }
            },
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/home/user/test.ts' }
            },
            {
              type: 'text',
              text: 'Modified /home/user/test.ts'
            }
          ]
        }
      };

      const files = extractFilePathsFromMessage(message);
      expect(files).toHaveLength(1);
      expect(files[0].toolUses).toHaveLength(2);
      expect(files[0].mentionedIn).toHaveLength(1);
    });
  });

  describe('extractFilePathsFromConversation', () => {
    it('should extract files from multiple messages', () => {
      const messages = [
        {
          uuid: 'msg-1',
          type: 'assistant' as const,
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Write',
                input: { file_path: '/home/user/file1.ts' }
              }
            ]
          },
          cwd: '/home/user'
        },
        {
          uuid: 'msg-2',
          type: 'assistant' as const,
          message: {
            content: [
              {
                type: 'text',
                text: 'Also created /home/user/file2.ts'
              }
            ]
          },
          cwd: '/home/user'
        }
      ];

      const files = extractFilePathsFromConversation(messages);
      expect(files.length).toBeGreaterThanOrEqual(2);
      const paths = files.map(f => f.path);
      expect(paths).toContain('/home/user/file1.ts');
      expect(paths).toContain('/home/user/file2.ts');
    });

    it('should merge duplicate files across messages', () => {
      const messages = [
        {
          uuid: 'msg-1',
          type: 'assistant' as const,
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Write',
                input: { file_path: '/home/user/test.ts' }
              }
            ]
          },
          cwd: '/home/user'
        },
        {
          uuid: 'msg-2',
          type: 'assistant' as const,
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: { file_path: '/home/user/test.ts' }
              }
            ]
          },
          cwd: '/home/user'
        }
      ];

      const files = extractFilePathsFromConversation(messages);
      expect(files).toHaveLength(1);
      expect(files[0].mentionedIn).toHaveLength(2);
      expect(files[0].mentionedIn).toContain('msg-1');
      expect(files[0].mentionedIn).toContain('msg-2');
      expect(files[0].toolUses).toHaveLength(2);
    });

    it('should use first message cwd for conversation', () => {
      const messages = [
        {
          uuid: 'msg-1',
          type: 'assistant' as const,
          message: {
            content: [
              {
                type: 'text',
                text: 'Working in /home/user/project/src/app.ts'
              }
            ]
          },
          cwd: '/home/user/project'
        }
      ];

      const files = extractFilePathsFromConversation(messages);
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUniqueFilePaths', () => {
    it('should return unique file paths', () => {
      const files: DetectedFile[] = [
        {
          path: '/home/user/file1.ts',
          filename: 'file1.ts',
          mentionedIn: ['msg-1'],
          toolUses: []
        },
        {
          path: '/home/user/file2.ts',
          filename: 'file2.ts',
          mentionedIn: ['msg-2'],
          toolUses: []
        },
        {
          path: '/home/user/file1.ts',
          filename: 'file1.ts',
          mentionedIn: ['msg-3'],
          toolUses: []
        }
      ];

      const uniquePaths = getUniqueFilePaths(files);
      expect(uniquePaths).toHaveLength(2);
      expect(uniquePaths).toContain('/home/user/file1.ts');
      expect(uniquePaths).toContain('/home/user/file2.ts');
    });
  });
});
