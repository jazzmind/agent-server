-- UP
-- Create network definitions table for dynamic agent network management
CREATE TABLE IF NOT EXISTS network_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  network_type VARCHAR(50) NOT NULL DEFAULT 'sequential', -- 'sequential', 'parallel', 'conditional', 'hub'
  agents JSONB NOT NULL DEFAULT '[]', -- Array of agent references with roles
  routing_rules JSONB DEFAULT '{}', -- Rules for routing between agents
  coordination_strategy VARCHAR(50) DEFAULT 'simple', -- 'simple', 'consensus', 'voting', 'hierarchical'
  communication_protocol JSONB DEFAULT '{}', -- How agents communicate
  config JSONB DEFAULT '{}', -- Additional network configuration
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create network_agent_roles junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS network_agent_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL,
  agent_name VARCHAR(255) NOT NULL, -- Reference to agent definition name
  role VARCHAR(100) NOT NULL, -- 'coordinator', 'worker', 'validator', 'reviewer', etc.
  order_index INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}', -- Role-specific configuration
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key constraint
  CONSTRAINT fk_network_agent_roles_network_id 
    FOREIGN KEY (network_id) 
    REFERENCES network_definitions(id) 
    ON DELETE CASCADE,
    
  -- Unique constraint for agent role within a network
  CONSTRAINT unique_network_agent_role 
    UNIQUE (network_id, agent_name, role)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_network_definitions_name 
ON network_definitions(name);

CREATE INDEX IF NOT EXISTS idx_network_definitions_network_type 
ON network_definitions(network_type);

CREATE INDEX IF NOT EXISTS idx_network_definitions_is_active 
ON network_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_network_definitions_scopes 
ON network_definitions USING gin(scopes);

CREATE INDEX IF NOT EXISTS idx_network_agent_roles_network_id 
ON network_agent_roles(network_id);

CREATE INDEX IF NOT EXISTS idx_network_agent_roles_agent_name 
ON network_agent_roles(agent_name);

CREATE INDEX IF NOT EXISTS idx_network_agent_roles_role 
ON network_agent_roles(role);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_network_agent_roles_role;
DROP INDEX IF EXISTS idx_network_agent_roles_agent_name;
DROP INDEX IF EXISTS idx_network_agent_roles_network_id;
DROP INDEX IF EXISTS idx_network_definitions_scopes;
DROP INDEX IF EXISTS idx_network_definitions_is_active;
DROP INDEX IF EXISTS idx_network_definitions_network_type;
DROP INDEX IF EXISTS idx_network_definitions_name;

-- Drop the tables
DROP TABLE IF EXISTS network_agent_roles;
DROP TABLE IF EXISTS network_definitions;