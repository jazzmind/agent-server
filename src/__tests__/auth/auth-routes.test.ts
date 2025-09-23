import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyManagementClient } from '../../mastra/auth/auth-utils';

describe('Auth Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MANAGEMENT_CLIENT_ID: 'test-admin',
      MANAGEMENT_CLIENT_SECRET: 'test-secret'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyManagementClient', () => {
    it('should verify valid management client credentials', async () => {
      const result = await verifyManagementClient('test-admin', 'test-secret');
      expect(result).toBe(true);
    });

    it('should reject invalid client ID', async () => {
      await expect(
        verifyManagementClient('wrong-admin', 'test-secret')
      ).rejects.toThrow('Invalid management client credentials');
    });

    it('should reject invalid client secret', async () => {
      await expect(
        verifyManagementClient('test-admin', 'wrong-secret')
      ).rejects.toThrow('Invalid management client credentials');
    });

    it('should throw error when environment variables are not set', async () => {
      delete process.env.MANAGEMENT_CLIENT_ID;
      delete process.env.MANAGEMENT_CLIENT_SECRET;

      await expect(
        verifyManagementClient('test-admin', 'test-secret')
      ).rejects.toThrow('Management client credentials not configured');
    });

    it('should throw error when only client ID is set', async () => {
      delete process.env.MANAGEMENT_CLIENT_SECRET;

      await expect(
        verifyManagementClient('test-admin', 'test-secret')
      ).rejects.toThrow('Management client credentials not configured');
    });

    it('should throw error when only client secret is set', async () => {
      delete process.env.MANAGEMENT_CLIENT_ID;

      await expect(
        verifyManagementClient('test-admin', 'test-secret')
      ).rejects.toThrow('Management client credentials not configured');
    });
  });
});
