# Testing Guide - Agent Server

This guide covers the testing setup and best practices for the agent server project.

## Testing Framework

We use **Vitest** as our testing framework, which provides:
- Fast test execution with ESM support
- Built-in TypeScript support
- Jest-compatible API
- Excellent coverage reporting
- Watch mode for development

## Setup

### Prerequisites
```bash
npm install
```

### Environment Variables
Copy the test environment variables from `test/setup.ts` or create a `.env.test` file:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/agent_server_test
MASTRA_JWT_SECRET=test-secret-key-for-testing-only
TOKEN_SERVICE_URL=http://localhost:4111
CLIENT_ID=test-client
CLIENT_SECRET=test-secret
MANAGEMENT_CLIENT_ID=test-management-client
MANAGEMENT_CLIENT_SECRET=test-management-secret
```

## Running Tests

### Basic Commands
```bash
# Run all tests once
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI interface
npm run test:ui
```

### Test Structure
```
src/
├── auth/
│   ├── signAssertion.ts
│   ├── signAssertion.test.ts
│   ├── verifyAssertion.ts
│   └── verifyAssertion.test.ts
├── mastra/
│   ├── services/
│   │   ├── dynamic-loader.ts
│   │   ├── dynamic-loader.test.ts
│   │   ├── rag-service.ts
│   │   └── rag-service.test.ts
│   ├── utils.ts
│   └── utils.test.ts
test/
├── setup.ts              # Test configuration and global setup
└── fixtures/             # Test data and helpers
```

## Writing Tests

### Test File Naming
- Test files should end with `.test.ts` or `.test.js`
- Place test files next to the source files they test
- Use descriptive test names that explain the behavior being tested

### Example Test Structure
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { functionToTest } from './module';

// Mock dependencies
vi.mock('external-dependency');

describe('functionToTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle valid input correctly', () => {
    const result = functionToTest('valid input');
    expect(result).toBe('expected output');
  });

  it('should throw error for invalid input', () => {
    expect(() => functionToTest(null)).toThrow('Invalid input');
  });
});
```

### Testing Best Practices

1. **Arrange, Act, Assert**: Structure your tests clearly
2. **Mock External Dependencies**: Use `vi.mock()` for external services
3. **Test Edge Cases**: Include error conditions and boundary cases
4. **Use Descriptive Names**: Test names should explain what they verify
5. **Keep Tests Isolated**: Each test should be independent
6. **Clean Up**: Use `beforeEach`/`afterEach` to reset state

### Mocking Guidelines

#### Environment Variables
```typescript
beforeEach(() => {
  process.env.TEST_VAR = 'test-value';
});
```

#### External APIs
```typescript
vi.mock('node:fetch', () => ({
  default: vi.fn(),
}));

const mockFetch = vi.mocked(fetch);
mockFetch.mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: 'test' }),
});
```

#### Database Calls
```typescript
vi.mock('@mastra/pg', () => ({
  PostgresStore: vi.fn().mockImplementation(() => ({
    db: {
      manyOrNone: vi.fn(),
      oneOrNone: vi.fn(),
    },
  })),
}));
```

## Coverage Requirements

We maintain a minimum coverage threshold of 80% for:
- Statements
- Branches
- Functions
- Lines

Coverage reports are generated in `coverage/` directory with HTML reports for easy viewing.

## CI/CD Integration

Tests are automatically run in CI/CD pipelines. Ensure all tests pass before merging:

```bash
# This should pass before committing
npm run test:coverage
```

## Debugging Tests

### VS Code Integration
Add this to your `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/vitest",
  "args": ["run", "--reporter=verbose"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen",
  "env": {
    "NODE_ENV": "test"
  }
}
```

### Debug Specific Tests
```bash
# Run specific test file
npm test -- auth/verifyAssertion.test.ts

# Run tests matching pattern
npm test -- --grep "should handle errors"
```

## Common Testing Patterns

### Testing Async Functions
```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Testing Error Conditions
```typescript
it('should throw error for invalid input', async () => {
  await expect(functionThatThrows()).rejects.toThrow('Expected error message');
});
```

### Testing API Routes
```typescript
it('should return 200 for valid request', async () => {
  const response = await request(app)
    .get('/api/endpoint')
    .expect(200);
  
  expect(response.body).toHaveProperty('data');
});
```

## Troubleshooting

### Common Issues

1. **Module Import Errors**: Ensure `vitest.config.ts` has correct path aliases
2. **Environment Variables**: Check `test/setup.ts` for required variables
3. **Database Connection**: Use test database URL in tests
4. **Async/Await**: Don't forget to await async functions in tests

### Getting Help

- Check Vitest documentation: https://vitest.dev/
- Review existing test files for patterns
- Run tests with `--reporter=verbose` for detailed output
