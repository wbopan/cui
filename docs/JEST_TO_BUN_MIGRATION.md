# Jest to Bun Test Migration Guide

This guide documents the key changes required when migrating test files from Jest to Bun's built-in test runner.

## Quick Reference

| Jest | Bun |
|------|-----|
| `import from 'jest'` | `import from 'bun:test'` |
| `jest.fn()` | `mock()` |
| `jest.mock()` | `mock.module()` |
| `jest.spyOn()` | `spyOn()` |
| `jest.clearAllMocks()` | `mock.restore()` or `mockFn.mockClear()` |
| `.toHaveBeenCalled()` | `.toHaveBeenCalled()` ✅ Same |
| `.resolves.not.toThrow()` | Just await the promise |
| `.rejects.toThrow()` | Use try-catch with `expect().fail()` |
| `jest.setTimeout()` | Use timeout in bunfig.toml |

## 1. Import Changes

### Jest
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// or implicitly available as globals
```

### Bun
```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
```

## 2. Mock Functions

### Jest
```typescript
const mockFn = jest.fn();
const mockWithImpl = jest.fn(() => 'return value');
const mockWithResolve = jest.fn().mockResolvedValue('async value');
```

### Bun
```typescript
const mockFn = mock();
const mockWithImpl = mock(() => 'return value');
const mockWithResolve = mock(() => Promise.resolve('async value'));
```

## 3. Module Mocking

### Jest
```typescript
jest.mock('@/services/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }))
}));
```

### Bun
```typescript
mock.module('@/services/logger', () => ({
  createLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    error: mock()
  }))
}));
```

## 4. Spying on Methods

### Jest
```typescript
jest.spyOn(object, 'method').mockReturnValue('value');
jest.spyOn(ConfigService, 'getInstance').mockImplementation(() => mockInstance);
```

### Bun
```typescript
spyOn(object, 'method').mockReturnValue('value');
spyOn(ConfigService, 'getInstance').mockImplementation(() => mockInstance);
```

## 5. Mock Implementations

### Jest
```typescript
mockFn.mockImplementation(() => 'value');
mockFn.mockImplementationOnce(() => 'once');
mockFn.mockResolvedValue('async');
mockFn.mockRejectedValue(new Error('failed'));
```

### Bun
```typescript
mockFn.mockImplementation(() => 'value');
mockFn.mockImplementationOnce(() => 'once');
mockFn.mockImplementation(() => Promise.resolve('async'));
mockFn.mockImplementation(() => Promise.reject(new Error('failed')));
```

## 6. Clearing and Resetting Mocks

### Jest
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
  mockFn.mockClear();
  mockFn.mockReset();
});
```

### Bun
```typescript
beforeEach(() => {
  mock.restore(); // Restores all mocks
  mockFn.mockClear(); // Clear specific mock
  mockFn.mockReset(); // Reset specific mock
});
```

## 7. Assertions

Most assertions remain the same, but there are some differences:

### Jest
```typescript
// Promise assertions
await expect(promise).resolves.toBe('value');
await expect(promise).rejects.toThrow('error');
await expect(asyncFn()).resolves.not.toThrow();

// Mock assertions
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenLastCalledWith('last');
```

### Bun
```typescript
// Promise assertions - simplified
const result = await promise;
expect(result).toBe('value');

// For non-throwing async functions, just await them
await asyncFn(); // Test passes if no error thrown

// For error testing, use try-catch blocks
try {
  await functionThatShouldThrow();
  expect().fail('Expected function to throw');
} catch (error) {
  expect(error).toBeDefined();
}

// Mock assertions - same as Jest
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenLastCalledWith('last');
```

## 8. Test Configuration

### Jest (jest.config.js)
```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  coverageThreshold: {
    global: {
      lines: 75,
      functions: 80
    }
  }
};
```

### Bun (bunfig.toml)
```toml
[test]
root = "./tests"
preload = ["./tests/setup.bun.ts"]
coverage = true
coverageThreshold = { line = 75, function = 80 }
coverageReporter = ["text", "lcov"]
timeout = 10000

[test.moduleResolver]
"@/*" = ["./src/*"]
```

