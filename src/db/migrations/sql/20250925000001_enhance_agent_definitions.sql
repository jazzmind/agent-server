-- UP
-- Enhance agent definitions table to support full AgentConfig options

-- Add new columns for expanded agent configuration
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS workflows JSONB DEFAULT '[]';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS default_generate_options JSONB DEFAULT '{}';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS default_stream_options JSONB DEFAULT '{}';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS agents JSONB DEFAULT '[]'; -- References to other agents
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS scorers JSONB DEFAULT '[]';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS evals JSONB DEFAULT '{}'; -- Evaluation metrics
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS memory_config JSONB DEFAULT '{}';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT '{}';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS input_processors JSONB DEFAULT '[]';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS output_processors JSONB DEFAULT '[]';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS telemetry_enabled BOOLEAN DEFAULT false;

-- Add indexes for new JSONB columns
CREATE INDEX IF NOT EXISTS idx_agent_definitions_workflows 
ON agent_definitions USING gin(workflows);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_agents 
ON agent_definitions USING gin(agents);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_scorers 
ON agent_definitions USING gin(scorers);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_input_processors 
ON agent_definitions USING gin(input_processors);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_output_processors 
ON agent_definitions USING gin(output_processors);

-- DOWN
-- Remove indexes
DROP INDEX IF EXISTS idx_agent_definitions_output_processors;
DROP INDEX IF EXISTS idx_agent_definitions_input_processors;
DROP INDEX IF EXISTS idx_agent_definitions_scorers;
DROP INDEX IF EXISTS idx_agent_definitions_agents;
DROP INDEX IF EXISTS idx_agent_definitions_workflows;

-- Remove columns
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS telemetry_enabled;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS output_processors;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS input_processors;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS voice_config;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS memory_config;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS evals;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS scorers;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS agents;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS default_stream_options;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS default_generate_options;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS workflows;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS max_retries;
ALTER TABLE agent_definitions DROP COLUMN IF EXISTS description;
