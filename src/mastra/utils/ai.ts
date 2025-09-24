import { openai as openaiSdk } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { MODELS, ModelDef } from '../config/models';

// create a list of models from the MODELS object
const openAIModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'openai')
  .map((model: ModelDef) => model.model);

const anthropicModels = Object.values(MODELS)
  .filter((model: ModelDef) => model.provider === 'anthropic')
  .map((model: ModelDef) => model.model);

// Optional anthropic import - only available if package is installed
let anthropicSdk: any;
try {
  anthropicSdk = require('@ai-sdk/anthropic').anthropic;
} catch {
  console.warn('⚠️ @ai-sdk/anthropic not available');
}

// Configuration for different AI providers
export interface AIProvider {
  name: 'openai' | 'anthropic' | 'local';
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
};

// Get the configured provider from environment or default to OpenAI
const DEFAULT_PROVIDER = (process.env.AI_PROVIDER as keyof typeof AI_PROVIDERS) || 'openai';
const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || AI_PROVIDERS[DEFAULT_PROVIDER].defaultModel;

/**
 * Get an AI SDK model instance with debug logging
 */
export const ai = (model?: string, provider?: keyof typeof AI_PROVIDERS): LanguageModelV2 => {
  const selectedProvider = provider || DEFAULT_PROVIDER;
  const selectedModel = model || DEFAULT_MODEL;
  
  let originalModel: LanguageModelV2;
  
  switch (selectedProvider) {
    case 'anthropic':
      if (!anthropicSdk) {
        console.warn('⚠️ Anthropic not available, falling back to OpenAI');
        originalModel = openaiSdk(DEFAULT_MODEL);
      } else {
        originalModel = anthropicSdk(selectedModel);
      }
      break;
    case 'openai':
    default:
      originalModel = openaiSdk(selectedModel);
      break;
  }

  // Create a proxy to add debug logging to all method calls
  return new Proxy(originalModel, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      
      if (typeof original === 'function') {
        return async function(...args: any[]) {
          console.log(`🤖 [AI-${selectedProvider.toUpperCase()}] Calling ${String(prop)}...`);
          console.log(`📝 [AI-${selectedProvider.toUpperCase()}] Model: ${selectedModel}`);
          
          const startTime = Date.now();
          try {
            const result = await original.apply(target, args);
            const duration = Date.now() - startTime;
            console.log(`✅ [AI-${selectedProvider.toUpperCase()}] ${String(prop)} completed in ${duration}ms`);
            
            if (result?.text) {
              console.log(`📊 [AI-${selectedProvider.toUpperCase()}] Response length: ${result.text.length}`);
              console.log(`📄 [AI-${selectedProvider.toUpperCase()}] Response preview: ${result.text.substring(0, 200)}...`);
            }
            
            return result;
          } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`❌ [AI-${selectedProvider.toUpperCase()}] ${String(prop)} failed after ${duration}ms`);
            console.error(`❌ [AI-${selectedProvider.toUpperCase()}] Error: ${error?.message}`);
            console.error(`❌ [AI-${selectedProvider.toUpperCase()}] Full error:`, error);
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