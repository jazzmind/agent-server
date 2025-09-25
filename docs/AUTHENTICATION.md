# Authentication Setup

This document describes the authentication infrastructure for the agent server.

## Overview

The authentication system provides:
- Universal token service with Ed25519 signing
- JWKS (JSON Web Key Set) endpoint for public key discovery  
- OAuth 2.0 client credentials flow for server-to-server authentication
- Client registration system controlling access to different services

## Quick Setup

1. **Generate Keys**
   ```bash
   npm run setup-auth
   ```
   This will create the `keys/` directory and generate token service keys for signing access tokens.

2. **Start the Server**
   ```bash
   npm run dev
   ```
   The Mastra server will start on port 4111 with auth endpoints available.

3. **Register Clients**
   ```bash
   node scripts/register-client.js weather-agent "Weather Agent Client" weather.read
   ```

## Environment Variables

Set these in your `.env` file:

```env
# Token Service Configuration
TOKEN_SERVICE_URL=http://localhost:4111
TOKEN_SERVICE_JWKS_URL=http://localhost:4111/.well-known/jwks.json
TOKEN_SERVICE_AUD=https://tools.local/token-service

# Client Credentials (from registration)
CLIENT_ID=weather-agent
CLIENT_SECRET=your-client-secret-from-registration

# Server Configuration
MASTRA_API_URL=http://localhost:4111
```

## API Endpoints

### JWKS Endpoint
```
GET /.well-known/jwks.json
```
Returns public keys for JWT verification.

### OAuth 2.0 Token Endpoint
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=weather-agent&
client_secret=your-secret&
audience=https://tools.local/weather&
scope=weather.read
```

### Server Registration
```
POST /clients/register
Content-Type: application/json

{
  "serverId": "agent-client",
  "name": "Agent Client API", 
  "scopes": ["weather.read"]
}
```

### List Servers
```
GET /clients
```

### Health Check
```
GET /auth/health
```

## Authentication Flow

1. **Client Registration**: Register client with scopes via `/clients/register`
2. **Token Request**: Client uses credentials to request access token via OAuth 2.0
3. **API Access**: Client uses access token to call protected APIs
4. **Token Verification**: Server verifies access token using JWKS

## File Structure

```
agent-server/
├── scripts/
│   ├── generate-keys.js      # Generate Ed25519 keypairs
│   ├── setup-auth.js         # Complete setup script
│   └── register-client.js    # Register client servers
├── src/
│   ├── auth/
│   │   ├── signAssertion.ts  # JWT signing and token exchange
│   │   └── verifyAssertion.ts # JWT verification
│   └── mastra/
│       ├── auth/
│       │   └── auth-routes.ts # Auth API endpoints
│       └── utils.ts          # Auth utilities
├── keys/                     # Generated keys (git ignored)
└── servers.json             # Server registry (git ignored)
```

## Security Notes

- Private keys are stored in the `keys/` directory and should never be committed
- Access tokens have a 1-hour expiration
- Client secrets should be stored securely and never committed
- All JWT verification uses proper audience and issuer validation
- Scope-based authorization controls access to different services

## Deployment

For production deployment:

1. Generate production keys using `npm run setup-auth`
2. Set the `TOKEN_SERVICE_PRIVATE_KEY` and `TOKEN_SERVICE_PUBLIC_KEY` environment variables in your deployment platform (Vercel, etc.)
3. Update environment variables to use production URLs
4. Consider using a proper database for server registration instead of JSON files
5. Set all required environment variables in your deployment platform

For Vercel deployment, set these environment variables in your project settings:
- `TOKEN_SERVICE_PRIVATE_KEY` (copy from key generation output)
- `TOKEN_SERVICE_PUBLIC_KEY` (copy from key generation output)  
- `MASTRA_JWT_SECRET` (secure random string)
- `DATABASE_URL` (your production database)
- `TOKEN_SERVICE_URL` (your production URL)
- `TOKEN_SERVICE_JWKS_URL` (your production URL + /.well-known/jwks.json)
- `TOKEN_SERVICE_AUD` (your production audience)

## Troubleshooting

**Keys not found**: Run the setup script to generate keys
**Connection refused**: Make sure the Mastra server is running on port 4111
**Invalid token**: Check that environment variables point to the correct JWKS URLs
**Insufficient permissions**: Ensure the required scopes are registered for your client
