import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { summaryComparisonAgent } from '../agents/summary-comparison-agent';
import { templateImprovementAgent } from '../agents/template-improvement-agent';
import { rfpAgent } from '../agents/rfp-agent';
import { 
  createAccuracyScorer,
  createCompletenessScorer, 
  createConsistencyScorer,
  createClarityScorer,
  createOverallSummaryScorer
} from '../scorers/summary-evaluation-scorers';

// NOTE: This workflow expects Prisma schema with evaluation-related tables
// (summaryEvaluation, evaluationIteration) which don't exist in current database.
// The workflow has been updated to gracefully handle missing tables but would
// need EvaluationService for full functionality.

// Step 1: Generate Summary using Current Template
export const summaryGenerationStep = createStep({
  id: 'summary-generation',
  description: 'Generate summary from RFP using the current template',
  inputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    rfpContent: z.string(),
    template: z.object({
      name: z.string(),
      description: z.string(),
      sections: z.array(z.any()),
    }),
  }),
  outputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [EVAL-WORKFLOW] Starting summary generation...');
    
    try {
      // Build prompt for RFP agent using the template
      const sectionsPrompt = inputData.template.sections.map((section: any) => 
        `**${section.name}** (${section.type}): ${section.prompt}`
      ).join('\n\n');

      const prompt = `Generate a comprehensive summary of this RFP document using the following template structure:

${sectionsPrompt}

**RFP Document:**
${inputData.rfpContent}

**Instructions:**
1. Extract information for each section according to its specific prompt
2. Use the specified data type for each section (text, number, array, object)
3. Be accurate and comprehensive
4. If information is not available for a section, indicate that clearly
5. Return the summary as a structured JSON object with each section as a property

Return the summary in this exact format:
{
  "${inputData.template.sections.map((s: any) => s.name).join('": "...",\n  "')}"
}`;

      // Use RFP agent to generate the summary
      // @ts-ignore - Skip type checking for generateVNext to avoid deep instantiation
      const result = await rfpAgent.generateVNext([
        {
          role: 'system',
          content: 'You are an expert document analyst specializing in RFP summarization. Generate accurate, comprehensive summaries according to the provided template.',
        },
        {
          role: 'user', 
          content: prompt,
        }
      ], {
        // Match working pattern from rfp-workflow
        output: z.object({}).passthrough(),
      });

      const generatedSummary = result.object || {};

      // TODO: Update iteration with generated summary using EvaluationService
      // For now, store in-memory or as temporary data
      console.log('📝 [EVAL-WORKFLOW] Generated summary stored (EvaluationService not implemented)');

      console.log('✅ [EVAL-WORKFLOW] Summary generation completed');

      return {
        evaluationId: inputData.evaluationId,
        iterationNumber: inputData.iterationNumber,
        generatedSummary,
        rfpContent: inputData.rfpContent,
        template: inputData.template,
      };

    } catch (error) {
      console.error('❌ [EVAL-WORKFLOW] Summary generation failed:', error);
      
      // TODO: Update iteration status to failed using EvaluationService
      console.warn('⚠️ [EVAL-WORKFLOW] Iteration failure noted (EvaluationService not implemented)');
      
      throw error;
    }
  },
});

// Step 2: Load Reference Summary  
export const referenceSummaryLoadStep = createStep({
  id: 'reference-summary-load',
  description: 'Load and parse the reference summary document',
  inputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
  }),
  outputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [EVAL-WORKFLOW] Loading reference summary...');
    
    try {
      // Test-friendly fast-path: if referenceSummary is provided in input, bypass DB fetch
      if ((inputData as any).referenceSummary) {
        return {
          evaluationId: inputData.evaluationId,
          iterationNumber: inputData.iterationNumber,
          generatedSummary: inputData.generatedSummary,
          referenceSummary: (inputData as any).referenceSummary,
          rfpContent: inputData.rfpContent,
          template: inputData.template,
        };
      }

      // TODO: Get evaluation details using EvaluationService
      // For now, handle case where evaluation data needs to be passed in
      const evaluationUrl = (inputData as any).referenceSummaryUrl;
      
      if (!evaluationUrl) {
        console.warn('⚠️ [EVAL-WORKFLOW] No reference summary URL provided');
        throw new Error('Reference summary URL required but not provided');
      }

      // Download and parse reference summary
      const response = await fetch(evaluationUrl);
      if (!response.ok) {
        throw new Error(`Failed to download reference summary: ${response.statusText}`);
      }

      const referenceSummaryText = await response.text();
      
      // Try to parse as JSON first, otherwise treat as text that needs structuring
      let referenceSummary;
      try {
        referenceSummary = JSON.parse(referenceSummaryText);
      } catch {
        // If not JSON, we might need to structure it using AI
        // For now, wrap it in a text object
        referenceSummary = {
          content: referenceSummaryText,
          type: 'unstructured_text'
        };
      }

      console.log('✅ [EVAL-WORKFLOW] Reference summary loaded');

      return {
        evaluationId: inputData.evaluationId,
        iterationNumber: inputData.iterationNumber,
        generatedSummary: inputData.generatedSummary,
        referenceSummary,
        rfpContent: inputData.rfpContent,
        template: inputData.template,
      };

    } catch (error) {
      console.error('❌ [EVAL-WORKFLOW] Reference summary loading failed:', error);
      throw error;
    }
  },
});

