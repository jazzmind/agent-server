import { PostgresStore } from '@mastra/pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  id: string;
  name: string;
  timestamp: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  id: string;
  name: string;
  executed_at: Date;
  checksum: string;
}

export class MigrationRunner {
  private pgStore: PostgresStore;
  private migrationsDir: string;

  constructor(pgStore: PostgresStore, migrationsDir?: string) {
    this.pgStore = pgStore;
    this.migrationsDir = migrationsDir || join(__dirname, 'sql');
  }

  /**
   * Initialize the migrations table
   */
  async initializeMigrationsTable(): Promise<void> {
    const createMigrationsTable = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at 
      ON schema_migrations(executed_at);
    `;

    await this.pgStore.db.none(createMigrationsTable);
    console.log('✅ Migrations table initialized');
  }

  /**
   * Get all migration files from the migrations directory
   */
  private getMigrationFiles(): Migration[] {
    if (!existsSync(this.migrationsDir)) {
      console.warn(`⚠️ Migrations directory not found: ${this.migrationsDir}`);
      return [];
    }

    const files = readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure chronological order

    return files.map(file => {
      const filePath = join(this.migrationsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      
      // Parse the migration file
      const parts = content.split('-- DOWN');
      const upPart = parts[0].replace('-- UP', '').trim();
      const downPart = parts[1]?.trim() || '';

      // Extract metadata from filename (format: YYYYMMDDHHMMSS_migration_name.sql)
      const match = file.match(/^(\d{14})_(.+)\.sql$/);
      if (!match) {
        throw new Error(`Invalid migration filename format: ${file}. Expected: YYYYMMDDHHMMSS_migration_name.sql`);
      }

      const [, timestamp, name] = match;
      
      return {
        id: `${timestamp}_${name}`,
        name: name.replace(/_/g, ' '),
        timestamp,
        up: upPart,
        down: downPart
      };
    });
  }

  /**
   * Get executed migrations from database
   */
  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    try {
      return await this.pgStore.db.manyOrNone(
        'SELECT * FROM schema_migrations ORDER BY executed_at ASC'
      );
    } catch (error) {
      // If table doesn't exist, return empty array
      return [];
    }
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get pending migrations that haven't been executed
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = this.getMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();
    const executedIds = new Set(executedMigrations.map(m => m.id));

    return allMigrations.filter(migration => !executedIds.has(migration.id));
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<void> {
    console.log(`🔄 Executing migration: ${migration.name} (${migration.id})`);
    
    try {
      await this.pgStore.db.tx(async (t) => {
        // Execute the migration SQL
        await t.none(migration.up);
        
        // Record the migration
        const checksum = this.calculateChecksum(migration.up);
        await t.none(
          'INSERT INTO schema_migrations (id, name, checksum) VALUES ($1, $2, $3)',
          [migration.id, migration.name, checksum]
        );
      });
      
      console.log(`✅ Migration completed: ${migration.name}`);
    } catch (error) {
      console.error(`❌ Migration failed: ${migration.name}`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<void> {
    console.log('🚀 Starting database migrations...');
    
    await this.initializeMigrationsTable();
    
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations. Database is up to date.');
      return;
    }

    console.log(`📝 Found ${pendingMigrations.length} pending migrations:`);
    pendingMigrations.forEach(m => console.log(`   - ${m.name} (${m.id})`));

    for (const migration of pendingMigrations) {
      await this.executeMigration(migration);
    }

    console.log(`🎉 Successfully executed ${pendingMigrations.length} migrations!`);
  }

  /**
   * Rollback the last migration
   */
  async rollback(steps: number = 1): Promise<void> {
    console.log(`🔙 Rolling back ${steps} migration(s)...`);
    
    const executedMigrations = await this.getExecutedMigrations();
    
    if (executedMigrations.length === 0) {
      console.log('ℹ️ No migrations to rollback.');
      return;
    }

    const migrationsToRollback = executedMigrations
      .slice(-steps)
      .reverse(); // Rollback in reverse order

    const allMigrations = this.getMigrationFiles();
    const migrationMap = new Map(allMigrations.map(m => [m.id, m]));

    for (const record of migrationsToRollback) {
      const migration = migrationMap.get(record.id);
      
      if (!migration) {
        console.warn(`⚠️ Migration file not found for: ${record.id}`);
        continue;
      }

      if (!migration.down) {
        console.warn(`⚠️ No rollback script for migration: ${migration.name}`);
        continue;
      }

      console.log(`🔄 Rolling back: ${migration.name} (${migration.id})`);
      
      try {
        await this.pgStore.db.tx(async (t) => {
          // Execute rollback SQL
          await t.none(migration.down);
          
          // Remove migration record
          await t.none(
            'DELETE FROM schema_migrations WHERE id = $1',
            [migration.id]
          );
        });
        
        console.log(`✅ Rollback completed: ${migration.name}`);
      } catch (error) {
        console.error(`❌ Rollback failed: ${migration.name}`, error);
        throw error;
      }
    }

    console.log(`🎉 Successfully rolled back ${migrationsToRollback.length} migrations!`);
  }

  /**
   * Get migration status
   */
  async status(): Promise<void> {
    const allMigrations = this.getMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();
    const executedIds = new Set(executedMigrations.map(m => m.id));

    console.log('\n📊 Migration Status:');
    console.log('=' .repeat(60));
    
    if (allMigrations.length === 0) {
      console.log('No migrations found.');
      return;
    }

    allMigrations.forEach(migration => {
      const isExecuted = executedIds.has(migration.id);
      const status = isExecuted ? '✅ Executed' : '⏳ Pending';
      const executedAt = isExecuted 
        ? executedMigrations.find(m => m.id === migration.id)?.executed_at.toISOString()
        : '';
      
      console.log(`${status} | ${migration.id} | ${migration.name}`);
      if (executedAt) {
        console.log(`        | ${executedAt}`);
      }
    });
    
    const pendingCount = allMigrations.length - executedMigrations.length;
    console.log('=' .repeat(60));
    console.log(`Total: ${allMigrations.length} | Executed: ${executedMigrations.length} | Pending: ${pendingCount}`);
  }

  /**
   * Validate migration integrity
   */
  async validate(): Promise<boolean> {
    console.log('🔍 Validating migration integrity...');
    
    const allMigrations = this.getMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();
    
    let isValid = true;

    for (const record of executedMigrations) {
      const migration = allMigrations.find(m => m.id === record.id);
      
      if (!migration) {
        console.error(`❌ Executed migration not found in files: ${record.id}`);
        isValid = false;
        continue;
      }

      const expectedChecksum = this.calculateChecksum(migration.up);
      if (record.checksum !== expectedChecksum) {
        console.error(`❌ Checksum mismatch for migration: ${record.id}`);
        console.error(`   Expected: ${expectedChecksum}`);
        console.error(`   Actual:   ${record.checksum}`);
        isValid = false;
      }
    }

    if (isValid) {
      console.log('✅ All migrations are valid.');
    } else {
      console.log('❌ Migration validation failed.');
    }

    return isValid;
  }
}