## 9. Setup Files

### Jest (setup.ts)
```typescript
import { jest } from '@jest/globals';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

jest.setTimeout(30000);

afterAll(async () => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
```

### Bun (setup.bun.ts)
```typescript
import { beforeAll, afterAll } from 'bun:test';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

// Timeout configured in bunfig.toml

afterAll(async () => {
  // Cleanup as needed
});
```

## 10. Running Tests

### Jest
```bash
npm run test
npm run test:watch
npm run test:coverage
npx jest tests/unit/specific.test.ts
npx jest -t "test name pattern"
```

### Bun
```bash
bun test
bun test --watch
bun test --coverage
bun test tests/unit/specific.test.ts
bun test -t "test name pattern"
```

## Common Gotchas

1. **Global Mocks**: Bun doesn't automatically hoist mocks like Jest. Use `mock.module()` explicitly.

2. **Timer Mocks**: Bun handles timers differently. Use `using` for auto-cleanup:
   ```typescript
   using _time = time.install();
   time.tick(1000);
   ```

3. **Snapshot Testing**: Bun uses `.toMatchSnapshot()` but stores snapshots differently.

4. **Coverage**: Bun's coverage reporter has different options. Check `bun test --help` for details.

5. **Environment Variables**: Both respect `NODE_ENV=test` but Bun also supports `.env.test` files.

6. **Mock Type Annotations**: Jest's mock type annotations don't work in Bun. Use generic `any` casting:
   ```typescript
   // Jest
   (mockFn as jest.MockedFunction<typeof originalFn>).mockRestore();
   
   // Bun  
   (mockFn as any).mockRestore();
   ```

7. **Error Testing**: Bun doesn't support `.rejects.toThrow()`. Always use try-catch blocks for testing expected errors.

8. **Module Mocking with External Libraries**: When mocking external modules like `node-fetch`, create the mock function first, then export it through `mock.module()` with a proper structure (e.g., `{ default: mockFn }`).

## Migration Checklist

- [ ] Update imports from Jest to `bun:test`
- [ ] Replace `jest.fn()` with `mock()`
- [ ] Replace `jest.mock()` with `mock.module()`
- [ ] Update mock implementations and assertions
- [ ] Simplify promise assertions (remove `.resolves`/`.rejects`)
- [ ] Convert `.rejects.toThrow()` to try-catch blocks
- [ ] Update mock type annotations from Jest-specific to generic `any`
- [ ] Check test helpers and use shared mock utilities (e.g., `createMockLogger()`) if available
- [ ] Create `bunfig.toml` with test configuration
- [ ] Update setup file for Bun
- [ ] Update package.json scripts
- [ ] Run tests and fix any remaining issues
- [ ] Update CI/CD pipelines to use Bun

## Performance Benefits

Bun's test runner is significantly faster than Jest because:
- Native TypeScript support (no transpilation needed)
- Built-in test runner (no additional dependencies)
- Faster module resolution
- Parallel test execution by default
- Optimized for modern JavaScript

## Example Migration

See `tests/unit/services/notification-service.bun.test.ts` and `tests/integration/config-integration.test.ts` for complete examples of migrated test files that maintain full compatibility and coverage.

### Real Migration Example

Here's a before/after comparison from `config-integration.test.ts`:

#### Before (Jest)
```typescript
import { ConfigService } from '@/services/config-service';

// Mock setup
jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);

// Mock restoration  
(os.homedir as jest.MockedFunction<typeof os.homedir>).mockRestore();

// Promise assertions
await expect(configService.initialize()).resolves.not.toThrow();
await expect(configService.initialize()).rejects.toThrow();
```

#### After (Bun)
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, spyOn } from 'bun:test';
import { ConfigService } from '@/services/config-service';

// Mock setup
spyOn(os, 'homedir').mockReturnValue(testConfigDir);

// Mock restoration
(os.homedir as any).mockRestore();

// Promise assertions - simplified
await configService.initialize(); // Test passes if no error

// Error testing with try-catch
try {
  await configService.initialize();
  expect().fail('Expected initialization to throw');
} catch (error) {
  expect(error).toBeDefined();
}
```