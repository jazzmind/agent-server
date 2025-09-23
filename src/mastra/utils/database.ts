import { PostgresStore } from '@mastra/pg';

// Shared PostgreSQL store instance
let sharedPgStore: PostgresStore | null = null;
let initPromise: Promise<PostgresStore | null> | null = null;

/**
 * Get or create a shared PostgreSQL store instance
 * This prevents duplicate database connections and warnings
 */
export async function getSharedPostgresStore(): Promise<PostgresStore | null> {
  // If already initialized, return it
  if (sharedPgStore) {
    return sharedPgStore;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = initializeSharedStore();
  return initPromise;
}

async function initializeSharedStore(): Promise<PostgresStore | null> {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not configured, PostgreSQL features disabled');
    return null;
  }

  try {
    console.log('🔗 Initializing shared PostgreSQL connection...');
    sharedPgStore = new PostgresStore({
      connectionString: process.env.DATABASE_URL,
    });
    
    await sharedPgStore.init();
    console.log('✅ Shared PostgreSQL connection initialized');
    return sharedPgStore;
  } catch (error: any) {
    console.error('❌ Failed to initialize shared PostgreSQL connection:', error.message);
    sharedPgStore = null;
    initPromise = null;
    return null;
  }
}

/**
 * Check if PostgreSQL is available
 */
export function isPostgresAvailable(): boolean {
  return sharedPgStore !== null;
}

/**
 * Close the shared PostgreSQL connection
 */
export async function closeSharedPostgresStore(): Promise<void> {
  if (sharedPgStore) {
    try {
      // Note: @mastra/pg might not have a close method
      // This is a placeholder for cleanup if needed
      console.log('🔌 Closing shared PostgreSQL connection...');
      sharedPgStore = null;
      initPromise = null;
    } catch (error: any) {
      console.warn('⚠️ Error closing PostgreSQL connection:', error.message);
    }
  }
}
