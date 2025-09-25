#!/usr/bin/env node

/**
 * Register a client server with the token service
 * Usage: node scripts/register-client.js <server-id> <server-name> [scopes...]
 */

const serverId = process.argv[2];
const serverName = process.argv[3];
const scopes = process.argv.slice(4);

if (!serverId || !serverName) {
  console.error('Usage: node scripts/register-client.js <server-id> <server-name> [scopes...]');
  console.error('Example: node scripts/register-client.js agent-client "Agent Client API" weather.read');
  process.exit(1);
}

const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'http://localhost:4113';

async function registerClient() {
  try {
    console.log(`📝 Registering client: ${serverName} (${serverId})`);
    console.log(`🔗 Token Service URL: ${TOKEN_SERVICE_URL}`);
    console.log(`🎯 Scopes: ${scopes.join(', ') || 'none'}`);
    
    // Check if we're in production and need admin key
    const isProduction = TOKEN_SERVICE_URL.includes('vercel.app') || TOKEN_SERVICE_URL.includes('https://');
    const adminKey = process.env.ADMIN_REGISTRATION_KEY;
    
    if (isProduction && !adminKey) {
      console.error('❌ Production registration requires ADMIN_REGISTRATION_KEY environment variable');
      console.log('💡 Set ADMIN_REGISTRATION_KEY=your-secret-key in your environment');
      process.exit(1);
    }
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (isProduction && adminKey) {
      headers['x-admin-key'] = adminKey;
      console.log('🔒 Using admin key for production registration');
    }
    
    const response = await fetch(`${TOKEN_SERVICE_URL}/clients/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        serverId,
        name: serverName,
        scopes
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    
    console.log('\n✅ Client registered successfully!');
    console.log('\n📋 Client Credentials:');
    console.log(`   Server ID: ${result.serverId}`);
    console.log(`   Client ID: ${result.clientId}`);
    console.log(`   Client Secret: ${result.clientSecret}`);
    console.log(`   Scopes: ${result.scopes.join(', ')}`);
    
    console.log('\n🔒 Environment Variables for your client:');
    console.log(`   CLIENT_ID=${result.clientId}`);
    console.log(`   CLIENT_SECRET=${result.clientSecret}`);
    console.log(`   TOKEN_SERVICE_URL=${TOKEN_SERVICE_URL}`);
    
    console.log('\n⚠️  Keep the client secret secure and never commit it to version control!');
    
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Make sure the Mastra server is running: npm run dev');
    }
    
    process.exit(1);
  }
}

registerClient();
