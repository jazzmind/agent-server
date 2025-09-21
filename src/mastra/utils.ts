import { makeAccessTokenVerifier } from "../auth/verifyAssertion";

// Token cache to avoid repeated exchanges
const tokenCache = new Map<string, { token: string; expires: number }>();

// Helper function to decode JWT payload without verification
export function decodeJWTPayload(token: string) {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload;
  } catch (error) {
    return null;
  }
}

export async function getAccessToken(
  clientId: string,
  targetAudience: string,
  scopes: string[]
): Promise<string> {
  try {
    const clientSecret = process.env.CLIENT_SECRET;
    const tokenServiceUrl = process.env.TOKEN_SERVICE_URL;

    if (!clientSecret) {
      throw new Error("CLIENT_SECRET environment variable is required");
    }
    if (!clientId) {
      throw new Error("CLIENT_ID environment variable is required");
    }
    if (!tokenServiceUrl) {
      throw new Error("TOKEN_SERVICE_URL environment variable is required");
    }

    console.log(
      `Getting access token for audience: ${targetAudience}, scopes: ${scopes.join(
        ","
      )}`
    );
    console.log(`Using token service: ${tokenServiceUrl}`);
    console.log(`Client ID: ${clientId}`);

    // Create cache key
    const cacheKey = `${clientId}:${targetAudience}:${scopes.sort().join(",")}`;

    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      // Double-check the actual token hasn't expired
      const payload = decodeJWTPayload(cached.token);
      const tokenExp = payload?.exp * 1000; // Convert to milliseconds

      if (tokenExp && tokenExp > Date.now() + 30 * 1000) {
        // 30 second buffer
        console.log("Using cached token");
        return cached.token;
      } else {
        console.log("Cached token expired, removing from cache");
        tokenCache.delete(cacheKey);
      }
    }

    console.log("Cache miss, requesting new token");

    // Use OAuth 2.0 client credentials flow
    const response = await fetch(`${tokenServiceUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: targetAudience,
        scope: scopes.join(' ')
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token request failed: ${error.error} - ${error.error_description || ''}`);
    }

    const tokenData = await response.json();
    const accessToken = tokenData.access_token;

    // Cache token based on its actual expiration time
    const payload = decodeJWTPayload(accessToken);
    const tokenExp = payload?.exp * 1000; // Convert to milliseconds
    const cacheUntil = tokenExp
      ? Math.min(tokenExp - 60 * 1000, Date.now() + 50 * 60 * 1000)
      : Date.now() + 50 * 60 * 1000;

    tokenCache.set(cacheKey, {
      token: accessToken,
      expires: cacheUntil, // Cache until 1 minute before token expires, or 50 minutes max
    });

    console.log("Successfully obtained and cached access token");
    return accessToken;
  } catch (error) {
    console.error("Failed to get access token:", error);
    throw error;
  }
}


// Use token service JWKS for access token verification
export const verifyAccessToken = makeAccessTokenVerifier(
    process.env.TOKEN_SERVICE_JWKS_URL ?? "http://localhost:4111/.well-known/jwks.json",
    process.env.TOKEN_SERVICE_AUD ?? "https://tools.local/token-service"
);

// Helper function to verify token - ONLY accepts access tokens from token service
export async function verifyToken(authHeader: string, requiredScope: string) {
    try {
      // Only accept access tokens from token service
      const result = await verifyAccessToken(authHeader);
      
      // Check if token has required scope
      if (!result.scopes.includes(requiredScope)) {
        throw new Error(`Insufficient permissions: ${requiredScope} scope required`);
      }
      
      return { clientId: result.clientId, scopes: result.scopes };
    } catch (error: any) {
      throw error; // Re-throw the original error
    }
}
  