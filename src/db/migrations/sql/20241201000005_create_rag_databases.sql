-- UP
-- Create RAG databases table for managing multiple RAG instances
CREATE TABLE IF NOT EXISTS rag_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  vector_store_type VARCHAR(50) NOT NULL DEFAULT 'chroma',
  vector_store_config JSONB NOT NULL DEFAULT '{}',
  embedding_model VARCHAR(255) NOT NULL DEFAULT 'text-embedding-ada-002',
  chunk_size INTEGER NOT NULL DEFAULT 1000,
  chunk_overlap INTEGER NOT NULL DEFAULT 200,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create RAG documents table for tracking uploaded documents
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_database_id UUID NOT NULL REFERENCES rag_databases(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  embedding_status VARCHAR(20) DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rag_databases_name 
ON rag_databases(name);

CREATE INDEX IF NOT EXISTS idx_rag_databases_is_active 
ON rag_databases(is_active);

CREATE INDEX IF NOT EXISTS idx_rag_databases_vector_store_type 
ON rag_databases(vector_store_type);

CREATE INDEX IF NOT EXISTS idx_rag_databases_scopes 
ON rag_databases USING gin(scopes);

CREATE INDEX IF NOT EXISTS idx_rag_documents_database_id 
ON rag_documents(rag_database_id);

CREATE INDEX IF NOT EXISTS idx_rag_documents_status 
ON rag_documents(embedding_status);

CREATE INDEX IF NOT EXISTS idx_rag_documents_filename 
ON rag_documents(filename);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_rag_documents_filename;
DROP INDEX IF EXISTS idx_rag_documents_status;
DROP INDEX IF EXISTS idx_rag_documents_database_id;
DROP INDEX IF EXISTS idx_rag_databases_scopes;
DROP INDEX IF EXISTS idx_rag_databases_vector_store_type;
DROP INDEX IF EXISTS idx_rag_databases_is_active;
DROP INDEX IF EXISTS idx_rag_databases_name;

-- Drop tables (documents first due to foreign key)
DROP TABLE IF EXISTS rag_documents;
DROP TABLE IF EXISTS rag_databases;
