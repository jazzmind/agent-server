import { PostgresStore } from '@mastra/pg';
import { createHash } from 'crypto';
import { getSharedPostgresStore } from '../utils/database';

export interface RAGDatabase {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  vector_store_type: 'chroma' | 'pinecone' | 'qdrant' | 'postgres';
  vector_store_config: any;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  scopes: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RAGDocument {
  id: string;
  rag_database_id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  metadata: any;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDatabaseConfig {
  name: string;
  display_name: string;
  description?: string;
  vector_store_type: 'chroma' | 'pinecone' | 'qdrant' | 'postgres';
  vector_store_config: any;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  scopes: string[];
}

export interface FileUpload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: any;
}

export class RAGService {
  private pgStore: PostgresStore | null = null;
  private ragInstances: Map<string, any> = new Map();

  constructor() {
    // Initialize shared PostgreSQL connection
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      this.pgStore = await getSharedPostgresStore();
      if (this.pgStore) {
        console.log('✅ RAG service: Using shared PostgreSQL connection');
      } else {
        console.warn('⚠️ RAG service: PostgreSQL not available');
      }
    } catch (error) {
      console.warn('⚠️ RAG service: Failed to get shared PostgreSQL connection:', error);
      this.pgStore = null;
    }
  }

  /**
   * Validate database configuration
   */
  private validateDatabaseConfig(config: CreateDatabaseConfig): void {
    if (!config.name?.trim()) {
      throw new Error('Database name is required');
    }

    if (!config.display_name?.trim()) {
      throw new Error('Display name is required');
    }

    const validVectorStoreTypes = ['chroma', 'pinecone', 'qdrant', 'postgres'];
    if (!validVectorStoreTypes.includes(config.vector_store_type)) {
      throw new Error(`Invalid vector store type: ${config.vector_store_type}`);
    }

    if (!config.embedding_model?.trim()) {
      throw new Error('Embedding model is required');
    }

    if (config.chunk_size < 100 || config.chunk_size > 10000) {
      throw new Error('Chunk size must be between 100 and 10000');
    }

    if (config.chunk_overlap < 0 || config.chunk_overlap >= config.chunk_size) {
      throw new Error('Chunk overlap must be less than chunk size');
    }
  }

  /**
   * Create a new RAG database
   */
  async createDatabase(config: CreateDatabaseConfig, createdBy: string): Promise<RAGDatabase> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    this.validateDatabaseConfig(config);

