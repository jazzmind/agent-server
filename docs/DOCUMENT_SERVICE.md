# Document Service

The DocumentService provides database operations for document ingestion and processing using Mastra/pg instead of direct Prisma calls.

## Overview

The service manages two main entities:
- **Documents**: Metadata about processed files
- **Document Sections**: Semantic chunks of documents with embeddings

## Database Schema

### Documents Table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  markdown TEXT,
  status VARCHAR(20) DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Document Sections Table
```sql
CREATE TABLE document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Service Interface

### Document Operations
- `createDocument(request)` - Create a new document record
- `getDocument(id)` - Get document by ID
- `getDocumentByFileUrl(fileUrl)` - Get document by file URL
- `updateDocument(id, request)` - Update document fields
- `updateDocumentsByFileUrl(fileUrl, status, metadata)` - Bulk update by file URL
- `deleteDocument(id)` - Delete document and all sections
- `listDocuments(options)` - List documents with filtering
- `getDocumentWithSections(id)` - Get document with all sections

### Document Section Operations
- `createDocumentSection(request)` - Create a new section
- `getDocumentSection(id)` - Get section by ID
- `getDocumentSections(documentId)` - Get all sections for a document
- `deleteDocumentSection(id)` - Delete a section

## Usage in Ingestion Tool

The ingestion tool has been refactored to use the DocumentService:

```typescript
import { documentService } from '../services/document';

// Create document
const document = await documentService.createDocument({
  original_filename: originalFilename,
  file_url: fileUrl,
  file_type: fileType,
  markdown,
  metadata: { purpose: 'ingestion', ... }
});

// Create sections
const section = await documentService.createDocumentSection({
  document_id: document.id,
  title: extractSectionTitle(chunk.text),
  content: chunk.text,
  metadata: { chunkIndex: index, embedding: embeddings[index] }
});

// Update status
await documentService.updateDocument(document.id, {
  status: 'COMPLETED',
  metadata: { sectionsCount: sections.length, ... }
});
```

## Migration

The migration file `20250924000001_create_documents.sql` creates the necessary tables and indexes.

## Benefits

1. **Database Abstraction**: Uses Mastra/pg instead of direct Prisma
2. **Service Pattern**: Clean separation of concerns
3. **Type Safety**: Full TypeScript interfaces
4. **Error Handling**: Proper PostgreSQL error handling
5. **Performance**: Optimized queries with proper indexing
6. **Flexibility**: Easy to extend for additional document types
