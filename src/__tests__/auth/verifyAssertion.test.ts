import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeVerifier, makeAccessTokenVerifier } from '../../auth/verifyAssertion';

// Mock jose library
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn()
}));

describe('verifyAssertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('makeVerifier', () => {
    it('should create a verifier function', () => {
      const verifier = makeVerifier('http://example.com/jwks', 'test-audience');
      expect(typeof verifier).toBe('function');
    });

    it('should throw error for missing bearer token', async () => {
      const verifier = makeVerifier('http://example.com/jwks', 'test-audience');
      
      await expect(verifier()).rejects.toThrow('Missing bearer token');
      await expect(verifier('')).rejects.toThrow('Missing bearer token');
      await expect(verifier('Token xyz')).rejects.toThrow('Missing bearer token');
    });
  });

  describe('makeAccessTokenVerifier', () => {
    it('should create an access token verifier function', () => {
      const verifier = makeAccessTokenVerifier('http://example.com/jwks', 'test-audience');
      expect(typeof verifier).toBe('function');
    });

    it('should throw error for missing bearer token', async () => {
      const verifier = makeAccessTokenVerifier('http://example.com/jwks', 'test-audience');
      
      await expect(verifier()).rejects.toThrow('Missing bearer token');
      await expect(verifier('')).rejects.toThrow('Missing bearer token');
      await expect(verifier('Token xyz')).rejects.toThrow('Missing bearer token');
    });
  });
});
