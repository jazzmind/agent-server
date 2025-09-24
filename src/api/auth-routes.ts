import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';
import { SignJWT, importJWK } from 'jose';
import { verifyAdminClient, loadPublicKeys, verifyAdminBearerToken } from '../mastra/auth/auth-utils';
import { applicationService } from '../mastra/services/application';
import { clientService } from '../mastra/services/client';


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
  console.error(`❌ Token service private key not found`);
  console.log(`💡 Set TOKEN_SERVICE_PRIVATE_KEY environment variable or run: npm run setup-auth`);
  return null;
}

// Verify client credentials using client service
async function verifyClientCredentials(clientId: string, clientSecret: string) {
  try {
    const clientInfo = await clientService.verifyClientCredentials(clientId, clientSecret);
    
    if (!clientInfo) {
      throw new Error('Invalid client_id');
    }
    
    return clientInfo;
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
    try {
      const clientInfo = await clientService.verifyClientCredentials(clientId, '');
      if (clientInfo && clientInfo.scopes && clientInfo.scopes.includes(requiredScope)) {
        console.log(`✅ Legacy scope granted: ${clientId} has global ${requiredScope}`);
        return true;
      }
    } catch (error) {
      // Legacy scope check failed, continue with application-specific check
    }

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
    
    // Get legacy global scopes via client service verification (just to get scopes)
    try {
      const clientInfo = await clientService.verifyClientCredentials(clientId, '');
      if (clientInfo && clientInfo.scopes) {
        clientInfo.scopes.forEach((scope: string) => allScopes.add(scope));
      }
    } catch (error) {
      // Ignore errors for legacy scope check - we're not actually verifying credentials here
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

// Reload dynamic definitions endpoint (protected)
export const reloadDynamicRoute = registerApiRoute('/admin/reload', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Get admin client credentials from headers
      const adminClientId = c.req.header('x-admin-client-id');
      const adminClientSecret = c.req.header('x-admin-client-secret');
      
      // Verify admin client credentials
      if (!adminClientId || !adminClientSecret) {
        return c.json({ 
          error: 'Missing admin client credentials',
          details: 'admin client ID and secret are required'
        }, 401);
      }
      
      try {
        await verifyAdminClient(adminClientId, adminClientSecret);
      } catch (error: any) {
        console.warn('🚫 Unauthorized reload attempt:', error.message);
        return c.json({ 
          error: 'Unauthorized. Valid admin client credentials required.',
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
    const keys = loadPublicKeys();
    
    let dbServerCount = 0;
    let databaseConnected = false;
    try {
      dbServerCount = await clientService.getClientRegistrationCount();
      databaseConnected = true;
    } catch (error: any) {
      // Database not available, use memory count
      console.warn('Health check: Database not available:', error.message);
    }
    
    return c.json({
      status: 'healthy',
      keysLoaded: keys.length,
      serversRegistered: dbServerCount,
      databaseConnected,
      storageType: databaseConnected ? 'postgresql' : 'memory'
    });
  },
});

// Export all routes as an array for easy registration
export const authRoutes = [
  jwksRoute,
  tokenRoute,
  reloadDynamicRoute,
  authHealthRoute,
];
