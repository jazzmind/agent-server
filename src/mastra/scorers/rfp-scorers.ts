import { createScorer } from '@mastra/core/scores';
import { ai } from '../utils/ai';
import { z } from 'zod';
import { MODELS } from '../config/models';

// Schema for criteria-based evaluation
const CriterionEvaluationSchema = z.object({
  score: z.number().describe('Score for this criterion within the specified range'),
  feedback: z.string().describe('Detailed explanation of the score'),
  strengths: z.array(z.string()).describe('Specific strengths identified'),
  improvements: z.array(z.string()).describe('Areas for improvement'),
});

// Schema for overall evaluation
const OverallEvaluationSchema = z.object({
  recommendation: z.enum(['approve', 'conditional_approval', 'reject']).describe('Final recommendation'),
  confidence: z.number().min(0).max(1).describe('Confidence level in the evaluation'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('Overall risk assessment'),
  summary: z.string().describe('Executive summary of the evaluation'),
  keyFindings: z.array(z.string()).describe('Most important findings'),
  actionItems: z.array(z.string()).describe('Recommended next steps'),
});

// Create a custom scorer for evaluating documents against specific criteria
export const createCriterionScorer = (criterionConfig: {
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
  weight: number;
  rubric: string;
  prompt: string;
}) => {
  return createScorer({
    name: `criterion-${criterionConfig.name.toLowerCase().replace(/\s+/g, '-')}`,
    description: `Evaluate document against criterion: ${criterionConfig.name}`,
    judge: {
      model: ai(MODELS.default.model),
      instructions: `You are an expert evaluator assessing documents against specific criteria. 
      Provide fair, objective assessments with detailed feedback and specific examples.`,
    },
  })
  .preprocess(({ run }) => {
    // Extract document and criterion from input
    const { document, context } = run.input;
    const { criterion } = context;
    
    return {
      document,
      criterion,
      evaluationContext: {
        scoringRange: `${criterion.minScore} to ${criterion.maxScore}`,
        rubric: criterion.rubric,
        instructions: criterion.prompt,
      },
    };
  })
  .analyze({
    description: `Analyze the document against the criterion: ${criterionConfig.name}`,
    outputSchema: CriterionEvaluationSchema,
    createPrompt: ({ run, results }) => {
      const { document, criterion, evaluationContext } = results.preprocessStepResult;
      
      return `
You are evaluating a document against specific criteria.

CRITERION DETAILS:
- Name: ${criterion.name}
- Description: ${criterion.description}
- Scoring Range: ${evaluationContext.scoringRange}
- Weight: ${criterion.weight}

SCORING RUBRIC:
${evaluationContext.rubric}

EVALUATION INSTRUCTIONS:
${evaluationContext.instructions}

DOCUMENT TO EVALUATE:
${document}

Please provide a thorough evaluation including:
1. A score between ${criterion.minScore} and ${criterion.maxScore}
2. Detailed feedback explaining the score
3. Specific strengths you identified
4. Areas that could be improved

Be objective, fair, and provide specific examples from the document to support your assessment.
      `;
    },
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    const { criterion } = results.preprocessStepResult;
    
    // Ensure score is within the valid range
    const score = Math.max(criterion.minScore, Math.min(criterion.maxScore, analysis.score));
    
    // Normalize to 0-1 range for Mastra
    return score / criterion.maxScore;
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    const { criterion } = results.preprocessStepResult;
    
    return `
Score: ${analysis.score}/${criterion.maxScore} (Normalized: ${score.toFixed(2)})
Weight: ${criterion.weight}

Feedback: ${analysis.feedback}

Strengths:
${analysis.strengths.map(s => `- ${s}`).join('\n')}

Areas for Improvement:
${analysis.improvements.map(i => `- ${i}`).join('\n')}
    `;
  });
};

// Create a scorer for generating document summaries based on templates
export const createSummaryScorer = (templateConfig: {
  sections: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    prompt: string;
    required: boolean;
  }>;
}) => {
  return createScorer({
    name: 'document-summary-generator',
    description: 'Generate structured summary based on template',
    judge: {
      model: ai(MODELS.default.model),
      instructions: 'You are an expert document analyst. Extract information accurately and format it as requested.',
    },
  })
  .preprocess(({ run }) => {
    const { document, template } = run.input;
    return {
      document,
      sections: template.sections,
      totalSections: template.sections.length,
    };
  })
  .generateScore(({ run, results }) => {
    // For summary generation, we'll compute completeness based on successful section generation
    // This is a synchronous score calculation since the actual summary generation
    // happens in the workflow using the sections individually
    const { sections } = results.preprocessStepResult;
    
    // Return 1.0 as placeholder - the actual completeness will be calculated
    // in the workflow when individual sections are processed
    return 1.0;
  })
  .generateReason(({ run, results, score }) => {
    const { sections, totalSections } = results.preprocessStepResult;
    
    return `Summary template configured with ${totalSections} sections:
${sections.map((s: any) => `- ${s.name} (${s.type}, ${s.required ? 'required' : 'optional'})`).join('\n')}

Template ready for section-by-section processing.`;
  });
};

