-- UP
-- Add name and registered_by columns to client_registrations if they don't exist
-- (These columns are referenced in the code but missing from the original schema)
ALTER TABLE client_registrations 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

ALTER TABLE client_registrations 
ADD COLUMN IF NOT EXISTS registered_by VARCHAR(255);

-- Update existing records to have a default name if null
UPDATE client_registrations 
SET name = 'Legacy Client: ' || client_id 
WHERE name IS NULL;

-- Make name column NOT NULL after setting defaults
ALTER TABLE client_registrations 
ALTER COLUMN name SET NOT NULL;

-- Add application-aware scope validation comment
COMMENT ON COLUMN client_registrations.scopes IS 'Legacy global scopes - migrating to application-based permissions';

-- DOWN
-- Remove the comment
COMMENT ON COLUMN client_registrations.scopes IS NULL;

-- Remove the added columns
ALTER TABLE client_registrations DROP COLUMN IF EXISTS registered_by;
ALTER TABLE client_registrations DROP COLUMN IF EXISTS name;
