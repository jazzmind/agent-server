import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { templateGeneratorAgent } from '../agents/template-generator-agent';
import { ingestionTool } from '../tools/ingestion-tool';
import { documentService } from '../services/document';

// NOTE: This workflow has been updated to use DocumentService instead of Prisma
// Template storage and management would require a separate TemplateService

// Step 1: Document Ingestion and Processing (Reuse from RFP workflow)
const documentIngestionStep = createStep({
  id: 'document-ingestion',
  description: 'Convert document to markdown, create sections, and store in RAG system',
  inputSchema: z.object({
    fileUrl: z.string().url(),
    fileType: z.enum(['pdf', 'docx']),
    originalFilename: z.string(),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    markdown: z.string(),
    sectionsCount: z.number(),
    status: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [TEMPLATE-WORKFLOW] Starting document ingestion step');
    console.log('📄 [TEMPLATE-WORKFLOW] Input data:', JSON.stringify(inputData, null, 2));
    
    try {
      console.log('🚀 [TEMPLATE-WORKFLOW] Executing ingestion tool...');
      const result = await ingestionTool.execute({
        context: {
          fileUrl: inputData.fileUrl,
          fileType: inputData.fileType,
          originalFilename: inputData.originalFilename,
        },
        runtimeContext: new RuntimeContext(),
      });

      console.log('✅ [TEMPLATE-WORKFLOW] Document ingestion completed');
      console.log('📊 [TEMPLATE-WORKFLOW] Result:', {
        documentId: result.documentId,
        markdownLength: result.markdown?.length || 0,
        sectionsCount: result.sections?.length || 0,
        status: result.status
      });
      
      // Update document status to indicate template generation
      await documentService.updateDocument(result.documentId, {
        status: 'PROCESSING',
        metadata: {
          step: 'template-generation',
          progress: 50,
          lastUpdated: new Date().toISOString(),
          purpose: 'template-generation' // Flag to indicate this is for template generation
        }
      });
      console.log('📊 [TEMPLATE-WORKFLOW] Updated document status: ingestion complete, starting template generation');

      return {
        documentId: result.documentId,
        markdown: result.markdown,
        sectionsCount: result.sections.length,
        status: result.status,
      };
    } catch (error: any) {
      console.error('❌ [TEMPLATE-WORKFLOW] Document ingestion failed:', error);
      console.error('❌ [TEMPLATE-WORKFLOW] Error stack:', error?.stack);
      
      // Try to update document with failure info if we have the fileUrl
      try {
        await documentService.updateDocumentsByFileUrl(inputData.fileUrl, 'FAILED', {
          step: 'template-generation-ingestion-failed',
          progress: 0,
          lastUpdated: new Date().toISOString(),
          error: error.message || 'Document ingestion failed',
          failurePoint: 'ingestion',
          canRetry: true,
          purpose: 'template-generation'
        });
      } catch (updateError) {
        console.error('❌ [TEMPLATE-WORKFLOW] Failed to update document failure status:', updateError);
      }
      
      throw error;
    }
  },
});

// Step 2: Generate the summary template based on document analysis
const templateGenerationStep = createStep({
  id: 'template-generation',
  description: 'Generate summary template based on document structure and content',
  inputSchema: z.object({
    documentId: z.string(),
    markdown: z.string(),
    sectionsCount: z.number(),
    status: z.string(),
  }),
  outputSchema: z.object({
    template: z.object({
      name: z.string(),
      description: z.string(),
      sections: z.array(z.object({
        name: z.string(),
        description: z.string(),
        type: z.enum(['text', 'number', 'array', 'object']),
        prompt: z.string(),
        required: z.boolean(),
      })),
    }),
    documentId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [TEMPLATE-WORKFLOW] Starting template generation...');
    console.log('📄 [TEMPLATE-WORKFLOW] Document ID:', inputData.documentId);
    console.log('📊 [TEMPLATE-WORKFLOW] Markdown length:', inputData.markdown.length);
    
    try {
        // Get the document and its sections from database
        const document = await documentService.getDocumentWithSections(inputData.documentId);

        if (!document) {
            throw new Error(`Document not found: ${inputData.documentId}`);
        }

        console.log('📋 [TEMPLATE-WORKFLOW] Document found:', {
            id: document.id,
            filename: document.original_filename,
            sectionsCount: document.sections?.length || 0,
        });

        // Build sections info for the agent
        const sectionsInfo = document.sections?.map((section: any) => 
            `**${section.title}**\n${section.content.substring(0, 500)}...`
        ).join('\n\n') || '';

        console.log(`🤖 [TEMPLATE-WORKFLOW] Generating template with agent...`);
        
        const prompt = `I need you to analyze this document and generate a comprehensive summary template based on its structure and content.

**Source Document**: ${document.original_filename}

**Document Sections Analysis**:
The document has been processed and contains the following sections:

${sectionsInfo}

**Full Document Content** (for reference):
${inputData.markdown.substring(0, 15000)}...

**Your Task**:
Generate a summary template that could be used to extract similar information from other documents of this type. The template should:

1. Capture all the major information categories present in this document
2. Create clear, descriptive section names
3. Write specific prompts that guide AI extraction
4. Choose appropriate data types for each section
5. Mark critical sections as required

Please provide the template as a JSON object with the following structure:
{
  "name": "Template name based on document type",
  "description": "Description of when and how to use this template",
  "sections": [
    {
      "name": "Section name",
      "description": "What this section captures",
      "type": "text|number|array|object",
      "prompt": "Detailed prompt for AI extraction",
      "required": true/false
    }
  ]
}

Focus on creating 5-15 sections that cover all the important business information in the document.`;
        const input = [
            {
            role: 'system' as const,
            content: 'You are an expert at analyzing documents and creating summary templates. Your goal is to understand document structure and create reusable templates that can extract similar information from other documents of the same type.',
            },
            {
            role: 'user' as const,
            content: prompt,
            },
        ];
      
        const outputSchema = z.object({
            name: z.string(),
            description: z.string(),
            sections: z.array(z.object({
            name: z.string(),
            description: z.string(),
            type: z.enum(['text', 'number', 'array', 'object']),
            prompt: z.string(),
            required: z.boolean(),
            })),
        });
        
        // @ts-ignore - Suppress type checking to avoid deep instantiation error
        const options = { 
            structuredOutput: { 
                schema: outputSchema, 
                errorStrategy: 'warn',
                maxSteps: 1 
            } 
        };
        // @ts-ignore - Suppress type checking to avoid deep instantiation error
        const result = await templateGeneratorAgent.generateVNext(input, options);

        console.log('✅ [TEMPLATE-WORKFLOW] Agent response received');
        console.log('📊 [TEMPLATE-WORKFLOW] Response object keys:', Object.keys(result.object || {}));
        
        // Get the structured response from the agent
        let template = result.object as unknown as z.infer<typeof outputSchema>;
        
        if (!template || !template.sections || template.sections.length === 0) {
            console.warn('⚠️ [TEMPLATE-WORKFLOW] Invalid or empty template from agent, using fallback');
            
            // Fallback template based on common document sections
            template = {
            name: `Template for ${document.original_filename}`,
            description: 'Auto-generated template based on document analysis',
            sections: [
                {
                name: 'Executive Summary',
                description: 'High-level overview and key points from the document',
                type: 'text',
                prompt: 'Extract the main points and executive summary from the document, focusing on the most important information and key takeaways.',
                required: true,
                },
                {
                name: 'Key Requirements',
                description: 'Main requirements and specifications mentioned',
                type: 'array',
                prompt: 'List all the key requirements and specifications mentioned in the document as a JSON array of strings.',
                required: true,
                },
                {
                name: 'Timeline and Deadlines',
                description: 'Important dates and project timeline',
                type: 'text',
                prompt: 'Extract any timeline information, deadlines, milestones, or important dates mentioned in the document.',
                required: false,
                },
                {
                name: 'Budget and Financial Information',
                description: 'Financial details and budget constraints',
                type: 'text',
                prompt: 'Extract any budget information, financial constraints, pricing details, or cost considerations mentioned.',
                required: false,
                },
                {
                name: 'Contact Information',
                description: 'Relevant contact details and stakeholders',
                type: 'text',
                prompt: 'Extract contact information, project stakeholders, and key personnel mentioned in the document.',
                required: false,
                },
            ],
            };
        }

        // Update document status to completed
        await documentService.updateDocument(inputData.documentId, {
            status: 'COMPLETED',
            metadata: {
                step: 'template-generation-completed',
                progress: 100,
                lastUpdated: new Date().toISOString(),
                purpose: 'template-generation',
                templateGenerated: true,
                sectionsGenerated: template.sections.length,
                generatedTemplate: template // Store the generated template in metadata
            }
        });

        console.log('✅ [TEMPLATE-WORKFLOW] Template generation completed');
        console.log('📋 [TEMPLATE-WORKFLOW] Generated sections:', template.sections.length);

        return {
            template,
            documentId: inputData.documentId,
            success: true,
        };
    } catch (error) {
      console.error('❌ [TEMPLATE-WORKFLOW] Template generation failed:', error);
      
      // Update document with failure status
      try {
        await documentService.updateDocument(inputData.documentId, {
          status: 'FAILED',
          metadata: {
            step: 'template-generation-failed',
            progress: 50,
            lastUpdated: new Date().toISOString(),
            purpose: 'template-generation',
            error: error instanceof Error ? error.message : 'Unknown error',
            canRetry: true
          }
        });
      } catch (updateError) {
        console.error('❌ [TEMPLATE-WORKFLOW] Failed to update document failure status:', updateError);
      }
      
      return {
        template: {
          name: 'Failed Template',
          description: 'Template generation failed',
          sections: [],
        },
        documentId: inputData.documentId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Main Template Generation Workflow
export const templateGenerationWorkflow = createWorkflow({
  id: 'template-generation',
  description: 'Generate summary templates from existing summary documents',
  inputSchema: z.object({
    fileUrl: z.string().url().describe('URL of the document to analyze'),
    fileType: z.enum(['pdf', 'docx']).describe('Type of document'),
    originalFilename: z.string().describe('Original filename'),
  }),
  outputSchema: z.object({
    template: z.object({
      name: z.string().describe('Generated template name'),
      description: z.string().describe('Template description'),
      sections: z.array(z.object({
        name: z.string().describe('Section name'),
        description: z.string().describe('Section description'),
        type: z.enum(['text', 'number', 'array', 'object']).describe('Data type'),
        prompt: z.string().describe('AI extraction prompt'),
        required: z.boolean().describe('Whether section is required'),
      })).describe('Template sections'),
    }).describe('Generated summary template'),
    documentId: z.string().describe('ID of the processed document'),
    success: z.boolean().describe('Whether generation was successful'),
    error: z.string().optional().describe('Error message if generation failed'),
  }),
  retryConfig: {
    attempts: 2,
    delay: 1000,
  },
})
  .then(documentIngestionStep)
  .then(templateGenerationStep)
  .commit();
