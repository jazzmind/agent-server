/**
 * AI model definitions and configurations
 */

export interface ModelDef {
  model: string;
  provider: 'openai' | 'anthropic' | 'bedrock' | 'local';
  reasoning?: 'minimal' | 'low' | 'medium' | 'high' | undefined;
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
  };
}

export const MODELS = {
  // Secure model (external, high quality)
  frontier: {
    model: process.env.MODEL_FRONTIER || 'frontier',
    provider: (process.env.MODEL_FRONTIER_PROVIDER || 'bedrock') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'medium' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Fast model for quick operations
  // Actual: microsoft/Phi-4-multimodal-instruct (6B parameters, GPU 0)
  chat: {
    model: process.env.MODEL_CHAT || 'chat',
    provider: (process.env.MODEL_CHAT_PROVIDER || 'local') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  
  // Default model for most operations
  // Actual: Qwen/Qwen3-30B-A3B-Instruct-2507 (30B parameters, GPU 1)
  default: {
    model: process.env.MODEL_DEFAULT || 'default',
    provider: (process.env.MODEL_DEFAULT_PROVIDER || 'local') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'minimal' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Evaluation model for detailed analysis
  analysis: {
    model: process.env.MODEL_ANALYSIS || 'analysis',
    provider: (process.env.MODEL_EVALUATION_PROVIDER || 'local') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
  
  // Best model for complex operations (same as default - we only have one large model)
  research: {
    model: process.env.MODEL_RESEARCH || 'research',
    provider: (process.env.MODEL_RESEARCH_PROVIDER || 'local') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,

  // Smartest model for reasoning tasks (use external if available, otherwise default)
  vision: {
    model: process.env.MODEL_VISION || 'vision',
    provider: (process.env.MODEL_VISION_PROVIDER || 'local') as 'openai' | 'anthropic' | 'bedrock' | 'local',
    reasoning: 'medium' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
};

export type { ModelDef as modelDef };
