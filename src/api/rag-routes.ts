import { registerApiRoute } from '@mastra/core/server';
import { RAGService } from '../mastra/services/rag';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';

// Initialize RAG service
const ragService = new RAGService();

/**
 * List all RAG databases
 */
export const listRAGDatabasesRoute = registerApiRoute('/rag/databases', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);

      // List databases
      const databases = await ragService.listDatabases();
      
      return c.json({ databases });
    } catch (error: any) {
      console.error('Failed to list RAG databases:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Create a new RAG database
 */
export const createRAGDatabaseRoute = registerApiRoute('/rag/databases', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      // Parse request body
      const config = await c.req.json();
      
      // Create database
      const database = await ragService.createDatabase(config, 'admin');
      
      return c.json({ database }, 201);
    } catch (error: any) {
      console.error('Failed to create RAG database:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Get a specific RAG database
 */
export const getRAGDatabaseRoute = registerApiRoute('/rag/databases/:id', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // Get database
      const database = await ragService.getDatabase(databaseId);
      
      return c.json({ database });
    } catch (error: any) {
      if (error.message === 'RAG database not found') {
        return c.json({ error: 'Database not found' }, 404);
      }
      console.error('Failed to get RAG database:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Update a RAG database
 * TODO: Implement updateDatabase method in RAGService
 */
export const updateRAGDatabaseRoute = registerApiRoute('/rag/databases/:id', {
  method: 'PUT',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // For now, return not implemented
      return c.json({ 
        error: 'Update database not yet implemented',
        details: 'This feature will be available in a future release'
      }, 501);
    } catch (error: any) {
      console.error('Failed to update RAG database:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Delete a RAG database
 */
export const deleteRAGDatabaseRoute = registerApiRoute('/rag/databases/:id', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
  
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // Delete database
      await ragService.deleteDatabase(databaseId);
      
      return c.json({ message: 'Database deleted successfully' });
    } catch (error: any) {
      if (error.message === 'RAG database not found') {
        return c.json({ error: 'Database not found' }, 404);
      }
      console.error('Failed to delete RAG database:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Upload a document to a RAG database
 */
export const uploadDocumentRoute = registerApiRoute('/rag/databases/:id/documents', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // Parse multipart form data (basic implementation)
      // In a real implementation, you'd use multer or similar
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      const metadata = formData.get('metadata');
      
      if (!file) {
        return c.json({ error: 'File is required' }, 400);
      }
      
      // Convert File to Buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      
      const fileObj = {
        buffer,
        originalname: file.name,
        mimetype: file.type
      };
      
      let parsedMetadata = {};
      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata.toString());
        } catch (error) {
          return c.json({ error: 'Invalid metadata JSON' }, 400);
        }
      }
      
      // Upload document
      const document = await ragService.uploadDocument(
        databaseId,
        fileObj,
        'admin',
        parsedMetadata
      );
      
      return c.json({ document }, 201);
    } catch (error: any) {
      if (error.message === 'RAG database not found') {
        return c.json({ error: 'Database not found' }, 404);
      }
      console.error('Failed to upload document:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * List documents in a RAG database
 */
export const listDocumentsRoute = registerApiRoute('/rag/databases/:id/documents', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // Parse query parameters
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      
      // List documents
      const documents = await ragService.listDocuments(databaseId, limit, offset);
      
      return c.json({ documents });
    } catch (error: any) {
      console.error('Failed to list documents:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Delete a document from a RAG database
 */
export const deleteDocumentRoute = registerApiRoute('/rag/databases/:id/documents/:docId', {
  method: 'DELETE',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
      const documentId = c.req.param('docId');
      
      if (!documentId) {
        return c.json({ error: 'Document ID is required' }, 400);
      }
      
      // Delete document
      await ragService.deleteDocument(documentId);
      
      return c.json({ message: 'Document deleted successfully' });
    } catch (error: any) {
      if (error.message === 'Document not found') {
        return c.json({ error: 'Document not found' }, 404);
      }
      console.error('Failed to delete document:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Search documents in a RAG database
 */
export const searchDocumentsRoute = registerApiRoute('/rag/databases/:id/search', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Get client credentials from headers (can be regular client or management client)
      const clientId = c.req.header('x-client-id');
      const clientSecret = c.req.header('x-client-secret');
      
      if (!clientId || !clientSecret) {
        return c.json({ 
          error: 'Missing client credentials',
          details: 'Client ID and secret are required'
        }, 401);
      }
      
      // TODO: Verify client credentials and check scopes for RAG access
      // For now, we'll allow any authenticated client
      
      const databaseId = c.req.param('id');
      
      if (!databaseId) {
        return c.json({ error: 'Database ID is required' }, 400);
      }
      
      // Parse request body
      const { query, options = {} } = await c.req.json();
      
      if (!query) {
        return c.json({ error: 'Query is required' }, 400);
      }
      
      // Extract limit from options if provided
      const limit = options.limit || 10;
      
      // Search documents (RAGService.search only takes 3 parameters: databaseId, query, limit)
      const results = await ragService.search(databaseId, query, limit);
      
      return c.json({ results });
    } catch (error: any) {
      if (error.message === 'RAG database not found') {
        return c.json({ error: 'Database not found' }, 404);
      }
      console.error('Failed to search documents:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

// Export all RAG routes
export const ragRoutes = [
  listRAGDatabasesRoute,
  createRAGDatabaseRoute,
  getRAGDatabaseRoute,
  updateRAGDatabaseRoute,
  deleteRAGDatabaseRoute,
  uploadDocumentRoute,
  listDocumentsRoute,
  deleteDocumentRoute,
  searchDocumentsRoute,
];
