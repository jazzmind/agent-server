-- UP
-- Create workflow steps table for dynamic workflow step management
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  step_id VARCHAR(255) NOT NULL, -- The step identifier used in the workflow
  name VARCHAR(255) NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB DEFAULT '{}',
  execute_code TEXT NOT NULL, -- The step execution code
  depends_on TEXT[] DEFAULT '{}', -- Array of step IDs this step depends on
  order_index INTEGER NOT NULL DEFAULT 0, -- Order of execution
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key constraint
  CONSTRAINT fk_workflow_steps_workflow_id 
    FOREIGN KEY (workflow_id) 
    REFERENCES workflow_definitions(id) 
    ON DELETE CASCADE,
    
  -- Unique constraint for step_id within a workflow
  CONSTRAINT unique_workflow_step_id 
    UNIQUE (workflow_id, step_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id 
ON workflow_steps(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_step_id 
ON workflow_steps(step_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_is_active 
ON workflow_steps(is_active);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_order_index 
ON workflow_steps(workflow_id, order_index);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_depends_on 
ON workflow_steps USING gin(depends_on);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_workflow_steps_depends_on;
DROP INDEX IF EXISTS idx_workflow_steps_order_index;
DROP INDEX IF EXISTS idx_workflow_steps_is_active;
DROP INDEX IF EXISTS idx_workflow_steps_step_id;
DROP INDEX IF EXISTS idx_workflow_steps_workflow_id;

-- Drop the table
DROP TABLE IF EXISTS workflow_steps;