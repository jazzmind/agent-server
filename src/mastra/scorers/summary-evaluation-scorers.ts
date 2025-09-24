import { createScorer } from '@mastra/core/scores';
import { ai } from '../utils/ai';
import { z } from 'zod';
import { MODELS } from '../config/models';

// Schema for summary comparison evaluation
const SummaryComparisonSchema = z.object({
  score: z.number().min(0).max(100).describe('Score out of 100 for this evaluation metric'),
  analysis: z.string().describe('Detailed analysis of the comparison'),
  specificIssues: z.array(z.string()).describe('Specific issues or gaps identified'),
  recommendations: z.array(z.string()).describe('Specific recommendations for improvement'),
});

// Schema for overall summary evaluation
const OverallSummaryEvaluationSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall score out of 100'),
  keyStrengths: z.array(z.string()).describe('Key strengths of the generated summary'),
  majorGaps: z.array(z.string()).describe('Major gaps or issues'),
  priorityRecommendations: z.array(z.string()).describe('Priority recommendations for template improvement'),
  templateQuality: z.enum(['excellent', 'good', 'fair', 'poor']).describe('Overall template quality assessment'),
});

/**
 * Accuracy Scorer - Evaluates how accurately the generated summary captures the RFP content
 */
export const createAccuracyScorer = () => {
  return createScorer({
    name: 'summary-accuracy',
    description: 'Evaluates how accurately the generated summary captures the key information from the RFP',
    judge: {
      model: ai(MODELS.evaluation.model),
      instructions: 'You are an expert document analyst evaluating the accuracy of AI-generated summaries.'
    }
  })
  .preprocess(({ run }) => {
    const { generatedSummary, referenceSummary, rfpContent } = run.input;
    return { generatedSummary, referenceSummary, rfpContent };
  })
  .analyze({
    description: 'Analyze accuracy by comparing generated summary with reference',
    outputSchema: SummaryComparisonSchema,
    createPrompt: ({ run, results }) => {
      const { generatedSummary, referenceSummary, rfpContent } = results.preprocessStepResult;
      
      return `Compare the AI-generated summary against the reference summary and original RFP content to evaluate accuracy.

**RFP Content:**
${rfpContent}

**Reference Summary (Human-created, considered accurate):**
${referenceSummary}

**Generated Summary (AI-created, to be evaluated):**
${generatedSummary}

**Evaluation Criteria:**
1. **Factual Accuracy**: Are all facts, dates, numbers, and requirements correctly captured?
2. **Key Information**: Are all critical details from the RFP included?
3. **No Hallucination**: Does the summary avoid adding information not present in the RFP?
4. **Alignment with Reference**: How well does it align with the reference summary's factual content?

Rate the accuracy from 0-100, where:
- 90-100: Highly accurate, minimal discrepancies
- 70-89: Good accuracy, minor issues
- 50-69: Moderate accuracy, some important issues
- 30-49: Poor accuracy, major factual errors
- 0-29: Very poor accuracy, significant misinformation

Provide specific examples of inaccuracies and recommendations for improvement.`;
    }
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.score / 100;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    return `Accuracy Score: ${Math.round(score * 100)}/100

${analysis.analysis}

Specific Issues:
${analysis.specificIssues.map(issue => `- ${issue}`).join('\n')}

Recommendations:
${analysis.recommendations.map(rec => `- ${rec}`).join('\n')}`;
  });
};

/**
 * Completeness Scorer - Evaluates how completely the generated summary covers all important aspects
 */
