#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

/**
 * Setup script for authentication infrastructure
 * This script will:
 * 1. Create the keys directory
 * 2. Generate token service keys
 * 3. Generate agent keys
 * 4. Start the JWKS/Token service
 */

const KEYS_DIR = 'keys';

console.log('🔐 Setting up authentication infrastructure...\n');

// Create keys directory
if (!existsSync(KEYS_DIR)) {
  mkdirSync(KEYS_DIR, { recursive: true });
  console.log(`✅ Created ${KEYS_DIR} directory`);
} else {
  console.log(`📁 ${KEYS_DIR} directory already exists`);
}

// Generate token service keys
console.log('\n🔑 Generating token service keys...');
try {
  execSync(`node scripts/generate-keys.js token-service ${KEYS_DIR}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to generate token service keys:', error.message);
  process.exit(1);
}

// Note: Individual agents don't need their own keys
// Access is controlled through client registration

console.log('\n🎉 Authentication setup complete!');
console.log('\n📋 Next steps:');
console.log('1. Start the Mastra server: npm run dev');
console.log('2. Set your environment variables (see the output above)');
console.log('3. Register your client servers using the /servers/register endpoint');
console.log('\n💡 Required environment variables:');
console.log('   TOKEN_SERVICE_URL=http://localhost:4111');
console.log('   TOKEN_SERVICE_JWKS_URL=http://localhost:4111/.well-known/jwks.json');
console.log('   TOKEN_SERVICE_AUD=https://tools.local/token-service');
console.log('   MASTRA_API_URL=http://localhost:4111');
console.log('   MASTRA_JWT_SECRET=your-jwt-secret-here');
console.log('   DATABASE_URL=your-database-url-here');
console.log('\n⚠️ The key generation output above shows TOKEN_SERVICE_PRIVATE_KEY and TOKEN_SERVICE_PUBLIC_KEY');
console.log('   Copy those to your .env file or deployment environment variables!');
console.log('\n🔗 Available auth endpoints:');
console.log('   GET  /.well-known/jwks.json - JWKS endpoint');
console.log('   POST /token - OAuth 2.0 token endpoint (client credentials)');
console.log('   POST /servers/register - Register server');
console.log('   GET  /servers - List servers');
console.log('   GET  /auth/health - Auth health check');
console.log('\n🎯 Register a client:');
console.log('   node scripts/register-client.js weather-agent "Weather Agent Client" weather.read');