// Step 3: Quantitative Scoring
export const quantitativeScoringStep = createStep({
  id: 'quantitative-scoring',
  description: 'Run quantitative evaluation using Mastra scorers',
  inputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
  }),
  outputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
    scores: z.object({
      accuracy: z.number(),
      completeness: z.number(),
      consistency: z.number(),
      clarity: z.number(),
      overall: z.number(),
    }),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [EVAL-WORKFLOW] Running quantitative scoring...');
    
    try {
      // Create scorers
      const accuracyScorer = createAccuracyScorer();
      const completenessScorer = createCompletenessScorer();
      const consistencyScorer = createConsistencyScorer();
      const clarityScorer = createClarityScorer();
      const overallScorer = createOverallSummaryScorer();

      // Run individual scorers using .run() method with proper inputs
      const accuracyResult = await accuracyScorer.run({
        input: {
          rfpContent: inputData.rfpContent,
          referenceSummary: JSON.stringify(inputData.referenceSummary),
          generatedSummary: JSON.stringify(inputData.generatedSummary),
        }
      });

      const completenessResult = await completenessScorer.run({
        input: {
          rfpContent: inputData.rfpContent,
          referenceSummary: JSON.stringify(inputData.referenceSummary),
          generatedSummary: JSON.stringify(inputData.generatedSummary),
        }
      });

      const consistencyResult = await consistencyScorer.run({
        input: {
          referenceSummary: JSON.stringify(inputData.referenceSummary),
          generatedSummary: JSON.stringify(inputData.generatedSummary),
        }
      });

      const clarityResult = await clarityScorer.run({
        input: {
          referenceSummary: JSON.stringify(inputData.referenceSummary),
          generatedSummary: JSON.stringify(inputData.generatedSummary),
        }
      });

      const overallResult = await overallScorer.run({
        input: {
          rfpContent: inputData.rfpContent,
          referenceSummary: JSON.stringify(inputData.referenceSummary),
          generatedSummary: JSON.stringify(inputData.generatedSummary),
          accuracyScore: accuracyResult.score,
          completenessScore: completenessResult.score,
          consistencyScore: consistencyResult.score,
          clarityScore: clarityResult.score,
        }
      });

      const scores: { accuracy: number; completeness: number; consistency: number; clarity: number; overall: number } = {
        accuracy: accuracyResult.score,
        completeness: completenessResult.score,
        consistency: consistencyResult.score,
        clarity: clarityResult.score,
        overall: overallResult.score,
      };

      // TODO: Update iteration with scores using EvaluationService
      console.log('📊 [EVAL-WORKFLOW] Scores recorded (EvaluationService not implemented):', scores);

      console.log('✅ [EVAL-WORKFLOW] Quantitative scoring completed');
      console.log('📊 [EVAL-WORKFLOW] Scores:', scores);

      return {
        ...inputData,
        scores,
      };

    } catch (error) {
      console.error('❌ [EVAL-WORKFLOW] Quantitative scoring failed:', error);
      throw error;
    }
  },
});

