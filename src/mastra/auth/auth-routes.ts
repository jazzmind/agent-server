import { registerApiRoute } from '@mastra/core/server';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { jwtVerify, createRemoteJWKSet, SignJWT, importJWK } from 'jose';
import { PrismaClient } from '@prisma/client';

// Configuration
const KEYS_DIR = process.env.KEYS_DIR || 'keys';
const SERVERS_DB_FILE = process.env.SERVERS_DB_FILE || 'servers.json';

// Prisma client for database operations
const prisma = new PrismaClient();

// In-memory server registry (fallback for local development)
let serversDb: Record<string, any> = {};

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

// Load public keys from environment variables
function loadPublicKeys() {
  const keys: any[] = [];
  
  // Try to load from environment variable first
  const tokenServicePublicKey = process.env.TOKEN_SERVICE_PUBLIC_KEY;
  if (tokenServicePublicKey) {
    try {
      const publicKey = JSON.parse(tokenServicePublicKey);
      keys.push(publicKey);
      console.log(`✅ Loaded token service public key from environment`);
    } catch (error: any) {
      console.error(`❌ Failed to parse TOKEN_SERVICE_PUBLIC_KEY:`, error.message);
    }
  }
  
  // Fallback: try to load from files (for local development)
  if (keys.length === 0 && existsSync(KEYS_DIR)) {
    try {
      const files = readdirSync(KEYS_DIR);
      const publicKeyFiles = files.filter(file => 
        file.endsWith('.public.jwk.json') || file.endsWith('.jwks.json')
      );

      for (const file of publicKeyFiles) {
        try {
          const keyPath = join(KEYS_DIR, file);
          const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
          
          if (keyData.keys) {
            // It's a JWKS file
            keys.push(...keyData.keys);
          } else {
            // It's a single JWK file
            keys.push(keyData);
          }
          
          console.log(`✅ Loaded key from ${file} (fallback)`);
        } catch (error: any) {
          console.warn(`⚠️ Failed to load key from ${file}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error(`❌ Failed to read keys directory:`, error.message);
    }
  }

  if (keys.length === 0) {
    console.warn(`⚠️ No public keys found. Set TOKEN_SERVICE_PUBLIC_KEY environment variable.`);
  }

  return keys;
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

// Verify client credentials (async now that we use database)
async function verifyClientCredentials(clientId: string, clientSecret: string) {
  try {
    const client = await prisma.serverRegistration.findUnique({
      where: { clientId }
    });
    
    if (!client) {
      throw new Error('Invalid client_id');
    }
    
    if (client.clientSecret !== clientSecret) {
      throw new Error('Invalid client_secret');
    }
    
    return {
      clientId,
      name: client.name,
      scopes: client.scopes
    };
  } catch (error) {
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
      // Security check: Only allow registration in development or with admin key
      const isDevelopment = process.env.NODE_ENV === 'development' || 
                           process.env.VERCEL_ENV === 'development' ||
                           (!process.env.VERCEL_ENV && !process.env.VERCEL); // Local development only
      
      const adminKey = c.req.header('x-admin-key');
      const expectedAdminKey = process.env.ADMIN_REGISTRATION_KEY;
      
      // Debug logging (remove in production)
      console.log('🔍 Registration security check:', {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL: process.env.VERCEL,
        isDevelopment,
        hasAdminKey: !!adminKey,
        hasExpectedAdminKey: !!expectedAdminKey
      });
      
      if (!isDevelopment && (!adminKey || !expectedAdminKey || adminKey !== expectedAdminKey)) {
        console.warn('🚫 Unauthorized registration attempt from:', c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown');
        return c.json({ 
          error: 'Unauthorized. Client registration is only allowed in development or with admin key.',
          debug: { isDevelopment, hasAdminKey: !!adminKey, hasExpectedAdminKey: !!expectedAdminKey }
        }, 403);
      }

      const { serverId, name, scopes = [] } = await c.req.json();
      
      if (!serverId || !name) {
        return c.json({ error: 'Missing serverId or name' }, 400);
      }

      // Check if client already exists
      const existingClient = await prisma.serverRegistration.findUnique({
        where: { serverId }
      });

      if (existingClient) {
        return c.json({ 
          error: 'Client already exists',
          clientId: existingClient.clientId,
          scopes: existingClient.scopes
        }, 409);
      }

      // Generate client credentials
      const clientId = serverId;
      const clientSecret = randomUUID();

      // Save to database
      const newClient = await prisma.serverRegistration.create({
        data: {
          serverId,
          name,
          clientId,
          clientSecret,
          scopes,
          registeredBy: isDevelopment ? 'development' : 'admin'
        }
      });

      // Also save to memory for local development fallback
      serversDb[serverId] = {
        name,
        clientId,
        clientSecret,
        scopes,
        createdAt: new Date().toISOString(),
        registeredBy: isDevelopment ? 'development' : 'admin'
      };
      saveServersDb();

      console.log(`📝 Registered server: ${name} (${serverId}) via ${isDevelopment ? 'development' : 'admin'}`);

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
      const dbServers = await prisma.serverRegistration.findMany({
        select: {
          serverId: true,
          name: true,
          scopes: true,
          createdAt: true,
          registeredBy: true
        }
      });

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
    } catch (error) {
      // Fallback to memory-only
      const servers = Object.entries(serversDb).map(([id, data]) => ({
        serverId: id,
        name: data.name,
        scopes: data.scopes,
        createdAt: data.createdAt
      }));

      return c.json({ servers });
    }
  },
});

// Health check for auth system
export const authHealthRoute = registerApiRoute('/auth/health', {
  method: 'GET',
  handler: async (c) => {
    const keys = loadPublicKeys();
    
    let dbServerCount = 0;
    try {
      dbServerCount = await prisma.serverRegistration.count();
    } catch (error) {
      // Database not available, use memory count
    }
    
    return c.json({
      status: 'healthy',
      keysLoaded: keys.length,
      serversRegistered: dbServerCount || Object.keys(serversDb).length,
      databaseConnected: dbServerCount > 0 || Object.keys(serversDb).length === 0
    });
  },
});

// Export all routes as an array for easy registration
export const authRoutes = [
  jwksRoute,
  tokenRoute,
  serverRegistrationRoute,
  listServersRoute,
  authHealthRoute,
];
