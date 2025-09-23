#!/usr/bin/env tsx

import { PostgresStore } from '@mastra/pg';
import { MigrationRunner } from '../src/db/migrations/migration-runner.ts';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  // Initialize PostgreSQL store
  const pgStore = new PostgresStore({
    connectionString: DATABASE_URL,
  });

  try {
    await pgStore.init();
    console.log('🔗 Connected to database');
  } catch (error: any) {
    console.error('❌ Failed to connect to database:', error.message);
    process.exit(1);
  }

  // Initialize migration runner
  const migrationsDir = join(__dirname, '..', 'src', 'db', 'migrations', 'sql');
  const migrationRunner = new MigrationRunner(pgStore, migrationsDir);

  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await migrationRunner.migrate();
        break;

      case 'rollback':
      case 'down':
        const steps = parseInt(args[0]) || 1;
        await migrationRunner.rollback(steps);
        break;

      case 'status':
        await migrationRunner.status();
        break;

      case 'validate':
        const isValid = await migrationRunner.validate();
        process.exit(isValid ? 0 : 1);
        break;

      case 'create':
        const migrationName = args[0];
        if (!migrationName) {
          console.error('❌ Migration name is required');
          console.log('Usage: npm run migrate create <migration_name>');
          process.exit(1);
        }
        await createMigration(migrationName, migrationsDir);
        break;

      default:
        printUsage();
        process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  console.log('🏁 Migration script completed');
  process.exit(0);
}

async function createMigration(name: string, migrationsDir: string) {
  // Ensure migrations directory exists
  if (!existsSync(migrationsDir)) {
    mkdirSync(migrationsDir, { recursive: true });
  }

  // Generate timestamp
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-T:\.Z]/g, '')
    .substring(0, 14);

  // Create filename
  const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`;
  const filepath = join(migrationsDir, filename);

  // Create migration template
  const template = `-- UP
-- Add your migration SQL here
-- Example:
-- CREATE TABLE example_table (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- DOWN
-- Add your rollback SQL here
-- Example:
-- DROP TABLE IF EXISTS example_table;
`;

  writeFileSync(filepath, template);
  console.log(`✅ Created migration: ${filename}`);
  console.log(`📝 Edit the file: ${filepath}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Add your migration SQL in the UP section');
  console.log('2. Add rollback SQL in the DOWN section');
  console.log('3. Run: npm run migrate up');
}

function printUsage() {
  console.log(`
🗃️  Database Migration Tool

Usage: npm run migrate <command> [options]

Commands:
  migrate, up           Run all pending migrations
  rollback, down [n]    Rollback last n migrations (default: 1)
  status               Show migration status
  validate             Validate migration integrity
  create <name>        Create a new migration file

Examples:
  npm run migrate up                    # Run all pending migrations
  npm run migrate down                  # Rollback last migration
  npm run migrate down 3                # Rollback last 3 migrations
  npm run migrate status                # Show migration status
  npm run migrate validate              # Check migration integrity
  npm run migrate create add_user_table # Create new migration

Environment Variables:
  DATABASE_URL         PostgreSQL connection string (required)
  DEBUG=true          Enable debug output
`);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
