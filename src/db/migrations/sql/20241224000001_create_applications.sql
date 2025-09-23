-- UP
-- Create applications table for grouping agents, workflows, RAG databases, etc.
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create application_components table to track what belongs to each application
CREATE TABLE IF NOT EXISTS application_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  component_type VARCHAR(50) NOT NULL, -- 'agent', 'workflow', 'tool', 'rag_database'
  component_id UUID NOT NULL, -- References the specific component
  component_name VARCHAR(255) NOT NULL, -- Denormalized for easier queries
  scopes TEXT[] DEFAULT '{}', -- Scopes required for this component
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(application_id, component_type, component_id)
);

-- Create application_client_permissions table for client access to applications
CREATE TABLE IF NOT EXISTS application_client_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL REFERENCES client_registrations(client_id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  component_scopes TEXT[] DEFAULT '{}', -- Specific scopes this client has for this application's components
  granted_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, application_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_applications_name ON applications(name);
CREATE INDEX IF NOT EXISTS idx_application_components_app_id ON application_components(application_id);
CREATE INDEX IF NOT EXISTS idx_application_components_type ON application_components(component_type);
CREATE INDEX IF NOT EXISTS idx_application_components_name ON application_components(component_name);
CREATE INDEX IF NOT EXISTS idx_application_client_permissions_client_id ON application_client_permissions(client_id);
CREATE INDEX IF NOT EXISTS idx_application_client_permissions_app_id ON application_client_permissions(application_id);
CREATE INDEX IF NOT EXISTS idx_application_client_permissions_scopes ON application_client_permissions USING gin(component_scopes);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_application_client_permissions_scopes;
DROP INDEX IF EXISTS idx_application_client_permissions_app_id;
DROP INDEX IF EXISTS idx_application_client_permissions_client_id;
DROP INDEX IF EXISTS idx_application_components_name;
DROP INDEX IF EXISTS idx_application_components_type;
DROP INDEX IF EXISTS idx_application_components_app_id;
DROP INDEX IF EXISTS idx_applications_name;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS application_client_permissions;
DROP TABLE IF EXISTS application_components;
DROP TABLE IF EXISTS applications;
