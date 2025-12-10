import { openai as openaiSdk, createOpenAI } from '@ai-sdk/openai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { anthropic as anthropicSdk } from '@ai-sdk/anthropic';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { MODELS, ModelDef } from '../config/models';

// Create LiteLLM provider using OpenAI SDK with custom base URL
// LiteLLM provides an OpenAI-compatible API for local and cloud models
const litellmBaseUrl = process.env.LITELLM_BASE_URL || 'http://10.96.200.207:4000/v1';
const litellmApiKey = process.env.LITELLM_API_KEY || '';

const litellmProvider = createOpenAI({
  baseURL: litellmBaseUrl,
  apiKey: litellmApiKey,
  // LiteLLM handles model routing, so we don't need strict compatibility mode
  compatibility: 'compatible',
});

// create a list of models from the MODELS object
const openAIModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'openai')
  .map((model: ModelDef) => model.model);

const anthropicModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'anthropic')
  .map((model: ModelDef) => model.model);

const bedrockModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'bedrock')
  .map((model: ModelDef) => model.model);

const litellmModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'local' || model.provider === 'litellm')
  .map((model: ModelDef) => model.model);

// Configuration for different AI providers
export interface AIProvider {
  name: 'openai' | 'anthropic' | 'bedrock' | 'local' | 'litellm';
  models: string[];
  defaultModel: string;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openai: {
    name: 'openai',
    models: openAIModels,
    defaultModel: MODELS.default.model,
  },
  anthropic: {
    name: 'anthropic', 
    models: anthropicModels,
    defaultModel: MODELS.default.model,
  },
  bedrock: {
    name: 'bedrock',
    models: bedrockModels,
    defaultModel: MODELS.default.model,
  },
  litellm: {
    name: 'litellm',
    models: litellmModels,
    defaultModel: MODELS.default.model,
  },
  // 'local' is an alias for litellm (for backwards compatibility)
  local: {
    name: 'local',
    models: litellmModels,
    defaultModel: MODELS.default.model,
  },
};

// Get the configured provider from environment or default to litellm for local models
let DEFAULT_PROVIDER = (process.env.AI_PROVIDER as keyof typeof AI_PROVIDERS) || 'litellm';

// Validate that the provider exists in AI_PROVIDERS
if (!AI_PROVIDERS[DEFAULT_PROVIDER]) {
  console.error(`❌ Invalid AI_PROVIDER: "${DEFAULT_PROVIDER}". Available providers: ${Object.keys(AI_PROVIDERS).join(', ')}`);
  console.error(`   Using fallback provider: litellm`);
  // Force fallback to litellm if invalid provider
  DEFAULT_PROVIDER = 'litellm';
}

const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || AI_PROVIDERS[DEFAULT_PROVIDER].defaultModel || MODELS.default.model;

/**
 * Get an AI SDK model instance with debug logging
 * 
 * Supports multiple providers:
 * - litellm: Local models via LiteLLM proxy (default)
 * - local: Alias for litellm
 * - openai: Direct OpenAI API
 * - anthropic: Direct Anthropic API
 * - bedrock: AWS Bedrock
 */
export const ai = (model?: string, provider?: keyof typeof AI_PROVIDERS): LanguageModelV2 => {
  const selectedProvider = provider || DEFAULT_PROVIDER;
  const selectedModel = model || DEFAULT_MODEL;
  
  let originalModel: LanguageModelV2;
  
  switch (selectedProvider) {
    case 'anthropic':
      originalModel = anthropicSdk(selectedModel);
      break;
    case 'openai':
      originalModel = openaiSdk(selectedModel);
      break;
    case 'bedrock':
      originalModel = createAmazonBedrock({
        apiKey: process.env.AWS_BEDROCK_API_KEY,
        region: process.env.AWS_BEDROCK_REGION
      }).languageModel(selectedModel);
      break;
    case 'litellm':
    case 'local':
    default:
      // Use LiteLLM provider for local models
      // LiteLLM routes to the appropriate backend (Ollama, vLLM, etc.)
      if (!litellmApiKey) {
        console.warn('⚠️ LITELLM_API_KEY not set - LiteLLM calls may fail');
      }
      originalModel = litellmProvider(selectedModel);
      break;
  }

  // Create a proxy to add debug logging to all method calls
  return new Proxy(originalModel, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      
      if (typeof original === 'function') {
        return async function(...args: any[]) {
          const providerLabel = selectedProvider.toUpperCase();
          console.log(`🤖 [AI-${providerLabel}] Calling ${String(prop)}...`);
          console.log(`📝 [AI-${providerLabel}] Model: ${selectedModel}`);
          if (selectedProvider === 'litellm' || selectedProvider === 'local') {
            console.log(`🔗 [AI-${providerLabel}] Base URL: ${litellmBaseUrl}`);
          }
          
          const startTime = Date.now();
          try {
            const result = await original.apply(target, args);
            const duration = Date.now() - startTime;
            console.log(`✅ [AI-${providerLabel}] ${String(prop)} completed in ${duration}ms`);
            
            if (result?.text) {
              console.log(`📊 [AI-${providerLabel}] Response length: ${result.text.length}`);
              console.log(`📄 [AI-${providerLabel}] Response preview: ${result.text.substring(0, 200)}...`);
            }
            
            return result;
          } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`❌ [AI-${providerLabel}] ${String(prop)} failed after ${duration}ms`);
            console.error(`❌ [AI-${providerLabel}] Error: ${error?.message}`);
            if (selectedProvider === 'litellm' || selectedProvider === 'local') {
              console.error(`❌ [AI-${providerLabel}] Check LiteLLM is running at ${litellmBaseUrl}`);
            }
            console.error(`❌ [AI-${providerLabel}] Full error:`, error);
            throw error;
          }
        };
      }
      
      return original;
    }
  });
};

/**
 * Get default AI model for the configured provider
 */
export const getDefaultModel = (): LanguageModelV2 => {
  return ai();
};

/**
 * Get a specific model with provider override
 */
export const getModel = (model: string, provider?: keyof typeof AI_PROVIDERS): LanguageModelV2 => {
  return ai(model, provider);
};

/**
 * Check if a model is available for the current provider
 */
export const isModelAvailable = (model: string, provider?: keyof typeof AI_PROVIDERS): boolean => {
  const selectedProvider = provider || DEFAULT_PROVIDER;
  return AI_PROVIDERS[selectedProvider]?.models.includes(model) || false;
};

/**
 * Get list of available models for a provider
 */
export const getAvailableModels = (provider?: keyof typeof AI_PROVIDERS): string[] => {
  const selectedProvider = provider || DEFAULT_PROVIDER;
  return AI_PROVIDERS[selectedProvider]?.models || [];
};

/**
 * Get LiteLLM configuration for debugging
 */
export const getLiteLLMConfig = () => ({
  baseUrl: litellmBaseUrl,
  hasApiKey: !!litellmApiKey,
  isDefault: DEFAULT_PROVIDER === 'litellm' || DEFAULT_PROVIDER === 'local',
});
