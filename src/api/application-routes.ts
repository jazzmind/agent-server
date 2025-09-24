import { registerApiRoute } from '@mastra/core/server';
import { applicationService, CreateApplicationRequest, UpdateApplicationRequest, AddComponentRequest, GrantClientPermissionRequest } from '../mastra/services/application';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';

// List all applications
export const listApplicationsRoute = registerApiRoute('/applications', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
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
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
 
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
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const applicationId = c.req.param('id');
      const applicationDetails = await applicationService.getApplicationDetails(applicationId);
      
      if (!applicationDetails) {
        return c.json({ error: 'Application not found' }, 404);
      }
      
      return c.json({ application: applicationDetails });
    } catch (error: any) {
      console.error('Failed to get application:', error);
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

// Update application
export const updateApplicationRoute = registerApiRoute('/applications/:id', {
  method: 'PUT',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const applicationId = c.req.param('id');
      const requestBody: UpdateApplicationRequest = await c.req.json();
      
      const application = await applicationService.updateApplication(applicationId, requestBody);
      
      console.log(`📝 Updated application: ${application.name} (${application.id})`);
      return c.json({ application });
    } catch (error: any) {
      console.error('Failed to update application:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
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
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

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


// Route to fetch available components for dropdown selection
const getAvailableComponentsRoute = registerApiRoute('/applications/:id/components', {
  method: 'GET',
  handler: async (c) => {
    try {
      const componentType = c.req.query('type');
      
      // Verify admin bearer token
      const authHeader = c.req.header('authorization');
      await verifyAdminBearerToken(authHeader || '', ['admin.read']);

      const components = await applicationService.getAvailableComponents(componentType);
      return c.json({ components });

    } catch (error: any) {
      console.error('❌ Failed to fetch available components:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      return c.json({ error: 'Failed to fetch available components' }, 500);
    }
  }
});

// Add component to application
export const addComponentRoute = registerApiRoute('/applications/:id/components', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

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
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
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
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const applicationId = c.req.param('id');
      const componentType = c.req.param('type');
      const componentId = c.req.param('componentId');
      
      await applicationService.removeComponentFromApplication(applicationId, componentType, componentId);
      
      console.log(`🗑️ Removed component ${componentId} (${componentType}) from application ${applicationId}`);
      return c.json({ message: 'Component removed successfully' });
    } catch (error: any) {
      console.error('Failed to remove component:', error);
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

// Grant client permission to application
export const grantClientPermissionRoute = registerApiRoute('/applications/:id/permissions/:clientId', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

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
      if (error.message?.includes('Unauthorized') || error.message?.includes('Invalid token')) {
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
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
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);

      const applicationId = c.req.param('id');
      const clientId = c.req.param('clientId');
      
      await applicationService.revokeClientPermission(applicationId, clientId);
      
      console.log(`🗑️ Revoked client ${clientId} permissions from application ${applicationId}`);
      return c.json({ message: 'Permission revoked successfully' });
    } catch (error: any) {
      console.error('Failed to revoke permission:', error);
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

// Get client's application permissions
export const getClientPermissionsRoute = registerApiRoute('/applications/:id/permissions/:clientId', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      const clientId = c.req.param('clientId');
      const permissions = await applicationService.getClientApplicationPermissions(clientId);
      
      return c.json({ permissions });
    } catch (error: any) {
      console.error('Failed to get client permissions:', error);
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
