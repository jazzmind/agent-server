-- UP
-- Create tool definitions table for dynamic tool management
CREATE TABLE IF NOT EXISTS tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB DEFAULT '{}',
  execute_code TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tool_definitions_name 
ON tool_definitions(name);

CREATE INDEX IF NOT EXISTS idx_tool_definitions_is_active 
ON tool_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_tool_definitions_scopes 
ON tool_definitions USING gin(scopes);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_tool_definitions_scopes;
DROP INDEX IF EXISTS idx_tool_definitions_is_active;
DROP INDEX IF EXISTS idx_tool_definitions_name;

-- Drop the table
DROP TABLE IF EXISTS tool_definitions;
