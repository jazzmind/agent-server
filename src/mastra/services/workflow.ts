import { PostgresStore } from '@mastra/pg';
import { getSharedPostgresStore } from '../utils/database';

export interface WorkflowDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  steps: any[];
  triggers: any[];
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_id: string;
  name: string;
  description?: string;
  input_schema: any;
  output_schema?: any;
  execute_code: string;
  depends_on: string[];
  order_index: number;
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkflowRequest {
  name: string;
  display_name: string;
  description?: string;
  steps?: any[];
  triggers?: any[];
  scopes?: string[];
  created_by?: string;
}

export interface UpdateWorkflowRequest {
  display_name?: string;
  description?: string;
  steps?: any[];
  triggers?: any[];
  scopes?: string[];
  is_active?: boolean;
}

export interface CreateWorkflowStepRequest {
  workflow_id: string;
  step_id: string;
  name: string;
  description?: string;
  input_schema: any;
  output_schema?: any;
  execute_code: string;
  depends_on?: string[];
  order_index?: number;
  created_by?: string;
}

export interface UpdateWorkflowStepRequest {
  name?: string;
  description?: string;
  input_schema?: any;
  output_schema?: any;
  execute_code?: string;
  depends_on?: string[];
  order_index?: number;
  is_active?: boolean;
}

export class WorkflowService {
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

  // Workflow CRUD operations
  async createWorkflow(request: CreateWorkflowRequest): Promise<WorkflowDefinition> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO workflow_definitions (name, display_name, description, steps, triggers, scopes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      request.name, 
      request.display_name, 
      request.description,
      JSON.stringify(request.steps || []),
      JSON.stringify(request.triggers || []),
      request.scopes || [],
      request.created_by
    ]);
    
    return result;
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM workflow_definitions WHERE id = $1
    `, [id]);
    
    return result;
  }

  async getWorkflowByName(name: string): Promise<WorkflowDefinition | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM workflow_definitions WHERE name = $1
    `, [name]);
    
    return result;
  }

  async listWorkflows(options?: { 
    active_only?: boolean; 
    scopes?: string[]; 
    limit?: number; 
    offset?: number;
  }): Promise<WorkflowDefinition[]> {
    await this.initializeStorage();
    
    let query = 'SELECT * FROM workflow_definitions WHERE 1=1';
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

  async updateWorkflow(id: string, request: UpdateWorkflowRequest): Promise<WorkflowDefinition> {
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

    if (request.steps !== undefined) {
      updates.push(`steps = $${paramIndex}`);
      params.push(JSON.stringify(request.steps));
      paramIndex++;
    }

    if (request.triggers !== undefined) {
      updates.push(`triggers = $${paramIndex}`);
      params.push(JSON.stringify(request.triggers));
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
      UPDATE workflow_definitions 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await this.pgStore!.db.one(query, params);
    return result;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.initializeStorage();
    
    // Delete workflow steps first (if any exist)
    await this.pgStore!.db.none(`
      DELETE FROM workflow_steps WHERE workflow_id = $1
    `, [id]);
    
    // Delete the workflow
    await this.pgStore!.db.none(`
      DELETE FROM workflow_definitions WHERE id = $1
    `, [id]);
  }

  async activateWorkflow(id: string): Promise<WorkflowDefinition> {
    return this.updateWorkflow(id, { is_active: true });
  }

  async deactivateWorkflow(id: string): Promise<WorkflowDefinition> {
    return this.updateWorkflow(id, { is_active: false });
  }

  // Workflow Step CRUD operations
  async createWorkflowStep(request: CreateWorkflowStepRequest): Promise<WorkflowStep> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO workflow_steps (
        workflow_id, step_id, name, description, input_schema, output_schema, 
        execute_code, depends_on, order_index, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      request.workflow_id,
      request.step_id,
      request.name,
      request.description,
      JSON.stringify(request.input_schema),
      JSON.stringify(request.output_schema || {}),
      request.execute_code,
      request.depends_on || [],
      request.order_index || 0,
      request.created_by
    ]);
    
    return result;
  }

  async getWorkflowStep(id: string): Promise<WorkflowStep | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM workflow_steps WHERE id = $1
    `, [id]);
    
    return result;
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM workflow_steps 
      WHERE workflow_id = $1 
      ORDER BY order_index ASC, created_at ASC
    `, [workflowId]);
    
    return results || [];
  }

  async updateWorkflowStep(id: string, request: UpdateWorkflowStepRequest): Promise<WorkflowStep> {
    await this.initializeStorage();
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (request.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(request.name);
      paramIndex++;
    }

    if (request.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(request.description);
      paramIndex++;
    }

    if (request.input_schema !== undefined) {
      updates.push(`input_schema = $${paramIndex}`);
      params.push(JSON.stringify(request.input_schema));
      paramIndex++;
    }

    if (request.output_schema !== undefined) {
      updates.push(`output_schema = $${paramIndex}`);
      params.push(JSON.stringify(request.output_schema));
      paramIndex++;
    }

    if (request.execute_code !== undefined) {
      updates.push(`execute_code = $${paramIndex}`);
      params.push(request.execute_code);
      paramIndex++;
    }

    if (request.depends_on !== undefined) {
      updates.push(`depends_on = $${paramIndex}`);
      params.push(request.depends_on);
      paramIndex++;
    }

    if (request.order_index !== undefined) {
      updates.push(`order_index = $${paramIndex}`);
      params.push(request.order_index);
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
      UPDATE workflow_steps 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await this.pgStore!.db.one(query, params);
    return result;
  }

  async deleteWorkflowStep(id: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM workflow_steps WHERE id = $1
    `, [id]);
  }

  // Utility methods
  async validateWorkflowName(name: string, excludeId?: string): Promise<boolean> {
    await this.initializeStorage();
    
    let query = 'SELECT id FROM workflow_definitions WHERE name = $1';
    const params = [name];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await this.pgStore!.db.oneOrNone(query, params);
    return !result; // Returns true if name is available
  }

  async validateWorkflowStepId(workflowId: string, stepId: string, excludeId?: string): Promise<boolean> {
    await this.initializeStorage();
    
    let query = 'SELECT id FROM workflow_steps WHERE workflow_id = $1 AND step_id = $2';
    const params = [workflowId, stepId];
    
    if (excludeId) {
      query += ' AND id != $3';
      params.push(excludeId);
    }
    
    const result = await this.pgStore!.db.oneOrNone(query, params);
    return !result; // Returns true if step_id is available
  }

  async getWorkflowsByScope(scope: string): Promise<WorkflowDefinition[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM workflow_definitions 
      WHERE $1 = ANY(scopes) AND is_active = true
      ORDER BY display_name ASC
    `, [scope]);
    
    return results || [];
  }

  async searchWorkflows(query: string, options?: { active_only?: boolean }): Promise<WorkflowDefinition[]> {
    await this.initializeStorage();
    
    let sql = `
      SELECT * FROM workflow_definitions 
      WHERE (
        name ILIKE $1 
        OR display_name ILIKE $1 
        OR description ILIKE $1
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

  // Get workflow with all its steps
  async getWorkflowWithSteps(id: string): Promise<(WorkflowDefinition & { workflow_steps?: WorkflowStep[] }) | null> {
    await this.initializeStorage();
    
    const workflow = await this.getWorkflow(id);
    if (!workflow) {
      return null;
    }

    const steps = await this.getWorkflowSteps(id);
    
    return {
      ...workflow,
      workflow_steps: steps
    };
  }
}

// Singleton instance
export const workflowService = new WorkflowService();
