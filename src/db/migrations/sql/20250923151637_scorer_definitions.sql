-- UP
-- Create scorer definitions table for dynamic scorer management
CREATE TABLE IF NOT EXISTS scorer_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  scorer_type VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'custom', 'criterion', 'summary', 'overall'
  judge_model VARCHAR(100) DEFAULT 'gpt-5-mini',
  judge_instructions TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB DEFAULT '{}',
  preprocess_code TEXT, -- Optional preprocessing logic
  analyze_code TEXT, -- Analysis step code
  score_generation_code TEXT, -- Score generation logic
  reason_generation_code TEXT, -- Reason generation logic
  config JSONB DEFAULT '{}', -- Additional configuration (rubrics, thresholds, etc.)
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scorer_definitions_name 
ON scorer_definitions(name);

CREATE INDEX IF NOT EXISTS idx_scorer_definitions_scorer_type 
ON scorer_definitions(scorer_type);

CREATE INDEX IF NOT EXISTS idx_scorer_definitions_is_active 
ON scorer_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_scorer_definitions_scopes 
ON scorer_definitions USING gin(scopes);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_scorer_definitions_scopes;
DROP INDEX IF EXISTS idx_scorer_definitions_is_active;
DROP INDEX IF EXISTS idx_scorer_definitions_scorer_type;
DROP INDEX IF EXISTS idx_scorer_definitions_name;

-- Drop the table
DROP TABLE IF EXISTS scorer_definitions;