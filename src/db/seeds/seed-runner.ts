/**
 * Database Seed Runner
 * 
 * Runs seed files to populate the database with initial data for agents, tools, etc.
 * Seeds are idempotent - they use UPSERT patterns so they can be run multiple times.
 * 
 * Usage:
 *   npm run seed           # Run all seeds
 *   npm run seed -- --file 001_document_search_tool.sql  # Run specific seed
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import pg from 'pg';

const { Pool } = pg;

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const fileArg = args.find(arg => arg.startsWith('--file='));
const specificFile = fileArg ? fileArg.split('=')[1] : null;

async function runSeeds() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('🌱 Starting database seeding...');
    console.log(`📦 Database: ${DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);

    // Get list of seed files
    const seedsDir = join(__dirname, '.');
    const files = await readdir(seedsDir);
    
    // Filter for SQL files and sort by name (numbered prefix ensures order)
    let seedFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    // If specific file requested, filter to just that file
    if (specificFile) {
      seedFiles = seedFiles.filter(f => f === specificFile || f.includes(specificFile));
      if (seedFiles.length === 0) {
        console.error(`❌ No seed file found matching: ${specificFile}`);
        console.log('Available seed files:');
        files.filter(f => f.endsWith('.sql')).forEach(f => console.log(`  - ${f}`));
        process.exit(1);
      }
    }

    console.log(`📋 Found ${seedFiles.length} seed file(s):`);
    seedFiles.forEach(f => console.log(`   - ${f}`));
    console.log('');

    // Run each seed file
    for (const seedFile of seedFiles) {
      console.log(`🔄 Running seed: ${seedFile}`);
      
      const seedPath = join(seedsDir, seedFile);
      const seedSql = await readFile(seedPath, 'utf-8');
      
      try {
        await pool.query(seedSql);
        console.log(`✅ Completed: ${seedFile}`);
      } catch (error: any) {
        console.error(`❌ Failed: ${seedFile}`);
        console.error(`   Error: ${error.message}`);
        
        // Continue with other seeds unless it's a critical error
        if (error.code === '42P01') {
          console.error('   Table does not exist - have you run migrations?');
        }
      }
    }

    console.log('');
    console.log('🎉 Seeding complete!');
    
    // Log summary of seeded data
    const toolCount = await pool.query('SELECT COUNT(*) FROM tool_definitions WHERE created_by = $1', ['system']);
    const agentCount = await pool.query('SELECT COUNT(*) FROM agent_definitions WHERE created_by = $1', ['system']);
    
    console.log('📊 Summary:');
    console.log(`   - System tools: ${toolCount.rows[0].count}`);
    console.log(`   - System agents: ${agentCount.rows[0].count}`);

  } catch (error: any) {
    console.error('❌ Seed runner failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
runSeeds().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

