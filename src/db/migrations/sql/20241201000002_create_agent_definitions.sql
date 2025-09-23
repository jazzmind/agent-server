-- UP
-- Create agent definitions table for dynamic agent management
CREATE TABLE IF NOT EXISTS agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  model VARCHAR(255) NOT NULL DEFAULT 'gpt-4',
  tools JSONB DEFAULT '[]',
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_definitions_name 
ON agent_definitions(name);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_is_active 
ON agent_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_scopes 
ON agent_definitions USING gin(scopes);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_tools 
ON agent_definitions USING gin(tools);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_agent_definitions_tools;
DROP INDEX IF EXISTS idx_agent_definitions_scopes;
DROP INDEX IF EXISTS idx_agent_definitions_is_active;
DROP INDEX IF EXISTS idx_agent_definitions_name;

-- Drop the table
DROP TABLE IF EXISTS agent_definitions;
