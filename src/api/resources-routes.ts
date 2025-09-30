import { registerApiRoute } from '@mastra/core/server';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';
import { agentService } from '../mastra/services/agent';
import { getSharedPostgresStore } from '../mastra/utils/database';

// Get available tools for agent configuration
export const getAvailableToolsRoute = registerApiRoute('/resources/tools', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      const pgStore = await getSharedPostgresStore();
      if (!pgStore) {
        return c.json({ error: 'Database not available' }, 500);
      }

      await pgStore.init();
      
      const tools = await pgStore.db.manyOrNone(`
        SELECT id, name, display_name, description, scopes
        FROM tool_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      
      return c.json({ tools: tools || [] });
    } catch (error: any) {
      console.error('Failed to get available tools:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get available workflows for agent configuration
export const getAvailableWorkflowsRoute = registerApiRoute('/resources/workflows', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      const pgStore = await getSharedPostgresStore();
      if (!pgStore) {
        return c.json({ error: 'Database not available' }, 500);
      }

      await pgStore.init();
      
      const workflows = await pgStore.db.manyOrNone(`
        SELECT id, name, display_name, description, scopes
        FROM workflow_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      
      return c.json({ workflows: workflows || [] });
    } catch (error: any) {
      console.error('Failed to get available workflows:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get available scorers for agent configuration
export const getAvailableScorersRoute = registerApiRoute('/resources/scorers', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      const pgStore = await getSharedPostgresStore();
      if (!pgStore) {
        return c.json({ error: 'Database not available' }, 500);
      }

      await pgStore.init();
      
      const scorers = await pgStore.db.manyOrNone(`
        SELECT id, name, display_name, description, scorer_type, scopes
        FROM scorer_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      
      return c.json({ scorers: scorers || [] });
    } catch (error: any) {
      console.error('Failed to get available scorers:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get available agents for referencing in other agents
export const getAvailableAgentsRoute = registerApiRoute('/resources/agents', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      // Get the agent ID that's being configured (to exclude from results)
      const excludeId = c.req.query('exclude');
      
      const agents = await agentService.listAgents({ active_only: true });
      
      // Filter out the agent being configured to prevent circular references
      const availableAgents = agents
        .filter(agent => excludeId ? agent.id !== excludeId : true)
        .map(agent => ({
          id: agent.id,
          name: agent.name,
          display_name: agent.display_name,
          description: agent.description,
          scopes: agent.scopes
        }));
      
      return c.json({ agents: availableAgents });
    } catch (error: any) {
      console.error('Failed to get available agents:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get available processors (input/output)
export const getAvailableProcessorsRoute = registerApiRoute('/resources/processors', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      // For now, return a predefined list of processors
      // In the future, this could be stored in the database
      const processors = [
        { name: 'text-preprocessor', display_name: 'Text Preprocessor', type: 'input' },
        { name: 'json-validator', display_name: 'JSON Validator', type: 'input' },
        { name: 'content-filter', display_name: 'Content Filter', type: 'input' },
        { name: 'text-formatter', display_name: 'Text Formatter', type: 'output' },
        { name: 'markdown-processor', display_name: 'Markdown Processor', type: 'output' },
        { name: 'json-formatter', display_name: 'JSON Formatter', type: 'output' },
        { name: 'template-processor', display_name: 'Template Processor', type: 'output' },
      ];
      
      return c.json({ processors });
    } catch (error: any) {
      console.error('Failed to get available processors:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Export all routes as an array for easy registration
export const resourceRoutes = [
  getAvailableToolsRoute,
  getAvailableWorkflowsRoute,
  getAvailableScorersRoute,
  getAvailableAgentsRoute,
  getAvailableProcessorsRoute,
];
