import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Setup environment variables for testing
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/agent_server_test';
  process.env.MASTRA_JWT_SECRET = process.env.MASTRA_JWT_SECRET || 'test-secret-key-for-testing-only';
  process.env.TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'http://localhost:4111';
  process.env.CLIENT_ID = process.env.CLIENT_ID || 'test-client';
  process.env.CLIENT_SECRET = process.env.CLIENT_SECRET || 'test-secret';
  process.env.MANAGEMENT_CLIENT_ID = process.env.MANAGEMENT_CLIENT_ID || 'test-management-client';
  process.env.MANAGEMENT_CLIENT_SECRET = process.env.MANAGEMENT_CLIENT_SECRET || 'test-management-secret';
});

// Clean up after all tests
afterAll(() => {
  // Cleanup resources if needed
});

// Reset any mocks before each test
beforeEach(() => {
  // Reset any global state or mocks
});

// Clean up after each test
afterEach(() => {
  // Clean up any test-specific state
});
