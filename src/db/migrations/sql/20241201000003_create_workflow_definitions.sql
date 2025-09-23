-- UP
-- Create workflow definitions table for dynamic workflow management
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  triggers JSONB DEFAULT '[]',
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_name 
ON workflow_definitions(name);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_is_active 
ON workflow_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_scopes 
ON workflow_definitions USING gin(scopes);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_steps 
ON workflow_definitions USING gin(steps);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_triggers 
ON workflow_definitions USING gin(triggers);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_workflow_definitions_triggers;
DROP INDEX IF EXISTS idx_workflow_definitions_steps;
DROP INDEX IF EXISTS idx_workflow_definitions_scopes;
DROP INDEX IF EXISTS idx_workflow_definitions_is_active;
DROP INDEX IF EXISTS idx_workflow_definitions_name;

-- Drop the table
DROP TABLE IF EXISTS workflow_definitions;
