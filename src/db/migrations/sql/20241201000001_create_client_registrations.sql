-- UP
-- Create client registrations table for OAuth client management
CREATE TABLE IF NOT EXISTS client_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret VARCHAR(255) NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  public_key JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_registrations_client_id 
ON client_registrations(client_id);

-- Create index for scope queries
CREATE INDEX IF NOT EXISTS idx_client_registrations_scopes 
ON client_registrations USING gin(scopes);

-- DOWN
-- Drop indexes first
DROP INDEX IF EXISTS idx_client_registrations_scopes;
DROP INDEX IF EXISTS idx_client_registrations_client_id;

-- Drop the table
DROP TABLE IF EXISTS client_registrations;
