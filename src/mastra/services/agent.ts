import { PostgresStore } from '@mastra/pg';
import { getSharedPostgresStore } from '../utils/database';

export interface AgentDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  instructions: string;
  model: string;
  max_retries?: number;
  tools: any[];
  workflows?: string[]; // Array of workflow names/IDs
  agents?: string[]; // Array of agent names/IDs this agent can reference
  scorers?: string[]; // Array of scorer names/IDs
  evals?: Record<string, any>; // Evaluation metrics
  memory_config?: Record<string, any>; // Memory configuration
  voice_config?: Record<string, any>; // Voice configuration
  input_processors?: string[]; // Array of input processor names
  output_processors?: string[]; // Array of output processor names
  default_generate_options?: Record<string, any>;
  default_stream_options?: Record<string, any>;
  telemetry_enabled?: boolean;
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAgentRequest {
  name: string;
  display_name: string;
  description?: string;
  instructions: string;
  model?: string;
  max_retries?: number;
  tools?: any[];
  workflows?: string[];
  agents?: string[];
  scorers?: string[];
  evals?: Record<string, any>;
  memory_config?: Record<string, any>;
  voice_config?: Record<string, any>;
  input_processors?: string[];
  output_processors?: string[];
  default_generate_options?: Record<string, any>;
  default_stream_options?: Record<string, any>;
  telemetry_enabled?: boolean;
  scopes?: string[];
  created_by?: string;
}

export interface UpdateAgentRequest {
  display_name?: string;
  description?: string;
  instructions?: string;
  model?: string;
  max_retries?: number;
  tools?: any[];
  workflows?: string[];
  agents?: string[];
  scorers?: string[];
  evals?: Record<string, any>;
  memory_config?: Record<string, any>;
  voice_config?: Record<string, any>;
  input_processors?: string[];
  output_processors?: string[];
  default_generate_options?: Record<string, any>;
  default_stream_options?: Record<string, any>;
  telemetry_enabled?: boolean;
  scopes?: string[];
  is_active?: boolean;
}

export class AgentService {
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

