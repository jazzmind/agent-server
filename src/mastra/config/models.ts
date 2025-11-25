/**
 * AI model definitions and configurations
 * 
 * Models are routed through LiteLLM which provides:
 * - Unified API for local and cloud models
 * - Model aliasing (e.g., 'default' -> 'Qwen/Qwen3-30B-A3B-Instruct-2507')
 * - Load balancing and fallback
 * - Usage tracking and rate limiting
 */

export interface ModelDef {
  model: string;
  provider: 'openai' | 'anthropic' | 'bedrock' | 'local' | 'litellm';
  reasoning?: 'minimal' | 'low' | 'medium' | 'high' | undefined;
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
  };
}

/**
 * Model aliases that map to actual models in LiteLLM registry
 * 
 * LiteLLM Config should define these aliases:
 * - 'default' -> local model for general tasks
 * - 'chat' -> fast model for quick responses
 * - 'frontier' -> high-quality external model (Claude, GPT-4, etc.)
 * - 'analysis' -> model for detailed analysis
 * - 'research' -> model for complex reasoning
 * - 'vision' -> multimodal model with image support
 */
export const MODELS = {
  // Secure model (external, high quality)
  // Maps to: Claude 3.5 Sonnet, GPT-4, etc. via LiteLLM
  frontier: {
    model: process.env.MODEL_FRONTIER || 'frontier',
    provider: (process.env.MODEL_FRONTIER_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'medium' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Fast model for quick operations
  // Maps to: Phi-4, Qwen-7B, or similar fast local model
  chat: {
    model: process.env.MODEL_CHAT || 'chat',
    provider: (process.env.MODEL_CHAT_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  
  // Default model for most operations
  // Maps to: Qwen-30B or similar capable local model
  default: {
    model: process.env.MODEL_DEFAULT || 'default',
    provider: (process.env.MODEL_DEFAULT_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'minimal' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Evaluation model for detailed analysis
  analysis: {
    model: process.env.MODEL_ANALYSIS || 'analysis',
    provider: (process.env.MODEL_ANALYSIS_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
  
  // Best model for complex operations
  research: {
    model: process.env.MODEL_RESEARCH || 'research',
    provider: (process.env.MODEL_RESEARCH_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,

  // Multimodal model for vision tasks
  vision: {
    model: process.env.MODEL_VISION || 'vision',
    provider: (process.env.MODEL_VISION_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'medium' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,

  // Aliases for backwards compatibility
  // 'fast' is an alias for 'chat'
  fast: {
    model: process.env.MODEL_CHAT || 'chat',
    provider: (process.env.MODEL_CHAT_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  
  // 'evaluation' is an alias for 'analysis'
  evaluation: {
    model: process.env.MODEL_ANALYSIS || 'analysis',
    provider: (process.env.MODEL_ANALYSIS_PROVIDER || 'litellm') as ModelDef['provider'],
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
};

/**
 * Get model definition by name
 */
export const getModelDef = (name: keyof typeof MODELS): ModelDef => {
  return MODELS[name];
};

/**
 * Get all available model names
 */
export const getModelNames = (): string[] => {
  return Object.keys(MODELS);
};

export type { ModelDef as modelDef };
