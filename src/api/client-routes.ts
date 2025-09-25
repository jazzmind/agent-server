import { registerApiRoute } from '@mastra/core/server';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';
import { clientService, CreateClientRequest, UpdateClientRequest } from '../mastra/services/client';


// Client registration endpoint (protected)
export const clientRegistrationRoute = registerApiRoute('/clients/register', {
    method: 'POST',
    handler: async (c) => {
      try {
        // Parse request body
        const requestBody = await c.req.json();
        const { serverId, name, scopes = [] } = requestBody;
        
        if (!serverId || !name) {
          return c.json({ error: 'Missing serverId or name' }, 400);
        }
  
        // Verify Bearer token with admin write permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
  
        const request: CreateClientRequest = { serverId, name, scopes };
        const { client, isNew } = await clientService.createClient(request);
        
        if (!isNew) {
          if (scopes.length > 0) {
            return c.json({ 
              message: 'Client updated',
              clientId: client.client_id,
              scopes: client.scopes
            }, 200);
          }
          
          return c.json({ 
            error: 'Client already exists',
            clientId: client.client_id,
            scopes: client.scopes
          }, 409);
        }
  
        console.log(`📝 Registered server: ${name} (${serverId}) via management client`);
  
        return c.json({
          serverId,
          clientId: client.client_id,
          clientSecret: client.client_secret,
          scopes: client.scopes
        }, 201);
  
      } catch (error: any) {
        console.error('Failed to register client:', error);
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
  
  // List clients endpoint
  export const listClientsRoute = registerApiRoute('/clients', {
    method: 'GET',
    handler: async (c) => {
      try {
        // Verify Bearer token with admin read permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.read']);
        
        const clients = await clientService.listClients();
        
        // Transform to match expected format
        const servers = clients.map(client => ({
          serverId: client.client_id,
          name: client.name,
          scopes: client.scopes,
          createdAt: client.created_at,
          registeredBy: client.registered_by
        }));
  
        return c.json({ servers });
      } catch (error: any) {
        console.error('Failed to list clients:', error);
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
  
  // Delete client endpoint (protected)
  export const deleteClientRoute = registerApiRoute('/clients/:clientId', {
    method: 'DELETE',
    handler: async (c) => {
      try {
        const clientId = c.req.param('clientId');
        
        // Verify Bearer token with admin write permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
        
        const deleted = await clientService.deleteClient(clientId);
        
        if (!deleted) {
          return c.json({ error: 'Client not found' }, 404);
        }
        
        console.log(`🗑️ Deleted client: ${clientId}`);
        return c.json({ message: 'Client deleted successfully' });
        
      } catch (error: any) {
        console.error('Failed to delete client:', error);
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
  
  // Update client endpoint (protected)
  export const updateClientRoute = registerApiRoute('/clients/:clientId', {
    method: 'PATCH',
    handler: async (c) => {
      try {
        const clientId = c.req.param('clientId');
        const requestBody = await c.req.json();
        const { name, global_scopes } = requestBody;
        console.log('requestBody', requestBody);
        // Verify Bearer token with admin write permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
        
        if (!Array.isArray(global_scopes)) {
          return c.json({ error: 'Scopes must be an array' }, 400);
        }
        
      const request: UpdateClientRequest = { name, scopes: global_scopes };
        const updated = await clientService.updateClient(clientId, request);
        
        if (!updated) {
          return c.json({ error: 'Client not found' }, 404);
        }
        
        console.log(`📝 Updated client scopes: ${clientId}`);
        return c.json({ 
          message: 'Client updated successfully', 
          client: { clientId, scopes: global_scopes }
        });
        
      } catch (error: any) {
        console.error('Failed to update client:', error);
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
  
  // Get client secret endpoint (protected)
  export const getClientSecretRoute = registerApiRoute('/clients/:clientId/secret', {
    method: 'GET',
    handler: async (c) => {
      try {
        const clientId = c.req.param('clientId');
        
        // Verify Bearer token with admin read permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.read']);
        
        const clientSecret = await clientService.getClientSecret(clientId);
        
        if (!clientSecret) {
          return c.json({ error: 'Client not found' }, 404);
        }
        
        console.log(`🔑 Retrieved client secret: ${clientId}`);
        return c.json({ secret: clientSecret });
        
      } catch (error: any) {
        console.error('Failed to get client secret:', error);
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
  
  // Reset client secret endpoint (protected)
  export const resetClientSecretRoute = registerApiRoute('/clients/:clientId/secret', {
    method: 'POST',
    handler: async (c) => {
      try {
        const clientId = c.req.param('clientId');
        
        // Verify Bearer token with admin write permission
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
        
        const newSecret = await clientService.resetClientSecret(clientId);
        
        if (!newSecret) {
          return c.json({ error: 'Client not found' }, 404);
        }
        
        console.log(`🔄 Reset client secret: ${clientId}`);
        return c.json({ secret: newSecret });
        
      } catch (error: any) {
        console.error('Failed to reset client secret:', error);
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
export const clientRoutes = [
    clientRegistrationRoute,
    listClientsRoute,
    deleteClientRoute,
    updateClientRoute,
    getClientSecretRoute,
    resetClientSecretRoute,
  ];
  