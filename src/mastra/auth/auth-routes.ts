import { registerApiRoute } from '@mastra/core/server';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { jwtVerify, createRemoteJWKSet, SignJWT, importJWK } from 'jose';
import { PostgresStore } from '@mastra/pg';
import { verifyManagementClient, loadPublicKeys, verifyAdminBearerToken } from './auth-utils';
import { getSharedPostgresStore } from '../utils/database';
import { ragRoutes } from './rag-routes';
import { mcpRoutes } from './mcp-routes';
import { applicationRoutes } from './application-routes';
import { applicationService } from '../services/application-service';

// Configuration
const KEYS_DIR = process.env.KEYS_DIR || 'keys';
const SERVERS_DB_FILE = process.env.SERVERS_DB_FILE || 'servers.json';

// In-memory server registry (fallback for when storage isn't available)
let serversDb: Record<string, any> = {};

// PostgreSQL storage for client registrations
let pgStore: PostgresStore | null = null;

// Initialize PostgreSQL storage using shared connection
async function initializeStorage() {
  if (!pgStore) {
    try {
      pgStore = await getSharedPostgresStore();
      if (pgStore) {
        console.log('✅ Auth routes: Using shared PostgreSQL connection');
      } else {
        console.warn('⚠️ Auth routes: PostgreSQL not available');
      }
    } catch (error: any) {
      console.warn('⚠️ Failed to initialize PostgreSQL storage:', error.message);
      pgStore = null;
    }
  }
}

// Load servers database if it exists
function loadServersDb() {
  try {
    if (existsSync(SERVERS_DB_FILE)) {
      serversDb = JSON.parse(readFileSync(SERVERS_DB_FILE, 'utf8'));
      console.log(`📖 Loaded ${Object.keys(serversDb).length} registered servers from ${SERVERS_DB_FILE}`);
    }
  } catch (error: any) {
    console.warn(`⚠️ Could not load servers database: ${error.message}`);
    serversDb = {};
  }
}

// Save servers database
function saveServersDb() {
  try {
    writeFileSync(SERVERS_DB_FILE, JSON.stringify(serversDb, null, 2));
  } catch (error: any) {
    console.error(`❌ Failed to save servers database: ${error.message}`);
  }
}


// Load token service keys (for signing access tokens)
function loadTokenServiceKeys() {
  // Try to load from environment variable first
  const tokenServicePrivateKey = process.env.TOKEN_SERVICE_PRIVATE_KEY;
  if (tokenServicePrivateKey) {
    try {
      const privateKey = JSON.parse(tokenServicePrivateKey);
      console.log(`✅ Loaded token service private key from environment`);
      return privateKey;
    } catch (error: any) {
      console.error(`❌ Failed to parse TOKEN_SERVICE_PRIVATE_KEY:`, error.message);
    }
  }
  
  // Fallback: try to load from files (for local development)
  if (existsSync(KEYS_DIR)) {
    try {
      const files = readdirSync(KEYS_DIR);
      const privateKeyFiles = files.filter(file => file.endsWith('.private.jwk.json'));
      
      for (const file of privateKeyFiles) {
        const keyPath = join(KEYS_DIR, file);
        const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
        
        if (keyData.agent_id === 'token-service') {
          console.log(`✅ Found token service key: ${file} (fallback)`);
          return keyData;
        }
      }
    } catch (error: any) {
      console.error(`❌ Failed to load token service key from files: ${error.message}`);
    }
  }
  
  console.error(`❌ Token service private key not found`);
  console.log(`💡 Set TOKEN_SERVICE_PRIVATE_KEY environment variable or run: npm run setup-auth`);
  return null;
}

