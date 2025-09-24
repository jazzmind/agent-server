import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { 
  createCriterionScorer, 
  createSummaryScorer, 
  createOverallEvaluationScorer,
  createDocumentQualityScorer 
} from '../scorers/rfp-scorers';
import { rfpAgent } from '../agents/rfp-agent';
import { ingestionTool } from '../tools/ingestion-tool';
import { uploadDocumentToOpenAI } from '../utils/openai-files';
import { documentService } from '../services/document';

// NOTE: This workflow currently expects Prisma schema with summaryTemplate and scoringCriteria tables
// which don't exist in the current database. The workflow has been partially updated to use DocumentService
// for document operations, but template and criteria operations are commented out pending implementation
// of TemplateService and CriteriaService.

// Step 1: Document Ingestion and Processing
const documentIngestionStep = createStep({
  id: 'document-ingestion',
  description: 'Convert document to markdown, create sections, and store in RAG system',
  inputSchema: z.object({
    fileUrl: z.string().url(),
    fileType: z.enum(['pdf', 'docx']),
    originalFilename: z.string(),
    summaryTemplateId: z.string().optional(),
    scoringCriteriaId: z.string().optional(),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    markdown: z.string(),
    sectionsCount: z.number(),
    status: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [WORKFLOW] Starting document ingestion step');
    console.log('📄 [WORKFLOW] Input data:', JSON.stringify(inputData, null, 2));
    
    try {

      console.log('🚀 [WORKFLOW] Executing ingestion tool...');
      const result = await ingestionTool.execute({
        context: {
          fileUrl: inputData.fileUrl,
          fileType: inputData.fileType,
          originalFilename: inputData.originalFilename,
        },
        runtimeContext: new RuntimeContext(),
      });

      console.log('✅ [WORKFLOW] Document ingestion completed');
      console.log('📊 [WORKFLOW] Result:', {
        documentId: result.documentId,
        markdownLength: result.markdown?.length || 0,
        sectionsCount: result.sections?.length || 0,
        status: result.status
      });
      
      // Update document status to indicate ingestion is complete, starting summary
      await documentService.updateDocument(result.documentId, {
        status: 'PROCESSING',  // Keep as processing but we know ingestion is done
        metadata: {
          purpose: 'rfp',
          step: 'summary-generation',
          progress: 33,
          lastUpdated: new Date().toISOString()
        }
      });
      console.log('📊 [WORKFLOW] Updated document status: ingestion complete, starting summary');

      return {
        documentId: result.documentId,
        markdown: result.markdown,
        sectionsCount: result.sections.length,
        status: result.status,
      };
    } catch (error: any) {
      console.error('❌ [WORKFLOW] Document ingestion failed:', error);
      console.error('❌ [WORKFLOW] Error stack:', error?.stack);
      
      // Try to update document with failure info if we have the fileUrl
      try {
        await documentService.updateDocumentsByFileUrl(inputData.fileUrl, 'FAILED', {
          purpose: 'rfp',
          step: 'document-ingestion-failed',
          progress: 0,
          lastUpdated: new Date().toISOString(),
          error: error.message || 'Document ingestion failed',
          failurePoint: 'ingestion',
          canRetry: true,
          retryOptions: ['upload_chunk_embed']
        });
      } catch (updateError) {
        console.error('❌ [WORKFLOW] Failed to update document failure status:', updateError);
      }
      
      throw error;
    }
  },
});

// Step 2A: Unified Summary Generation (New Approach)
const unifiedSummaryGenerationStep = createStep({
  id: 'unified-summary-generation',
  description: 'Generate document summary using all template sections in a single LLM call with dynamic Zod schema',
  inputSchema: z.object({
    documentId: z.string(),
    markdown: z.string(),
    sectionsCount: z.number(),
    status: z.string(),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    summary: z.record(z.any()),
    templateUsed: z.string().optional(),
    completeness: z.number(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [WORKFLOW-UNIFIED] Starting unified summary generation step');
    console.log('📄 [WORKFLOW-UNIFIED] Input data:', JSON.stringify(inputData, null, 2));
    
    const { documentId } = inputData;
    
    try {
      console.log('🔍 [WORKFLOW-UNIFIED] Fetching document from database...');
      // Get document with sections
      const document = await documentService.getDocumentWithSections(documentId);

      if (!document) {
        console.error('❌ [WORKFLOW-UNIFIED] Document not found:', documentId);
        throw new Error(`Document not found: ${documentId}`);
      }
      
      console.log('📊 [WORKFLOW-UNIFIED] Document found:', {
        id: document.id,
        filename: document.original_filename,
        markdownLength: document.markdown?.length || 0,
        sectionsCount: document.sections?.length || 0,
      });

      // TODO: Template support requires TemplateService - for now use fallback
      let template: any = null;
      
      // Check if template ID is provided in metadata or input
      const templateId = (document.metadata as any)?.summaryTemplateId || inputData.summaryTemplateId;
      if (templateId) {
        console.log('🔍 [WORKFLOW-UNIFIED] Template ID found in metadata, but TemplateService not implemented yet');
        // TODO: Implement TemplateService and get template by ID
      }
      
      if (!template) {
        console.warn('⚠️ [WORKFLOW-UNIFIED] No template service available - using fallback template');
      }

      let summary: Record<string, any> = {};
      let completeness = 0;
      let prompt = `Please provide a comprehensive summary of the following document with these sections:
1. Key Information (summary of all the important information in the document)
2. Contact Information (any contact details provided in the document)
Document content:
${document.markdown}`;

      let input = [
        {
          role: 'system',
          content: 'You are analyzing a document to create a comprehensive summary. Extract the requested information from the document content provided.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];
      
      let options = { 
        structuredOutput: { 
            schema: z.object({
              keyInformation: z.array(z.string()),
              contactInfo: z.string(),
            }), 
            errorStrategy: 'warn',
            maxSteps: 1 
        } 
      };

      let sections = [];

      if (template) {
        console.log('📝 [WORKFLOW-UNIFIED] Starting unified template-based summary generation');
        // Use unified template-based summary generation
        sections = template.sections as Array<{
          id: string;
          name: string;
          description: string;
          type: string;
          prompt: string;
          required: boolean;
        }>;

        console.log(`📋 [WORKFLOW-UNIFIED] Processing ${sections.length} template sections in single unified call`);
        
        // Check if summary already exists in metadata
        let existingSummary = (document.metadata as any)?.summary || {};
        if (Object.keys(existingSummary).length > 0) {
          console.log('✅ [WORKFLOW-UNIFIED] Summary already exists, skipping generation');
          return {
            documentId,
            summary: existingSummary,
            templateUsed: template?.id,
            completeness: 1.0,
          };
        }
        
        // 🚀 BUILD DYNAMIC ZOD SCHEMA based on template sections
        console.log('🔧 [WORKFLOW-UNIFIED] Building dynamic Zod schema...');
        const zodSchemaFields: Record<string, any> = {};
        prompt = `Analyze the following document and extract information for each section:\n\n`;
        
        sections.forEach((section, index) => {
          // Add section to unified prompt
          prompt += `## ${index + 1}. ${section.name}\n`;
          prompt += `Description: ${section.description}\n`;
          prompt += `Instructions: ${section.prompt}\n`;
          prompt += `Required: ${section.required ? 'Yes' : 'No'}\n\n`;
          
          // Build Zod schema field based on section type
          switch (section.type) {
            case 'array':
              zodSchemaFields[section.id] = z.array(z.string()).describe(`${section.name}: ${section.description}`);
              break;
            case 'object':
              zodSchemaFields[section.id] = z.record(z.any()).describe(`${section.name}: ${section.description}`);
              break;
            case 'number':
              zodSchemaFields[section.id] = z.number().describe(`${section.name}: ${section.description}`);
              break;
            case 'boolean':
              zodSchemaFields[section.id] = z.boolean().describe(`${section.name}: ${section.description}`);
              break;
            default: // 'text' or any other type
              zodSchemaFields[section.id] = z.string().describe(`${section.name}: ${section.description}`);
          }
          
          // Make optional if not required
          if (!section.required) {
            zodSchemaFields[section.id] = zodSchemaFields[section.id].optional();
          }
        });
        
        // Create dynamic Zod schema
        const dynamicSchema = z.object(zodSchemaFields);
        
        prompt += `\nProvide your analysis as a JSON object with the following structure:\n`;
        prompt += `- Each section should be a key in the JSON object\n`;
        prompt += `- Follow the data types specified for each section\n`;
        prompt += `- Ensure all required sections are included\n`;
        prompt += `- Extract information directly from the document content\n\n`;
        prompt += `Document content:\n\n${document.markdown}`;
        
        console.log(`🤖 [WORKFLOW-UNIFIED] Making single comprehensive LLM call...`);
        console.log(`📝 [WORKFLOW-UNIFIED] Unified prompt length: ${prompt.length} characters`);
        console.log(`🔧 [WORKFLOW-UNIFIED] Dynamic schema fields: ${Object.keys(zodSchemaFields).join(', ')}`);
        
        input = [
          {
            role: 'system',
            content: `You are analyzing a document to extract structured information according to a template. You will receive the document content directly and must extract information for multiple sections in a single response. Ensure your JSON response matches the exact schema requirements.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ];
        // 🚀 SINGLE LLM CALL with dynamic schema and markdown content
        options.structuredOutput.schema = dynamicSchema as any; 
      }

      // @ts-ignore - Skip type checking for generateVNext to avoid deep instantiation
      const agentResult = await rfpAgent.generateVNext(input, options);

      console.log(`✅ [WORKFLOW-UNIFIED] Unified LLM call completed successfully`);
      console.log(`📄 [WORKFLOW-UNIFIED] Result keys: ${Object.keys(agentResult.object || {}).join(', ')}`);
      
      summary = agentResult.object || {};
      const completedSections = Object.keys(summary).length;
      completeness = sections?.length > 0 ? completedSections / sections?.length : 0;
      
      console.log(`📊 [WORKFLOW-UNIFIED] Summary generation completed: ${completedSections}/${sections.length} sections (${Math.round(completeness * 100)}%)`);

      // Update document with final summary and progress
      console.log(`💾 [WORKFLOW-UNIFIED] Updating document ${documentId} with unified summary...`);
      await documentService.updateDocument(documentId, {
        metadata: {
          purpose: 'rfp',
          step: 'evaluation',
          progress: 66,
          lastUpdated: new Date().toISOString(),
          summaryCompleted: true,
          completedSections: Object.keys(summary),
          totalSections: sections.length,
          unifiedApproach: true, // Flag to indicate this used the new approach
          summary, // Store summary in metadata
          summaryTemplateId: template?.id || undefined,
        },
      });

      console.log(`✅ [WORKFLOW-UNIFIED] Document updated with unified template-based summary`);
      console.log(`✅ [WORKFLOW-UNIFIED] Unified summary generation step completed successfully`);
      console.log(`📊 [WORKFLOW-UNIFIED] Summary result:`, {
        documentId,
        summaryKeys: Object.keys(summary),
        templateUsed: template?.id,
        completeness: Math.round(completeness * 100) + '%'
      });

      return {
        documentId,
        summary,
        templateUsed: template?.id,
        completeness,
      };
    } catch (error: any) {
      console.error('❌ [WORKFLOW-UNIFIED] Unified summary generation failed:', error);
      console.error('❌ [WORKFLOW-UNIFIED] Error stack:', error?.stack);
      
      // Update document with failure info
      try {
        await documentService.updateDocument(documentId, {
          status: 'FAILED',
          metadata: {
            purpose: 'rfp',
            step: 'unified-summary-generation-failed',
            progress: 33,
            lastUpdated: new Date().toISOString(),
            error: error.message || 'Unified summary generation failed',
            failurePoint: 'unified-summary',
            canRetry: true,
            retryOptions: ['template_change', 'section_retry'],
            unifiedApproach: true
          }
        });
      } catch (updateError) {
        console.error('❌ [WORKFLOW-UNIFIED] Failed to update document failure status:', updateError);
      }
      
      throw error;
    }
  },
});

// Step 2B: Original Summary Generation (Parallel Approach - Backup)
const summaryGenerationStep = createStep({
  id: 'summary-generation',
  description: 'Generate document summary using provided template with Mastra scorer',
  inputSchema: z.object({
    documentId: z.string(),
    markdown: z.string(),
    sectionsCount: z.number(),
    status: z.string(),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    summary: z.record(z.any()),
    templateUsed: z.string().optional(),
    completeness: z.number(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [WORKFLOW] Starting summary generation step');
    console.log('📄 [WORKFLOW] Input data:', JSON.stringify(inputData, null, 2));
    
    const { documentId } = inputData;
    
    try {
      console.log('🔍 [WORKFLOW] Fetching document from database...');
      // Get document and template
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          sections: true,
          summaryTemplate: true,
        },
      });

      if (!document) {
        console.error('❌ [WORKFLOW] Document not found:', documentId);
        throw new Error(`Document not found: ${documentId}`);
      }
      
      console.log('📊 [WORKFLOW] Document found:', {
        id: document.id,
        filename: document.originalFilename,
        markdownLength: document.markdown?.length || 0,
        sectionsCount: document.sections?.length || 0,
        hasTemplate: !!document.summaryTemplate
      });

      // Get template - use the one associated with the document or get a default one
      let template = document.summaryTemplate;
      
      if (!template) {
        console.log('🔍 [WORKFLOW] No template found, searching for default...');
        // Try to get the first available template as default
        template = await prisma.summaryTemplate.findFirst({
          orderBy: { createdAt: 'desc' },
        });
        
        if (template) {
          console.log('📋 [WORKFLOW] Using default template:', template.name);
        } else {
          console.warn('⚠️ [WORKFLOW] No templates available');
        }
      } else {
        console.log('📋 [WORKFLOW] Using document template:', template.name);
      }

      let summary: Record<string, any> = {};
      let completeness = 0;
      
      if (template) {
        console.log('📝 [WORKFLOW] Starting template-based summary generation');
        // Use template-based summary generation
        const sections = template.sections as Array<{
          id: string;
          name: string;
          description: string;
          type: string;
          prompt: string;
          required: boolean;
        }>;

        console.log(`📋 [WORKFLOW] Processing ${sections.length} template sections in parallel`);
        
        // Check for existing summary to support partial retry
        let existingSummary = document.summary as Record<string, any> || {};
        const completedSections = Object.keys(existingSummary);
        const sectionsToProcess = sections.filter(section => !completedSections.includes(section.id));
        
        console.log(`📊 [WORKFLOW] Found ${completedSections.length} already completed sections`);
        console.log(`🔄 [WORKFLOW] Processing ${sectionsToProcess.length} remaining sections`);
        
        if (sectionsToProcess.length === 0) {
          console.log(`✅ [WORKFLOW] All sections already completed, skipping to next step`);
          return {
            documentId,
            summary: existingSummary,
            templateUsed: template?.id,
            completeness: 1.0,
          };
        }
        
        // Upload document to OpenAI File API for efficient token management and caching
        let openaiFileId = (document.metadata as any)?.openaiFileId;
        
        if (!openaiFileId) {
          try {
            openaiFileId = await uploadDocumentToOpenAI(
              document.markdown, 
              `${document.originalFilename}.md`
            );
            
            // Save file ID to document metadata
            await prisma.document.update({
              where: { id: documentId },
              data: {
                metadata: {
                  ...(document.metadata as any || {}),
                  openaiFileId,
                  fileUploadedAt: new Date().toISOString()
                }
              }
            });
            
          } catch (error: any) {
            console.error('❌ [WORKFLOW] Failed to upload document to OpenAI:', error);
            throw new Error(`Failed to upload document to OpenAI: ${error.message}`);
          }
        } else {
          console.log(`✅ [WORKFLOW] Using existing OpenAI file: ${openaiFileId}`);
        }

        // Process only remaining sections in parallel with staggered start to avoid rate limits
        const sectionPromises = sectionsToProcess.map(async (section, index) => {
          // Stagger requests to avoid overwhelming OpenAI API
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 500)); // 500ms stagger
          }
          console.log(`🔄 [WORKFLOW] Starting section ${index + 1}/${sectionsToProcess.length}: ${section.name}`);
          
          try {
            // Create an optimized prompt that references the uploaded file
            const prompt = `Based on the document uploaded as file ID: ${openaiFileId}, ${section.prompt}

${section.description}

Please analyze the uploaded document file and provide your response as valid ${section.type === 'array' ? 'JSON array' : section.type === 'object' ? 'JSON object' : 'plain text'}. If JSON, ensure proper escaping of quotes and special characters.

Focus your analysis on the content within the uploaded document file.`;

            console.log(`🤖 [WORKFLOW] Calling OpenAI for section: ${section.name}`);
            console.log(`📝 [WORKFLOW] Prompt length: ${prompt.length} characters`);
            
            // Use conversation structure with file reference for optimal token usage
            const agentResult = await rfpAgent.generateVNext([
              {
                role: 'system',
                content: `You are analyzing a document for the "${section.name}" section. The document has been uploaded to OpenAI with file ID: ${openaiFileId}. Focus on extracting relevant information efficiently from this document.`,
                type: 'text',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompt,
                  },
                  {
                    type: 'file',
                    data: openaiFileId,
                    mediaType: 'text/markdown',
                  }
                ],
              },
            ]);

            console.log(`✅ [WORKFLOW] OpenAI response received for section: ${section.name}`);
            console.log(`📄 [WORKFLOW] Response length: ${agentResult.text?.length || 0} characters`);
            console.log(`📝 [WORKFLOW] Response preview: ${agentResult.text?.substring(0, 200)}...`);

            let content = agentResult.text;
            
            // Enhanced JSON parsing with better error handling
            if (section.type === 'array' || section.type === 'object') {
              console.log(`🔄 [WORKFLOW] Attempting to parse JSON for section: ${section.name}`);
              try {
                // Try to clean up common JSON issues before parsing
                let cleanedResponse = agentResult.text.trim();
                
                // Remove markdown code blocks if present
                if (cleanedResponse.startsWith('```json')) {
                  cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (cleanedResponse.startsWith('```')) {
                  cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                
                content = JSON.parse(cleanedResponse);
                console.log(`✅ [WORKFLOW] Successfully parsed JSON for section: ${section.name}`);
              } catch (parseError: any) {
                console.warn(`⚠️ [WORKFLOW] JSON parsing failed for section: ${section.name}`);
                console.warn(`⚠️ [WORKFLOW] Parse error: ${parseError?.message}`);
                console.warn(`⚠️ [WORKFLOW] Raw response: ${agentResult.text.substring(0, 500)}...`);
                
                // Try to extract JSON from text if it's embedded
                const jsonMatch = agentResult.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                if (jsonMatch) {
                  try {
                    content = JSON.parse(jsonMatch[0]);
                    console.log(`✅ [WORKFLOW] Recovered JSON from text for section: ${section.name}`);
                  } catch {
                    console.warn(`⚠️ [WORKFLOW] Could not recover JSON, keeping as text for section: ${section.name}`);
                    // Keep as text if all parsing attempts fail
                  }
                }
              }
            }
            
            // Save this section immediately to the database for incremental progress
            try {
              const updatedSummary = { ...existingSummary, [section.id]: content };
              await prisma.document.update({
                where: { id: documentId },
                data: { 
                  summary: updatedSummary,
                  metadata: {
                    purpose: 'rfp',
                    step: 'summary-generation',
                    progress: 33 + (Object.keys(updatedSummary).length / sections.length) * 33, // Progress between 33-66%
                    lastUpdated: new Date().toISOString(),
                    completedSections: Object.keys(updatedSummary),
                    totalSections: sections.length
                  }
                },
              });
              console.log(`💾 [WORKFLOW] Saved section "${section.name}" to database`);
              
              // Update the local copy for other concurrent operations
              existingSummary[section.id] = content;
            } catch (saveError: any) {
              console.error(`❌ [WORKFLOW] Failed to save section ${section.id}:`, saveError);
              // Continue processing even if save fails
            }
            
            console.log(`✅ [WORKFLOW] Completed section ${index + 1}/${sectionsToProcess.length}: ${section.name}`);
            return { sectionId: section.id, content, success: true };
          } catch (error: any) {
            console.error(`❌ [WORKFLOW] Error generating section ${section.id}:`, error);
            console.error(`❌ [WORKFLOW] Error stack:`, error?.stack);
            return { 
              sectionId: section.id, 
              content: section.required ? 'Error: Could not generate content' : null, 
              success: false 
            };
          }
        });

        // Wait for all remaining sections to complete
        console.log(`⏳ [WORKFLOW] Waiting for all ${sectionsToProcess.length} remaining sections to complete...`);
        const sectionResults = await Promise.all(sectionPromises);
        
        // Combine existing and new results
        const summary = { ...existingSummary };
        let newlyCompletedSections = 0;
        sectionResults.forEach(result => {
          summary[result.sectionId] = result.content;
          if (result.success) newlyCompletedSections++;
        });
        
        const totalCompletedSections = Object.keys(summary).length;
        completeness = sections.length > 0 ? totalCompletedSections / sections.length : 0;
        console.log(`📊 [WORKFLOW] Summary generation completed: ${totalCompletedSections}/${sections.length} sections (${Math.round(completeness * 100)}%)`);
        console.log(`📊 [WORKFLOW] Newly processed: ${newlyCompletedSections}, Previously completed: ${completedSections.length}`);

        // Update document with final summary and progress
        console.log(`💾 [WORKFLOW] Updating document ${documentId} with complete summary...`);
        await prisma.document.update({
          where: { id: documentId },
          data: {
            summary,
            summaryTemplateId: template.id,
            metadata: {
              step: 'evaluation',
              progress: 66,
              lastUpdated: new Date().toISOString(),
              summaryCompleted: true,
              completedSections: Object.keys(summary),
              totalSections: sections.length
            },
          },
        });
        console.log(`✅ [WORKFLOW] Document updated with template-based summary`);
      } else {
        console.log('📝 [WORKFLOW] No template available, using basic summary generation');
        
        // Check if basic summary already exists
        let summary = document.summary as Record<string, any> || {};
        if (Object.keys(summary).length > 0) {
          console.log('✅ [WORKFLOW] Basic summary already exists, skipping generation');
          completeness = 1.0;
        } else {
          // Use agent for basic summary generation with file reference
          console.log(`🤖 [WORKFLOW] Calling OpenAI for basic summary...`);
          
          // Ensure we have the OpenAI file ID for basic summary too
          let basicSummaryFileId = (document.metadata as any)?.openaiFileId;
          if (!basicSummaryFileId) {
            try {
              basicSummaryFileId = await uploadDocumentToOpenAI(
                document.markdown, 
                `${document.originalFilename}.md`
              );
              
              // Save file ID to document metadata
              await prisma.document.update({
                where: { id: documentId },
                data: {
                  metadata: {
                    ...(document.metadata as any || {}),
                    openaiFileId: basicSummaryFileId,
                    fileUploadedAt: new Date().toISOString()
                  }
                }
              });
              
            } catch (error: any) {
              console.error('❌ [WORKFLOW] Failed to upload document to OpenAI for basic summary:', error);
              throw new Error(`Failed to upload document to OpenAI: ${error.message}`);
            }
          }
          const prompt = `Please provide a comprehensive summary of the document (file ID: ${basicSummaryFileId}) with the following sections:
              
1. Executive Summary (2-3 sentences)
2. Key Requirements (bullet points)  
3. Timeline and Deadlines
4. Budget/Financial Information
5. Evaluation Criteria
6. Contact Information

Analyze the uploaded document file and provide your response as a JSON object with the above sections as keys.`;
          const input = [
            {
              role: 'system',
              content: `You are analyzing a document to create a comprehensive summary. The document has been uploaded to OpenAI with file ID: ${basicSummaryFileId}.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ];
          const output = z.object({
            executiveSummary: z.string(),
            keyRequirements: z.array(z.string()),
            timeline: z.string(),
            budget: z.string(),
            evaluationCriteria: z.string(),
            contactInfo: z.string(),
          });
          const options = {
            structuredOutput: {
              schema: output,
              errorStrategy: 'warn',
              maxSteps: 1
            }
          };
          //@ts-ignore - Skip type checking for generateVNext to avoid deep instantiation
          const agentResult = await rfpAgent.generateVNext(input,options);

          console.log(`✅ [WORKFLOW] Basic summary generation completed`);
          summary = agentResult.object || {};
          completeness = 1.0; // Assume complete for basic summary

          console.log(`💾 [WORKFLOW] Updating document ${documentId} with basic summary...`);
          await prisma.document.update({
            where: { id: documentId },
            data: { 
              summary,
              metadata: {
                step: 'evaluation',
                progress: 66,
                lastUpdated: new Date().toISOString(),
                summaryCompleted: true
              }
            },
          });
          console.log(`✅ [WORKFLOW] Document updated with basic summary`);
        }
      }

      console.log(`✅ [WORKFLOW] Summary generation step completed successfully`);
      console.log(`📊 [WORKFLOW] Summary result:`, {
        documentId,
        summaryKeys: Object.keys(summary),
        templateUsed: template?.id,
        completeness: Math.round(completeness * 100) + '%'
      });

      return {
        documentId,
        summary,
        templateUsed: template?.id,
        completeness,
      };
    } catch (error: any) {
      console.error('❌ [WORKFLOW] Summary generation failed:', error);
      console.error('❌ [WORKFLOW] Error stack:', error?.stack);
      
      // Update document with failure info
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'FAILED',
            metadata: {
              purpose: 'rfp',
              step: 'summary-generation-failed',
              progress: 33,
              lastUpdated: new Date().toISOString(),
              error: error.message || 'Summary generation failed',
              failurePoint: 'summary',
              canRetry: true,
              retryOptions: ['openai_upload', 'template_change', 'section_retry']
            }
          }
        });
      } catch (updateError) {
        console.error('❌ [WORKFLOW] Failed to update document failure status:', updateError);
      }
      
      throw error;
    }
  },
});

// Step 3: Document Evaluation using Mastra Scorers
const evaluationStep = createStep({
  id: 'document-evaluation',
  description: 'Evaluate document using scoring criteria with Mastra scorers',
  inputSchema: z.object({
    documentId: z.string(),
    summary: z.record(z.any()),
    templateUsed: z.string().optional(),
    completeness: z.number(),
  }),
  outputSchema: z.object({
    evaluation: z.object({
      totalScore: z.number(),
      maxScore: z.number(),
      percentage: z.number(),
      criteriaScores: z.array(z.object({
        criterionId: z.string(),
        name: z.string(),
        score: z.number(),
        maxScore: z.number(),
        weight: z.number(),
        feedback: z.string(),
        strengths: z.array(z.string()),
        improvements: z.array(z.string()),
      })),
      overallFeedback: z.string(),
      recommendation: z.string(),
      confidence: z.number(),
      riskLevel: z.string(),
    }),
    criteriaUsed: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    console.log('🔄 [WORKFLOW] Starting document evaluation step');
    console.log('📄 [WORKFLOW] Input data:', JSON.stringify(inputData, null, 2));
    
    const { documentId } = inputData;
    
    try {
      console.log('🔍 [WORKFLOW] Fetching document for evaluation...');
      // Get document and criteria
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          sections: true,
          scoringCriteria: true,
        },
      });

      if (!document) {
        console.error('❌ [WORKFLOW] Document not found for evaluation:', documentId);
        throw new Error(`Document not found: ${documentId}`);
      }
      
      console.log('📊 [WORKFLOW] Document found for evaluation:', {
        id: document.id,
        filename: document.originalFilename,
        hasSummary: !!document.summary,
        hasCriteria: !!document.scoringCriteria
      });

      // Get criteria - use the one associated with the document or get a default one
      let criteria = document.scoringCriteria;
      
      if (!criteria) {
        console.log('🔍 [WORKFLOW] No criteria found, searching for default...');
        // Try to get the first available criteria as default
        criteria = await prisma.scoringCriteria.findFirst({
          orderBy: { createdAt: 'desc' },
        });
        
        if (criteria) {
          console.log('📊 [WORKFLOW] Using default criteria:', criteria.name);
        } else {
          console.warn('⚠️ [WORKFLOW] No scoring criteria available');
        }
      } else {
        console.log('📊 [WORKFLOW] Using document criteria:', criteria.name);
      }

      let evaluation: any = {};
      
      if (criteria) {
        console.log('📊 [WORKFLOW] Starting criteria-based evaluation');
      } else {
        console.log('📊 [WORKFLOW] Starting basic quality evaluation');
      }
      
      if (criteria) {
      // Use Mastra scorers for criteria-based evaluation
      const criteriaList = criteria.criteria as Array<{
        id: string;
        name: string;
        description: string;
        weight: number;
        minScore: number;
        maxScore: number;
        rubric: string;
        prompt: string;
      }>;

      const criteriaScores = [];
      let totalScore = 0;
      let maxScore = 0;

      // Evaluate against each criterion using Mastra scorers
      for (const criterion of criteriaList) {
        const criterionScorer = createCriterionScorer(criterion);
        
        const result = await criterionScorer.run({
          input: {
            document: document.markdown,
            context: { criterion },
          },
          output: {}, // Placeholder output for scorer
        });

        // Get the normalized score and convert back to original range
        const normalizedScore = result.score;
        const originalScore = normalizedScore * criterion.maxScore;
        
        const weightedScore = originalScore * criterion.weight;
        const weightedMaxScore = criterion.maxScore * criterion.weight;
        
        totalScore += weightedScore;
        maxScore += weightedMaxScore;

        criteriaScores.push({
          criterionId: criterion.id,
          name: criterion.name,
          score: originalScore,
          maxScore: criterion.maxScore,
          weight: criterion.weight,
          feedback: result.analyzeStepResult?.feedback || 'No feedback provided',
          strengths: result.analyzeStepResult?.strengths || [],
          improvements: result.analyzeStepResult?.improvements || [],
        });
      }

      // Generate overall evaluation using Mastra scorer
      const overallScorer = createOverallEvaluationScorer();
      const overallResult = await overallScorer.run({
        input: {
          document: document.markdown,
          criteriaScores: criteriaScores.map(c => ({
            name: c.name,
            score: c.score,
            maxScore: c.maxScore,
            weight: c.weight,
            feedback: c.feedback,
          })),
          totalScore,
          maxScore,
        },
        output: {}, // Placeholder output for scorer
      });

      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
      const analysisResult = overallResult.analyzeStepResult;

      evaluation = {
        totalScore,
        maxScore,
        percentage: Math.round(percentage * 100) / 100,
        criteriaScores,
        overallFeedback: analysisResult?.summary || 'No overall feedback provided',
        recommendation: analysisResult?.recommendation || 'conditional_approval',
        confidence: analysisResult?.confidence || 0.5,
        riskLevel: analysisResult?.riskLevel || 'medium',
      };

      // Update document with evaluation and mark as completed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          evaluation,
          scoringCriteriaId: criteria.id,
          status: 'COMPLETED',
          metadata: {
            purpose: 'rfp',
            step: 'completed',
            progress: 100,
            lastUpdated: new Date().toISOString(),
            evaluationCompleted: true
          },
        },
      });
    } else {
      // Use basic quality scorer when no criteria provided
      const qualityScorer = createDocumentQualityScorer();
      const result = await qualityScorer.run({
        input: { document: document.markdown },
        output: {}, // Placeholder output for scorer
      });

      const analysisResult = result.analyzeStepResult;
      const totalScore = result.score * 10; // Convert back to 1-10 scale
      const maxScore = 10;

      evaluation = {
        totalScore,
        maxScore,
        percentage: (totalScore / maxScore) * 100,
        criteriaScores: [
          {
            criterionId: 'clarity',
            name: 'Clarity and Organization',
            score: analysisResult?.clarity || 5,
            maxScore: 10,
            weight: 1,
            feedback: `Clarity score: ${analysisResult?.clarity || 5}/10`,
            strengths: [],
            improvements: [],
          },
          {
            criterionId: 'completeness',
            name: 'Completeness',
            score: analysisResult?.completeness || 5,
            maxScore: 10,
            weight: 1,
            feedback: `Completeness score: ${analysisResult?.completeness || 5}/10`,
            strengths: [],
            improvements: [],
          },
          {
            criterionId: 'technical',
            name: 'Technical Specifications',
            score: analysisResult?.technical || 5,
            maxScore: 10,
            weight: 1,
            feedback: `Technical score: ${analysisResult?.technical || 5}/10`,
            strengths: [],
            improvements: [],
          },
          {
            criterionId: 'feasibility',
            name: 'Feasibility',
            score: analysisResult?.feasibility || 5,
            maxScore: 10,
            weight: 1,
            feedback: `Feasibility score: ${analysisResult?.feasibility || 5}/10`,
            strengths: [],
            improvements: [],
          },
        ],
        overallFeedback: analysisResult?.feedback || 'No detailed feedback provided',
        recommendation: totalScore >= 8 ? 'approve' : totalScore >= 6 ? 'conditional_approval' : 'reject',
        confidence: 0.8,
        riskLevel: totalScore >= 8 ? 'low' : totalScore >= 6 ? 'medium' : 'high',
      };

      await prisma.document.update({
        where: { id: documentId },
        data: { 
          evaluation,
          status: 'COMPLETED',
          metadata: {
            purpose: 'rfp',
            step: 'completed',
            progress: 100,
            lastUpdated: new Date().toISOString(),
            evaluationCompleted: true
          }
        },
      });
    }

      console.log(`✅ [WORKFLOW] Document evaluation step completed successfully`);
      console.log(`📊 [WORKFLOW] Evaluation result:`, {
        documentId,
        totalScore: evaluation.totalScore,
        maxScore: evaluation.maxScore,
        percentage: evaluation.percentage,
        criteriaUsed: criteria?.id
      });

      return {
        evaluation,
        criteriaUsed: criteria?.id,
      };
    } catch (error: any) {
      console.error('❌ [WORKFLOW] Document evaluation failed:', error);
      console.error('❌ [WORKFLOW] Error stack:', error?.stack);
      
      // Update document with failure info
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'FAILED',
            metadata: {
              purpose: 'rfp',
              step: 'evaluation-failed',
              progress: 66,
              lastUpdated: new Date().toISOString(),
              error: error.message || 'Document evaluation failed',
              failurePoint: 'evaluation',
              canRetry: true,
              retryOptions: ['score_recalculation']
            }
          }
        });
      } catch (updateError) {
        console.error('❌ [WORKFLOW] Failed to update document failure status:', updateError);
      }
      
      throw error;
    }
  },
});

// Main Greensheet Workflow (Unified Approach - Default)
export const rfpWorkflow = createWorkflow({
  id: 'summarize-analysis-unified',
  description: 'Complete document analysis workflow for RFP processing using unified summary generation',
  inputSchema: z.object({
    fileUrl: z.string().url().describe('URL of the document to process'),
    fileType: z.enum(['pdf', 'docx']).describe('Type of document'),
    originalFilename: z.string().describe('Original filename'),
    summaryTemplateId: z.string().optional().describe('Optional template for summary generation'),
    scoringCriteriaId: z.string().optional().describe('Optional criteria for document evaluation'),
  }),
  outputSchema: z.object({
    evaluation: z.object({
      totalScore: z.number(),
      maxScore: z.number(),
      percentage: z.number(),
      criteriaScores: z.array(z.object({
        criterionId: z.string(),
        name: z.string(),
        score: z.number(),
        maxScore: z.number(),
        weight: z.number(),
        feedback: z.string(),
        strengths: z.array(z.string()),
        improvements: z.array(z.string()),
      })),
      overallFeedback: z.string(),
      recommendation: z.string(),
      confidence: z.number(),
      riskLevel: z.string(),
    }),
    criteriaUsed: z.string().optional(),
  }),
  retryConfig: {
    attempts: 3,
    delay: 2000,
  },
})
  .then(documentIngestionStep)
  .then(unifiedSummaryGenerationStep) // 🚀 Use unified approach
  .then(evaluationStep)
  .commit();

// Backup Greensheet Workflow (Parallel Approach - for fallback/testing)
export const rfpWorkflowParallel = createWorkflow({
  id: 'rfp-analysis-parallel',
  description: 'Complete document analysis workflow for RFP processing using parallel summary generation (backup)',
  inputSchema: z.object({
    fileUrl: z.string().url().describe('URL of the document to process'),
    fileType: z.enum(['pdf', 'docx']).describe('Type of document'),
    originalFilename: z.string().describe('Original filename'),
    summaryTemplateId: z.string().optional().describe('Optional template for summary generation'),
    scoringCriteriaId: z.string().optional().describe('Optional criteria for document evaluation'),
  }),
  outputSchema: z.object({
    evaluation: z.object({
      totalScore: z.number(),
      maxScore: z.number(),
      percentage: z.number(),
      criteriaScores: z.array(z.object({
        criterionId: z.string(),
        name: z.string(),
        score: z.number(),
        maxScore: z.number(),
        weight: z.number(),
        feedback: z.string(),
        strengths: z.array(z.string()),
        improvements: z.array(z.string()),
      })),
      overallFeedback: z.string(),
      recommendation: z.string(),
      confidence: z.number(),
      riskLevel: z.string(),
    }),
    criteriaUsed: z.string().optional(),
  }),
  retryConfig: {
    attempts: 3,
    delay: 2000,
  },
})
  .then(documentIngestionStep)
  .then(summaryGenerationStep) // Original parallel approach
  .then(evaluationStep)
  .commit();