  // Agent CRUD operations
  async createAgent(request: CreateAgentRequest): Promise<AgentDefinition> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO agent_definitions (name, display_name, instructions, model, tools, scopes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      request.name, 
      request.display_name, 
      request.instructions, 
      request.model || 'gpt-4',
      JSON.stringify(request.tools || []),
      request.scopes || [],
      request.created_by
    ]);
    
    return result;
  }

  async getAgent(id: string): Promise<AgentDefinition | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM agent_definitions WHERE id = $1
    `, [id]);
    
    return result;
  }

  async getAgentByName(name: string): Promise<AgentDefinition | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM agent_definitions WHERE name = $1
    `, [name]);
    
    return result;
  }

  async listAgents(options?: { 
    active_only?: boolean; 
    scopes?: string[]; 
    limit?: number; 
    offset?: number;
  }): Promise<AgentDefinition[]> {
    await this.initializeStorage();
    
    let query = 'SELECT * FROM agent_definitions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (options?.active_only) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(true);
      paramIndex++;
    }

    if (options?.scopes && options.scopes.length > 0) {
      query += ` AND scopes && $${paramIndex}`;
      params.push(options.scopes);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
      paramIndex++;
    }
    
    const results = await this.pgStore!.db.manyOrNone(query, params);
    return results || [];
  }

  async updateAgent(id: string, request: UpdateAgentRequest): Promise<AgentDefinition> {
    await this.initializeStorage();
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (request.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex}`);
      params.push(request.display_name);
      paramIndex++;
    }

    if (request.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(request.description);
      paramIndex++;
    }

    if (request.instructions !== undefined) {
      updates.push(`instructions = $${paramIndex}`);
      params.push(request.instructions);
      paramIndex++;
    }

    if (request.model !== undefined) {
      updates.push(`model = $${paramIndex}`);
      params.push(request.model);
      paramIndex++;
    }

    if (request.max_retries !== undefined) {
      updates.push(`max_retries = $${paramIndex}`);
      params.push(request.max_retries);
      paramIndex++;
    }

    if (request.tools !== undefined) {
      updates.push(`tools = $${paramIndex}`);
      params.push(JSON.stringify(request.tools));
      paramIndex++;
    }

    if (request.workflows !== undefined) {
      updates.push(`workflows = $${paramIndex}`);
      params.push(JSON.stringify(request.workflows));
      paramIndex++;
    }

    if (request.agents !== undefined) {
      updates.push(`agents = $${paramIndex}`);
      params.push(JSON.stringify(request.agents));
      paramIndex++;
    }

    if (request.scorers !== undefined) {
      updates.push(`scorers = $${paramIndex}`);
      params.push(JSON.stringify(request.scorers));
      paramIndex++;
    }

    if (request.evals !== undefined) {
      updates.push(`evals = $${paramIndex}`);
      params.push(JSON.stringify(request.evals));
      paramIndex++;
    }

    if (request.memory_config !== undefined) {
      updates.push(`memory_config = $${paramIndex}`);
      params.push(JSON.stringify(request.memory_config));
      paramIndex++;
    }

    if (request.voice_config !== undefined) {
      updates.push(`voice_config = $${paramIndex}`);
      params.push(JSON.stringify(request.voice_config));
      paramIndex++;
    }

    if (request.input_processors !== undefined) {
      updates.push(`input_processors = $${paramIndex}`);
      params.push(JSON.stringify(request.input_processors));
      paramIndex++;
    }

    if (request.output_processors !== undefined) {
      updates.push(`output_processors = $${paramIndex}`);
      params.push(JSON.stringify(request.output_processors));
      paramIndex++;
    }

    if (request.default_generate_options !== undefined) {
      updates.push(`default_generate_options = $${paramIndex}`);
      params.push(JSON.stringify(request.default_generate_options));
      paramIndex++;
    }

    if (request.default_stream_options !== undefined) {
      updates.push(`default_stream_options = $${paramIndex}`);
      params.push(JSON.stringify(request.default_stream_options));
      paramIndex++;
    }

    if (request.telemetry_enabled !== undefined) {
      updates.push(`telemetry_enabled = $${paramIndex}`);
      params.push(request.telemetry_enabled);
      paramIndex++;
    }

    if (request.scopes !== undefined) {
      updates.push(`scopes = $${paramIndex}`);
      params.push(request.scopes);
      paramIndex++;
    }

    if (request.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(request.is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE agent_definitions 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await this.pgStore!.db.one(query, params);
    return result;
  }

  async deleteAgent(id: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM agent_definitions WHERE id = $1
    `, [id]);
  }

  async activateAgent(id: string): Promise<AgentDefinition> {
    return this.updateAgent(id, { is_active: true });
  }

  async deactivateAgent(id: string): Promise<AgentDefinition> {
    return this.updateAgent(id, { is_active: false });
  }

  // Utility methods
  async validateAgentName(name: string, excludeId?: string): Promise<boolean> {
    await this.initializeStorage();
    
    let query = 'SELECT id FROM agent_definitions WHERE name = $1';
    const params = [name];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await this.pgStore!.db.oneOrNone(query, params);
    return !result; // Returns true if name is available
  }

  async getAgentsByScope(scope: string): Promise<AgentDefinition[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM agent_definitions 
      WHERE $1 = ANY(scopes) AND is_active = true
      ORDER BY display_name ASC
    `, [scope]);
    
    return results || [];
  }

  async searchAgents(query: string, options?: { active_only?: boolean }): Promise<AgentDefinition[]> {
    await this.initializeStorage();
    
    let sql = `
      SELECT * FROM agent_definitions 
      WHERE (
        name ILIKE $1 
        OR display_name ILIKE $1 
        OR instructions ILIKE $1
      )
    `;
    
    const params = [`%${query}%`];
    
    if (options?.active_only) {
      sql += ' AND is_active = true';
    }
    
    sql += ' ORDER BY display_name ASC';
    
    const results = await this.pgStore!.db.manyOrNone(sql, params);
    return results || [];
  }
}

// Singleton instance
export const agentService = new AgentService();
