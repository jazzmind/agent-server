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
  secure: {
    model: 'claude-sonnet-4',
    provider: 'bedrock',
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  // Fast model for quick operations
  fast: {
    model: 'gpt-5-nano',
    provider: 'openai',
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  
  // Default model for most operations
  default: {
    model: 'gpt-5-mini',
    provider: 'openai',
    reasoning: 'minimal' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Evaluation model for detailed analysis
  evaluation: {
    model: 'gpt-5-mini',
    provider: 'openai',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
  
  // Large model for complex operations
  best: {
    model: 'gpt-5',
    provider: 'openai',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,

  smartest: {
    model: 'gpt-5',
    provider: 'openai',
    reasoning: 'high' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
};

export type { ModelDef as modelDef };