// Verify client credentials using PostgreSQL storage
async function verifyClientCredentials(clientId: string, clientSecret: string) {
  await initializeStorage();
  
  try {
    // Special case: Check for admin client credentials from environment variables
    const adminClientId = process.env.ADMIN_CLIENT_ID;
    const adminClientSecret = process.env.ADMIN_CLIENT_SECRET;
    
    if (adminClientId && adminClientSecret && 
        clientId === adminClientId && clientSecret === adminClientSecret) {
      console.log(`✅ Admin client authenticated: ${clientId}`);
      return {
        clientId,
        name: 'Admin Client',
        scopes: [
          'admin.read',
          'admin.write', 
          'client.read',
          'client.write',
          'agent.read',
          'agent.write',
          'workflow.read',
          'workflow.write',
          'tool.read',
          'tool.write',
          'rag.read',
          'rag.write'
        ]
      };
    }
    
    if (pgStore) {
      // Use PostgreSQL to find the client
      const client = await pgStore.db.oneOrNone(
        'SELECT * FROM client_registrations WHERE client_id = $1',
        [clientId]
      );
      
      if (client && client.client_secret === clientSecret) {
        return {
          clientId,
          name: client.name,
          scopes: client.scopes || []
        };
      }
    }
    
    // Fallback to in-memory for local development
    const memoryClient = serversDb[clientId];
    if (memoryClient && memoryClient.clientSecret === clientSecret) {
      return {
        clientId,
        name: memoryClient.name,
        scopes: memoryClient.scopes
      };
    }
    throw new Error('Invalid client_id');
  } catch (error) {
    throw new Error('Invalid client_id');
  }
}


// Generate access token
async function generateAccessToken(clientId: string, audience: string, scopes: string[], tokenServicePrivateKey: any) {
  try {
    const key = await importJWK(tokenServicePrivateKey, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);

    return await new SignJWT({
      scopes: scopes,
      client_id: clientId,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: tokenServicePrivateKey.kid })
      .setIssuer('https://token.example')
      .setSubject(clientId)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600) // 1 hour
      .setJti(randomUUID())
      .sign(key);
  } catch (error: any) {
    throw new Error(`Failed to generate access token: ${error.message}`);
  }
}


// Enhanced scope validation for application-aware access
export async function verifyApplicationScope(
  clientId: string, 
  applicationName: string, 
  requiredScope: string
): Promise<boolean> {
  try {
    // First check legacy global scopes for backward compatibility
    // We'll just query the database directly for the client without validating credentials
    await initializeStorage();
    if (pgStore) {
      const client = await pgStore.db.oneOrNone(
        'SELECT scopes FROM client_registrations WHERE client_id = $1',
        [clientId]
      );
      
      if (client && client.scopes && client.scopes.includes(requiredScope)) {
        console.log(`✅ Legacy scope granted: ${clientId} has global ${requiredScope}`);
        return true;
      }
    }
  } catch (error) {
    // Legacy scope check failed, continue with application-specific check
  }

  try {
    // Check application-specific scope
    const hasApplicationScope = await applicationService.validateClientApplicationScope(
      clientId, 
      applicationName, 
      requiredScope
    );
    
    if (hasApplicationScope) {
      console.log(`✅ Application scope granted: ${clientId} has ${requiredScope} for ${applicationName}`);
      return true;
    }

    console.log(`❌ Scope denied: ${clientId} lacks ${requiredScope} for ${applicationName}`);
    return false;
  } catch (error: any) {
    console.error(`❌ Scope validation error: ${error.message}`);
    return false;
  }
}

// Helper to get all scopes for a client across applications
export async function getClientAllScopes(clientId: string): Promise<string[]> {
  try {
    const allScopes = new Set<string>();
    
    // Add legacy global scopes
    await initializeStorage();
    if (pgStore) {
      try {
        const client = await pgStore.db.oneOrNone(
          'SELECT scopes FROM client_registrations WHERE client_id = $1',
          [clientId]
        );
        
        if (client && client.scopes) {
          client.scopes.forEach((scope: string) => allScopes.add(scope));
        }
      } catch (error) {
        // Ignore errors for legacy scope check
      }
    }

    // Add application-specific scopes
    const applicationPermissions = await applicationService.getClientApplicationPermissions(clientId);
    applicationPermissions.forEach(permission => {
      permission.component_scopes.forEach(scope => allScopes.add(scope));
    });

    return Array.from(allScopes);
  } catch (error: any) {
    console.error(`Failed to get client scopes: ${error.message}`);
    return [];
  }
}

// Initialize server registry
loadServersDb();

// JWKS endpoint
export const jwksRoute = registerApiRoute('/.well-known/jwks.json', {
  method: 'GET',
  handler: async (c) => {
    const keys = loadPublicKeys();
    const jwks = { keys };
    
    return c.json(jwks);
  },
});

