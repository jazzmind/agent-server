import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { jwtVerify, importJWK } from 'jose';

// Configuration
const KEYS_DIR = process.env.KEYS_DIR || 'keys';

// Load public keys from environment variables
export function loadPublicKeys() {
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

// Verify Bearer token for admin endpoints
export async function verifyAdminBearerToken(authorizationHeader?: string, requiredScopes?: string[]) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  
  const token = authorizationHeader.slice('Bearer '.length);
  
  try {
    // Get token service public keys for verification
    const keys = loadPublicKeys();
    if (keys.length === 0) {
      throw new Error('No public keys available for token verification');
    }
    
    // Create JWKS for verification
    const jwks = { keys };
    const getKey = async (header: any) => {
      const key = jwks.keys.find(k => k.kid === header.kid);
      if (!key) throw new Error('Key not found');
      return await importJWK(key, 'EdDSA');
    };
    
    const { payload } = await jwtVerify(token, getKey, {
      issuer: 'https://token.example',
    });
    
    const { scopes, client_id, exp } = payload as any;
    
    // Check token expiration
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }
    
    // Check required scope
    for (const requiredScope of requiredScopes || []) {
      if (requiredScope && (!scopes || !scopes.includes(requiredScope))) {
        throw new Error(`Insufficient permissions: ${requiredScope} scope required`);
      }
    }
    
    return { clientId: client_id, scopes: scopes || [] };
  } catch (error: any) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

// Verify management client credentials
export async function verifyManagementClient(clientId: string, clientSecret: string) {
  const managementClientId = process.env.MANAGEMENT_CLIENT_ID;
  const managementClientSecret = process.env.MANAGEMENT_CLIENT_SECRET;
  
  if (!managementClientId || !managementClientSecret) {
    throw new Error('Management client credentials not configured');
  }
  
  if (clientId !== managementClientId || clientSecret !== managementClientSecret) {
    throw new Error('Invalid management client credentials');
  }
  
  return true;
}