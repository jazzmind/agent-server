import { PostgresStore } from '@mastra/pg';
import { getSharedPostgresStore } from '../utils/database';

export interface Document {
  id: string;
  original_filename: string;
  file_url: string;
  file_type: string;
  markdown?: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentSection {
  id: string;
  document_id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDocumentRequest {
  original_filename: string;
  file_url: string;
  file_type: string;
  markdown?: string;
  metadata?: Record<string, any>;
}

export interface UpdateDocumentRequest {
  markdown?: string;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  metadata?: Record<string, any>;
}

export interface CreateDocumentSectionRequest {
  document_id: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

export class DocumentService {
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

  // Document CRUD operations
  async createDocument(request: CreateDocumentRequest): Promise<Document> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO documents (original_filename, file_url, file_type, markdown, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      request.original_filename,
      request.file_url,
      request.file_type,
      request.markdown,
      JSON.stringify(request.metadata || {})
    ]);
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async getDocument(id: string): Promise<Document | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM documents WHERE id = $1
    `, [id]);
    
    if (!result) {
      return null;
    }
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async getDocumentByFileUrl(fileUrl: string): Promise<Document | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM documents WHERE file_url = $1 ORDER BY created_at DESC LIMIT 1
    `, [fileUrl]);
    
    if (!result) {
      return null;
    }
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async updateDocument(id: string, request: UpdateDocumentRequest): Promise<Document> {
    await this.initializeStorage();
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (request.markdown !== undefined) {
      updates.push(`markdown = $${paramIndex}`);
      params.push(request.markdown);
      paramIndex++;
    }

    if (request.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(request.status);
      paramIndex++;
    }

    if (request.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(request.metadata));
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE documents 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await this.pgStore!.db.one(query, params);
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async updateDocumentsByFileUrl(fileUrl: string, status: 'PROCESSING' | 'COMPLETED' | 'FAILED', metadata?: Record<string, any>): Promise<void> {
    await this.initializeStorage();
    
    const updateData: any = {
      status,
      updated_at: 'NOW()'
    };
    
    if (metadata) {
      updateData.metadata = JSON.stringify(metadata);
    }
    
    const updates = Object.keys(updateData).map((key, index) => 
      key === 'updated_at' ? `${key} = NOW()` : `${key} = $${index + 2}`
    );
    
    const params = [fileUrl, ...Object.values(updateData).filter(v => v !== 'NOW()')];
    
    await this.pgStore!.db.none(`
      UPDATE documents 
      SET ${updates.join(', ')}
      WHERE file_url = $1 AND status = 'PROCESSING'
    `, params);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.initializeStorage();
    
    // Delete document sections first (cascade should handle this, but being explicit)
    await this.pgStore!.db.none(`
      DELETE FROM document_sections WHERE document_id = $1
    `, [id]);
    
    // Delete the document
    await this.pgStore!.db.none(`
      DELETE FROM documents WHERE id = $1
    `, [id]);
  }

  // Document Section operations
  async createDocumentSection(request: CreateDocumentSectionRequest): Promise<DocumentSection> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.one(`
      INSERT INTO document_sections (document_id, title, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      request.document_id,
      request.title,
      request.content,
      JSON.stringify(request.metadata || {})
    ]);
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async getDocumentSections(documentId: string): Promise<DocumentSection[]> {
    await this.initializeStorage();
    
    const results = await this.pgStore!.db.manyOrNone(`
      SELECT * FROM document_sections 
      WHERE document_id = $1 
      ORDER BY created_at ASC
    `, [documentId]);
    
    return (results || []).map(result => ({
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    }));
  }

  async getDocumentSection(id: string): Promise<DocumentSection | null> {
    await this.initializeStorage();
    
    const result = await this.pgStore!.db.oneOrNone(`
      SELECT * FROM document_sections WHERE id = $1
    `, [id]);
    
    if (!result) {
      return null;
    }
    
    return {
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    };
  }

  async deleteDocumentSection(id: string): Promise<void> {
    await this.initializeStorage();
    
    await this.pgStore!.db.none(`
      DELETE FROM document_sections WHERE id = $1
    `, [id]);
  }

  // Utility methods
  async listDocuments(options?: { 
    status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
    file_type?: string;
    limit?: number; 
    offset?: number;
  }): Promise<Document[]> {
    await this.initializeStorage();
    
    let query = 'SELECT * FROM documents WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (options?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options?.file_type) {
      query += ` AND file_type = $${paramIndex}`;
      params.push(options.file_type);
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
    
    return (results || []).map(result => ({
      ...result,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
    }));
  }

  async getDocumentWithSections(id: string): Promise<(Document & { sections?: DocumentSection[] }) | null> {
    await this.initializeStorage();
    
    const document = await this.getDocument(id);
    if (!document) {
      return null;
    }

    const sections = await this.getDocumentSections(id);
    
    return {
      ...document,
      sections
    };
  }
}

// Singleton instance
export const documentService = new DocumentService();
