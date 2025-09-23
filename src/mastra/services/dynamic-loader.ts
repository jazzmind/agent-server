import { PostgresStore } from '@mastra/pg';
import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext, ToolInvocationOptions } from '@mastra/core/tools';
import { createWorkflow, createStep } from '@mastra/core/workflows';
// Note: @mastra/scorers may not be available yet, using placeholder
// import { createScorer } from '@mastra/scorers';
import { Memory } from '@mastra/memory';
import { getSharedPostgresStore } from '../utils/database';
import { z } from 'zod';

interface AgentDefinition {
  id: string;
  name: string;
  display_name: string;
  instructions: string;
  model: string;
  tools: string[];
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  steps: any[];
  triggers: any[];
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface ToolDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  input_schema: any;
  output_schema?: any;
  execute_code: string;
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowStepDefinition {
  id: string;
  workflow_id: string;
  step_id: string;
  name: string;
  description?: string;
  input_schema: any;
  output_schema?: any;
  execute_code: string;
  depends_on: string[];
  order_index: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface ScorerDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  scorer_type: string;
  judge_model: string;
  judge_instructions?: string;
  input_schema: any;
  output_schema?: any;
  preprocess_code?: string;
  analyze_code?: string;
  score_generation_code?: string;
  reason_generation_code?: string;
  config: any;
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface NetworkDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  network_type: string;
  agents: any[];
  routing_rules: any;
  coordination_strategy: string;
  communication_protocol: any;
  config: any;
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface NetworkAgentRole {
  id: string;
  network_id: string;
  agent_name: string;
  role: string;
  order_index: number;
  is_required: boolean;
  config: any;
  created_at: string;
}

// Helper function to get model instance from string
function getModelFromString(modelString: string) {
  // For now, default to OpenAI models
  // This could be expanded to support other providers
  switch (modelString.toLowerCase()) {
    case 'gpt-5':
    case 'gpt-5-mini':
    case 'gpt-5-nano':  
      return openai(modelString.toLowerCase());
    default:
      console.warn(`Unknown model: ${modelString}, defaulting to gpt-5-nano`);
      return openai('gpt-5-nano');
  }
}

export class DynamicLoader {
  private pgStore: PostgresStore | null = null;
  private dynamicTools: Map<string, any> = new Map();
  private dynamicAgents: Map<string, any> = new Map();
  private dynamicWorkflows: Map<string, any> = new Map();
  private dynamicScorers: Map<string, any> = new Map();
  private dynamicNetworks: Map<string, any> = new Map();
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize database connection in constructor
    // It will be initialized when first needed
  }

  /**
   * Ensure database connection is initialized
   * This is called before any database operations
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initializeDatabase();
    await this.initPromise;
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.pgStore = await getSharedPostgresStore();
      if (this.pgStore) {
        console.log('✅ Dynamic loader: Using shared PostgreSQL connection');
      } else {
        console.warn('⚠️ Dynamic loader: PostgreSQL not available');
      }
      this.isInitialized = true;
    } catch (error) {
      console.warn('⚠️ Dynamic loader: Failed to get shared PostgreSQL connection:', error);
      this.pgStore = null;
      this.isInitialized = true; // Mark as initialized even if failed
    }
  }

  /**
   * Load dynamic tools from database
   */
  async loadDynamicTools(): Promise<Map<string, any>> {
    const tools = new Map<string, any>();

    // Ensure database is initialized before proceeding
    await this.ensureInitialized();

    if (!this.pgStore) {
      console.warn('⚠️ Dynamic loader: No database connection');
      return tools;
    }

    try {
      await this.pgStore.init();

      const toolDefinitions = await this.pgStore.db.manyOrNone(`
        SELECT * FROM tool_definitions 
        WHERE is_active = true 
        ORDER BY created_at ASC
      `);

      for (const definition of toolDefinitions || []) {
        try {
          // Parse and validate input schema - convert to zod
          let inputSchema;
          try {
            const inputSchemaData = typeof definition.input_schema === 'string' 
              ? JSON.parse(definition.input_schema)
              : definition.input_schema;
            
            // Convert simple schema to zod object
            inputSchema = this.convertToZodSchema(inputSchemaData);
          } catch (error) {
            console.warn(`⚠️ Invalid input schema for tool ${definition.name}:`, error);
            // Use empty zod object as fallback
            inputSchema = z.object({});
          }

          // Parse output schema if provided - convert to zod
          let outputSchema;
          if (definition.output_schema) {
            try {
              const outputSchemaData = typeof definition.output_schema === 'string'
                ? JSON.parse(definition.output_schema)
                : definition.output_schema;
              
              outputSchema = this.convertToZodSchema(outputSchemaData);
            } catch (error) {
              console.warn(`⚠️ Invalid output schema for tool ${definition.name}:`, error);
              outputSchema = z.object({});
            }
          } else {
            outputSchema = z.object({});
          }

          // Create tool execute function
          const executeFunction = this.createExecuteFunction(definition.execute_code);

          // Create tool using createTool
          const tool = createTool({
            id: definition.name,
            description: definition.description,
            inputSchema,
            outputSchema,
            execute: async (context: ToolExecutionContext<any>) => {
              try {
                // Access the input from the context object
                return await executeFunction(context);
              } catch (error: any) {
                throw new Error(`Tool execution error: ${error.message}`);
              }
            }
          });

          tools.set(definition.name, tool);
          console.log(`✅ Loaded dynamic tool: ${definition.name}`);
        } catch (error) {
          console.error(`❌ Failed to load tool ${definition.name}:`, error);
        }
      }
    } catch (error: any) {
      console.error('Failed to load dynamic tools:', error);
    }

    this.dynamicTools = tools;
    return tools;
  }

  /**
   * Load dynamic agents from database
   */
  async loadDynamicAgents(): Promise<Map<string, any>> {
    const agents = new Map<string, any>();

    // Ensure database is initialized before proceeding
    await this.ensureInitialized();

    if (!this.pgStore) {
      console.warn('⚠️ Dynamic loader: No database connection');
      return agents;
    }

    try {
      await this.pgStore.init();

      const agentDefinitions = await this.pgStore.db.manyOrNone(`
        SELECT * FROM agent_definitions 
        WHERE is_active = true 
        ORDER BY created_at ASC
      `);

      for (const definition of agentDefinitions || []) {
        try {
          // Parse tools array
          const toolNames = Array.isArray(definition.tools) 
            ? definition.tools 
            : JSON.parse(definition.tools || '[]');

          // Resolve tool references - create tools object
          const agentTools: Record<string, any> = {};
          for (const toolName of toolNames) {
            const tool = this.dynamicTools.get(toolName);
            if (tool) {
              agentTools[toolName] = tool;
            } else {
              console.warn(`⚠️ Tool '${toolName}' not found for agent '${definition.name}'`);
            }
          }

          // Get model instance
          const model = getModelFromString(definition.model || 'gpt-5-nano');

          // Get shared storage for memory
          const sharedPgStore = await getSharedPostgresStore();

          // Create real Mastra Agent instance
          const agent = new Agent({
            name: definition.display_name, // Use display_name for the agent name
            instructions: definition.instructions,
            model: model,
            tools: agentTools,
            memory: sharedPgStore ? new Memory({
              storage: sharedPgStore,
            }) : undefined,
          });

          agents.set(definition.name, agent);
          console.log(`✅ Loaded dynamic agent: ${definition.name}`);
        } catch (error) {
          console.error(`❌ Failed to load agent ${definition.name}:`, error);
        }
      }
    } catch (error: any) {
      console.error('Failed to load dynamic agents:', error);
    }

    this.dynamicAgents = agents;
    return agents;
  }

  /**
   * Load dynamic workflows from database with proper step creation
   */
  async loadDynamicWorkflows(): Promise<Map<string, any>> {
    const workflows = new Map<string, any>();

    // Ensure database is initialized before proceeding
    await this.ensureInitialized();

    if (!this.pgStore) {
      console.warn('⚠️ Dynamic loader: No database connection');
      return workflows;
    }

    try {
      await this.pgStore.init();

      const workflowDefinitions = await this.pgStore.db.manyOrNone(`
        SELECT * FROM workflow_definitions 
        WHERE is_active = true 
        ORDER BY created_at ASC
      `);

      for (const definition of workflowDefinitions || []) {
        try {
          // Get workflow steps from database
          const stepDefinitions = await this.pgStore.db.manyOrNone(`
            SELECT * FROM workflow_steps 
            WHERE workflow_id = $1 AND is_active = true 
            ORDER BY order_index ASC, created_at ASC
          `, [definition.id]);

          // Create workflow steps
          const steps = await this.createWorkflowSteps(stepDefinitions || []);
          
          // Parse triggers
          const triggers = Array.isArray(definition.triggers)
            ? definition.triggers
            : JSON.parse(definition.triggers || '[]');

          // Create real Mastra Workflow instance
          let workflow = createWorkflow({
            id: definition.name,
            description: definition.description || definition.display_name,
            inputSchema: z.object({}), // Will be updated based on first step
            outputSchema: z.object({}), // Will be updated based on last step
          });

          // Chain the steps in order
          for (const step of steps) {
            workflow = workflow.then(step);
          }

          // Commit the workflow
          const finalWorkflow = workflow.commit();

          workflows.set(definition.name, finalWorkflow);
          console.log(`✅ Loaded dynamic workflow: ${definition.name} with ${steps.length} steps`);
        } catch (error) {
          console.error(`❌ Failed to load workflow ${definition.name}:`, error);
        }
      }
    } catch (error: any) {
      console.error('Failed to load dynamic workflows:', error);
    }

    this.dynamicWorkflows = workflows;
    return workflows;
  }

  /**
   * Get all agents (hardcoded + dynamic)
   */
  async getAllAgents(hardcodedAgents: Record<string, any> = {}): Promise<Record<string, any>> {
    // Load dynamic agents first
    await this.loadDynamicTools(); // Load tools first since agents depend on them
    await this.loadDynamicAgents();

    // Combine hardcoded and dynamic agents (dynamic overrides hardcoded)
    const allAgents = { ...hardcodedAgents };

    for (const [name, agent] of this.dynamicAgents) {
      allAgents[name] = agent;
    }

    return allAgents;
  }

  /**
   * Get all workflows (hardcoded + dynamic)
   */
  async getAllWorkflows(hardcodedWorkflows: Record<string, any> = {}): Promise<Record<string, any>> {
    // Load dynamic workflows
    await this.loadDynamicWorkflows();

    // Combine hardcoded and dynamic workflows (dynamic overrides hardcoded)
    const allWorkflows = { ...hardcodedWorkflows };

    for (const [name, workflow] of this.dynamicWorkflows) {
      allWorkflows[name] = workflow;
    }

    return allWorkflows;
  }

  /**
   * Get all tools (hardcoded + dynamic)
   */
  async getAllTools(hardcodedTools: Record<string, any> = {}): Promise<Record<string, any>> {
    // Load dynamic tools
    await this.loadDynamicTools();

    // Combine hardcoded and dynamic tools (dynamic overrides hardcoded)
    const allTools = { ...hardcodedTools };

    for (const [name, tool] of this.dynamicTools) {
      allTools[name] = tool;
    }

    return allTools;
  }

  /**
   * Load dynamic scorers from database
   */
  async loadDynamicScorers(): Promise<Map<string, any>> {
    const scorers = new Map<string, any>();

    // Ensure database is initialized before proceeding
    await this.ensureInitialized();

    if (!this.pgStore) {
      console.warn('⚠️ Dynamic loader: No database connection');
      return scorers;
    }

    try {
      await this.pgStore.init();

      const scorerDefinitions = await this.pgStore.db.manyOrNone(`
        SELECT * FROM scorer_definitions 
        WHERE is_active = true 
        ORDER BY created_at ASC
      `);

      for (const definition of scorerDefinitions || []) {
        try {
          // Create scorer using createScorer (placeholder for now)
          const scorer = await this.createDynamicScorer(definition);
          
          scorers.set(definition.name, scorer);
          console.log(`✅ Loaded dynamic scorer: ${definition.name}`);
        } catch (error) {
          console.error(`❌ Failed to load scorer ${definition.name}:`, error);
        }
      }
    } catch (error: any) {
      console.error('Failed to load dynamic scorers:', error);
    }

    this.dynamicScorers = scorers;
    return scorers;
  }

  /**
   * Load dynamic networks from database
   */
  async loadDynamicNetworks(): Promise<Map<string, any>> {
    const networks = new Map<string, any>();

    // Ensure database is initialized before proceeding
    await this.ensureInitialized();

    if (!this.pgStore) {
      console.warn('⚠️ Dynamic loader: No database connection');
      return networks;
    }

    try {
      await this.pgStore.init();

      const networkDefinitions = await this.pgStore.db.manyOrNone(`
        SELECT * FROM network_definitions 
        WHERE is_active = true 
        ORDER BY created_at ASC
      `);

      for (const definition of networkDefinitions || []) {
        try {
          // Get network agent roles
          const agentRoles = await this.pgStore.db.manyOrNone(`
            SELECT * FROM network_agent_roles 
            WHERE network_id = $1 
            ORDER BY order_index ASC, created_at ASC
          `, [definition.id]);

          // Create network configuration
          const network = await this.createDynamicNetwork(definition, agentRoles || []);
          
          networks.set(definition.name, network);
          console.log(`✅ Loaded dynamic network: ${definition.name} with ${agentRoles?.length || 0} agents`);
        } catch (error) {
          console.error(`❌ Failed to load network ${definition.name}:`, error);
        }
      }
    } catch (error: any) {
      console.error('Failed to load dynamic networks:', error);
    }

    this.dynamicNetworks = networks;
    return networks;
  }

  /**
   * Get all scorers (hardcoded + dynamic)
   */
  async getAllScorers(hardcodedScorers: Record<string, any> = {}): Promise<Record<string, any>> {
    // Load dynamic scorers
    await this.loadDynamicScorers();

    // Combine hardcoded and dynamic scorers (dynamic overrides hardcoded)
    const allScorers = { ...hardcodedScorers };

    for (const [name, scorer] of this.dynamicScorers) {
      allScorers[name] = scorer;
    }

    return allScorers;
  }

  /**
   * Get all networks (hardcoded + dynamic)
   */
  async getAllNetworks(hardcodedNetworks: Record<string, any> = {}): Promise<Record<string, any>> {
    // Load dynamic networks
    await this.loadDynamicNetworks();

    // Combine hardcoded and dynamic networks (dynamic overrides hardcoded)
    const allNetworks = { ...hardcodedNetworks };

    for (const [name, network] of this.dynamicNetworks) {
      allNetworks[name] = network;
    }

    return allNetworks;
  }

  /**
   * Reload all dynamic definitions
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading dynamic definitions...');
    
    // Clear existing caches
    this.dynamicTools.clear();
    this.dynamicAgents.clear();
    this.dynamicWorkflows.clear();
    this.dynamicScorers.clear();
    this.dynamicNetworks.clear();

    // Reload all definitions
    await this.loadDynamicTools();
    await this.loadDynamicAgents();
    await this.loadDynamicWorkflows();
    await this.loadDynamicScorers();
    await this.loadDynamicNetworks();

    console.log('✅ Dynamic definitions reloaded');
  }

  /**
   * Convert JSON schema to zod schema
   */
  private convertToZodSchema(jsonSchema: any): z.ZodObject<any> {
    try {
      if (!jsonSchema || typeof jsonSchema !== 'object') {
        return z.object({});
      }

      const shape: Record<string, z.ZodTypeAny> = {};

      // Handle properties
      if (jsonSchema.properties) {
        for (const [key, value] of Object.entries(jsonSchema.properties)) {
          const prop = value as any;
          
          switch (prop.type) {
            case 'string':
              shape[key] = z.string();
              break;
            case 'number':
              shape[key] = z.number();
              break;
            case 'boolean':
              shape[key] = z.boolean();
              break;
            case 'array':
              shape[key] = z.array(z.any());
              break;
            case 'object':
              shape[key] = z.object({});
              break;
            default:
              shape[key] = z.any();
          }
          
          // Handle optional properties
          if (!jsonSchema.required || !jsonSchema.required.includes(key)) {
            shape[key] = shape[key].optional();
          }
        }
      }

      return z.object(shape);
    } catch (error) {
      console.warn('Failed to convert JSON schema to zod:', error);
      return z.object({});
    }
  }

  /**
   * Create workflow steps from step definitions
   */
  private async createWorkflowSteps(stepDefinitions: WorkflowStepDefinition[]): Promise<any[]> {
    const steps = [];

    for (const stepDef of stepDefinitions) {
      try {
        // Convert schemas
        const inputSchema = this.convertToZodSchema(
          typeof stepDef.input_schema === 'string' 
            ? JSON.parse(stepDef.input_schema)
            : stepDef.input_schema
        );

        const outputSchema = this.convertToZodSchema(
          typeof stepDef.output_schema === 'string' 
            ? JSON.parse(stepDef.output_schema || '{}')
            : stepDef.output_schema || {}
        );

        // Create step execute function
        const executeFunction = this.createExecuteFunction(stepDef.execute_code);

        // Create step
        const step = createStep({
          id: stepDef.step_id,
          description: stepDef.description || stepDef.name,
          inputSchema,
          outputSchema,
          execute: async ({ inputData }) => {
            return await executeFunction(inputData);
          }
        });

        steps.push(step);
      } catch (error) {
        console.error(`❌ Failed to create workflow step ${stepDef.step_id}:`, error);
        throw error;
      }
    }

    return steps;
  }

  /**
   * Create dynamic scorer from definition
   * TODO: Implement proper scorer creation when @mastra/scorers is available
   */
  private async createDynamicScorer(definition: ScorerDefinition): Promise<any> {
    try {
      // For now, create a simple scorer configuration object
      // This will be replaced with proper createScorer when the package is available
      const scorer = {
        name: definition.name,
        description: definition.description || definition.display_name,
        type: definition.scorer_type,
        model: definition.judge_model,
        instructions: definition.judge_instructions,
        config: definition.config,
        _isScorer: true // marker to identify this as a scorer
      };

      return scorer;
    } catch (error) {
      console.error(`❌ Failed to create scorer ${definition.name}:`, error);
      throw error;
    }
  }

  /**
   * Create dynamic network from definition
   */
  private async createDynamicNetwork(definition: NetworkDefinition, agentRoles: NetworkAgentRole[]): Promise<any> {
    try {
      // For now, create a simple network configuration object
      // This will be expanded when Mastra has more robust network support
      const network = {
        id: definition.name,
        name: definition.display_name,
        description: definition.description,
        type: definition.network_type,
        agents: agentRoles.map(role => ({
          name: role.agent_name,
          role: role.role,
          order: role.order_index,
          required: role.is_required,
          config: role.config,
        })),
        routing: definition.routing_rules,
        coordination: definition.coordination_strategy,
        communication: definition.communication_protocol,
        config: definition.config,
        _isNetwork: true // marker to identify this as a network
      };

      return network;
    } catch (error) {
      console.error(`❌ Failed to create network ${definition.name}:`, error);
      throw error;
    }
  }

  /**
   * Create execute function from code string
   */
  private createExecuteFunction(code: string): (input: any) => Promise<any> {
    try {
      // WARNING: Using eval is dangerous and should be replaced with a safer sandbox
      // This is a simplified implementation for testing
      const executeFunction = new Function('input', `
        return (async () => {
          try {
            ${code}
          } catch (error) {
            throw new Error('Tool execution failed: ' + error.message);
          }
        })();
      `) as (input: any) => Promise<any>;

      return executeFunction;
    } catch (error) {
      console.error('Failed to create execute function:', error);
      throw new Error('Invalid tool execution code');
    }
  }
}