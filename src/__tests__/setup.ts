import { config } from 'dotenv';
import { beforeEach, afterEach, vi } from 'vitest';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods for cleaner test output
const originalConsole = { ...console };

beforeEach(() => {
  // Mock console.log, console.warn, console.error for tests unless DEBUG is set
  if (!process.env.DEBUG) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterEach(() => {
  // Restore console methods
  if (!process.env.DEBUG) {
    vi.restoreAllMocks();
  }
});

// Mock environment variables for testing
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.MANAGEMENT_CLIENT_ID = process.env.MANAGEMENT_CLIENT_ID || 'test-admin-client';
process.env.MANAGEMENT_CLIENT_SECRET = process.env.MANAGEMENT_CLIENT_SECRET || 'test-admin-secret';
process.env.MASTRA_JWT_SECRET = process.env.MASTRA_JWT_SECRET || 'test-jwt-secret';
process.env.TOKEN_SERVICE_PRIVATE_KEY = process.env.TOKEN_SERVICE_PRIVATE_KEY || JSON.stringify({
  kty: 'OKP',
  crv: 'Ed25519',
  d: 'test-private-key',
  x: 'test-public-key',
  kid: 'test-key-id'
});
process.env.TOKEN_SERVICE_PUBLIC_KEY = process.env.TOKEN_SERVICE_PUBLIC_KEY || JSON.stringify({
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'test-public-key',
  kid: 'test-key-id'
});
