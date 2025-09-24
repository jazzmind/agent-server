-- UP
-- Create documents table for document ingestion processing
CREATE TABLE IF NOT EXISTS documents (
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

-- Create document_sections table for semantic sections
CREATE TABLE IF NOT EXISTS document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_status 
ON documents(status);

CREATE INDEX IF NOT EXISTS idx_documents_file_url 
ON documents(file_url);

CREATE INDEX IF NOT EXISTS idx_documents_file_type 
ON documents(file_type);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id 
ON document_sections(document_id);

CREATE INDEX IF NOT EXISTS idx_document_sections_title 
ON document_sections(title);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_document_sections_title;
DROP INDEX IF EXISTS idx_document_sections_document_id;
DROP INDEX IF EXISTS idx_documents_file_type;
DROP INDEX IF EXISTS idx_documents_file_url;
DROP INDEX IF EXISTS idx_documents_status;

-- Drop tables (sections first due to foreign key)
DROP TABLE IF EXISTS document_sections;
DROP TABLE IF EXISTS documents;
