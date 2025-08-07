export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/web/**/*'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      lines: 75,
      functions: 80,
      branches: 60,
      statements: 75
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modelcontextprotocol/sdk/server/index.js$': '<rootDir>/tests/__mocks__/mcp-server-mock.ts',
    '^@modelcontextprotocol/sdk/server/stdio.js$': '<rootDir>/tests/__mocks__/mcp-stdio-mock.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  // Run integration tests serially to avoid resource conflicts
  maxWorkers: 1,
  // Transform ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(@google/genai|undici)/)'
  ],
  // Handle ES modules properly
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }]
  }
};