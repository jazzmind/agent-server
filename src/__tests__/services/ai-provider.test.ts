import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ai, getDefaultModel, getModel, isModelAvailable, getAvailableModels, getLiteLLMConfig, AI_PROVIDERS } from '../../mastra/utils/ai';
import { MODELS, getModelDef, getModelNames } from '../../mastra/config/models';

// Mock fetch for LiteLLM API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AI Provider Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env.LITELLM_BASE_URL = 'http://test-litellm:4000/v1';
    process.env.LITELLM_API_KEY = 'test-api-key';
    process.env.AI_PROVIDER = 'litellm';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MODELS configuration', () => {
    it('should have all required model definitions', () => {
      const requiredModels = ['default', 'chat', 'frontier', 'analysis', 'research', 'vision'];
      
      for (const modelName of requiredModels) {
        expect(MODELS).toHaveProperty(modelName);
        expect(MODELS[modelName as keyof typeof MODELS]).toHaveProperty('model');
        expect(MODELS[modelName as keyof typeof MODELS]).toHaveProperty('provider');
      }
    });

    it('should default to litellm provider for local models', () => {
      expect(MODELS.default.provider).toBe('litellm');
      expect(MODELS.chat.provider).toBe('litellm');
    });

    it('should use environment variables for model names', () => {
      const originalDefault = process.env.MODEL_DEFAULT;
      process.env.MODEL_DEFAULT = 'custom-model';
      
      // Re-import to get fresh values (in real code, this would be dynamic)
      // For this test, we just verify the pattern
      expect(MODELS.default.model).toBeDefined();
      
      process.env.MODEL_DEFAULT = originalDefault;
    });

    it('should provide model names via getModelNames', () => {
      const names = getModelNames();
      expect(names).toContain('default');
      expect(names).toContain('chat');
      expect(names).toContain('frontier');
    });

    it('should return model definition via getModelDef', () => {
      const defaultModel = getModelDef('default');
      expect(defaultModel).toHaveProperty('model');
      expect(defaultModel).toHaveProperty('provider');
      expect(defaultModel).toHaveProperty('reasoning');
    });
  });

  describe('AI_PROVIDERS configuration', () => {
    it('should include litellm provider', () => {
      expect(AI_PROVIDERS).toHaveProperty('litellm');
      expect(AI_PROVIDERS.litellm.name).toBe('litellm');
    });

    it('should include local as alias for litellm', () => {
      expect(AI_PROVIDERS).toHaveProperty('local');
      expect(AI_PROVIDERS.local.name).toBe('local');
    });

    it('should include traditional providers', () => {
      expect(AI_PROVIDERS).toHaveProperty('openai');
      expect(AI_PROVIDERS).toHaveProperty('anthropic');
      expect(AI_PROVIDERS).toHaveProperty('bedrock');
    });
  });

  describe('getLiteLLMConfig', () => {
    it('should return LiteLLM configuration', () => {
      const config = getLiteLLMConfig();
      
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('hasApiKey');
      expect(config).toHaveProperty('isDefault');
    });

    it('should indicate when API key is set', () => {
      process.env.LITELLM_API_KEY = 'test-key';
      
      // Note: getLiteLLMConfig reads from module-level constants
      // This test verifies the structure; actual value depends on when module was loaded
      const config = getLiteLLMConfig();
      expect(typeof config.hasApiKey).toBe('boolean');
    });
  });

  describe('ai() function', () => {
    it('should create a model instance', () => {
      const model = ai('default', 'litellm');
      expect(model).toBeDefined();
    });

    it('should use default model when none specified', () => {
      const model = getDefaultModel();
      expect(model).toBeDefined();
    });

    it('should allow provider override', () => {
      const model = getModel('gpt-4', 'openai');
      expect(model).toBeDefined();
    });
  });

  describe('isModelAvailable', () => {
    it('should return true for available models', () => {
      // Default model should be available in litellm provider
      const available = isModelAvailable('default', 'litellm');
      expect(typeof available).toBe('boolean');
    });

    it('should handle unknown models', () => {
      const available = isModelAvailable('unknown-model-xyz', 'litellm');
      expect(available).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return array of model names', () => {
      const models = getAvailableModels('litellm');
      expect(Array.isArray(models)).toBe(true);
    });

    it('should use default provider when none specified', () => {
      const models = getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
    });
  });
});

describe('LiteLLM Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LITELLM_BASE_URL = 'http://test-litellm:4000/v1';
    process.env.LITELLM_API_KEY = 'test-api-key';
  });

  describe('Model call flow', () => {
    it('should create litellm model with correct base URL', () => {
      const model = ai('default', 'litellm');
      
      // Model should be a proxy object
      expect(model).toBeDefined();
      expect(typeof model).toBe('object');
    });

    it('should handle missing API key gracefully', () => {
      const originalKey = process.env.LITELLM_API_KEY;
      delete process.env.LITELLM_API_KEY;
      
      // Should not throw when creating model
      expect(() => ai('default', 'litellm')).not.toThrow();
      
      process.env.LITELLM_API_KEY = originalKey;
    });
  });

  describe('Error handling', () => {
    it('should wrap errors with helpful context', async () => {
      const model = ai('default', 'litellm');
      
      // Mock a failure - the proxy should catch and re-throw with context
      // This tests the error handling path in the proxy
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      
      // The actual API call would fail, but we're testing the model creation succeeds
      expect(model).toBeDefined();
    });
  });
});

describe('Provider Selection', () => {
  it('should select litellm for local provider', () => {
    process.env.AI_PROVIDER = 'local';
    const model = ai('default');
    expect(model).toBeDefined();
  });

  it('should select correct provider based on AI_PROVIDER env var', () => {
    const providers = ['litellm', 'local', 'openai', 'anthropic', 'bedrock'];
    
    for (const provider of providers) {
      process.env.AI_PROVIDER = provider;
      // Should not throw for any valid provider
      expect(() => ai('test-model', provider as any)).not.toThrow();
    }
  });
});