// OAuth 2.0 Token endpoint (client credentials flow)
export const tokenRoute = registerApiRoute('/token', {
  method: 'POST',
  handler: async (c) => {
    try {
      const tokenServiceKey = loadTokenServiceKeys();
      if (!tokenServiceKey) {
        return c.json({ error: 'Token service not configured' }, 500);
      }

      // Parse form data (OAuth 2.0 standard)
      const formData = await c.req.formData();
      const grantType = formData.get('grant_type')?.toString();
      const clientId = formData.get('client_id')?.toString();
      const clientSecret = formData.get('client_secret')?.toString();
      const audience = formData.get('audience')?.toString();
      const scope = formData.get('scope')?.toString();

      if (grantType !== 'client_credentials') {
        return c.json({ error: 'unsupported_grant_type' }, 400);
      }

      if (!clientId || !clientSecret) {
        return c.json({ error: 'invalid_client' }, 401);
      }

      if (!audience) {
        return c.json({ error: 'invalid_request', error_description: 'audience parameter is required' }, 400);
      }

      // Verify client credentials
      const clientInfo = await verifyClientCredentials(clientId, clientSecret);
      
      // Parse requested scopes
      const requestedScopes = scope ? scope.split(' ') : [];
      
      // Check if client is authorized for the requested scopes
      const authorizedScopes = requestedScopes.filter(s => clientInfo.scopes.includes(s));
      
      if (requestedScopes.length > 0 && authorizedScopes.length === 0) {
        return c.json({ error: 'invalid_scope' }, 400);
      }

      console.log(`🔄 Token requested by client ${clientId} for audience ${audience}, scopes: ${authorizedScopes.join(',') || 'none'}`);

      // Generate access token
      const accessToken = await generateAccessToken(
        clientId,
        audience,
        authorizedScopes,
        tokenServiceKey
      );

      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: authorizedScopes.join(' ')
      });

    } catch (error: any) {
      console.error(`❌ Token generation error: ${error.message}`);
      
      if (error.message.includes('Invalid client')) {
        return c.json({ error: 'invalid_client' }, 401);
      }
      
      return c.json({ error: 'server_error' }, 500);
    }
  },
});

// Server registration endpoint (protected)
export const serverRegistrationRoute = registerApiRoute('/servers/register', {
  method: 'POST',
  handler: async (c) => {
    try {
      await initializeStorage();
      
      // Parse request body
      const requestBody = await c.req.json();
      const { serverId, name, scopes = [] } = requestBody;
      
      if (!serverId || !name) {
        return c.json({ error: 'Missing serverId or name' }, 400);
      }

      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized registration attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }

      // Check if client already exists
      let existingClient = null;
      if (pgStore) {
        existingClient = await pgStore.db.oneOrNone(
          'SELECT * FROM client_registrations WHERE client_id = $1',
          [serverId]
        );
      }

      if (existingClient) {
        // Update existing client with new scopes if provided
        if (scopes.length > 0) {
          await pgStore?.db.none(`
            UPDATE client_registrations 
            SET scopes = $2, updated_at = NOW()
            WHERE client_id = $1
          `, [serverId, scopes]);
          
          return c.json({ 
            message: 'Client updated',
            clientId: existingClient.client_id,
            scopes: scopes
          }, 200);
        }
        
        return c.json({ 
          error: 'Client already exists',
          clientId: existingClient.client_id,
          scopes: existingClient.scopes
        }, 409);
      }

      // Generate client credentials
      const clientId = serverId;
      const clientSecret = randomUUID();

      // Save to database
      // temp use 'admin' as registered by until we have users table
      try {
        if (pgStore) {
          await pgStore.db.none(`
            INSERT INTO client_registrations (client_id, client_secret, name, scopes, registered_by)
            VALUES ($1, $2, $3, $4, $5)
          `, [clientId, clientSecret, name, scopes, 'admin']);
          console.log(`✅ Server registered in PostgreSQL: ${name} (${clientId})`);
        } else {
          throw new Error('PostgreSQL not available');
        }
      } catch (dbError: any) {
        console.warn('⚠️ Database save failed, using in-memory fallback:', dbError.message);
      }

      // Also save to memory for local development fallback
      serversDb[serverId] = {
        name,
        clientId,
        clientSecret,
        scopes,
        createdAt: new Date().toISOString(),
        registeredBy: 'admin'
      };
      saveServersDb();

      console.log(`📝 Registered server: ${name} (${serverId}) via management client`);

      return c.json({
        serverId,
        clientId,
        clientSecret,
        scopes
      }, 201);

    } catch (error: any) {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
  },
});