// Create a scorer for overall document evaluation
export const createOverallEvaluationScorer = () => {
  return createScorer({
    name: 'overall-document-evaluation',
    description: 'Provide overall evaluation and recommendation',
    judge: {
      model: ai(MODELS.default.model),
      instructions: 'You are an expert business analyst. Provide actionable, strategic recommendations based on evaluation data.',
    },
  })
  .preprocess(({ run }) => {
    const { document, criteriaScores, totalScore, maxScore } = run.input;
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    
    const scoresSummary = criteriaScores.map((c: any) => 
      `${c.name}: ${c.score}/${c.maxScore} (Weight: ${c.weight}) - ${c.feedback}`
    ).join('\n\n');
    
    return {
      document: document.substring(0, 1000), // Truncate for analysis
      scoresSummary,
      totalScore,
      maxScore,
      percentage,
    };
  })
  .analyze({
    description: 'Analyze overall document performance and generate comprehensive assessment',
    outputSchema: OverallEvaluationSchema,
    createPrompt: ({ run, results }) => {
      const { scoresSummary, totalScore, maxScore, percentage, document } = results.preprocessStepResult;
      
      return `
Based on the following evaluation results, provide a comprehensive overall assessment:

DOCUMENT PERFORMANCE:
Total Score: ${totalScore}/${maxScore} (${Math.round(percentage)}%)

INDIVIDUAL CRITERIA SCORES:
${scoresSummary}

DOCUMENT SAMPLE:
${document}...

Please provide:
1. A clear recommendation (approve/conditional_approval/reject)
2. Confidence level in your assessment (0-1)
3. Risk level assessment (low/medium/high)
4. Executive summary of the evaluation
5. Key findings that influenced your decision
6. Specific action items or recommendations

Base your recommendation on:
- Score ≥80%: Generally approve
- Score 60-79%: Conditional approval with specific requirements
- Score <60%: Recommend rejection with improvement areas

Consider the document quality, completeness, and alignment with requirements.
      `;
    },
  })
  .generateScore(({ run, results }) => {
    const { percentage } = results.preprocessStepResult;
    return percentage / 100; // Normalize to 0-1
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    const { percentage, totalScore, maxScore } = results.preprocessStepResult;
    
    return `
Overall Assessment: ${analysis.recommendation.toUpperCase()}
Score: ${totalScore}/${maxScore} (${Math.round(percentage)}%)
Confidence: ${(analysis.confidence * 100).toFixed(1)}%
Risk Level: ${analysis.riskLevel.toUpperCase()}

Executive Summary:
${analysis.summary}

Key Findings:
${analysis.keyFindings.map(f => `- ${f}`).join('\n')}

Recommended Actions:
${analysis.actionItems.map(a => `- ${a}`).join('\n')}
    `;
  });
};

// Basic document quality scorer (for when no custom criteria are provided)
export const createDocumentQualityScorer = () => {
  const QualitySchema = z.object({
    clarity: z.number().min(1).max(10).describe('Clarity and organization score'),
    completeness: z.number().min(1).max(10).describe('Completeness score'),
    technical: z.number().min(1).max(10).describe('Technical specifications score'),
    feasibility: z.number().min(1).max(10).describe('Feasibility score'),
    overall: z.number().min(1).max(10).describe('Overall quality score'),
    feedback: z.string().describe('Detailed feedback'),
  });

  return createScorer({
    name: 'basic-document-quality',
    description: 'Evaluate basic document quality metrics',
    judge: {
      model: ai(MODELS.default.model),
      instructions: 'You are an expert document evaluator. Provide fair, detailed assessments with specific examples.',
    },
  })
  .preprocess(({ run }) => {
    const { document } = run.input;
    return {
      document: document.substring(0, 2000), // Limit document size for analysis
    };
  })
  .analyze({
    description: 'Analyze document quality across multiple dimensions',
    outputSchema: QualitySchema,
    createPrompt: ({ run, results }) => {
      const { document } = results.preprocessStepResult;
      
      return `
Evaluate the following document on a scale of 1-10 for each criterion:
1. Clarity and Organization (1-10)
2. Completeness of Information (1-10)
3. Technical Specifications (1-10)
4. Feasibility (1-10)
5. Overall Quality (1-10)

Document:
${document}

Provide detailed feedback for each criterion and an overall assessment.
Be objective and specific in your evaluation.
      `;
    },
  })
  .generateScore(({ run, results }) => {
    const analysis = results.analyzeStepResult;
    
    const averageScore = (
      analysis.clarity + 
      analysis.completeness + 
      analysis.technical + 
      analysis.feasibility + 
      analysis.overall
    ) / 5;

    return averageScore / 10; // Normalize to 0-1
  })
  .generateReason(({ run, results, score }) => {
    const analysis = results.analyzeStepResult;
    
    return `
Document Quality Assessment:
- Clarity & Organization: ${analysis.clarity}/10
- Completeness: ${analysis.completeness}/10
- Technical Specifications: ${analysis.technical}/10
- Feasibility: ${analysis.feasibility}/10
- Overall Quality: ${analysis.overall}/10

Average Score: ${(score * 10).toFixed(1)}/10

Detailed Feedback:
${analysis.feedback}
    `;
  });
};