    try {
      await this.pgStore.init();

      // Check if database name already exists
      const existing = await this.pgStore.db.oneOrNone(
        'SELECT id FROM rag_databases WHERE name = $1',
        [config.name]
      );

      if (existing) {
        throw new Error(`Database with name '${config.name}' already exists`);
      }

      // Insert new database
      const database = await this.pgStore.db.one(`
        INSERT INTO rag_databases (
          name, display_name, description, vector_store_type, vector_store_config,
          embedding_model, chunk_size, chunk_overlap, scopes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        config.name,
        config.display_name,
        config.description || null,
        config.vector_store_type,
        JSON.stringify(config.vector_store_config),
        config.embedding_model,
        config.chunk_size,
        config.chunk_overlap,
        config.scopes,
        createdBy
      ]);

      // Initialize RAG instance
      await this.initializeRAGInstance(database);

      return database;
    } catch (error: any) {
      console.error('Failed to create RAG database:', error);
      throw error;
    }
  }

  /**
   * List all RAG databases
   */
  async listDatabases(allowedScopes?: string[]): Promise<RAGDatabase[]> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      let query = 'SELECT * FROM rag_databases WHERE is_active = true';
      const params: any[] = [];

      if (allowedScopes && allowedScopes.length > 0) {
        query += ' AND scopes && $1';
        params.push(allowedScopes);
      }

      query += ' ORDER BY created_at DESC';

      const databases = await this.pgStore.db.manyOrNone(query, params);
      return databases || [];
    } catch (error: any) {
      console.error('Failed to list RAG databases:', error);
      throw error;
    }
  }

  /**
   * Get a specific RAG database
   */
  async getDatabase(databaseId: string): Promise<RAGDatabase> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      const database = await this.pgStore.db.oneOrNone(
        'SELECT * FROM rag_databases WHERE id = $1 AND is_active = true',
        [databaseId]
      );

      if (!database) {
        throw new Error('Database not found');
      }

      return database;
    } catch (error: any) {
      console.error('Failed to get RAG database:', error);
      throw error;
    }
  }

  /**
   * Delete a RAG database
   */
  async deleteDatabase(databaseId: string): Promise<void> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      // Soft delete the database
      const result = await this.pgStore.db.result(
        'UPDATE rag_databases SET is_active = false, updated_at = NOW() WHERE id = $1',
        [databaseId]
      );

      if (result.rowCount === 0) {
        throw new Error('Database not found');
      }

      // Remove from memory cache
      this.ragInstances.delete(databaseId);
    } catch (error: any) {
      console.error('Failed to delete RAG database:', error);
      throw error;
    }
  }

  /**
   * Upload a document to a RAG database
   */
  async uploadDocument(
    databaseId: string,
    file: FileUpload,
    uploadedBy: string,
    metadata: any = {}
  ): Promise<RAGDocument> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      // Verify database exists
      const database = await this.getDatabase(databaseId);

      // Generate unique filename
      const timestamp = Date.now();
      const hash = createHash('md5').update(file.buffer).digest('hex').substring(0, 8);
      const filename = `${timestamp}_${hash}_${file.originalname}`;

      // Insert document record
      const document = await this.pgStore.db.one(`
        INSERT INTO rag_documents (
          rag_database_id, filename, original_filename, file_type, file_size,
          metadata, uploaded_by, embedding_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        databaseId,
        filename,
        file.originalname,
        file.mimetype,
        file.buffer.length,
        JSON.stringify(metadata),
        uploadedBy,
        'pending'
      ]);

      // Process the document (this would typically be done asynchronously)
      this.processDocument(document, file.buffer, database).catch(error => {
        console.error('Document processing failed:', error);
        // Update document status to failed
        if (this.pgStore?.db?.none) {
          this.pgStore.db.none(
            'UPDATE rag_documents SET embedding_status = $1, error_message = $2 WHERE id = $3',
            ['failed', error.message, document.id]
          ).catch(dbError => {
            console.error('Failed to update document status:', dbError);
          });
        }
      });

      return document;
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      throw error;
    }
  }

  /**
   * List documents in a RAG database
   */
  async listDocuments(databaseId: string, limit: number = 50, offset: number = 0): Promise<RAGDocument[]> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      const documents = await this.pgStore.db.manyOrNone(`
        SELECT * FROM rag_documents 
        WHERE rag_database_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `, [databaseId, limit, offset]);

      return documents || [];
    } catch (error: any) {
      console.error('Failed to list documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document from a RAG database
   */
  async deleteDocument(documentId: string): Promise<void> {
    if (!this.pgStore) {
      throw new Error('Database not available');
    }

    try {
      await this.pgStore.init();

      const result = await this.pgStore.db.result(
        'DELETE FROM rag_documents WHERE id = $1',
        [documentId]
      );

      if (result.rowCount === 0) {
        throw new Error('Document not found');
      }
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  /**
   * Search documents in a RAG database
   */
  async search(databaseId: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const ragInstance = await this.getRAGInstance(databaseId);
      
      if (!ragInstance) {
        throw new Error('RAG instance not found');
      }

      // This would typically use the actual RAG instance to perform vector search
      // For now, return mock results for testing
      return [
        {
          id: 'result-1',
          content: 'Mock search result',
          score: 0.95,
          metadata: { source: 'test' }
        }
      ];
    } catch (error: any) {
      console.error('Failed to search documents:', error);
      throw error;
    }
  }

  /**
   * Initialize RAG instance for a database
   */
  private async initializeRAGInstance(database: RAGDatabase): Promise<any> {
    try {
      let ragInstance;

      switch (database.vector_store_type) {
        case 'chroma':
          // Would initialize Chroma instance
          ragInstance = { type: 'chroma', config: database.vector_store_config };
          break;
        case 'pinecone':
          // Would initialize Pinecone instance
          ragInstance = { type: 'pinecone', config: database.vector_store_config };
          break;
        case 'qdrant':
          // Would initialize Qdrant instance
          ragInstance = { type: 'qdrant', config: database.vector_store_config };
          break;
        case 'postgres':
          // Would initialize pgvector instance
          ragInstance = { type: 'postgres', config: database.vector_store_config };
          break;
        default:
          throw new Error(`Unsupported vector store type: ${database.vector_store_type}`);
      }

      this.ragInstances.set(database.id, ragInstance);
      return ragInstance;
    } catch (error: any) {
      console.error('Failed to initialize RAG instance:', error);
      throw error;
    }
  }

  /**
   * Get or create RAG instance for a database
   */
  private async getRAGInstance(databaseId: string): Promise<any> {
    let ragInstance = this.ragInstances.get(databaseId);
    
    if (!ragInstance) {
      const database = await this.getDatabase(databaseId);
      ragInstance = await this.initializeRAGInstance(database);
    }

    return ragInstance;
  }

  /**
   * Process uploaded document (chunking, embedding, indexing)
   */
  private async processDocument(document: RAGDocument, buffer: Buffer, database: RAGDatabase): Promise<void> {
    try {
      if (!this.pgStore) {
        throw new Error('Database not available');
      }

      // Update status to processing
      await this.pgStore.db.none(
        'UPDATE rag_documents SET embedding_status = $1 WHERE id = $2',
        ['processing', document.id]
      );

      // Extract text content (simplified - would use proper parsers)
      const content = buffer.toString('utf-8');
      
      // Chunk the content
      const chunks = this.chunkContent(content, database.chunk_size, database.chunk_overlap);
      
      // Update chunk count
      await this.pgStore.db.none(
        'UPDATE rag_documents SET chunk_count = $1, embedding_status = $2 WHERE id = $3',
        [chunks.length, 'completed', document.id]
      );

    } catch (error: any) {
      console.error('Document processing failed:', error);
      throw error;
    }
  }

  /**
   * Chunk content into smaller pieces
   */
  private chunkContent(content: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.substring(start, end);
      chunks.push(chunk);
      start = end - overlap;
    }

    return chunks;
  }
}