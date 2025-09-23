import { registerApiRoute } from '@mastra/core/server';
import { applicationService, CreateApplicationRequest, UpdateApplicationRequest, AddComponentRequest, GrantClientPermissionRequest } from '../services/application-service';
import { verifyAdminBearerToken } from './auth-utils';
import { getSharedPostgresStore } from '../utils/database';
import { PostgresStore } from '@mastra/pg';

// PostgreSQL storage for database access
let pgStore: PostgresStore | null = null;

// Initialize PostgreSQL storage using shared connection
async function initializeStorage() {
  if (!pgStore) {
    try {
      pgStore = await getSharedPostgresStore();
      if (pgStore) {
        console.log('✅ Application routes: Using shared PostgreSQL connection');
      } else {
        console.warn('⚠️ Application routes: PostgreSQL not available');
      }
    } catch (error: any) {
      console.warn('⚠️ Failed to initialize PostgreSQL storage:', error.message);
      pgStore = null;
    }
  }
}

// Application management routes

// List all applications
export const listApplicationsRoute = registerApiRoute('/applications', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.read']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized applications list attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applications = await applicationService.listApplications();
      return c.json({ applications });
    } catch (error: any) {
      console.error('Failed to list applications:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Create new application
export const createApplicationRoute = registerApiRoute('/applications', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized application creation attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const requestBody: CreateApplicationRequest = await c.req.json();
      
      if (!requestBody.name || !requestBody.display_name) {
        return c.json({ error: 'Missing required fields: name, display_name' }, 400);
      }

      // Check if application with this name already exists
      const existingApp = await applicationService.getApplicationByName(requestBody.name);
      if (existingApp) {
        return c.json({ error: 'Application with this name already exists' }, 409);
      }

      const application = await applicationService.createApplication(requestBody);
      
      console.log(`📝 Created application: ${application.name} (${application.id})`);
      return c.json({ application }, 201);
    } catch (error: any) {
      console.error('Failed to create application:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get application details
export const getApplicationRoute = registerApiRoute('/applications/:id', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.read']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized application access attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const applicationDetails = await applicationService.getApplicationDetails(applicationId);
      
      if (!applicationDetails) {
        return c.json({ error: 'Application not found' }, 404);
      }
      
      return c.json({ application: applicationDetails });
    } catch (error: any) {
      console.error('Failed to get application:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Update application
export const updateApplicationRoute = registerApiRoute('/applications/:id', {
  method: 'PUT',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized application update attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const requestBody: UpdateApplicationRequest = await c.req.json();
      
      const application = await applicationService.updateApplication(applicationId, requestBody);
      
      console.log(`📝 Updated application: ${application.name} (${application.id})`);
      return c.json({ application });
    } catch (error: any) {
      console.error('Failed to update application:', error);
      if (error.message.includes('No data returned')) {
        return c.json({ error: 'Application not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Delete application
export const deleteApplicationRoute = registerApiRoute('/applications/:id', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized application deletion attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      
      // Check if application exists first
      const application = await applicationService.getApplication(applicationId);
      if (!application) {
        return c.json({ error: 'Application not found' }, 404);
      }
      
      await applicationService.deleteApplication(applicationId);
      
      console.log(`🗑️ Deleted application: ${application.name} (${applicationId})`);
      return c.json({ message: 'Application deleted successfully' });
    } catch (error: any) {
      console.error('Failed to delete application:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Add component to application
export const addComponentRoute = registerApiRoute('/applications/:id/components', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized component addition attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const requestBody: AddComponentRequest = await c.req.json();
      
      if (!requestBody.component_type || !requestBody.component_id || !requestBody.component_name) {
        return c.json({ error: 'Missing required fields: component_type, component_id, component_name' }, 400);
      }

      const component = await applicationService.addComponentToApplication(applicationId, requestBody);
      
      console.log(`📝 Added component ${component.component_name} to application ${applicationId}`);
      return c.json({ component }, 201);
    } catch (error: any) {
      console.error('Failed to add component:', error);
      if (error.message.includes('foreign key')) {
        return c.json({ error: 'Application not found' }, 404);
      }
      if (error.message.includes('duplicate key')) {
        return c.json({ error: 'Component already exists in this application' }, 409);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Remove component from application
export const removeComponentRoute = registerApiRoute('/applications/:id/components/:type/:componentId', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized component removal attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const componentType = c.req.param('type');
      const componentId = c.req.param('componentId');
      
      await applicationService.removeComponentFromApplication(applicationId, componentType, componentId);
      
      console.log(`🗑️ Removed component ${componentId} (${componentType}) from application ${applicationId}`);
      return c.json({ message: 'Component removed successfully' });
    } catch (error: any) {
      console.error('Failed to remove component:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Grant client permission to application
export const grantClientPermissionRoute = registerApiRoute('/applications/:id/permissions', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized permission grant attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const requestBody: GrantClientPermissionRequest = await c.req.json();
      
      if (!requestBody.client_id || !Array.isArray(requestBody.component_scopes)) {
        return c.json({ error: 'Missing required fields: client_id, component_scopes (array)' }, 400);
      }

      const permission = await applicationService.grantClientPermission(applicationId, requestBody);
      
      console.log(`📝 Granted client ${permission.client_id} permissions to application ${applicationId}`);
      return c.json({ permission }, 201);
    } catch (error: any) {
      console.error('Failed to grant permission:', error);
      if (error.message.includes('foreign key')) {
        return c.json({ error: 'Application or client not found' }, 404);
      }
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Revoke client permission from application
export const revokeClientPermissionRoute = registerApiRoute('/applications/:id/permissions/:clientId', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized permission revocation attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const applicationId = c.req.param('id');
      const clientId = c.req.param('clientId');
      
      await applicationService.revokeClientPermission(applicationId, clientId);
      
      console.log(`🗑️ Revoked client ${clientId} permissions from application ${applicationId}`);
      return c.json({ message: 'Permission revoked successfully' });
    } catch (error: any) {
      console.error('Failed to revoke permission:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Get client's application permissions
export const getClientPermissionsRoute = registerApiRoute('/clients/:clientId/permissions', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['admin.read']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized client permissions access attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      const clientId = c.req.param('clientId');
      const permissions = await applicationService.getClientApplicationPermissions(clientId);
      
      return c.json({ permissions });
    } catch (error: any) {
      console.error('Failed to get client permissions:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Route to fetch available components for dropdown selection
const getAvailableComponentsRoute = registerApiRoute('/components/available', {
  method: 'GET',
  handler: async (c) => {
    try {
      const componentType = c.req.query('type');
      
      // Verify admin bearer token
      const authHeader = c.req.header('authorization');
      try {
        await verifyAdminBearerToken(authHeader || '', ['admin.read'] );
      } catch (error: any) {
        return c.json({ 
          error: error.message || 'Unauthorized' 
        }, 401);
      }

      await initializeStorage();
      if (!pgStore) {
        return c.json({ error: 'Database not available' }, 500);
      }

      let components: any[] = [];

      if (!componentType || componentType === 'agent') {
        const agents = await pgStore.db.manyOrNone(`
          SELECT id, name, display_name, 'agent' as component_type
          FROM agent_definitions 
          WHERE is_active = true 
          ORDER BY display_name ASC
        `);
        components.push(...(agents || []));
      }

      if (!componentType || componentType === 'workflow') {
        const workflows = await pgStore.db.manyOrNone(`
          SELECT id, name, display_name, 'workflow' as component_type
          FROM workflow_definitions 
          WHERE is_active = true 
          ORDER BY display_name ASC
        `);
        components.push(...(workflows || []));
      }

      if (!componentType || componentType === 'tool') {
        const tools = await pgStore.db.manyOrNone(`
          SELECT id, name, display_name, 'tool' as component_type
          FROM tool_definitions 
          WHERE is_active = true 
          ORDER BY display_name ASC
        `);
        components.push(...(tools || []));
      }

      if (!componentType || componentType === 'rag_database') {
        const ragDatabases = await pgStore.db.manyOrNone(`
          SELECT id, name, display_name, 'rag_database' as component_type
          FROM rag_database_definitions 
          WHERE is_active = true 
          ORDER BY display_name ASC
        `);
        components.push(...(ragDatabases || []));
      }

      return c.json({ components });

    } catch (error: any) {
      console.error('❌ Failed to fetch available components:', error);
      return c.json({ error: 'Failed to fetch available components' }, 500);
    }
  }
});

// Export all routes as an array for easy registration
export const applicationRoutes = [
  listApplicationsRoute,
  createApplicationRoute,
  getApplicationRoute,
  updateApplicationRoute,
  deleteApplicationRoute,
  addComponentRoute,
  removeComponentRoute,
  grantClientPermissionRoute,
  revokeClientPermissionRoute,
  getClientPermissionsRoute,
  getAvailableComponentsRoute,
];
