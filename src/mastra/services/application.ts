import { PostgresStore } from '@mastra/pg';
import { getSharedPostgresStore } from '../utils/database';

export interface Application {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationComponent {
  id: string;
  application_id: string;
  component_type: 'agent' | 'workflow' | 'tool' | 'rag_database';
  component_id: string;
  component_name: string;
  scopes: string[];
  created_at: Date;
}

export interface ApplicationClientPermission {
  id: string;
  client_id: string;
  application_id: string;
  component_scopes: string[];
  granted_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateApplicationRequest {
  name: string;
  display_name: string;
  description?: string;
  created_by?: string;
}

export interface UpdateApplicationRequest {
  display_name?: string;
  description?: string;
}

export interface AddComponentRequest {
  component_type: 'agent' | 'workflow' | 'tool' | 'rag_database';
  component_id: string;
  component_name: string;
  scopes: string[];
}

export interface GrantClientPermissionRequest {
  client_id: string;
  component_scopes: string[];
  granted_by?: string;
}

export class ApplicationService {
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

  // Application CRUD operations
  async createApplication(request: CreateApplicationRequest): Promise<Application> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO applications (name, display_name, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [request.name, request.display_name, request.description, request.created_by]);
    
    return result;
  }

  async getApplication(id: string): Promise<Application | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM applications WHERE id = $1
    `, [id]);
    
    return result;
  }

  async getApplicationByName(name: string): Promise<Application | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM applications WHERE name = $1
    `, [name]);
    
    return result;
  }

  async listApplications(): Promise<Application[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM applications ORDER BY created_at DESC
    `);
    
    return results || [];
  }

  async updateApplication(id: string, request: UpdateApplicationRequest): Promise<Application> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      UPDATE applications 
      SET display_name = COALESCE($2, display_name),
          description = COALESCE($3, description),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, request.display_name, request.description]);
    
    return result;
  }

  async deleteApplication(id: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM applications WHERE id = $1
    `, [id]);
  }

  // Component management
  async addComponentToApplication(applicationId: string, request: AddComponentRequest): Promise<ApplicationComponent> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO application_components 
      (application_id, component_type, component_id, component_name, scopes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [applicationId, request.component_type, request.component_id, request.component_name, request.scopes]);
    
    return result;
  }

  async removeComponentFromApplication(applicationId: string, componentType: string, componentId: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM application_components 
      WHERE application_id = $1 AND component_type = $2 AND component_id = $3
    `, [applicationId, componentType, componentId]);
  }

  async getApplicationComponents(applicationId: string): Promise<ApplicationComponent[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM application_components 
      WHERE application_id = $1 
      ORDER BY component_type, component_name
    `, [applicationId]);
    
    return results || [];
  }

  // Client permission management
  async grantClientPermission(applicationId: string, request: GrantClientPermissionRequest): Promise<ApplicationClientPermission> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO application_client_permissions 
      (client_id, application_id, component_scopes, granted_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (client_id, application_id) 
      DO UPDATE SET 
        component_scopes = $3,
        granted_by = $4,
        updated_at = NOW()
      RETURNING *
    `, [request.client_id, applicationId, request.component_scopes, request.granted_by]);
    
    return result;
  }

  async revokeClientPermission(applicationId: string, clientId: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM application_client_permissions 
      WHERE application_id = $1 AND client_id = $2
    `, [applicationId, clientId]);
  }

  async getClientApplicationPermissions(clientId: string): Promise<ApplicationClientPermission[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM application_client_permissions 
      WHERE client_id = $1
    `, [clientId]);
    
    return results || [];
  }

  async getApplicationClientPermissions(applicationId: string): Promise<ApplicationClientPermission[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM application_client_permissions 
      WHERE application_id = $1
    `, [applicationId]);
    
    return results || [];
  }

  // Scope validation helpers
  async validateClientApplicationScope(clientId: string, applicationName: string, requiredScope: string): Promise<boolean> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT 1 FROM application_client_permissions acp
      JOIN applications a ON a.id = acp.application_id
      WHERE acp.client_id = $1 
        AND a.name = $2 
        AND $3 = ANY(acp.component_scopes)
    `, [clientId, applicationName, requiredScope]);
    
    return !!result;
  }

  async getClientAllowedScopesForApplication(clientId: string, applicationName: string): Promise<string[]> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT acp.component_scopes FROM application_client_permissions acp
      JOIN applications a ON a.id = acp.application_id
      WHERE acp.client_id = $1 AND a.name = $2
    `, [clientId, applicationName]);
    
    return result?.component_scopes || [];
  }

  // Get applications with their components and client permissions
  async getApplicationDetails(id: string) {
    await this.initializeStorage();
    
    const application = await this.getApplication(id);
    if (!application) {
      return null;
    }

    const components = await this.getApplicationComponents(id);
    const clientPermissions = await this.getApplicationClientPermissions(id);

    return {
      ...application,
      components,
      clientPermissions
    };
  }

  // Get available components for application configuration
  async getAvailableComponents(componentType?: string): Promise<any[]> {
    await this.initializeStorage();
    
    let components: any[] = [];

    if (!componentType || componentType === 'agent') {
      const agents = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'agent' as component_type, scopes
        FROM agent_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(agents || []));
    }

    if (!componentType || componentType === 'workflow') {
      const workflows = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'workflow' as component_type, scopes
        FROM workflow_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(workflows || []));
    }

    if (!componentType || componentType === 'tool') {
      const tools = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'tool' as component_type, scopes
        FROM tool_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(tools || []));
    }

    if (!componentType || componentType === 'rag_database') {
      const ragDatabases = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'rag_database' as component_type, scopes
        FROM rag_database_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(ragDatabases || []));
    }

    if (!componentType || componentType === 'scorer') {
      const scorers = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'scorer' as component_type, scopes
        FROM scorer_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(scorers || []));
    }

    if (!componentType || componentType === 'network') {
      const networks = await this.pgStore!.db.manyOrNone(`
        SELECT id, name, display_name, 'network' as component_type, scopes
        FROM network_definitions 
        WHERE is_active = true 
        ORDER BY display_name ASC
      `);
      components.push(...(networks || []));
    }

    return components;
  }
}

// Singleton instance
export const applicationService = new ApplicationService();