// Step 4: Side-by-Side Comparison Analysis
export const comparisonAnalysisStep = createStep({
  id: 'comparison-analysis',
  description: 'Generate detailed side-by-side comparison analysis',
  inputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    rfpContent: z.string(),
    template: z.object({}).passthrough(),
    scores: z.object({
      accuracy: z.number(),
      completeness: z.number(),
      consistency: z.number(),
      clarity: z.number(),
      overall: z.number(),
    }),
  }),
  outputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    template: z.object({}).passthrough(),
    scores: z.object({}).passthrough(),
    comparisonAnalysis: z.object({}).passthrough(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [EVAL-WORKFLOW] Generating comparison analysis...');
    
    try {
      // Cap large inputs to prevent streaming transformer from choking on oversized payloads
      const cappedRfp = inputData.rfpContent.slice(0, 15000);
      const cappedReference = JSON.stringify(inputData.referenceSummary).slice(0, 15000);
      const cappedGenerated = JSON.stringify(inputData.generatedSummary).slice(0, 15000);

      const prompt = `Perform a detailed side-by-side comparison analysis of the AI-generated summary vs. the reference summary.

**Quantitative Scores:**
- Accuracy: ${Math.round(inputData.scores.accuracy * 100)}/100
- Completeness: ${Math.round(inputData.scores.completeness * 100)}/100  
- Consistency: ${Math.round(inputData.scores.consistency * 100)}/100
- Clarity: ${Math.round(inputData.scores.clarity * 100)}/100
- Overall: ${Math.round(inputData.scores.overall * 100)}/100

**Template Used:**
${JSON.stringify(inputData.template, null, 2)}

**RFP Content (truncated):**
${cappedRfp}

**Reference Summary (truncated):**
${cappedReference}

**Generated Summary (truncated):**
${cappedGenerated}

Please provide a comprehensive comparison analysis that includes:

1. **Section-by-Section Analysis**: Compare each major section
2. **Gap Analysis**: Identify specific missing or incorrect information
3. **Quality Assessment**: Evaluate the quality of extracted information
4. **Business Impact**: How do the differences affect business utility?
5. **Specific Examples**: Cite concrete examples of issues
6. **Improvement Areas**: What areas need the most improvement?

Format your response as a structured analysis that will be useful for template improvement.`;

      // @ts-ignore - Skip type checking for generateVNext to avoid deep instantiation
      const result = await summaryComparisonAgent.generateVNext([
        {
          role: 'user',
          content: prompt,
        }
      ], {
        // Be tolerant to model deviations during streaming
        output: z.object({}).passthrough().optional(),
      });

      const comparisonAnalysis: any = (result as any)?.object ?? { analysis: (result as any)?.text ?? 'Analysis unavailable' };

      // TODO: Update iteration with comparison analysis using EvaluationService
      console.log('📊 [EVAL-WORKFLOW] Comparison analysis recorded (EvaluationService not implemented)');

      console.log('✅ [EVAL-WORKFLOW] Comparison analysis completed');

      return {
        evaluationId: inputData.evaluationId,
        iterationNumber: inputData.iterationNumber,
        generatedSummary: inputData.generatedSummary,
        referenceSummary: inputData.referenceSummary,
        template: inputData.template,
        scores: inputData.scores,
        comparisonAnalysis,
      };

    } catch (error) {
      console.error('❌ [EVAL-WORKFLOW] Comparison analysis failed:', error);
      const comparisonAnalysis = { analysis: 'Comparison unavailable due to validation/runtime error', error: String((error as Error)?.message || error) } as any;
      // TODO: Best-effort persist using EvaluationService
      console.warn('⚠️ [EVAL-WORKFLOW] Comparison analysis persistence failed (EvaluationService not implemented)');
      return {
        evaluationId: inputData.evaluationId,
        iterationNumber: inputData.iterationNumber,
        generatedSummary: inputData.generatedSummary,
        referenceSummary: inputData.referenceSummary,
        template: inputData.template,
        scores: inputData.scores,
        comparisonAnalysis,
      };
    }
  },
});

