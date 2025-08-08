# Testing Architecture

This directory contains comprehensive test coverage for CUI services.

## Testing Philosophy

- **Prefer real implementations** over mocks when testing (per project guidelines)
- **Comprehensive unit test coverage** for all services (90%+ target)
- **Mock Claude CLI** using `tests/__mocks__/claude` script for consistent testing
- **Silent logging** in tests (LOG_LEVEL=silent) to reduce noise

## Test Structure

```
tests/
├── __mocks__
│   └── claude
├── integration
│   ├── conversation-status-integration.test.ts
│   ├── real-claude-integration.test.ts
│   └── streaming-integration.test.ts
├── setup.ts
├── unit
│   ├── cui-server.test.ts
│   ├── claude-history-reader.test.ts
│   ├── claude-process-long-running.test.ts
│   ├── claude-process-manager.test.ts
│   ├── cli
│   │   ├── get.test.ts
│   │   ├── list.test.ts
│   │   ├── serve.test.ts
│   │   ├── status-simple.test.ts
│   │   ├── status-working.test.ts
│   │   └── status.test.ts
│   ├── conversation-status-tracker.test.ts
│   ├── json-lines-parser.test.ts
│   └── stream-manager.test.ts
└── utils
    └── test-helpers.ts
```

## Mock Claude CLI

The project includes a mock Claude CLI (`tests/__mocks__/claude`) that:
- Simulates real Claude CLI behavior for testing
- Outputs valid JSONL stream format
- Supports various command line arguments
- Enables testing without requiring actual Claude CLI installation

## Testing Patterns

```typescript
// Integration test pattern with mock Claude CLI
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

// Server setup with random port to avoid conflicts
const serverPort = 9000 + Math.floor(Math.random() * 1000);
const server = new CUIServer({ port: serverPort });

// Override ProcessManager with mock path
const mockClaudePath = getMockClaudeExecutablePath();
const { ClaudeProcessManager } = await import('@/services/claude-process-manager');
(server as any).processManager = new ClaudeProcessManager(mockClaudePath);
```

## Test Configuration

- **Vitest** for fast and modern testing with TypeScript support
- **Path mapping** using `@/` aliases matching source structure

## Test Commands

```bash
# Run specific test files
npm test -- claude-process-manager.test.ts
npm test -- tests/unit/

# Run tests matching a pattern
npm test -- --testNamePattern="should start conversation"

# Run unit tests only
npm run unit-tests

# Run integration tests only
npm run integration-tests

# Run with coverage
npm run test:coverage
```

## Development Practices

- **Meaningful test names** and comprehensive test coverage
- **Silent logging** in tests (LOG_LEVEL=silent) to reduce noise
- **Random ports** for server tests to avoid conflicts
- **Proper cleanup** of resources and processes in tests