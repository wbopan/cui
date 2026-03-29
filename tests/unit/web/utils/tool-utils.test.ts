import { formatFilePath } from '@/web/chat/utils/tool-utils';

describe('formatFilePath', () => {
  it('returns relative path when inside working directory', () => {
    expect(formatFilePath('/home/user/project/src/index.ts', '/home/user/project'))
      .toBe('./src/index.ts');
  });

  it('does not collapse sibling directories that only share a prefix', () => {
    expect(formatFilePath('/home/user/project-other/file.ts', '/home/user/project'))
      .toBe('~/user/project-other/file.ts');
  });

  it('handles windows-style paths with trailing slashes', () => {
    expect(formatFilePath('C:/workspace/app/src/main.ts', 'C:/workspace/app/'))
      .toBe('./src/main.ts');
    expect(formatFilePath('C:/workspace/app-logs/output.log', 'C:/workspace/app/'))
      .toBe('C:/workspace/app-logs/output.log');
  });
});
