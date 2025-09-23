# Database Migrations Guide

This document explains how to manage database schema changes using our custom migration system.

## Overview

Our migration system provides a lightweight alternative to Prisma that works seamlessly with Mastra's PostgreSQL library while keeping bundle sizes small. It offers:

- **Chronological migrations** with timestamp-based ordering
- **Rollback support** for safe schema changes
- **Integrity validation** with checksums
- **Transaction safety** for atomic migrations
- **CLI tools** for easy management

## Why Not Prisma?

While Prisma is excellent for many projects, we chose a custom solution because:

1. **Bundle Size**: Prisma significantly increases build size
2. **Mastra Compatibility**: Potential conflicts with Mastra's PG library
3. **Simplicity**: Direct SQL control without ORM overhead
4. **Performance**: No query generation overhead

## Migration File Structure

```
src/db/migrations/
├── migration-runner.ts          # Migration runner logic
└── sql/                        # Migration files
    ├── 20241201000001_create_client_registrations.sql
    ├── 20241201000002_create_agent_definitions.sql
    ├── 20241201000003_create_workflow_definitions.sql
    ├── 20241201000004_create_tool_definitions.sql
    └── 20241201000005_create_rag_databases.sql
```

## Migration File Format

Each migration file follows this structure:

```sql
-- UP
-- Forward migration SQL
CREATE TABLE example_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_example_name ON example_table(name);

-- DOWN
-- Rollback migration SQL
DROP INDEX IF EXISTS idx_example_name;
DROP TABLE IF EXISTS example_table;
```

### Naming Convention

Migration files must follow this pattern:
```
YYYYMMDDHHMMSS_migration_name.sql
```

Examples:
- `20241201120000_create_users_table.sql`
- `20241201120001_add_user_email_index.sql`
- `20241201120002_alter_user_add_phone.sql`

## CLI Commands

### Run Migrations

```bash
# Run all pending migrations
npm run migrate
# or
npm run migrate:up

# Check migration status
npm run migrate:status

# Validate migration integrity
npm run migrate:validate
```

### Create New Migration

```bash
# Create a new migration file
npm run migrate:create add_user_preferences_table

# This creates: YYYYMMDDHHMMSS_add_user_preferences_table.sql
```

### Rollback Migrations

```bash
# Rollback last migration
npm run migrate:down

# Rollback last 3 migrations
npm run migrate:down 3
```

## Schema Management Workflow

### 1. Creating a New Migration

When you need to change the database schema:

```bash
# Create migration file
npm run migrate:create add_new_feature_table

# Edit the generated file
# Add your SQL in the UP section
# Add rollback SQL in the DOWN section

# Test the migration
npm run migrate:up

# If there are issues, rollback
npm run migrate:down
```

### 2. Migration Best Practices

#### Forward Migration (UP)
```sql
-- UP
-- Always use IF NOT EXISTS for CREATE statements
CREATE TABLE IF NOT EXISTS new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Use IF NOT EXISTS for indexes
CREATE INDEX IF NOT EXISTS idx_new_table_name ON new_table(name);

-- Be explicit about constraints
ALTER TABLE existing_table 
ADD CONSTRAINT fk_new_table 
FOREIGN KEY (new_table_id) REFERENCES new_table(id);
```

#### Rollback Migration (DOWN)
```sql
-- DOWN
-- Always use IF EXISTS for DROP statements
ALTER TABLE existing_table 
DROP CONSTRAINT IF EXISTS fk_new_table;

DROP INDEX IF EXISTS idx_new_table_name;
DROP TABLE IF EXISTS new_table;
```

### 3. Column Changes

#### Adding Columns
```sql
-- UP
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Create index after adding column
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- DOWN
DROP INDEX IF EXISTS idx_users_email;
ALTER TABLE users 
DROP COLUMN IF EXISTS phone,
DROP COLUMN IF EXISTS email;
```

#### Modifying Columns
```sql
-- UP
-- Create new column
ALTER TABLE users ADD COLUMN new_name VARCHAR(500);

-- Copy data
UPDATE users SET new_name = old_name;

-- Drop old column
ALTER TABLE users DROP COLUMN old_name;

-- Rename new column
ALTER TABLE users RENAME COLUMN new_name TO old_name;

-- DOWN
-- Similar process in reverse
ALTER TABLE users RENAME COLUMN old_name TO new_name;
ALTER TABLE users ADD COLUMN old_name VARCHAR(255);
UPDATE users SET old_name = new_name;
ALTER TABLE users DROP COLUMN new_name;
```

## Environment Setup

### Development
```bash
# Set up development database
createdb agent_server_dev

# Set environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/agent_server_dev"

# Run migrations manually
npm run migrate:up

# Start development server
npm run dev
```

