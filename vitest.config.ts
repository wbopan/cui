import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
        '!src/web/**/*'
      ],
      thresholds: {
        lines: 75,
        functions: 80,
        branches: 60,
        statements: 75
      }
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modelcontextprotocol/sdk/server/index.js': path.resolve(__dirname, './tests/__mocks__/mcp-server-mock.ts'),
      '@modelcontextprotocol/sdk/server/stdio.js': path.resolve(__dirname, './tests/__mocks__/mcp-stdio-mock.ts')
    }
  }
});