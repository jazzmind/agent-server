import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGService } from '../../mastra/services/rag-service';

// Mock PostgresStore
vi.mock('@mastra/pg', () => ({
  PostgresStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    db: {
      none: vi.fn().mockResolvedValue(undefined),
      one: vi.fn().mockResolvedValue({ id: 'test-id' }),
      oneOrNone: vi.fn().mockResolvedValue(null),
      manyOrNone: vi.fn().mockResolvedValue([]),
      result: vi.fn().mockResolvedValue({ rowCount: 1 }),
    },
  })),
}));

// Mock Chroma
vi.mock('@mastra/chroma', () => ({
  Chroma: vi.fn().mockImplementation(() => ({
    // Mock Chroma methods
  })),
}));

// Mock RAG
vi.mock('@mastra/rag', () => ({
  RAG: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue([{ id: 'chunk-1', content: 'test content' }]),
    retrieve: vi.fn().mockResolvedValue([{ id: 'chunk-1', score: 0.9 }]),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('RAGService', () => {
  let ragService: RAGService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db'
    };
    ragService = new RAGService();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('createDatabase', () => {
    const validConfig = {
      name: 'test-db',
      display_name: 'Test Database',
      description: 'A test database',
      vector_store_type: 'chroma' as const,
      vector_store_config: { host: 'localhost', port: 8000 },
      embedding_model: 'text-embedding-ada-002',
      chunk_size: 1000,
      chunk_overlap: 200,
      scopes: ['rag.read']
    };

    it('should create a RAG database with valid configuration', async () => {
      // Mock the pgStore to return a test ID
      const mockDb = {
        one: vi.fn().mockResolvedValue({ id: 'test-id', ...validConfig }),
        oneOrNone: vi.fn().mockResolvedValue(null) // No existing database
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDb 
      };

      const result = await ragService.createDatabase(validConfig, 'test-user');
      expect(result).toBeDefined();
      expect(result.id).toBe('test-id');
    });

    it('should reject invalid configuration', async () => {
      const invalidConfig = {
        ...validConfig,
        name: '', // Invalid: empty name
      };

      await expect(
        ragService.createDatabase(invalidConfig, 'test-user')
      ).rejects.toThrow();
    });

    it('should reject invalid vector store type', async () => {
      const invalidConfig = {
        ...validConfig,
        vector_store_type: 'invalid-store' as any,
      };

      await expect(
        ragService.createDatabase(invalidConfig, 'test-user')
      ).rejects.toThrow();
    });

    it('should handle database connection error', async () => {
      // Create service without database URL
      process.env.DATABASE_URL = '';
      const serviceWithoutDb = new RAGService();

      await expect(
        serviceWithoutDb.createDatabase(validConfig, 'test-user')
      ).rejects.toThrow('Database not available');
    });
  });

  describe('listDatabases', () => {
    it('should list databases without scope filter', async () => {
      // Mock the pgStore
      const mockDb = {
        manyOrNone: vi.fn().mockResolvedValue([{ id: 'db-1', name: 'test-db' }])
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDb 
      };

      const result = await ragService.listDatabases();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should list databases with scope filter', async () => {
      // Mock the pgStore
      const mockDb = {
        manyOrNone: vi.fn().mockResolvedValue([{ id: 'db-1', name: 'test-db' }])
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDb 
      };

      const result = await ragService.listDatabases(['rag.read']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle database connection error', async () => {
      process.env.DATABASE_URL = '';
      const serviceWithoutDb = new RAGService();

      await expect(
        serviceWithoutDb.listDatabases()
      ).rejects.toThrow('Database not available');
    });
  });

  describe('uploadDocument', () => {
    const mockFile = {
      buffer: Buffer.from('test content'),
      originalname: 'test.txt',
      mimetype: 'text/plain'
    };

    it('should upload a document successfully', async () => {
      // Mock database to return a valid database
      const mockDb = {
        id: 'db-1',
        name: 'test-db',
        display_name: 'Test DB',
        vector_store_type: 'chroma',
        vector_store_config: {},
        embedding_model: 'text-embedding-ada-002',
        chunk_size: 1000,
        chunk_overlap: 200,
        scopes: [],
        is_active: true,
        created_by: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock the pgStore and getDatabase method
      const mockDbConnection = {
        one: vi.fn().mockResolvedValue({ id: 'test-id', ...mockFile }),
        init: vi.fn().mockResolvedValue(undefined)
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDbConnection 
      };
      vi.spyOn(ragService as any, 'getDatabase').mockResolvedValue(mockDb);

      const result = await ragService.uploadDocument('db-1', mockFile, 'test-user');
      expect(result).toBeDefined();
      expect(result.id).toBe('test-id');
    });

    it('should reject upload to non-existent database', async () => {
      // Mock the pgStore first
      const mockDbConnection = {
        init: vi.fn().mockResolvedValue(undefined)
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDbConnection 
      };
      
      vi.spyOn(ragService as any, 'getDatabase').mockRejectedValue(new Error('Database not found'));

      await expect(
        ragService.uploadDocument('non-existent', mockFile, 'test-user')
      ).rejects.toThrow('Database not found');
    });
  });

  describe('search', () => {
    it('should search documents successfully', async () => {
      // Mock getRAGInstance
      const mockRAGInstance = {
        retrieve: vi.fn().mockResolvedValue([
          { id: 'vector-1', score: 0.9 }
        ])
      };
      vi.spyOn(ragService as any, 'getRAGInstance').mockResolvedValue(mockRAGInstance);

      const result = await ragService.search('db-1', 'test query');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle search errors', async () => {
      vi.spyOn(ragService as any, 'getRAGInstance').mockRejectedValue(new Error('RAG instance error'));

      await expect(
        ragService.search('db-1', 'test query')
      ).rejects.toThrow();
    });
  });

  describe('deleteDatabase', () => {
    it('should delete database successfully', async () => {
      // Mock the pgStore
      const mockDb = {
        result: vi.fn().mockResolvedValue({ rowCount: 1 })
      };
      (ragService as any).pgStore = { 
        init: vi.fn().mockResolvedValue(undefined),
        db: mockDb 
      };

      await expect(ragService.deleteDatabase('db-1')).resolves.not.toThrow();
    });

    it('should handle database connection error', async () => {
      process.env.DATABASE_URL = '';
      const serviceWithoutDb = new RAGService();

      await expect(
        serviceWithoutDb.deleteDatabase('db-1')
      ).rejects.toThrow('Database not available');
    });
  });
});