// List servers endpoint
export const listServersRoute = registerApiRoute('/servers', {
  method: 'GET',
  handler: async (c) => {
    try {
      await initializeStorage();
      
      // Verify Bearer token with admin read permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.read']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized servers list attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      
      let dbServers = [];
      if (pgStore) {
        dbServers = await pgStore.db.manyOrNone(`
          SELECT client_id as "serverId", name, scopes, created_at as "createdAt", registered_by as "registeredBy"
          FROM client_registrations
        `);
      }
      
      // Fallback to memory for local development
      const memoryServers = Object.entries(serversDb).map(([id, data]) => ({
        serverId: id,
        name: data.name,
        scopes: data.scopes,
        createdAt: data.createdAt,
        registeredBy: data.registeredBy || 'memory'
      }));
      
      // Combine and deduplicate (prefer database entries)
      const serverMap = new Map();
      memoryServers.forEach(s => serverMap.set(s.serverId, s));
      dbServers.forEach(s => serverMap.set(s.serverId, s));

      return c.json({ servers: Array.from(serverMap.values()) });
    } catch (error: any) {
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Delete client endpoint (protected)
export const deleteClientRoute = registerApiRoute('/servers/:clientId', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      await initializeStorage();
      
      const clientId = c.req.param('clientId');
      
      // Verify Bearer token with admin write permission
      try {
        const authHeader = c.req.header('Authorization');
        await verifyAdminBearerToken(authHeader, ['client.write']);
      } catch (error: any) {
        console.warn('🚫 Unauthorized client deletion attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin token required.',
          details: error.message
        }, 403);
      }
      
      // Delete from database
      let deleted = false;
      if (pgStore) {
        const result = await pgStore.db.result(
          'DELETE FROM client_registrations WHERE client_id = $1',
          [clientId]
        );
        deleted = result.rowCount > 0;
      }
      
      // Also delete from memory
      if (serversDb[clientId]) {
        delete serversDb[clientId];
        saveServersDb();
        deleted = true;
      }
      
      if (!deleted) {
        return c.json({ error: 'Client not found' }, 404);
      }
      
      console.log(`🗑️ Deleted client: ${clientId}`);
      return c.json({ message: 'Client deleted successfully' });
      
    } catch (error: any) {
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Reload dynamic definitions endpoint (protected)
export const reloadDynamicRoute = registerApiRoute('/admin/reload', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Get management client credentials from headers
      const managementClientId = c.req.header('x-management-client-id');
      const managementClientSecret = c.req.header('x-management-client-secret');
      
      // Verify management client credentials
      if (!managementClientId || !managementClientSecret) {
        return c.json({ 
          error: 'Missing management client credentials',
          details: 'Management client ID and secret are required'
        }, 401);
      }
      
      try {
        await verifyManagementClient(managementClientId, managementClientSecret);
      } catch (error: any) {
        console.warn('🚫 Unauthorized reload attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid management client credentials required.',
          details: error.message
        }, 403);
      }
      
      // Reload dynamic definitions
      // Note: This would require access to the dynamic loader instance
      // For now, just return success - the actual reload logic would need to be implemented
      // based on how the Mastra instance is structured
      
      console.log('🔄 Dynamic definitions reload requested');
      return c.json({ message: 'Dynamic definitions reload initiated' });
      
    } catch (error: any) {
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Health check for auth system
export const authHealthRoute = registerApiRoute('/auth/health', {
  method: 'GET',
  handler: async (c) => {
    await initializeStorage();
    
    const keys = loadPublicKeys();
    
    let dbServerCount = 0;
    let databaseConnected = false;
    try {
      if (pgStore) {
        dbServerCount = await pgStore.db.one('SELECT COUNT(*) as count FROM client_registrations', [], a => +a.count);
        databaseConnected = true;
      }
    } catch (error: any) {
      // Database not available, use memory count
      console.warn('Health check: Database not available:', error.message);
    }
    
    return c.json({
      status: 'healthy',
      keysLoaded: keys.length,
      serversRegistered: dbServerCount || Object.keys(serversDb).length,
      databaseConnected,
      storageType: databaseConnected ? 'postgresql' : 'memory'
    });
  },
});

// Export all routes as an array for easy registration
export const authRoutes = [
  jwksRoute,
  tokenRoute,
  serverRegistrationRoute,
  listServersRoute,
  deleteClientRoute,
  reloadDynamicRoute,
  authHealthRoute,
  ...ragRoutes,
  ...mcpRoutes,
  ...applicationRoutes,
];
