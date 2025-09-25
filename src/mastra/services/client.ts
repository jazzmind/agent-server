import { PostgresStore } from '@mastra/pg';
import { getSharedPostgresStore } from '../utils/database';
import { randomUUID } from 'crypto';
import { ApplicationService } from './application';

export interface Client {
  client_id: string;
  client_secret: string;
  name: string;
  scopes: string[];
  registered_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateClientRequest {
  serverId: string;
  name: string;
  scopes?: string[];
}

export interface UpdateClientRequest {
  name: string;
  scopes: string[];
}

export class ClientService {
  private pgStore: PostgresStore | null = null;

  private async initializeStorage() {
    if (!this.pgStore) {
      try {
        this.pgStore = await getSharedPostgresStore();
        if (!this.pgStore) {
          throw new Error('PostgreSQL not available');
        }
      } catch (error: any) {
        console.error('Failed to initialize PostgreSQL storage:', error.message);
        throw error;
      }
    }
  }

  async createClient(request: CreateClientRequest): Promise<{ client: Client; isNew: boolean }> {
    await this.initializeStorage();
    
    const { serverId, name, scopes = [] } = request;
    
    // Check if client already exists
    const existingClient = await this.pgStore!.db.oneOrNone(
      'SELECT * FROM client_registrations WHERE client_id = $1',
      [serverId]
    );

    if (existingClient) {
      // Update existing client with new scopes if provided
      if (scopes.length > 0) {
        await this.pgStore!.db.none(`
          UPDATE client_registrations 
          SET scopes = $2, updated_at = NOW()
          WHERE client_id = $1
        `, [serverId, scopes]);
        
        return {
          client: {
            ...existingClient,
            scopes
          },
          isNew: false
        };
      }
      
      return {
        client: existingClient,
        isNew: false
      };
    }

    // Generate client credentials
    const clientId = serverId;
    const clientSecret = randomUUID();

    // Save to database
    const newClient = await this.pgStore!.db.one(`
      INSERT INTO client_registrations (client_id, client_secret, name, scopes, registered_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [clientId, clientSecret, name, scopes, 'admin']);

    console.log(`✅ Server registered in PostgreSQL: ${name} (${clientId})`);

    return {
      client: newClient,
      isNew: true
    };
  }

  async listClients(): Promise<Client[]> {
    await this.initializeStorage();
    
    const clients = await this.pgStore!.db.manyOrNone(`
      SELECT client_id, name, scopes, created_at, registered_by
      FROM client_registrations
    `);
    
    return clients || [];
  }

  async getClient(clientId: string): Promise<Client | null> {
    await this.initializeStorage();
    
    const client = await this.pgStore!.db.oneOrNone(
      'SELECT * FROM client_registrations WHERE client_id = $1',
      [clientId]
    );
    
    return client || null;
  }

  async deleteClient(clientId: string): Promise<boolean> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.result(
      'DELETE FROM client_registrations WHERE client_id = $1',
      [clientId]
    );
    
    return result.rowCount > 0;
  }

  async updateClient(clientId: string, request: UpdateClientRequest): Promise<boolean> {
    await this.initializeStorage();
    
    const { name, scopes } = request;
    
    const result = await this.pgStore!.db.result(
      'UPDATE client_registrations SET scopes = $1, name = $2, updated_at = NOW() WHERE client_id = $2',
      [scopes, name, clientId]
    );
    
    return result.rowCount > 0;
  }

  async getClientSecret(clientId: string): Promise<string | null> {
    await this.initializeStorage();
    
    const client = await this.pgStore!.db.oneOrNone(
      'SELECT client_secret FROM client_registrations WHERE client_id = $1',
      [clientId]
    );
    
    return client?.client_secret || null;
  }

  async resetClientSecret(clientId: string): Promise<string | null> {
    await this.initializeStorage();
    
    const newSecret = randomUUID();
    
    const result = await this.pgStore!.db.result(
      'UPDATE client_registrations SET client_secret = $1, updated_at = NOW() WHERE client_id = $2',
      [newSecret, clientId]
    );
    
    if (result.rowCount > 0) {
      return newSecret;
    }
    
    return null;
  }

  async verifyClientCredentials(clientId: string, clientSecret: string): Promise<{ clientId: string; name: string; scopes: string[] } | null> {
    await this.initializeStorage();
    
    // Special case: Check for admin client credentials from environment variables
    const adminClientId = process.env.ADMIN_CLIENT_ID;
    const adminClientSecret = process.env.ADMIN_CLIENT_SECRET;
    
    if (adminClientId && adminClientSecret && 
        clientId === adminClientId && clientSecret === adminClientSecret) {
      console.log(`✅ Admin client authenticated: ${clientId}`);
      return {
        clientId,
        name: 'Admin Client',
        scopes: [
          'admin.read',
          'admin.write', 
          'client.read',
          'client.write',
          'agent.read',
          'agent.write',
          'workflow.read',
          'workflow.write',
          'tool.read',
          'tool.write',
          'rag.read',
          'rag.write'
        ]
      };
    }
    
    // Use PostgreSQL to find the client
    const client = await this.pgStore!.db.oneOrNone(
      'SELECT * FROM client_registrations WHERE client_id = $1',
      [clientId]
    );
    
    if (!client || client.client_secret !== clientSecret) {
      return null;
    }

    // we also need to get the scopes from the application service
    const applicationService = new ApplicationService();
    const applicationScopes = await applicationService.getClientApplicationPermissions(clientId) || [];
    console.log('applicationScopes', applicationScopes);
    const combinedScopes = [...client.scopes, ...applicationScopes.map(scope => scope.component_scopes).flat()];
    return {
      clientId,
      name: client.name,
      scopes: combinedScopes || []
      };  
  }

  async getClientRegistrationCount(): Promise<number> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(
      'SELECT COUNT(*) as count FROM client_registrations', 
      [], 
      a => +a.count
    );
    
    return result;
  }
}

// Singleton instance
export const clientService = new ClientService();
