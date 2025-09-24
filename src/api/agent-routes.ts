import { registerApiRoute } from '@mastra/core/server';
import { agentService, CreateAgentRequest, UpdateAgentRequest } from '../mastra/services/agent';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';

// List all agents
export const listAgentsRoute = registerApiRoute('/agents', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      // Parse query parameters
      const activeOnly = c.req.query('active_only') === 'true';
      const scopesParam = c.req.query('scopes');
      const scopes = scopesParam ? scopesParam.split(',') : undefined;
      const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
      const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;
      
      const agents = await agentService.listAgents({
        active_only: activeOnly,
        scopes,
        limit,
        offset
      });
      
      return c.json({ agents });
    } catch (error: any) {
      console.error('Failed to list agents:', error);
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

// Create new agent
export const createAgentRoute = registerApiRoute('/agents', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const requestBody: CreateAgentRequest = await c.req.json();
      
      if (!requestBody.name || !requestBody.display_name || !requestBody.instructions) {
        return c.json({ error: 'Missing required fields: name, display_name, instructions' }, 400);
      }

      // Check if agent with this name already exists
      const nameAvailable = await agentService.validateAgentName(requestBody.name);
      if (!nameAvailable) {
        return c.json({ error: 'Agent with this name already exists' }, 409);
      }

      const agent = await agentService.createAgent(requestBody);
      
      console.log(`📝 Created agent: ${agent.name} (${agent.id})`);
      return c.json({ agent }, 201);
    } catch (error: any) {
      console.error('Failed to create agent:', error);
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

// Get agent details
export const getAgentRoute = registerApiRoute('/agents/:id', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const agentId = c.req.param('id');
      const agent = await agentService.getAgent(agentId);
      
      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      
      return c.json({ agent });
    } catch (error: any) {
      console.error('Failed to get agent:', error);
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

// Update agent
export const updateAgentRoute = registerApiRoute('/agents/:id', {
  method: 'PUT',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const agentId = c.req.param('id');
      const requestBody: UpdateAgentRequest = await c.req.json();
      
      const agent = await agentService.updateAgent(agentId, requestBody);
      
      console.log(`📝 Updated agent: ${agent.name} (${agent.id})`);
      return c.json({ agent });
    } catch (error: any) {
      console.error('Failed to update agent:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      if (error.message.includes('No data returned')) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Delete agent
export const deleteAgentRoute = registerApiRoute('/agents/:id', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const agentId = c.req.param('id');
      
      // Check if agent exists first
      const agent = await agentService.getAgent(agentId);
      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      
      await agentService.deleteAgent(agentId);
      
      console.log(`🗑️ Deleted agent: ${agent.name} (${agentId})`);
      return c.json({ message: 'Agent deleted successfully' });
    } catch (error: any) {
      console.error('Failed to delete agent:', error);
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

// Activate agent
export const activateAgentRoute = registerApiRoute('/agents/:id/activate', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const agentId = c.req.param('id');
      const agent = await agentService.activateAgent(agentId);
      
      console.log(`✅ Activated agent: ${agent.name} (${agentId})`);
      return c.json({ agent });
    } catch (error: any) {
      console.error('Failed to activate agent:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      if (error.message.includes('No data returned')) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Deactivate agent
export const deactivateAgentRoute = registerApiRoute('/agents/:id/deactivate', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const agentId = c.req.param('id');
      const agent = await agentService.deactivateAgent(agentId);
      
      console.log(`❌ Deactivated agent: ${agent.name} (${agentId})`);
      return c.json({ agent });
    } catch (error: any) {
      console.error('Failed to deactivate agent:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      if (error.message.includes('No data returned')) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Search agents
export const searchAgentsRoute = registerApiRoute('/agents/search', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const query = c.req.query('q');
      if (!query) {
        return c.json({ error: 'Query parameter "q" is required' }, 400);
      }
      
      const activeOnly = c.req.query('active_only') === 'true';
      const agents = await agentService.searchAgents(query, { active_only: activeOnly });
      
      return c.json({ agents });
    } catch (error: any) {
      console.error('Failed to search agents:', error);
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

// Get agents by scope
export const getAgentsByScopeRoute = registerApiRoute('/agents/scope/:scope', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const scope = c.req.param('scope');
      const agents = await agentService.getAgentsByScope(scope);
      
      return c.json({ agents });
    } catch (error: any) {
      console.error('Failed to get agents by scope:', error);
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
export const agentRoutes = [
  listAgentsRoute,
  createAgentRoute,
  getAgentRoute,
  updateAgentRoute,
  deleteAgentRoute,
  activateAgentRoute,
  deactivateAgentRoute,
  searchAgentsRoute,
  getAgentsByScopeRoute,
];