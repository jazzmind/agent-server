#!/usr/bin/env node

import { generateKeyPair, exportJWK } from 'jose';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Generate Ed25519 keypair and save as JWK files
 * Usage: node scripts/generate-keys.js [agent-id] [output-dir]
 */

const agentId = process.argv[2] || 'agent-' + randomUUID();
const outputDir = process.argv[3] || 'keys';

async function generateKeys() {
  try {
    console.log(`Generating Ed25519 keypair for agent: ${agentId}`);
    
    // Generate Ed25519 keypair
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });

    // Export keys as JWK
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);

    // Add metadata
    const kid = randomUUID();
    publicJwk.kid = kid;
    publicJwk.use = 'sig';
    publicJwk.alg = 'EdDSA';
    publicJwk.agent_id = agentId;

    privateJwk.kid = kid;
    privateJwk.use = 'sig';
    privateJwk.alg = 'EdDSA';
    privateJwk.agent_id = agentId;

    // Create output directory for backup files (optional)
    mkdirSync(outputDir, { recursive: true });

    // Write backup files (for local development)
    const publicKeyPath = join(outputDir, `${kid}.public.jwk.json`);
    writeFileSync(publicKeyPath, JSON.stringify(publicJwk, null, 2));
    
    const privateKeyPath = join(outputDir, `${kid}.private.jwk.json`);
    writeFileSync(privateKeyPath, JSON.stringify(privateJwk, null, 2));
    
    const jwks = { keys: [publicJwk] };
    const jwksPath = join(outputDir, `${kid}.jwks.json`);
    writeFileSync(jwksPath, JSON.stringify(jwks, null, 2));

    console.log(`\n📋 Summary:`);
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Key ID (kid): ${kid}`);
    console.log(`   Algorithm: EdDSA (Ed25519)`);
    
    console.log(`\n🔒 Environment Variables (for deployment):`);
    console.log(`TOKEN_SERVICE_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`);
    console.log(`TOKEN_SERVICE_PUBLIC_KEY='${JSON.stringify(publicJwk)}'`);
    
    console.log(`\n📁 Local Files (for backup/development):`);
    console.log(`   Public key: ${publicKeyPath}`);
    console.log(`   Private key: ${privateKeyPath}`);
    console.log(`   JWKS: ${jwksPath}`);
    
    console.log(`\n⚠️  Keep the private key secure and never commit it to version control!`);

  } catch (error) {
    console.error('❌ Error generating keys:', error);
    process.exit(1);
  }
}

generateKeys();