export const createCompletenessScorer = () => {
  return createScorer({
    name: 'summary-completeness',
    description: 'Evaluates how completely the generated summary covers all important aspects of the RFP',
    judge: {
      model: ai(MODELS.evaluation.model),
      instructions: 'You are an expert document analyst evaluating the completeness of AI-generated summaries.'
    }
  })
  .preprocess(({ run }) => {
    const { generatedSummary, referenceSummary, rfpContent } = run.input;
    return { generatedSummary, referenceSummary, rfpContent };
  })
  .analyze({
    description: 'Analyze completeness by checking coverage of all important aspects',
    outputSchema: SummaryComparisonSchema,
    createPrompt: ({ run, results }) => {
      const { generatedSummary, referenceSummary, rfpContent } = results.preprocessStepResult;
      
      return `Evaluate how completely the AI-generated summary covers all important aspects of the RFP.

**RFP Content:**
${rfpContent}

**Reference Summary (Human-created, shows expected completeness):**
${referenceSummary}

**Generated Summary (AI-created, to be evaluated):**
${generatedSummary}

**Evaluation Criteria:**
1. **Coverage**: Does the summary address all major sections and topics from the RFP?
2. **Important Details**: Are key details, requirements, and specifications included?
3. **Context**: Is sufficient context provided for understanding?
4. **Comprehensiveness**: Is the summary comprehensive compared to the reference?

Rate the completeness from 0-100, where:
- 90-100: Highly complete, covers all important aspects
- 70-89: Good completeness, minor omissions
- 50-69: Moderate completeness, some important gaps
- 30-49: Poor completeness, major sections missing
- 0-29: Very incomplete, critical information missing

Identify specific missing elements and recommend what should be added.`;
    }
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.score / 100;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    return `Completeness Score: ${Math.round(score * 100)}/100

${analysis.analysis}

Specific Issues:
${analysis.specificIssues.map(issue => `- ${issue}`).join('\n')}

Recommendations:
${analysis.recommendations.map(rec => `- ${rec}`).join('\n')}`;
  });
};

/**
 * Consistency Scorer - Evaluates internal consistency within the generated summary
 */
export const createConsistencyScorer = () => {
  return createScorer({
    name: 'summary-consistency',
    description: 'Evaluates the internal consistency and coherence of the generated summary',
    judge: {
      model: ai(MODELS.evaluation.model),
      instructions: 'You are an expert document analyst evaluating the consistency of AI-generated summaries.'
    }
  })
  .preprocess(({ run }) => {
    const { generatedSummary, referenceSummary } = run.input;
    return { generatedSummary, referenceSummary };
  })
  .analyze({
    description: 'Analyze internal consistency and logical coherence',
    outputSchema: SummaryComparisonSchema,
    createPrompt: ({ run, results }) => {
      const { generatedSummary, referenceSummary } = results.preprocessStepResult;
      
      return `Evaluate the internal consistency and coherence of the AI-generated summary.

**Reference Summary (for context):**
${referenceSummary}

**Generated Summary (to be evaluated):**
${generatedSummary}

**Evaluation Criteria:**
1. **Internal Logic**: Are all parts of the summary logically consistent with each other?
2. **Format Consistency**: Is the formatting and structure consistent throughout?
3. **Data Consistency**: Are numbers, dates, and facts consistent across sections?
4. **Terminology**: Is terminology used consistently throughout the summary?
5. **Cross-References**: Do cross-references and related information align properly?

Rate the consistency from 0-100, where:
- 90-100: Highly consistent, no contradictions
- 70-89: Good consistency, minor inconsistencies
- 50-69: Moderate consistency, some contradictions
- 30-49: Poor consistency, notable contradictions
- 0-29: Very inconsistent, major contradictions

Identify specific inconsistencies and recommend how to resolve them.`;
    }
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.score / 100;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    return `Consistency Score: ${Math.round(score * 100)}/100

${analysis.analysis}

Specific Issues:
${analysis.specificIssues.map(issue => `- ${issue}`).join('\n')}

Recommendations:
${analysis.recommendations.map(rec => `- ${rec}`).join('\n')}`;
  });
};

/**
 * Clarity Scorer - Evaluates the clarity and readability of the generated summary
 */
