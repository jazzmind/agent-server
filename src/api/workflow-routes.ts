import { registerApiRoute } from '@mastra/core/server';
import { 
  workflowService, 
  CreateWorkflowRequest, 
  UpdateWorkflowRequest,
  CreateWorkflowStepRequest,
  UpdateWorkflowStepRequest
} from '../mastra/services/workflow';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';

// List all workflows
export const listWorkflowsRoute = registerApiRoute('/workflows', {
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
      
      const workflows = await workflowService.listWorkflows({
        active_only: activeOnly,
        scopes,
        limit,
        offset
      });
      
      return c.json({ workflows });
    } catch (error: any) {
      console.error('Failed to list workflows:', error);
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

// Create new workflow
export const createWorkflowRoute = registerApiRoute('/workflows', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const requestBody: CreateWorkflowRequest = await c.req.json();
      
      if (!requestBody.name || !requestBody.display_name) {
        return c.json({ error: 'Missing required fields: name, display_name' }, 400);
      }

      // Check if workflow with this name already exists
      const nameAvailable = await workflowService.validateWorkflowName(requestBody.name);
      if (!nameAvailable) {
        return c.json({ error: 'Workflow with this name already exists' }, 409);
      }

      const workflow = await workflowService.createWorkflow(requestBody);
      
      console.log(`📝 Created workflow: ${workflow.name} (${workflow.id})`);
      return c.json({ workflow }, 201);
    } catch (error: any) {
      console.error('Failed to create workflow:', error);
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

// Get workflow details
export const getWorkflowRoute = registerApiRoute('/workflows/:id', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const workflowId = c.req.param('id');
      const includeSteps = c.req.query('include_steps') === 'true';
      
      let workflow;
      if (includeSteps) {
        workflow = await workflowService.getWorkflowWithSteps(workflowId);
      } else {
        workflow = await workflowService.getWorkflow(workflowId);
      }
      
      if (!workflow) {
        return c.json({ error: 'Workflow not found' }, 404);
      }
      
      return c.json({ workflow });
    } catch (error: any) {
      console.error('Failed to get workflow:', error);
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

// Update workflow
export const updateWorkflowRoute = registerApiRoute('/workflows/:id', {
  method: 'PUT',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const workflowId = c.req.param('id');
      const requestBody: UpdateWorkflowRequest = await c.req.json();
      
      const workflow = await workflowService.updateWorkflow(workflowId, requestBody);
      
      console.log(`📝 Updated workflow: ${workflow.name} (${workflow.id})`);
      return c.json({ workflow });
    } catch (error: any) {
      console.error('Failed to update workflow:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      if (error.message.includes('No data returned')) {
        return c.json({ error: 'Workflow not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Delete workflow
export const deleteWorkflowRoute = registerApiRoute('/workflows/:id', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const workflowId = c.req.param('id');
      
      // Check if workflow exists first
      const workflow = await workflowService.getWorkflow(workflowId);
      if (!workflow) {
        return c.json({ error: 'Workflow not found' }, 404);
      }
      
      await workflowService.deleteWorkflow(workflowId);
      
      console.log(`🗑️ Deleted workflow: ${workflow.name} (${workflowId})`);
      return c.json({ message: 'Workflow deleted successfully' });
    } catch (error: any) {
      console.error('Failed to delete workflow:', error);
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

// Search workflows
export const searchWorkflowsRoute = registerApiRoute('/workflows/search', {
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
      const workflows = await workflowService.searchWorkflows(query, { active_only: activeOnly });
      
      return c.json({ workflows });
    } catch (error: any) {
      console.error('Failed to search workflows:', error);
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
export const workflowRoutes = [
  listWorkflowsRoute,
  createWorkflowRoute,
  getWorkflowRoute,
  updateWorkflowRoute,
  deleteWorkflowRoute,
  searchWorkflowsRoute,
];
