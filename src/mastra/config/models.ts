/**
 * AI model definitions and configurations
 */

export interface ModelDef {
  model: string;
  reasoning?: 'minimal' | 'low' | 'medium' | 'high' | undefined;
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
  };
}

export const MODELS = {
  // Fast model for quick operations
  fast: {
    model: 'gpt-5-nano',
    reasoning: 'minimal' as const,
    text: { verbosity: 'low' }
  } as ModelDef,
  
  // Default model for most operations
  default: {
    model: 'gpt-5-mini',
    reasoning: 'minimal' as const,
    text: { verbosity: 'medium' }
  } as ModelDef,
  
  // Evaluation model for detailed analysis
  evaluation: {
    model: 'gpt-5-mini',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
  
  // Large model for complex operations
  best: {
    model: 'gpt-5',
    reasoning: 'medium' as const,
    text: { verbosity: 'high' }
  } as ModelDef,

  smartest: {
    model: 'gpt-5',
    reasoning: 'high' as const,
    text: { verbosity: 'high' }
  } as ModelDef,
};

export type { ModelDef as modelDef };
