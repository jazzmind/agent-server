import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyAdminClient } from '../../mastra/auth/auth-utils';

describe('Auth Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_CLIENT_ID: 'test-admin',
      ADMIN_CLIENT_SECRET: 'test-secret'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyAdminClient', () => {
    it('should verify valid admin client credentials', async () => {
      const result = await verifyAdminClient('test-admin', 'test-secret');
      expect(result).toBe(true);
    });

    it('should reject invalid admin client ID', async () => {
      await expect(
        verifyAdminClient('wrong-admin', 'test-secret')
      ).rejects.toThrow('Invalid admin client credentials');
    });

    it('should reject invalid admin client secret', async () => {
      await expect(
        verifyAdminClient('test-admin', 'wrong-secret')
      ).rejects.toThrow('Invalid admin client credentials');
    });

    it('should throw error when environment variables are not set', async () => {
      delete process.env.ADMIN_CLIENT_ID;
      delete process.env.ADMIN_CLIENT_SECRET;

      await expect(
        verifyAdminClient('test-admin', 'test-secret')
      ).rejects.toThrow('admin client credentials not configured');
    });

    it('should throw error when only admin client ID is set', async () => {
      delete process.env.ADMIN_CLIENT_SECRET;

      await expect(
        verifyAdminClient('test-admin', 'test-secret')
      ).rejects.toThrow('admin client credentials not configured');
    });

    it('should throw error when only client secret is set', async () => {
      delete process.env.ADMIN_CLIENT_ID;

      await expect(
        verifyAdminClient('test-admin', 'test-secret')
      ).rejects.toThrow('admin client credentials not configured');
    });
  });
});