### Production
```bash
# Production migrations should be run during deployment, before starting the server
DATABASE_URL="postgresql://prod_user:prod_pass@prod_host:5432/agent_server_prod" \
npm run migrate:up

# Then start the server
npm start
```

### Testing
```bash
# Set up test database
createdb agent_server_test

# Test environment
export DATABASE_URL="postgresql://test:test@localhost:5432/agent_server_test"

# Run migrations for test database
npm run migrate:up

# Run tests
npm test
```

## Schema Tracking

### Migration Table
The system automatically creates a `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
  id VARCHAR(255) PRIMARY KEY,           -- Migration ID (timestamp_name)
  name VARCHAR(255) NOT NULL,            -- Human-readable name
  executed_at TIMESTAMP DEFAULT NOW(),   -- When migration was run
  checksum VARCHAR(64) NOT NULL          -- Content hash for integrity
);
```

### Status Checking
```bash
# See which migrations have been executed
npm run migrate:status

# Example output:
# ✅ Executed | 20241201000001_create_client_registrations | Client Registrations
# ✅ Executed | 20241201000002_create_agent_definitions | Agent Definitions  
# ⏳ Pending  | 20241201000003_create_workflow_definitions | Workflow Definitions
```

## Advanced Features

### Transaction Safety
All migrations run within database transactions, ensuring atomicity:
- If migration fails, all changes are rolled back
- Database remains in consistent state
- No partial migrations

### Integrity Validation
```bash
# Check if migration files match executed migrations
npm run migrate:validate

# This verifies:
# - All executed migrations have corresponding files
# - File contents haven't changed (checksum validation)
# - No corruption in migration history
```

### Parallel Development
When multiple developers create migrations:

1. **Always pull latest** before creating new migrations
2. **Check for conflicts** in migration timestamps
3. **Resolve conflicts** by renaming migration files if needed
4. **Test locally** before pushing

## Troubleshooting

### Common Issues

#### 1. Migration Fails
```bash
# Check error details
DEBUG=true npm run migrate:up

# If safe to retry
npm run migrate:down 1
npm run migrate:up
```

#### 2. Checksum Mismatch
```bash
# Validate migrations
npm run migrate:validate

# If migration file was legitimately changed:
# - Create new migration to fix the issue
# - Don't modify existing migration files
```

#### 3. Database Connection Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check environment variables
echo $DATABASE_URL
```

#### 4. Missing Migrations Table
```bash
# Force initialization
psql $DATABASE_URL -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);"
```

### Recovery Procedures

#### Reset Development Database
```bash
# Drop and recreate database
dropdb agent_server_dev
createdb agent_server_dev

# Run all migrations fresh
npm run migrate:up
```

#### Production Emergency Rollback
```bash
# Rollback problematic migration
npm run migrate:down 1

# Apply hotfix migration
npm run migrate:create emergency_hotfix
# Edit migration file with fix
npm run migrate:up
```

## Integration with Code

### Manual Migration Approach
Migrations are run manually as part of the deployment process, not automatically on server startup. This ensures:

- **Predictable deployments** without startup delays
- **No race conditions** in multi-instance deployments  
- **Explicit control** over when schema changes occur
- **Better error handling** during deployment

```bash
# Run migrations before starting the server
npm run migrate:up
npm start
```

### Programmatic Access
```typescript
import { MigrationRunner } from './db/migrations/migration-runner.js';

const migrationRunner = new MigrationRunner(pgStore);

// Check pending migrations
const pending = await migrationRunner.getPendingMigrations();

// Run migrations programmatically
await migrationRunner.migrate();

// Validate integrity
const isValid = await migrationRunner.validate();
```

## Best Practices Summary

1. **Always create rollback SQL** in the DOWN section
2. **Use IF EXISTS/IF NOT EXISTS** for safer operations  
3. **Test migrations locally** before deploying
4. **Make migrations additive** when possible
5. **Run migrations manually** as part of deployment process
6. **Validate after running** migrations
7. **Keep migrations small** and focused
8. **Document complex changes** in migration comments
9. **Backup production** before major schema changes
10. **Never run migrations automatically** in application startup

## Deployment Workflow

### Recommended Deployment Process

```bash
# 1. Backup production database (if applicable)
pg_dump $PROD_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migrations
npm run migrate:up

# 3. Validate migration success
npm run migrate:validate

# 4. Start the application
npm start
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
deploy:
  steps:
    - name: Run Database Migrations
      run: |
        npm run migrate:up
        npm run migrate:validate
    
    - name: Deploy Application
      run: npm start
```

This migration system provides robust schema management while maintaining the lightweight architecture needed for Mastra-based applications.