// Step 5: Template Improvement Recommendations
export const templateImprovementStep = createStep({
  id: 'template-improvement',
  description: 'Generate improved template based on evaluation results',
  inputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    generatedSummary: z.object({}).passthrough(),
    referenceSummary: z.object({}).passthrough(),
    template: z.object({}).passthrough(),
    scores: z.object({}).passthrough(),
    comparisonAnalysis: z.object({}).passthrough(),
  }),
  outputSchema: z.object({
    evaluationId: z.string(),
    iterationNumber: z.number(),
    recommendations: z.object({}).passthrough(),
    improvedTemplate: z.object({}).passthrough(),
    success: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [EVAL-WORKFLOW] Generating template improvements...');
    
    try {
      const cappedRfp = inputData.rfpContent.slice(0, 15000);
      const cappedReference = JSON.stringify(inputData.referenceSummary).slice(0, 15000);
      const cappedGenerated = JSON.stringify(inputData.generatedSummary).slice(0, 15000);
      const cappedAnalysis = JSON.stringify(inputData.comparisonAnalysis).slice(0, 12000);

      const prompt = `Based on the evaluation results, generate an improved template that addresses the identified issues.

**Current Template:**
${JSON.stringify(inputData.template, null, 2)}

**Performance Scores:**
${JSON.stringify(inputData.scores, null, 2)}

**Comparison Analysis (truncated):**
${cappedAnalysis}

**Reference Summary (truncated):**
${cappedReference}

**Generated Summary (truncated):**
${cappedGenerated}

Your task is to create an improved template that will generate better summaries. Focus on:

1. **Prompt Optimization**: Improve extraction prompts for better accuracy
2. **Section Refinement**: Add, remove, or restructure sections as needed
3. **Specificity**: Make prompts more specific where gaps were identified
4. **Context Enhancement**: Add better context for AI extraction
5. **Data Type Optimization**: Ensure appropriate data types

Return your response with:
- **recommendations**: Detailed explanation of changes and why they're needed
- **improvedTemplate**: Complete updated template with the same structure as the original

The improved template should maintain the same overall structure but with optimized prompts and sections.`;

      // @ts-ignore - Skip type checking for generateVNext to avoid deep instantiation
      const result = await templateImprovementAgent.generateVNext([
        {
          role: 'user',
          content: prompt,
        }
      ], {
        output: z.object({
          recommendations: z.object({}).passthrough(),
          improvedTemplate: z.object({
            name: z.string(),
            description: z.string(), 
            sections: z.array(z.any()),
          }),
        }).optional(),
      });

      const anyObj = (result as any)?.object ?? {};
      const recommendations = anyObj.recommendations ?? {};
      const improvedTemplate = anyObj.improvedTemplate ?? inputData.template;

      // TODO: Update iteration with recommendations and improved template using EvaluationService
      console.log('📊 [EVAL-WORKFLOW] Template improvements recorded (EvaluationService not implemented)');

      // TODO: Update evaluation status to completed using EvaluationService
      console.log('✅ [EVAL-WORKFLOW] Evaluation completion recorded (EvaluationService not implemented)');

      console.log('✅ [EVAL-WORKFLOW] Template improvement completed');

      return {
        evaluationId: inputData.evaluationId,
        iterationNumber: inputData.iterationNumber,
        recommendations,
        improvedTemplate,
        success: true,
      };

    } catch (error) {
      console.error('❌ [EVAL-WORKFLOW] Template improvement failed:', error);
      
      // TODO: Update iteration status to failed using EvaluationService
      console.warn('⚠️ [EVAL-WORKFLOW] Template improvement failure noted (EvaluationService not implemented)');
      
      throw error;
    }
  },
});

// Main Summary Evaluation Workflow
export const summaryEvaluationWorkflow = createWorkflow({
  id: 'summary-evaluation',
  description: 'Comprehensive evaluation of summary generation with quantitative scoring and improvement recommendations',
  inputSchema: z.object({
    evaluationId: z.string().describe('ID of the evaluation to run'),
    iterationNumber: z.number().describe('Iteration number for this evaluation run'),
    rfpContent: z.string().describe('RFP document content'),
    template: z.object({
      name: z.string(),
      description: z.string(),
      sections: z.array(z.any()),
    }).describe('Summary template to evaluate'),
  }),
  outputSchema: z.object({
    evaluationId: z.string().describe('ID of the completed evaluation'),
    iterationNumber: z.number().describe('Iteration number'),
    scores: z.object({
      accuracy: z.number(),
      completeness: z.number(),
      consistency: z.number(),
      clarity: z.number(),
      overall: z.number(),
    }).describe('Quantitative evaluation scores'),
    comparisonAnalysis: z.object({}).passthrough().describe('Detailed comparison analysis'),
    recommendations: z.object({}).passthrough().describe('Improvement recommendations'),
    improvedTemplate: z.object({}).passthrough().describe('Suggested improved template'),
    success: z.boolean().describe('Whether evaluation completed successfully'),
  }),
  retryConfig: {
    attempts: 2,
    delay: 1000,
  },
})
  .then(summaryGenerationStep)
  .then(referenceSummaryLoadStep)
  .then(quantitativeScoringStep)
  .then(comparisonAnalysisStep)
  .then(templateImprovementStep)
  .commit();