export const createClarityScorer = () => {
  return createScorer({
    name: 'summary-clarity',
    description: 'Evaluates the clarity, readability, and organization of the generated summary',
    judge: {
      model: ai(MODELS.evaluation.model),
      instructions: 'You are an expert document analyst evaluating the clarity of AI-generated summaries.'
    }
  })
  .preprocess(({ run }) => {
    const { generatedSummary, referenceSummary } = run.input;
    return { generatedSummary, referenceSummary };
  })
  .analyze({
    description: 'Analyze clarity, readability, and organization',
    outputSchema: SummaryComparisonSchema,
    createPrompt: ({ run, results }) => {
      const { generatedSummary, referenceSummary } = results.preprocessStepResult;
      
      return `Evaluate the clarity, readability, and organization of the AI-generated summary.

**Reference Summary (for context and comparison):**
${referenceSummary}

**Generated Summary (to be evaluated):**
${generatedSummary}

**Evaluation Criteria:**
1. **Readability**: Is the summary easy to read and understand?
2. **Organization**: Is the information well-organized and logically structured?
3. **Language Quality**: Is the language clear, concise, and professional?
4. **Information Density**: Is the information presented at an appropriate level of detail?
5. **User Experience**: Would a business professional find this summary useful and accessible?

Rate the clarity from 0-100, where:
- 90-100: Excellent clarity, very easy to understand
- 70-89: Good clarity, generally clear with minor issues
- 50-69: Moderate clarity, some confusing or unclear sections
- 30-49: Poor clarity, difficult to understand in places
- 0-29: Very poor clarity, confusing and hard to follow

Provide specific examples of clarity issues and recommendations for improvement.`;
    }
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.score / 100;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    return `Clarity Score: ${Math.round(score * 100)}/100

${analysis.analysis}

Specific Issues:
${analysis.specificIssues.map(issue => `- ${issue}`).join('\n')}

Recommendations:
${analysis.recommendations.map(rec => `- ${rec}`).join('\n')}`;
  });
};

/**
 * Overall Summary Evaluation Scorer - Provides comprehensive evaluation
 */
export const createOverallSummaryScorer = () => {
  return createScorer({
    name: 'overall-summary-evaluation',
    description: 'Provides comprehensive evaluation of the generated summary quality',
    judge: {
      model: ai(MODELS.evaluation.model),
      instructions: 'You are a senior business analyst providing a comprehensive evaluation of an AI-generated summary system.'
    }
  })
  .preprocess(({ run }) => {
    const { 
      generatedSummary, 
      referenceSummary, 
      rfpContent, 
      accuracyScore, 
      completenessScore, 
      consistencyScore, 
      clarityScore,
    } = run.input;
    
    return {
      generatedSummary,
      referenceSummary,
      rfpContent,
      scores: { accuracyScore, completenessScore, consistencyScore, clarityScore }
    };
  })
  .analyze({
    description: 'Generate comprehensive overall evaluation',
    outputSchema: OverallSummaryEvaluationSchema,
    createPrompt: ({ run, results }) => {
      const { generatedSummary, referenceSummary, rfpContent, scores } = results.preprocessStepResult;
      
      return `You are evaluating an AI summary generation system by comparing its output against a human-created reference summary.

**RFP Content:**
${rfpContent}

**Reference Summary (Human-created baseline):**
${referenceSummary}

**Generated Summary (AI-created):**
${generatedSummary}

**Individual Metric Scores:**
- Accuracy: ${scores.accuracyScore || 'N/A'}
- Completeness: ${scores.completenessScore || 'N/A'}
- Consistency: ${scores.consistencyScore || 'N/A'}
- Clarity: ${scores.clarityScore || 'N/A'}

**Your Task:**
Provide a comprehensive evaluation considering all aspects of summary quality. Focus on:

1. **Overall Quality Assessment**: How would you rate this summary system overall?
2. **Business Value**: How useful would this be for real business decisions?
3. **Key Strengths**: What does the system do particularly well?
4. **Major Gaps**: What are the most critical areas needing improvement?
5. **Template Quality**: How well is the template working for this type of document?
6. **Priority Recommendations**: What are the top 3-5 improvements needed?

Consider both the individual scores and the holistic user experience when rating overall performance.`;
    }
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.score / 100;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    return `Overall Score: ${Math.round(score * 100)}/100
Template Quality: ${analysis.templateQuality.toUpperCase()}

Key Strengths:
${analysis.keyStrengths.map(s => `- ${s}`).join('\n')}

Major Gaps:
${analysis.majorGaps.map(g => `- ${g}`).join('\n')}

Priority Recommendations:
${analysis.priorityRecommendations.map(r => `- ${r}`).join('\n')}`;
  });
};