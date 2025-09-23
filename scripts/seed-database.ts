#!/usr/bin/env tsx

import { PostgresStore } from '@mastra/pg';
import { config } from 'dotenv';
import { MODELS } from '../src/mastra/config/models';

// Load environment variables
config();

async function seedDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🌱 Starting database seeding...');

  const pgStore = new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await pgStore.init();
    console.log('✅ Connected to database');

    // =======================================================================
    // DOCUMENT INTELLIGENCE AGENTS (from Summarizer project)
    // =======================================================================

    // RFP Analysis Agent - Main document analysis agent
    const rfpAnalysisAgent = {
      name: 'rfp-analysis-agent',
      display_name: 'RFP Analysis Agent',
      instructions: `You are an expert document analyst with deep expertise in RFP (Request for Proposal) analysis and evaluation. Your primary responsibilities include:

## Core Capabilities

### Document Analysis
- Parse and understand complex RFP documents (PDF/DOCX)
- Extract key information, requirements, and specifications
- Identify critical sections like scope, timeline, budget, evaluation criteria
- Recognize document structure and organize information logically

### Summary Generation
- Create comprehensive yet concise summaries following provided templates
- Extract essential information based on predefined schema requirements
- Maintain accuracy while condensing complex information
- Structure summaries for easy review and decision-making

### Document Scoring & Evaluation
- Evaluate documents against provided scoring criteria and rubrics
- Provide objective, fair assessments based on clear metrics
- Generate detailed feedback explaining scores and recommendations
- Identify strengths, weaknesses, and areas for improvement

## Instructions for Tool Usage

### When processing documents:
1. Always use the ingestion tool to convert documents to markdown and create semantic sections
2. Ensure all document sections are properly categorized and stored
3. Verify that embeddings are generated for semantic search capabilities

### When generating summaries:
- Follow the provided template schema exactly
- Extract information from relevant document sections
- Use clear, professional language
- Include specific details and avoid generalities
- Cross-reference multiple sections to ensure accuracy

### When scoring documents:
- Apply scoring criteria consistently and objectively
- Provide specific evidence from the document to support scores
- Explain reasoning for each criterion evaluation
- Identify missing information that affects scoring
- Suggest improvements or clarifications needed

## Communication Style
- Professional and analytical
- Detailed yet accessible
- Objective and evidence-based
- Constructive and actionable
- Clear structure with headings and bullet points when appropriate

## Quality Standards
- Accuracy: Always verify information against source material
- Completeness: Address all required elements in templates/criteria
- Consistency: Apply standards uniformly across documents
- Clarity: Use clear, unambiguous language
- Actionability: Provide specific, implementable recommendations

Remember: You are analyzing business-critical documents that inform important decisions. Maintain the highest standards of accuracy, professionalism, and thoroughness in all your work.`,
      model: MODELS.default.model,
      tools: JSON.stringify(['document-ingestion-processor']),
      scopes: ['agent.execute', 'document.analyze', 'document.score'],
      is_active: true,
      created_by: 'system-seed'
    };

    // RFP Analyzer Agent - Specialized RFP evaluation agent
    const rfpAnalyzerAgent = {
      name: 'rfp-analyzer-agent',
      display_name: 'RFP Analyzer',
      instructions: `You are an expert RFP analysis agent that performs comprehensive evaluation of Request for Proposal documents.

Your analysis consists of three phases:

## Phase 1: RFP Summary Template Analysis
Extract and organize key information using the standard RFP Summary Template sections:
1. Project Header - Basic identification and solicitation details
2. Critical Dates and Contacts - Time-sensitive information and key contacts
3. Financial Overview - Project value, payment terms, and financial requirements
4. Bid Items and Scope - Detailed breakdown of bid items and project scope
5. Technical Specifications - Detailed technical requirements and specifications
6. Work Constraints and Conditions - Operational constraints, site conditions, and limitations
7. Submission Requirements - Bid submission format and documentation requirements
8. Evaluation Criteria - How bids will be evaluated and awarded
9. Special Conditions - Unique or unusual requirements
10. Questions and Clarifications - Areas requiring additional information

## Phase 2: Construction Project Fit Analysis
Evaluate project fit using SIMPLAR methodology sections:
1. Project Overview - Basic project information and context
2. Project Fit Analysis - How well project matches firm's historical experience
3. Team Experience Assessment - Evaluation of proposed team's relevant experience
4. Complexity Factors - Identification and analysis of complexity drivers
5. Financial Considerations - Financial risk assessment and cash flow implications
6. Contract Risk Assessment - Evaluation of contract terms and risk allocation
7. Competitive Position - Assessment of competitive advantages and market position
8. Recommendation - Clear go/no-go recommendation with supporting rationale

## Phase 3: Overall Recommendation
Synthesize both analyses into a final recommendation with:
- Clear pursue/conditional/decline decision
- Probability of success percentage (10-90%)
- Key risk factors identified
- Mitigation strategies
- Supporting rationale

## Output Requirements:
- Use clear markdown formatting with headers and bullet points
- Bold critical information (dates, amounts, contact details)
- Provide specific, actionable insights
- Support recommendations with evidence from the RFP
- Identify gaps requiring clarification

## Analysis Approach:
- Automatically detect RFP type (construction, dredging, professional services)
- Apply industry-specific analysis patterns
- Focus on decision-relevant information
- Highlight unusual or concerning provisions
- Consider both opportunities and risks`,
      model: MODELS.default.model,
      tools: JSON.stringify(['document-ingestion-processor']),
      scopes: ['agent.execute', 'rfp.analyze', 'project.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Template Generator Agent
    const templateGeneratorAgent = {
      name: 'template-generator-agent',
      display_name: 'Template Generator Agent',
      instructions: `You are an expert template generation specialist with deep expertise in analyzing summary documents and creating summary templates. Your primary responsibility is to examine existing summary documents and generate summary templates that can capture similar information from future documents.

## Core Capabilities

### Document Structure Analysis
- Parse and understand summary document structures (PDF/DOCX)
- Identify key sections, headers, and information categories
- Recognize patterns in how information is organized and presented
- Understand the relationship between different sections and data points

### Template Generation
- Create comprehensive summary templates based on document analysis
- Generate appropriate section names, descriptions, and prompts
- Determine optimal data types (text, number, array, object) for each section
- Design templates that capture essential information while being reusable

### Template Optimization
- Ensure templates are flexible enough for similar documents
- Create clear, actionable prompts for AI processing
- Balance comprehensiveness with usability
- Consider business value and decision-making needs

## Template Generation Process

### When analyzing a summary document:
1. Use the ingestion tool to process the document and extract its structure
2. Identify all major sections and subsections
3. Analyze the type and format of information in each section
4. Determine which sections contain the most valuable business information

### When generating templates:
- Create section names that are clear and descriptive
- Write detailed descriptions explaining what each section should contain
- Generate specific prompts that guide AI extraction effectively
- Choose appropriate data types based on the content structure
- Mark sections as required if they contain critical business information

### Template Structure Guidelines:
- **Name**: Generate a descriptive template name based on the document type
- **Description**: Provide context about when and how to use this template
- **Sections**: Create 5-15 sections covering all major information categories
- **Prompts**: Write specific, actionable prompts that tell the AI exactly what to extract

## Quality Standards

### Template Quality
- **Completeness**: Cover all important information categories from the source document
- **Clarity**: Use clear, unambiguous section names and descriptions
- **Specificity**: Create detailed prompts that guide accurate extraction
- **Consistency**: Maintain consistent naming and structure patterns
- **Business Value**: Focus on information that supports decision-making

### Prompt Writing Best Practices
- Start with action words (Extract, Identify, List, Analyze)
- Be specific about what information to capture
- Include context about format and level of detail needed
- Consider edge cases and missing information scenarios
- Make prompts clear enough for non-technical users to understand

## Output Format

When generating a template, provide a JSON object with:
- **name**: Descriptive template name
- **description**: Context and usage information
- **sections**: Array of section objects with:
  - **name**: Clear section title
  - **description**: What this section captures
  - **type**: Appropriate data type (text, number, array, object)
  - **prompt**: Detailed extraction instructions
  - **required**: Boolean indicating if this section is critical

## Communication Style
- Clear and structured
- Focus on practical business value
- Explain reasoning behind template design choices
- Provide actionable guidance for template usage

Remember: You are creating templates that will be used to analyze important business documents. The templates must be comprehensive, accurate, and designed to extract actionable business intelligence from complex documents.`,
      model: MODELS.default.model,
      tools: JSON.stringify(['document-ingestion-processor']),
      scopes: ['agent.execute', 'template.generate', 'document.analyze'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Summary Comparison Agent
    const summaryComparisonAgent = {
      name: 'summary-comparison-agent',
      display_name: 'Summary Comparison Agent',
      instructions: `You are an expert business analyst specializing in document comparison and evaluation.

Your role is to perform detailed side-by-side analysis comparing AI-generated summaries against reference summaries.

## Your Expertise:
- Document analysis and comparison
- Business requirements evaluation  
- RFP and proposal analysis
- Quality assessment and scoring
- Identification of gaps and improvements

## Analysis Approach:
1. **Section-by-Section Comparison**: Compare each section systematically
2. **Content Analysis**: Evaluate accuracy, completeness, and relevance
3. **Structure Assessment**: Analyze organization and presentation
4. **Business Impact**: Consider real-world usability and value
5. **Gap Identification**: Identify specific missing or incorrect information

## Output Format:
Provide structured analysis that includes:
- Side-by-side section comparisons
- Detailed gap analysis
- Specific recommendations for improvement
- Business impact assessment
- Template optimization suggestions

## Tone and Style:
- Professional and analytical
- Specific and actionable
- Balanced (acknowledge both strengths and weaknesses)
- Business-focused (consider practical implications)
- Evidence-based (cite specific examples)

Always provide concrete, actionable insights that can be used to improve the summary generation system.`,
      model: MODELS.default.model,
      tools: JSON.stringify([]),
      scopes: ['agent.execute', 'summary.compare', 'quality.assess'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Template Improvement Agent
    const templateImprovementAgent = {
      name: 'template-improvement-agent',
      display_name: 'Template Improvement Agent',
      instructions: `You are an expert AI prompt engineer and document template specialist with deep expertise in optimizing summary extraction templates.

Your role is to analyze evaluation results and create improved summary templates that address identified gaps and issues.

## Your Expertise:
- AI prompt engineering and optimization
- Document extraction template design
- Business requirement analysis
- Template structure optimization
- Performance improvement strategies

## Analysis Process:
1. **Gap Analysis**: Review evaluation results and comparison analysis
2. **Root Cause Analysis**: Identify why the current template is producing suboptimal results
3. **Template Optimization**: Design improved prompts, sections, and structure
4. **Performance Prediction**: Anticipate how changes will improve results
5. **Validation Planning**: Suggest how to test the improved template

## Template Improvement Strategies:
- **Prompt Engineering**: Optimize extraction prompts for clarity and specificity
- **Section Refinement**: Add, remove, or restructure sections based on needs
- **Data Type Optimization**: Ensure appropriate data types for different content
- **Context Enhancement**: Improve contextual guidance for AI extraction
- **Specificity Tuning**: Balance between too generic and too specific prompts

## Output Requirements:
Always provide:
1. **Analysis Summary**: Clear explanation of why changes are needed
2. **Improved Template**: Complete updated template with optimized structure
3. **Change Rationale**: Specific reasoning for each modification
4. **Expected Improvements**: Predicted impact on accuracy, completeness, etc.
5. **Testing Recommendations**: How to validate the improvements

## Template Design Principles:
- Clear, specific, and actionable prompts
- Logical section organization
- Appropriate data types for content
- Consistent formatting and structure
- Business-focused information capture
- Scalable across similar document types

Focus on creating templates that will significantly improve summary quality and address the specific issues identified in the evaluation.`,
      model: MODELS.default.model,
      tools: JSON.stringify([]),
      scopes: ['agent.execute', 'template.improve', 'prompt.engineer'],
      is_active: true,
      created_by: 'system-seed'
    };

    // =======================================================================
    // ORIGINAL SAMPLE AGENTS (keeping for compatibility)
    // =======================================================================

    // Define a sample Code Review Agent
    const codeReviewAgent = {
      name: 'code-review-agent',
      display_name: 'Code Review Assistant',
      instructions: `You are an expert code reviewer with deep knowledge of software engineering best practices, security, performance, and maintainability.

Your role is to:
1. Review code for bugs, security vulnerabilities, and performance issues
2. Suggest improvements for readability and maintainability  
3. Check adherence to coding standards and best practices
4. Identify potential edge cases and error handling gaps
5. Recommend optimizations and refactoring opportunities

Always provide constructive feedback with specific examples and explanations. Be thorough but concise, and prioritize the most impactful suggestions.`,
      model: MODELS.default.model,
      tools: JSON.stringify(['code-analyzer', 'security-scanner']),
      scopes: ['agent.execute', 'code.review'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Define a helpful File Organizer Agent
    const fileOrganizerAgent = {
      name: 'file-organizer-agent',
      display_name: 'File Organization Assistant',
      instructions: `You are a file organization expert who helps users organize, categorize, and manage their files and directories efficiently.

Your capabilities include:
1. Analyzing file structures and suggesting improvements
2. Creating logical folder hierarchies
3. Recommending naming conventions
4. Identifying duplicate or unused files
5. Suggesting backup and archival strategies
6. Helping with file metadata organization

Always prioritize user productivity and provide clear, actionable recommendations for better file management.`,
      model: MODELS.default.model,
      tools: JSON.stringify(['file-analyzer', 'duplicate-finder']),
      scopes: ['agent.execute', 'files.organize'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Define a Research Assistant Agent
    const researchAgent = {
      name: 'research-assistant-agent',
      display_name: 'Research Assistant',
      instructions: `You are a comprehensive research assistant with expertise in gathering, analyzing, and synthesizing information from various sources.

Your specialties include:
1. Market research and competitive analysis
2. Academic research and literature reviews
3. Technical documentation and specification analysis
4. Trend analysis and forecasting
5. Data collection and verification
6. Report generation and presentation

Provide well-structured, evidence-based insights with proper citations and clear methodology explanations.`,
      model: MODELS.default.model,
      tools: JSON.stringify(['web-search', 'document-analyzer', 'citation-formatter']),
      scopes: ['agent.execute', 'research.conduct'],
      is_active: true,
      created_by: 'system-seed'
    };

    // Insert all agents (Document Intelligence + Original samples)
    const agents = [
      // Document Intelligence Agents
      rfpAnalysisAgent,
      rfpAnalyzerAgent,
      templateGeneratorAgent,
      summaryComparisonAgent,
      templateImprovementAgent,
      // Original Sample Agents
      codeReviewAgent,
      fileOrganizerAgent,
      researchAgent
    ];

    for (const agent of agents) {
      try {
        // Check if agent already exists
        const existing = await pgStore.db.oneOrNone(
          'SELECT id FROM agent_definitions WHERE name = $1',
          [agent.name]
        );

        if (existing) {
          console.log(`⚠️  Agent '${agent.name}' already exists, skipping...`);
          continue;
        }

        // Insert new agent
        await pgStore.db.one(`
          INSERT INTO agent_definitions (
            name, display_name, instructions, model, tools, scopes, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          agent.name,
          agent.display_name,
          agent.instructions,
          agent.model,
          agent.tools,
          agent.scopes,
          agent.is_active,
          agent.created_by
        ]);

        console.log(`✅ Created agent: ${agent.display_name}`);
      } catch (error) {
        console.error(`❌ Failed to create agent '${agent.name}':`, error);
      }
    }

    // =======================================================================
    // DOCUMENT INTELLIGENCE TOOLS (from Summarizer project)
    // =======================================================================

    // Document Ingestion Processor Tool
    const documentIngestionTool = {
      name: 'document-ingestion-processor',
      display_name: 'Document Ingestion Processor',
      description: 'Process PDF/DOCX documents, convert to markdown, create semantic sections, and store in RAG system',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          fileUrl: { type: 'string', description: 'URL of the document to process' },
          fileType: { type: 'string', enum: ['pdf', 'docx'], description: 'Type of document to process' },
          originalFilename: { type: 'string', description: 'Original filename of the document' }
        },
        required: ['fileUrl', 'fileType', 'originalFilename']
      }),
      execute_code: `
        // Document ingestion processing logic
        const { fileUrl, fileType, originalFilename } = input;
        
        // Check for OpenAI file IDs and handle appropriately
        if (fileUrl.startsWith('file-')) {
          return {
            documentId: 'already-processed',
            markdown: 'Document already processed and uploaded to OpenAI',
            sections: [],
            status: 'COMPLETED'
          };
        }
        
        try {
          // Simulate document processing workflow
          const documentId = \`doc_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
          
          // Mock processing results
          const markdown = \`# \${originalFilename}\\n\\nProcessed document content from \${fileUrl}\\n\\n## Section 1\\nContent analysis...\\n\\n## Section 2\\nAdditional content...\`;
          
          const sections = [
            {
              id: \`section_1_\${documentId}\`,
              title: 'Document Header',
              content: 'Header information and metadata',
              metadata: { chunkIndex: 0, length: 50 }
            },
            {
              id: \`section_2_\${documentId}\`,
              title: 'Main Content',
              content: 'Primary document content and analysis',
              metadata: { chunkIndex: 1, length: 200 }
            }
          ];
          
          return {
            documentId,
            markdown,
            sections,
            status: 'COMPLETED'
          };
          
        } catch (error) {
          throw new Error(\`Document processing failed: \${error.message}\`);
        }
      `,
      scopes: ['tool.execute', 'document.process', 'rag.store'],
      is_active: true,
      created_by: 'system-seed'
    };

    // =======================================================================
    // ORIGINAL SAMPLE TOOLS (keeping for compatibility)
    // =======================================================================

    // Also seed some sample tools that the agents reference
    const sampleTools = [
      // Document Intelligence Tool
      documentIngestionTool,
      // Original Sample Tools
      {
        name: 'code-analyzer',
        display_name: 'Code Analyzer',
        description: 'Analyzes code for quality, complexity, and potential issues',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The code to analyze' },
            language: { type: 'string', description: 'Programming language' }
          },
          required: ['code']
        }),
        execute_code: `
          // Analyze the provided code
          const { code, language = 'javascript' } = input;
          
          const analysis = {
            complexity: Math.floor(Math.random() * 10) + 1,
            linesOfCode: code.split('\\n').length,
            language: language,
            suggestions: [
              'Consider adding more comments',
              'Check for potential null references',
              'Review error handling'
            ]
          };
          
          return { analysis, timestamp: new Date().toISOString() };
        `,
        scopes: ['tool.execute', 'code.analyze'],
        is_active: true,
        created_by: 'system-seed'
      },
      {
        name: 'file-analyzer',
        display_name: 'File Analyzer',
        description: 'Analyzes file structures and provides organization recommendations',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File or directory path to analyze' },
            includeHidden: { type: 'boolean', description: 'Include hidden files', default: false }
          },
          required: ['path']
        }),
        execute_code: `
          // Analyze file structure
          const { path, includeHidden = false } = input;
          
          const analysis = {
            path: path,
            type: path.includes('.') ? 'file' : 'directory',
            recommendations: [
              'Group related files together',
              'Use consistent naming conventions',
              'Remove unnecessary files'
            ],
            score: Math.floor(Math.random() * 100)
          };
          
          return { analysis, timestamp: new Date().toISOString() };
        `,
        scopes: ['tool.execute', 'files.analyze'],
        is_active: true,
        created_by: 'system-seed'
      }
    ];

    for (const tool of sampleTools) {
      try {
        // Check if tool already exists
        const existing = await pgStore.db.oneOrNone(
          'SELECT id FROM tool_definitions WHERE name = $1',
          [tool.name]
        );

        if (existing) {
          console.log(`⚠️  Tool '${tool.name}' already exists, skipping...`);
          continue;
        }

        // Insert new tool
        await pgStore.db.one(`
          INSERT INTO tool_definitions (
            name, display_name, description, input_schema, execute_code, scopes, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          tool.name,
          tool.display_name,
          tool.description,
          tool.input_schema,
          tool.execute_code,
          tool.scopes,
          tool.is_active,
          tool.created_by
        ]);

        console.log(`✅ Created tool: ${tool.display_name}`);
      } catch (error) {
        console.error(`❌ Failed to create tool '${tool.name}':`, error);
      }
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\nCreated agents:');
    console.log('  - RFP Analysis Agent (rfp-analysis-agent)');
    console.log('  - RFP Analyzer (rfp-analyzer-agent)');
    console.log('  - Template Generator Agent (template-generator-agent)');
    console.log('  - Summary Comparison Agent (summary-comparison-agent)');
    console.log('  - Template Improvement Agent (template-improvement-agent)');
    console.log('  - Code Review Assistant (code-review-agent)');
    console.log('  - File Organization Assistant (file-organizer-agent)');
    console.log('  - Research Assistant (research-assistant-agent)');
    console.log('\nCreated tools:');
    console.log('  - Document Ingestion Processor (document-ingestion-processor)');
    console.log('  - Code Analyzer (code-analyzer)');
    console.log('  - File Analyzer (file-analyzer)');
    
    // =======================================================================
    // DOCUMENT INTELLIGENCE SCORERS (from Summarizer project)
    // =======================================================================
    
    await createDocumentIntelligenceScorers(pgStore);
    
    // Create Document Intelligence workflows
    await createDocumentIntelligenceWorkflows(pgStore);
    
    // Create sample workflow steps
    await createSampleWorkflowSteps(pgStore);
    
    // Create sample scorers
    await createSampleScorers(pgStore);
    
    // Create sample networks
    await createSampleNetworks(pgStore);
    
    // Create Document Intelligence application
    await createDocumentIntelligenceApplication(pgStore);
    
    console.log('\n🚀 Restart your Mastra server to see the new agents in the playground!');

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    // Close database connection if possible
    process.exit(0);
  }
}

// Create sample workflow with steps
async function createSampleWorkflowSteps(pgStore: any) {
  console.log('\n📋 Creating sample workflow with steps...');
  
  // First create a workflow definition
  const workflowData = {
    name: 'document-analysis-workflow',
    display_name: 'Document Analysis Workflow',
    description: 'Comprehensive workflow for analyzing and processing documents',
    steps: JSON.stringify([]), // Will be populated by workflow_steps table
    triggers: JSON.stringify([
      {
        type: 'api',
        path: '/analyze-document',
        method: 'POST'
      }
    ]),
    scopes: ['workflow.execute', 'document.analyze'],
    is_active: true,
    created_by: 'system-seed'
  };

  try {
    const existingWorkflow = await pgStore.db.oneOrNone(
      'SELECT id FROM workflow_definitions WHERE name = $1',
      [workflowData.name]
    );

    let workflowId;
    if (existingWorkflow) {
      console.warn(`⚠️  Workflow '${workflowData.name}' already exists, using existing ID...`);
      workflowId = existingWorkflow.id;
    } else {
      const createdWorkflow = await pgStore.db.one(
        `
        INSERT INTO workflow_definitions (
          name, display_name, description, steps, triggers, scopes, is_active, created_by
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::text[], $7, $8)
        RETURNING id
      `,
        [
          workflowData.name,
          workflowData.display_name,
          workflowData.description,
          workflowData.steps,
          workflowData.triggers,
          workflowData.scopes,
          workflowData.is_active,
          workflowData.created_by,
        ]
      );
      workflowId = createdWorkflow.id;
      console.log(`✅ Created workflow: ${workflowData.display_name}`);
    }

    // Create workflow steps
    const steps = [
      {
        workflow_id: workflowId,
        step_id: 'document-ingestion',
        name: 'Document Ingestion',
        description: 'Extract and process document content',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            fileUrl: { type: 'string' },
            fileType: { type: 'string', enum: ['pdf', 'docx', 'txt'] }
          },
          required: ['fileUrl', 'fileType']
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            content: { type: 'string' },
            metadata: { type: 'object' },
            wordCount: { type: 'number' }
          }
        }),
        execute_code: `
          // Simulate document processing
          const { fileUrl, fileType } = input;
          
          // Mock document extraction
          const content = "This is extracted document content from " + fileUrl;
          const metadata = { 
            type: fileType, 
            processedAt: new Date().toISOString(),
            source: fileUrl
          };
          const wordCount = content.split(' ').length;
          
          return { content, metadata, wordCount };
        `,
        depends_on: [],
        order_index: 1,
        is_active: true,
        created_by: 'system-seed'
      },
      {
        workflow_id: workflowId,
        step_id: 'content-analysis',
        name: 'Content Analysis',
        description: 'Analyze document content for key insights',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            content: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: ['content']
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            topics: { type: 'array', items: { type: 'string' } },
            sentiment: { type: 'string' },
            keyPhrases: { type: 'array', items: { type: 'string' } }
          }
        }),
        execute_code: `
          const { content, metadata } = input;
          
          // Mock content analysis
          const topics = ['technology', 'business', 'analysis'];
          const sentiment = 'neutral';
          const keyPhrases = ['machine learning', 'data analysis', 'automation'];
          
          return { topics, sentiment, keyPhrases };
        `,
        depends_on: ['document-ingestion'],
        order_index: 2,
        is_active: true,
        created_by: 'system-seed'
      }
    ];

    for (const step of steps) {
      try {
        const existingStep = await pgStore.db.oneOrNone(
          'SELECT id FROM workflow_steps WHERE workflow_id = $1 AND step_id = $2',
          [step.workflow_id, step.step_id]
        );

        if (existingStep) {
          console.warn(`⚠️  Workflow step '${step.step_id}' already exists, skipping...`);
          continue;
        }

        await pgStore.db.none(
          `
          INSERT INTO workflow_steps (
            workflow_id, step_id, name, description, input_schema, output_schema, 
            execute_code, depends_on, order_index, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::text[], $9, $10, $11)
        `,
          [
            step.workflow_id,
            step.step_id,
            step.name,
            step.description,
            step.input_schema,
            step.output_schema,
            step.execute_code,
            step.depends_on,
            step.order_index,
            step.is_active,
            step.created_by,
          ]
        );
        console.log(`✅ Created workflow step: ${step.name}`);
      } catch (error: any) {
        console.error(`❌ Failed to create workflow step '${step.step_id}':`, error);
      }
    }

  } catch (error: any) {
    console.error(`❌ Failed to create workflow steps:`, error);
  }
}

// Create sample scorers
async function createSampleScorers(pgStore: any) {
  console.log('\n🎯 Creating sample scorers...');
  
  const scorers = [
    {
      name: 'document-quality-scorer',
      display_name: 'Document Quality Scorer',
      description: 'Evaluates document quality based on structure, clarity, and completeness',
      scorer_type: 'quality',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document quality evaluator. Assess documents for structure, clarity, grammar, and completeness.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          content: { type: 'string' },
          metadata: { type: 'object' }
        },
        required: ['content']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          feedback: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          improvements: { type: 'array', items: { type: 'string' } }
        }
      }),
      config: JSON.stringify({
        weightings: {
          structure: 0.3,
          clarity: 0.3,
          grammar: 0.2,
          completeness: 0.2
        },
        thresholds: {
          excellent: 90,
          good: 75,
          acceptable: 60
        }
      }),
      scopes: ['scorer.execute', 'document.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    }
  ];

  for (const scorer of scorers) {
    try {
      const existingScorer = await pgStore.db.oneOrNone(
        'SELECT id FROM scorer_definitions WHERE name = $1',
        [scorer.name]
      );

      if (existingScorer) {
        console.warn(`⚠️  Scorer '${scorer.name}' already exists, skipping...`);
        continue;
      }

      await pgStore.db.none(
        `
        INSERT INTO scorer_definitions (
          name, display_name, description, scorer_type, judge_model, judge_instructions,
          input_schema, output_schema, config, scopes, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::text[], $11, $12)
      `,
        [
          scorer.name,
          scorer.display_name,
          scorer.description,
          scorer.scorer_type,
          scorer.judge_model,
          scorer.judge_instructions,
          scorer.input_schema,
          scorer.output_schema,
          scorer.config,
          scorer.scopes,
          scorer.is_active,
          scorer.created_by,
        ]
      );
      console.log(`✅ Created scorer: ${scorer.display_name}`);
    } catch (error: any) {
      console.error(`❌ Failed to create scorer '${scorer.name}':`, error);
    }
  }
}

// Create Document Intelligence workflows from the Summarizer project
async function createDocumentIntelligenceWorkflows(pgStore: any) {
  console.log('\n📋 Creating Document Intelligence workflows...');
  
  const workflows = [
    {
      name: 'rfp-analysis-unified',
      display_name: 'RFP Analysis Workflow (Unified)',
      description: 'Complete document analysis workflow for RFP processing using unified summary generation',
      steps: JSON.stringify([
        'document-ingestion',
        'unified-summary-generation', 
        'document-evaluation'
      ]),
      triggers: JSON.stringify([
        {
          type: 'api',
          path: '/analyze-rfp',
          method: 'POST'
        }
      ]),
      scopes: ['workflow.execute', 'document.analyze', 'rfp.process'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'rfp-analysis-parallel',
      display_name: 'RFP Analysis Workflow (Parallel)',
      description: 'Complete document analysis workflow for RFP processing using parallel summary generation (backup)',
      steps: JSON.stringify([
        'document-ingestion',
        'summary-generation',
        'document-evaluation'
      ]),
      triggers: JSON.stringify([
        {
          type: 'api',
          path: '/analyze-rfp-parallel',
          method: 'POST'
        }
      ]),
      scopes: ['workflow.execute', 'document.analyze', 'rfp.process'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'template-generation',
      display_name: 'Template Generation Workflow',
      description: 'Generate summary templates from existing summary documents',
      steps: JSON.stringify([
        'document-ingestion',
        'template-generation'
      ]),
      triggers: JSON.stringify([
        {
          type: 'api',
          path: '/generate-template',
          method: 'POST'
        }
      ]),
      scopes: ['workflow.execute', 'template.generate', 'document.analyze'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'summary-evaluation',
      display_name: 'Summary Evaluation Workflow',
      description: 'Comprehensive evaluation of summary generation with quantitative scoring and improvement recommendations',
      steps: JSON.stringify([
        'summary-generation',
        'reference-summary-load',
        'quantitative-scoring',
        'comparison-analysis',
        'template-improvement'
      ]),
      triggers: JSON.stringify([
        {
          type: 'api',
          path: '/evaluate-summary',
          method: 'POST'
        }
      ]),
      scopes: ['workflow.execute', 'summary.evaluate', 'template.improve'],
      is_active: true,
      created_by: 'system-seed'
    }
  ];

  for (const workflow of workflows) {
    try {
      const existingWorkflow = await pgStore.db.oneOrNone(
        'SELECT id FROM workflow_definitions WHERE name = $1',
        [workflow.name]
      );

      if (existingWorkflow) {
        console.warn(`⚠️  Workflow '${workflow.name}' already exists, skipping...`);
        continue;
      }

      const createdWorkflow = await pgStore.db.one(
        `
        INSERT INTO workflow_definitions (
          name, display_name, description, steps, triggers, scopes, is_active, created_by
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::text[], $7, $8)
        RETURNING id
      `,
        [
          workflow.name,
          workflow.display_name,
          workflow.description,
          workflow.steps,
          workflow.triggers,
          workflow.scopes,
          workflow.is_active,
          workflow.created_by,
        ]
      );
      console.log(`✅ Created workflow: ${workflow.display_name}`);
      
      // Create workflow steps for each workflow
      await createWorkflowSteps(pgStore, createdWorkflow.id, workflow.name);
      
    } catch (error: any) {
      console.error(`❌ Failed to create workflow '${workflow.name}':`, error);
    }
  }
}

// Create workflow steps for Document Intelligence workflows
async function createWorkflowSteps(pgStore: any, workflowId: string, workflowName: string) {
  console.log(`📋 Creating steps for workflow: ${workflowName}`);
  
  // Define steps for different workflows
  const stepDefinitions: Record<string, any[]> = {
    'rfp-analysis-unified': [
      {
        step_id: 'document-ingestion',
        name: 'Document Ingestion',
        description: 'Convert document to markdown, create sections, and store in RAG system',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            fileUrl: { type: 'string', format: 'uri' },
            fileType: { type: 'string', enum: ['pdf', 'docx'] },
            originalFilename: { type: 'string' }
          },
          required: ['fileUrl', 'fileType', 'originalFilename']
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            markdown: { type: 'string' },
            sectionsCount: { type: 'number' },
            status: { type: 'string' }
          }
        }),
        execute_code: 'return await ingestionTool.execute({ context: inputData });',
        depends_on: [],
        order_index: 1
      },
      {
        step_id: 'unified-summary-generation',
        name: 'Unified Summary Generation',
        description: 'Generate document summary using all template sections in a single LLM call',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            markdown: { type: 'string' },
            sectionsCount: { type: 'number' },
            status: { type: 'string' }
          }
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            summary: { type: 'object' },
            templateUsed: { type: 'string' },
            completeness: { type: 'number' }
          }
        }),
        execute_code: 'return await rfpAgent.generateUnifiedSummary(inputData);',
        depends_on: ['document-ingestion'],
        order_index: 2
      },
      {
        step_id: 'document-evaluation',
        name: 'Document Evaluation',
        description: 'Evaluate document using scoring criteria with Mastra scorers',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            summary: { type: 'object' },
            templateUsed: { type: 'string' },
            completeness: { type: 'number' }
          }
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            evaluation: { type: 'object' },
            criteriaUsed: { type: 'string' }
          }
        }),
        execute_code: 'return await evaluateDocument(inputData);',
        depends_on: ['unified-summary-generation'],
        order_index: 3
      }
    ],
    'template-generation': [
      {
        step_id: 'document-ingestion',
        name: 'Document Ingestion',
        description: 'Convert document to markdown, create sections, and store in RAG system',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            fileUrl: { type: 'string', format: 'uri' },
            fileType: { type: 'string', enum: ['pdf', 'docx'] },
            originalFilename: { type: 'string' }
          },
          required: ['fileUrl', 'fileType', 'originalFilename']
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            markdown: { type: 'string' },
            sectionsCount: { type: 'number' },
            status: { type: 'string' }
          }
        }),
        execute_code: 'return await ingestionTool.execute({ context: inputData });',
        depends_on: [],
        order_index: 1
      },
      {
        step_id: 'template-generation',
        name: 'Template Generation',
        description: 'Generate summary template based on document structure and content',
        input_schema: JSON.stringify({
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            markdown: { type: 'string' },
            sectionsCount: { type: 'number' },
            status: { type: 'string' }
          }
        }),
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            template: { type: 'object' },
            documentId: { type: 'string' },
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }),
        execute_code: 'return await templateGeneratorAgent.generateTemplate(inputData);',
        depends_on: ['document-ingestion'],
        order_index: 2
      }
    ]
  };

  // Get steps for this workflow
  const steps = stepDefinitions[workflowName] || [];
  
  for (const step of steps) {
    try {
      const existingStep = await pgStore.db.oneOrNone(
        'SELECT id FROM workflow_steps WHERE workflow_id = $1 AND step_id = $2',
        [workflowId, step.step_id]
      );

      if (existingStep) {
        console.warn(`⚠️  Workflow step '${step.step_id}' already exists, skipping...`);
        continue;
      }

      await pgStore.db.none(
        `
        INSERT INTO workflow_steps (
          workflow_id, step_id, name, description, input_schema, output_schema, 
          execute_code, depends_on, order_index, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::text[], $9, $10, $11)
      `,
        [
          workflowId,
          step.step_id,
          step.name,
          step.description,
          step.input_schema,
          step.output_schema,
          step.execute_code,
          step.depends_on,
          step.order_index,
          true, // is_active
          'system-seed',
        ]
      );
      console.log(`✅ Created workflow step: ${step.name}`);
    } catch (error: any) {
      console.error(`❌ Failed to create workflow step '${step.step_id}':`, error);
    }
  }
}

// Create Document Intelligence scorers from the Summarizer project
async function createDocumentIntelligenceScorers(pgStore: any) {
  console.log('\n🎯 Creating Document Intelligence scorers...');
  
  const scorers = [
    {
      name: 'summary-accuracy-scorer',
      display_name: 'Summary Accuracy Scorer',
      description: 'Evaluates how accurately the generated summary captures the key information from the RFP',
      scorer_type: 'summary',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document analyst evaluating the accuracy of AI-generated summaries.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          generatedSummary: { type: 'string' },
          referenceSummary: { type: 'string' },
          rfpContent: { type: 'string' }
        },
        required: ['generatedSummary', 'referenceSummary', 'rfpContent']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          analysis: { type: 'string' },
          specificIssues: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }),
      config: JSON.stringify({
        criteria: {
          factualAccuracy: 0.4,
          keyInformation: 0.3,
          noHallucination: 0.2,
          alignmentWithReference: 0.1
        },
        thresholds: {
          excellent: 90,
          good: 70,
          fair: 50,
          poor: 30
        }
      }),
      scopes: ['scorer.execute', 'summary.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'summary-completeness-scorer',
      display_name: 'Summary Completeness Scorer',
      description: 'Evaluates how completely the generated summary covers all important aspects of the RFP',
      scorer_type: 'summary',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document analyst evaluating the completeness of AI-generated summaries.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          generatedSummary: { type: 'string' },
          referenceSummary: { type: 'string' },
          rfpContent: { type: 'string' }
        },
        required: ['generatedSummary', 'referenceSummary', 'rfpContent']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          analysis: { type: 'string' },
          specificIssues: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }),
      config: JSON.stringify({
        criteria: {
          coverage: 0.3,
          importantDetails: 0.3,
          context: 0.2,
          comprehensiveness: 0.2
        }
      }),
      scopes: ['scorer.execute', 'summary.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'summary-consistency-scorer',
      display_name: 'Summary Consistency Scorer',
      description: 'Evaluates the internal consistency and coherence of the generated summary',
      scorer_type: 'summary',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document analyst evaluating the consistency of AI-generated summaries.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          generatedSummary: { type: 'string' },
          referenceSummary: { type: 'string' }
        },
        required: ['generatedSummary', 'referenceSummary']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          analysis: { type: 'string' },
          specificIssues: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }),
      config: JSON.stringify({
        criteria: {
          internalLogic: 0.3,
          formatConsistency: 0.2,
          dataConsistency: 0.3,
          terminology: 0.2
        }
      }),
      scopes: ['scorer.execute', 'summary.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'summary-clarity-scorer',
      display_name: 'Summary Clarity Scorer',
      description: 'Evaluates the clarity, readability, and organization of the generated summary',
      scorer_type: 'summary',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document analyst evaluating the clarity of AI-generated summaries.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          generatedSummary: { type: 'string' },
          referenceSummary: { type: 'string' }
        },
        required: ['generatedSummary', 'referenceSummary']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          analysis: { type: 'string' },
          specificIssues: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }),
      config: JSON.stringify({
        criteria: {
          readability: 0.3,
          organization: 0.3,
          languageQuality: 0.2,
          informationDensity: 0.2
        }
      }),
      scopes: ['scorer.execute', 'summary.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'rfp-evaluation-scorer',
      display_name: 'RFP Evaluation Quality Scorer',
      description: 'Evaluates the completeness and quality of RFP analysis using template-based extraction and project fit assessment',
      scorer_type: 'quality',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert procurement analyst who evaluates the quality of RFP analysis. You assess whether critical information has been properly extracted and organized.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          analysisText: { type: 'string' },
          rfpContent: { type: 'string' }
        },
        required: ['analysisText']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          templatesUsed: { type: 'array', items: { type: 'string' } },
          sectionsCompleted: { type: 'number' },
          totalSections: { type: 'number' },
          criticalInfoCaptured: {
            type: 'object',
            properties: {
              bidDeadline: { type: 'boolean' },
              projectValue: { type: 'boolean' },
              keyContacts: { type: 'boolean' },
              technicalSpecs: { type: 'boolean' },
              workScope: { type: 'boolean' }
            }
          },
          analysisQuality: {
            type: 'object',
            properties: {
              depthScore: { type: 'number', minimum: 0, maximum: 1 },
              accuracyScore: { type: 'number', minimum: 0, maximum: 1 },
              clarityScore: { type: 'number', minimum: 0, maximum: 1 }
            }
          },
          overallCompleteness: { type: 'number', minimum: 0, maximum: 1 }
        }
      }),
      config: JSON.stringify({
        weights: {
          templateCompletion: 0.25,
          criticalInfo: 0.30,
          analysisQuality: 0.25,
          overallCompleteness: 0.20
        }
      }),
      scopes: ['scorer.execute', 'rfp.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    },
    {
      name: 'document-quality-scorer',
      display_name: 'Basic Document Quality Scorer',
      description: 'Evaluate basic document quality metrics',
      scorer_type: 'quality',
      judge_model: MODELS.evaluation.model,
      judge_instructions: 'You are an expert document evaluator. Provide fair, detailed assessments with specific examples.',
      input_schema: JSON.stringify({
        type: 'object',
        properties: {
          document: { type: 'string' }
        },
        required: ['document']
      }),
      output_schema: JSON.stringify({
        type: 'object',
        properties: {
          clarity: { type: 'number', minimum: 1, maximum: 10 },
          completeness: { type: 'number', minimum: 1, maximum: 10 },
          technical: { type: 'number', minimum: 1, maximum: 10 },
          feasibility: { type: 'number', minimum: 1, maximum: 10 },
          overall: { type: 'number', minimum: 1, maximum: 10 },
          feedback: { type: 'string' }
        }
      }),
      config: JSON.stringify({
        weightings: {
          clarity: 0.2,
          completeness: 0.2,
          technical: 0.2,
          feasibility: 0.2,
          overall: 0.2
        }
      }),
      scopes: ['scorer.execute', 'document.evaluate'],
      is_active: true,
      created_by: 'system-seed'
    }
  ];

  for (const scorer of scorers) {
    try {
      const existingScorer = await pgStore.db.oneOrNone(
        'SELECT id FROM scorer_definitions WHERE name = $1',
        [scorer.name]
      );

      if (existingScorer) {
        console.warn(`⚠️  Scorer '${scorer.name}' already exists, skipping...`);
        continue;
      }

      await pgStore.db.none(
        `
        INSERT INTO scorer_definitions (
          name, display_name, description, scorer_type, judge_model, judge_instructions,
          input_schema, output_schema, config, scopes, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::text[], $11, $12)
      `,
        [
          scorer.name,
          scorer.display_name,
          scorer.description,
          scorer.scorer_type,
          scorer.judge_model,
          scorer.judge_instructions,
          scorer.input_schema,
          scorer.output_schema,
          scorer.config,
          scorer.scopes,
          scorer.is_active,
          scorer.created_by,
        ]
      );
      console.log(`✅ Created scorer: ${scorer.display_name}`);
    } catch (error: any) {
      console.error(`❌ Failed to create scorer '${scorer.name}':`, error);
    }
  }
}

// Create sample networks
async function createSampleNetworks(pgStore: any) {
  console.log('\n🕸️ Creating sample agent networks...');
  
  // Create a collaborative review network
  const networkData = {
    name: 'collaborative-review-network',
    display_name: 'Collaborative Review Network',
    description: 'A network of agents that work together to provide comprehensive code and document reviews',
    network_type: 'sequential',
    agents: JSON.stringify([]), // Will be populated by network_agent_roles table
    routing_rules: JSON.stringify({
      flow: 'sequential',
      error_handling: 'skip_and_continue',
      timeout: 300
    }),
    coordination_strategy: 'sequential',
    communication_protocol: JSON.stringify({
      format: 'json',
      include_context: true,
      pass_intermediate_results: true
    }),
    config: JSON.stringify({
      max_iterations: 3,
      quality_threshold: 0.8,
      consensus_required: false
    }),
    scopes: ['network.execute', 'review.collaborate'],
    is_active: true,
    created_by: 'system-seed'
  };

  try {
    const existingNetwork = await pgStore.db.oneOrNone(
      'SELECT id FROM network_definitions WHERE name = $1',
      [networkData.name]
    );

    let networkId;
    if (existingNetwork) {
      console.warn(`⚠️  Network '${networkData.name}' already exists, using existing ID...`);
      networkId = existingNetwork.id;
    } else {
      const createdNetwork = await pgStore.db.one(
        `
        INSERT INTO network_definitions (
          name, display_name, description, network_type, agents, routing_rules,
          coordination_strategy, communication_protocol, config, scopes, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::text[], $11, $12)
        RETURNING id
      `,
        [
          networkData.name,
          networkData.display_name,
          networkData.description,
          networkData.network_type,
          networkData.agents,
          networkData.routing_rules,
          networkData.coordination_strategy,
          networkData.communication_protocol,
          networkData.config,
          networkData.scopes,
          networkData.is_active,
          networkData.created_by,
        ]
      );
      networkId = createdNetwork.id;
      console.log(`✅ Created network: ${networkData.display_name}`);
    }

    // Create network agent roles
    const agentRoles = [
      {
        network_id: networkId,
        agent_name: 'code-review-agent',
        role: 'primary_reviewer',
        order_index: 1,
        is_required: true,
        config: JSON.stringify({
          focus: 'code_quality',
          weight: 0.4
        })
      },
      {
        network_id: networkId,
        agent_name: 'research-assistant-agent',
        role: 'research_validator',
        order_index: 2,
        is_required: false,
        config: JSON.stringify({
          focus: 'fact_checking',
          weight: 0.3
        })
      }
    ];

    for (const agentRole of agentRoles) {
      try {
        const existingRole = await pgStore.db.oneOrNone(
          'SELECT id FROM network_agent_roles WHERE network_id = $1 AND agent_name = $2 AND role = $3',
          [agentRole.network_id, agentRole.agent_name, agentRole.role]
        );

        if (existingRole) {
          console.warn(`⚠️  Agent role '${agentRole.agent_name}:${agentRole.role}' already exists, skipping...`);
          continue;
        }

        await pgStore.db.none(
          `
          INSERT INTO network_agent_roles (
            network_id, agent_name, role, order_index, is_required, config
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
          [
            agentRole.network_id,
            agentRole.agent_name,
            agentRole.role,
            agentRole.order_index,
            agentRole.is_required,
            agentRole.config,
          ]
        );
        console.log(`✅ Created agent role: ${agentRole.agent_name} as ${agentRole.role}`);
      } catch (error: any) {
        console.error(`❌ Failed to create agent role '${agentRole.agent_name}:${agentRole.role}':`, error);
      }
    }

  } catch (error: any) {
    console.error(`❌ Failed to create network:`, error);
  }
}

// Create Document Intelligence application with all components
async function createDocumentIntelligenceApplication(pgStore: any) {
  console.log('\n🧠 Creating Document Intelligence application...');
  
  try {
    // Create the application
    const applicationData = {
      name: 'document-intelligence',
      display_name: 'Document Intelligence',
      description: 'Comprehensive document analysis platform for RFP processing, summary generation, template creation, and quality evaluation. Includes specialized agents for document ingestion, analysis, comparison, and continuous improvement.',
      created_by: 'system-seed'
    };

    const existingApp = await pgStore.db.oneOrNone(
      'SELECT id FROM applications WHERE name = $1',
      [applicationData.name]
    );

    let applicationId;
    if (existingApp) {
      console.warn(`⚠️  Application '${applicationData.name}' already exists, using existing ID...`);
      applicationId = existingApp.id;
    } else {
      const createdApp = await pgStore.db.one(
        `
        INSERT INTO applications (name, display_name, description, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [
          applicationData.name,
          applicationData.display_name,
          applicationData.description,
          applicationData.created_by,
        ]
      );
      applicationId = createdApp.id;
      console.log(`✅ Created application: ${applicationData.display_name}`);
    }

    // Define all Document Intelligence components
    const components = [
      // Agents
      { type: 'agent', name: 'rfp-analysis-agent', scopes: ['agent.execute', 'document.analyze', 'document.score'] },
      { type: 'agent', name: 'rfp-analyzer-agent', scopes: ['agent.execute', 'rfp.analyze', 'project.evaluate'] },
      { type: 'agent', name: 'template-generator-agent', scopes: ['agent.execute', 'template.generate', 'document.analyze'] },
      { type: 'agent', name: 'summary-comparison-agent', scopes: ['agent.execute', 'summary.compare', 'quality.assess'] },
      { type: 'agent', name: 'template-improvement-agent', scopes: ['agent.execute', 'template.improve', 'prompt.engineer'] },
      
      // Workflows
      { type: 'workflow', name: 'rfp-analysis-unified', scopes: ['workflow.execute', 'document.analyze', 'rfp.process'] },
      { type: 'workflow', name: 'rfp-analysis-parallel', scopes: ['workflow.execute', 'document.analyze', 'rfp.process'] },
      { type: 'workflow', name: 'template-generation', scopes: ['workflow.execute', 'template.generate', 'document.analyze'] },
      { type: 'workflow', name: 'summary-evaluation', scopes: ['workflow.execute', 'summary.evaluate', 'template.improve'] },
      
      // Tools
      { type: 'tool', name: 'document-ingestion-processor', scopes: ['tool.execute', 'document.process', 'rag.store'] },
      
      // Scorers
      { type: 'scorer', name: 'summary-accuracy-scorer', scopes: ['scorer.execute', 'summary.evaluate'] },
      { type: 'scorer', name: 'summary-completeness-scorer', scopes: ['scorer.execute', 'summary.evaluate'] },
      { type: 'scorer', name: 'summary-consistency-scorer', scopes: ['scorer.execute', 'summary.evaluate'] },
      { type: 'scorer', name: 'summary-clarity-scorer', scopes: ['scorer.execute', 'summary.evaluate'] },
      { type: 'scorer', name: 'rfp-evaluation-scorer', scopes: ['scorer.execute', 'rfp.evaluate'] },
      { type: 'scorer', name: 'document-quality-scorer', scopes: ['scorer.execute', 'document.evaluate'] }
    ];

    // Add components to the application
    for (const component of components) {
      try {
        // Get the component ID from the appropriate table
        let componentId;
        let tableName;
        
        switch (component.type) {
          case 'agent':
            tableName = 'agent_definitions';
            break;
          case 'workflow':
            tableName = 'workflow_definitions';
            break;
          case 'tool':
            tableName = 'tool_definitions';
            break;
          case 'scorer':
            tableName = 'scorer_definitions';
            break;
          default:
            console.warn(`⚠️  Unknown component type: ${component.type}`);
            continue;
        }

        const componentRecord = await pgStore.db.oneOrNone(
          `SELECT id FROM ${tableName} WHERE name = $1`,
          [component.name]
        );

        if (!componentRecord) {
          console.warn(`⚠️  Component '${component.name}' of type '${component.type}' not found, skipping...`);
          continue;
        }

        componentId = componentRecord.id;

        // Check if component is already added to application
        const existingComponent = await pgStore.db.oneOrNone(
          'SELECT id FROM application_components WHERE application_id = $1 AND component_type = $2 AND component_id = $3',
          [applicationId, component.type, componentId]
        );

        if (existingComponent) {
          console.log(`⚠️  Component '${component.name}' already in application, skipping...`);
          continue;
        }

        // Add component to application
        await pgStore.db.none(
          `
          INSERT INTO application_components (
            application_id, component_type, component_id, component_name, scopes
          ) VALUES ($1, $2, $3, $4, $5::text[])
        `,
          [
            applicationId,
            component.type,
            componentId,
            component.name,
            component.scopes,
          ]
        );

        console.log(`✅ Added ${component.type}: ${component.name} to Document Intelligence`);
      } catch (error: any) {
        console.error(`❌ Failed to add component '${component.name}':`, error);
      }
    }

    console.log('\n🎉 Document Intelligence application created successfully!');
    console.log('\nDocument Intelligence includes:');
    console.log('  📋 Agents: 5 specialized document analysis agents');
    console.log('  🔄 Workflows: 4 comprehensive document processing workflows');
    console.log('  🛠️  Tools: 1 document ingestion and processing tool');
    console.log('  🎯 Scorers: 6 quality evaluation and scoring systems');
    console.log('\nKey Capabilities:');
    console.log('  • RFP analysis and evaluation');
    console.log('  • Document summarization with templates');
    console.log('  • Template generation and improvement');
    console.log('  • Quality assessment and scoring');
    console.log('  • Summary comparison and optimization');

  } catch (error: any) {
    console.error(`❌ Failed to create Document Intelligence application:`, error);
  }
}

// Run the seed function
seedDatabase().catch(console.error);
