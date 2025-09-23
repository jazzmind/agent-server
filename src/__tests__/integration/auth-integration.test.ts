import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresStore } from '@mastra/pg';
import { MODELS } from '../../../src/mastra/config/models';

describe('Auth Integration Tests', () => {
  let pgStore: PostgresStore;
  const testDatabaseUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/agent_server_test';

  beforeAll(async () => {
    // Initialize test database connection
    pgStore = new PostgresStore({
      connectionString: testDatabaseUrl,
    });

    try {
      await pgStore.init();
      
      // Create test tables if they don't exist
      await pgStore.db.none(`
        CREATE TABLE IF NOT EXISTS test_client_registrations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id VARCHAR(255) UNIQUE NOT NULL,
          client_secret VARCHAR(255) NOT NULL,
          scopes TEXT[] DEFAULT '{}',
          public_key JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await pgStore.db.none(`
        CREATE TABLE IF NOT EXISTS test_agent_definitions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) UNIQUE NOT NULL,
          display_name VARCHAR(255) NOT NULL,
          instructions TEXT NOT NULL,
          model VARCHAR(255) NOT NULL DEFAULT 'gpt-5',
          tools JSONB DEFAULT '[]',
          scopes TEXT[] DEFAULT '{}',
          is_active BOOLEAN DEFAULT true,
          created_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (error) {
      console.warn('Could not initialize test database:', error);
      // Skip tests if database is not available
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (pgStore?.db) {
      try {
        await pgStore.db.none('DROP TABLE IF EXISTS test_client_registrations');
        await pgStore.db.none('DROP TABLE IF EXISTS test_agent_definitions');
      } catch (error) {
        console.warn('Could not clean up test database:', error);
      }
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    if (pgStore?.db) {
      try {
        await pgStore.db.none('DELETE FROM test_client_registrations');
        await pgStore.db.none('DELETE FROM test_agent_definitions');
      } catch (error) {
        console.warn('Could not clear test data:', error);
      }
    }
  });

  describe('Client Registration', () => {
    it('should store and retrieve client registrations', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      const clientData = {
        client_id: 'test-client-123',
        client_secret: 'test-secret-456',
        scopes: ['read', 'write'],
        public_key: { kty: 'RSA', n: 'test-key' }
      };

      // Insert test client
      await pgStore.db.none(`
        INSERT INTO test_client_registrations (client_id, client_secret, scopes, public_key)
        VALUES ($1, $2, $3, $4)
      `, [clientData.client_id, clientData.client_secret, clientData.scopes, JSON.stringify(clientData.public_key)]);

      // Retrieve and verify
      const retrieved = await pgStore.db.one(`
        SELECT * FROM test_client_registrations WHERE client_id = $1
      `, [clientData.client_id]);

      expect(retrieved.client_id).toBe(clientData.client_id);
      expect(retrieved.client_secret).toBe(clientData.client_secret);
      expect(retrieved.scopes).toEqual(clientData.scopes);
      expect(retrieved.public_key).toEqual(clientData.public_key);
    });

    it('should prevent duplicate client IDs', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      const clientData = {
        client_id: 'duplicate-client',
        client_secret: 'secret-1',
        scopes: ['read']
      };

      // Insert first client
      await pgStore.db.none(`
        INSERT INTO test_client_registrations (client_id, client_secret, scopes)
        VALUES ($1, $2, $3)
      `, [clientData.client_id, clientData.client_secret, clientData.scopes]);

      // Attempt to insert duplicate should fail
      await expect(
        pgStore.db.none(`
          INSERT INTO test_client_registrations (client_id, client_secret, scopes)
          VALUES ($1, $2, $3)
        `, [clientData.client_id, 'secret-2', ['write']])
      ).rejects.toThrow();
    });
  });

  describe('Agent Definitions', () => {
    it('should store and retrieve agent definitions', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      const agentData = {
        name: 'test-agent',
        display_name: 'Test Agent',
        instructions: 'You are a test agent',
        model: MODELS.default.model,
        tools: ['tool1', 'tool2'],
        scopes: ['agent.execute'],
        created_by: 'test-user'
      };

      // Insert test agent
      await pgStore.db.none(`
        INSERT INTO test_agent_definitions (name, display_name, instructions, model, tools, scopes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        agentData.name,
        agentData.display_name,
        agentData.instructions,
        agentData.model,
        JSON.stringify(agentData.tools),
        agentData.scopes,
        agentData.created_by
      ]);

      // Retrieve and verify
      const retrieved = await pgStore.db.one(`
        SELECT * FROM test_agent_definitions WHERE name = $1
      `, [agentData.name]);

      expect(retrieved.name).toBe(agentData.name);
      expect(retrieved.display_name).toBe(agentData.display_name);
      expect(retrieved.instructions).toBe(agentData.instructions);
      expect(retrieved.model).toBe(agentData.model);
      expect(retrieved.tools).toEqual(agentData.tools);
      expect(retrieved.scopes).toEqual(agentData.scopes);
      expect(retrieved.created_by).toBe(agentData.created_by);
      expect(retrieved.is_active).toBe(true);
    });

    it('should filter active agents', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      // Insert active agent
      await pgStore.db.none(`
        INSERT INTO test_agent_definitions (name, display_name, instructions, is_active)
        VALUES ($1, $2, $3, $4)
      `, ['active-agent', 'Active Agent', 'Active instructions', true]);

      // Insert inactive agent
      await pgStore.db.none(`
        INSERT INTO test_agent_definitions (name, display_name, instructions, is_active)
        VALUES ($1, $2, $3, $4)
      `, ['inactive-agent', 'Inactive Agent', 'Inactive instructions', false]);

      // Query only active agents
      const activeAgents = await pgStore.db.manyOrNone(`
        SELECT * FROM test_agent_definitions WHERE is_active = true
      `);

      expect(activeAgents).toHaveLength(1);
      expect(activeAgents[0].name).toBe('active-agent');
    });
  });

  describe('Database Schema Validation', () => {
    it('should have correct table structure for client registrations', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      const columns = await pgStore.db.manyOrNone(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'test_client_registrations'
        ORDER BY ordinal_position
      `);

      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'client_id', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'client_secret', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'scopes', data_type: 'ARRAY', is_nullable: 'YES' },
        { column_name: 'public_key', data_type: 'jsonb', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp without time zone', is_nullable: 'YES' },
        { column_name: 'updated_at', data_type: 'timestamp without time zone', is_nullable: 'YES' }
      ];

      expect(columns).toHaveLength(expectedColumns.length);
      
      expectedColumns.forEach((expected, index) => {
        expect(columns[index].column_name).toBe(expected.column_name);
        expect(columns[index].is_nullable).toBe(expected.is_nullable);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle bulk client insertions efficiently', async () => {
      if (!pgStore?.db) {
        console.warn('Skipping test: Database not available');
        return;
      }

      const startTime = Date.now();
      const numClients = 100;

      // Insert many clients in a transaction
      await pgStore.db.tx(async (t) => {
        for (let i = 0; i < numClients; i++) {
          await t.none(`
            INSERT INTO test_client_registrations (client_id, client_secret, scopes)
            VALUES ($1, $2, $3)
          `, [`client-${i}`, `secret-${i}`, ['read']]);
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all clients were inserted
      const count = await pgStore.db.one(`
        SELECT COUNT(*) as count FROM test_client_registrations
      `);
      expect(parseInt(count.count)).toBe(numClients);
    });
  });
});
