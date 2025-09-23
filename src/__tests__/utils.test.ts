import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeJWTPayload, getAccessToken } from '../mastra/utils/utils';

// Mock fetch globally
global.fetch = vi.fn();

describe('utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('decodeJWTPayload', () => {
    it('should decode a valid JWT payload', () => {
      // Create a simple JWT-like token for testing
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { sub: 'test', exp: Math.floor(Date.now() / 1000) + 3600 };
      const signature = 'signature';
      
      const token = [
        Buffer.from(JSON.stringify(header)).toString('base64url'),
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
        signature
      ].join('.');

      const decoded = decodeJWTPayload(token);
      expect(decoded).toEqual(payload);
    });

    it('should return null for invalid token', () => {
      expect(decodeJWTPayload('invalid')).toBeNull();
      expect(decodeJWTPayload('')).toBeNull();
      expect(decodeJWTPayload('a.b')).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    beforeEach(() => {
      // Set required environment variables
      process.env.CLIENT_SECRET = 'test-secret';
      process.env.TOKEN_SERVICE_URL = 'http://localhost:4111';
    });

    it('should throw error when CLIENT_SECRET is missing', async () => {
      delete process.env.CLIENT_SECRET;
      
      await expect(getAccessToken('test-client', 'test-audience', ['scope1']))
        .rejects.toThrow('CLIENT_SECRET environment variable is required');
    });

    it('should throw error when TOKEN_SERVICE_URL is missing', async () => {
      delete process.env.TOKEN_SERVICE_URL;
      
      await expect(getAccessToken('test-client', 'test-audience', ['scope1']))
        .rejects.toThrow('TOKEN_SERVICE_URL environment variable is required');
    });

    it('should make a successful token request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);

      const token = await getAccessToken('test-client', 'test-audience', ['scope1']);
      
      expect(token).toBe('test-token');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4111/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );
    });

    it('should handle token request failure', async () => {
      const mockResponse = {
        ok: false,
        json: vi.fn().mockResolvedValue({
          error: 'invalid_client',
          error_description: 'Client not found'
        })
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(getAccessToken('test-client', 'test-audience', ['scope1']))
        .rejects.toThrow('Token request failed: invalid_client - Client not found');
    });
  });
});
