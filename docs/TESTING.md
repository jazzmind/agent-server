# Testing Guide

This document describes the testing strategy and setup for the Agent Server.

## Overview

The project uses **Vitest** as the testing framework, providing:
- Fast test execution with native ESM support
- Built-in TypeScript support
- Coverage reporting with v8
- Watch mode for development
- UI mode for interactive testing

## Test Structure

```
src/__tests__/
├── setup.ts                    # Global test setup and configuration
├── auth/
│   └── auth-routes.test.ts     # Unit tests for authentication routes
├── services/
│   ├── rag-service.test.ts     # Unit tests for RAG service
│   ├── dynamic-loader.test.ts  # Unit tests for dynamic loader
│   └── mcp-server-service.test.ts
└── integration/
    └── auth-integration.test.ts # Integration tests with real database
```

## Test Categories

### Unit Tests
- **Location**: `src/__tests__/auth/`, `src/__tests__/services/`
- **Purpose**: Test individual functions and classes in isolation
- **Mocking**: External dependencies are mocked (database, APIs, etc.)
- **Speed**: Fast execution

### Integration Tests
- **Location**: `src/__tests__/integration/`
- **Purpose**: Test components working together with real dependencies
- **Database**: Uses test database (separate from development/production)
- **Speed**: Slower but more comprehensive

## Running Tests

### Prerequisites

1. **Test Database Setup** (for integration tests):
   ```bash
   # Create test database
   createdb agent_server_test
   
   # Or using Docker
   docker run -d \
     --name postgres-test \
     -e POSTGRES_USER=test \
     -e POSTGRES_PASSWORD=test \
     -e POSTGRES_DB=agent_server_test \
     -p 5433:5432 \
     postgres:15
   ```

2. **Environment Configuration**:
   ```bash
   # Copy example test environment
   cp env.test.example .env.test
   
   # Update test database URL if needed
   DATABASE_URL=postgresql://test:test@localhost:5433/agent_server_test
   ```

### Test Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui

# Run only unit tests
npm test -- --run src/__tests__/auth src/__tests__/services

# Run only integration tests
npm test -- --run src/__tests__/integration

# Run specific test file
npm test -- --run src/__tests__/auth/auth-routes.test.ts

# Run tests matching pattern
npm test -- --run --grep "verifyManagementClient"
```

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,           // Use global test functions (describe, it, expect)
    environment: 'node',     // Node.js environment
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,      // 30-second timeout for slow tests
    coverage: {
      provider: 'v8',        // Fast native coverage
      thresholds: {
        global: {
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85,
        }
      }
    }
  }
});
```

### Global Setup (`src/__tests__/setup.ts`)

- Loads test environment variables from `.env.test`
- Sets up test environment
- Mocks console output (unless `DEBUG=true`)
- Configures default test environment variables

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, vi } from 'vitest';
import { verifyManagementClient } from '../../mastra/auth/auth-routes';

describe('verifyManagementClient', () => {
  it('should verify valid credentials', async () => {
    process.env.MANAGEMENT_CLIENT_ID = 'test-id';
    process.env.MANAGEMENT_CLIENT_SECRET = 'test-secret';
    
    const result = await verifyManagementClient('test-id', 'test-secret');
    expect(result).toBe(true);
  });
  
  it('should reject invalid credentials', async () => {
    await expect(
      verifyManagementClient('wrong-id', 'wrong-secret')
    ).rejects.toThrow('Invalid management client credentials');
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgresStore } from '@mastra/pg';

describe('Database Integration', () => {
  let pgStore: PostgresStore;
  
  beforeAll(async () => {
    pgStore = new PostgresStore({
      connectionString: process.env.DATABASE_URL!
    });
    await pgStore.init();
  });
  
  afterAll(async () => {
    // Cleanup test data
  });
  
  it('should store and retrieve data', async () => {
    // Test with real database
  });
});
```

### Mocking Dependencies

```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('@mastra/pg', () => ({
  PostgresStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    db: {
      one: vi.fn().mockResolvedValue({ id: 'test-id' }),
      manyOrNone: vi.fn().mockResolvedValue([]),
    },
  })),
}));

// Mock specific function
const mockFunction = vi.fn().mockResolvedValue('mocked-result');
vi.spyOn(someModule, 'someFunction').mockImplementation(mockFunction);
```

## Best Practices

### Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names that explain the expected behavior
- Follow the "Arrange, Act, Assert" pattern

### Test Data
- Use minimal test data that covers the test case
- Clean up test data after each test
- Use factories or builders for complex test objects

### Assertions
- Be specific with assertions
- Test both success and error cases
- Verify side effects (database changes, API calls, etc.)

### Async Testing
- Always use `async/await` for asynchronous operations
- Don't forget to `await` assertions for async functions
- Use appropriate timeouts for slow operations

### Environment Isolation
- Tests should not depend on external services in production
- Use separate test database
- Mock external API calls
- Reset state between tests

## Coverage Goals

- **Lines**: 85% minimum
- **Functions**: 85% minimum
- **Branches**: 80% minimum
- **Statements**: 85% minimum

### Excluded from Coverage
- Type definition files (`.d.ts`)
- Configuration files
- Test files themselves
- Index files that only re-export

## Debugging Tests

### Debug Individual Test
```bash
# Run single test with debug output
DEBUG=true npm test -- --run src/__tests__/auth/auth-routes.test.ts

# Run with Node.js debugger
node --inspect-brk ./node_modules/.bin/vitest --run <test-file>
```

### Debug Database Issues
```bash
# Check test database connection
psql postgresql://test:test@localhost:5433/agent_server_test

# View test logs
DEBUG=true npm test -- --run src/__tests__/integration/
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Release builds

### CI Configuration Requirements
- Test database available
- Environment variables configured
- Node.js 20+ installed
- Coverage thresholds must pass

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify test database is running
   - Check connection string in `.env.test`
   - Ensure database user has proper permissions

2. **Mock Import Errors**
   - Check that mocked modules exist
   - Verify import paths are correct
   - Ensure mocks are defined before imports

3. **Timeout Errors**
   - Increase test timeout in vitest config
   - Check for hanging promises
   - Verify async operations complete

4. **Coverage Issues**
   - Check that all code paths are tested
   - Add tests for error conditions
   - Verify mocks don't hide untested code

### Getting Help

- Check Vitest documentation: https://vitest.dev/
- Review existing tests for patterns
- Ask team members for guidance on complex scenarios
