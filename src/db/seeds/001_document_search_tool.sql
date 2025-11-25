-- Seed: Document Search Tool
-- This tool enables RAG by searching user documents via the busibox search API

INSERT INTO tool_definitions (
  name,
  display_name,
  description,
  input_schema,
  output_schema,
  execute_code,
  scopes,
  is_active,
  created_by
)
VALUES (
  'document-search',
  'Document Search',
  'Search through the user''s uploaded documents to find relevant information.
Use this tool when:
- The user asks a question that might be answered by their documents
- You need to find specific information from uploaded files
- You want to provide context-aware answers based on the user''s data

The tool returns relevant text chunks from documents that match the query.
Always use the returned text to inform your response - cite the source document when possible.

IMPORTANT: You must provide the authToken parameter to search the user''s documents.',
  '{
    "type": "object",
    "properties": {
      "authToken": {
        "type": "string",
        "description": "The user authentication token (JWT) for accessing their documents"
      },
      "query": {
        "type": "string",
        "description": "The search query - use natural language to describe what you are looking for"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return (default: 5, max: 50)",
        "default": 5
      },
      "mode": {
        "type": "string",
        "enum": ["hybrid", "semantic", "keyword"],
        "description": "Search mode: hybrid (recommended), semantic (meaning-based), or keyword (exact match)",
        "default": "hybrid"
      },
      "fileIds": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional: limit search to specific file IDs"
      }
    },
    "required": ["authToken", "query"]
  }',
  '{
    "type": "object",
    "properties": {
      "found": {
        "type": "boolean",
        "description": "Whether any relevant documents were found"
      },
      "resultCount": {
        "type": "number",
        "description": "Number of results returned"
      },
      "context": {
        "type": "string",
        "description": "Combined context from relevant document chunks"
      },
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "filename": { "type": "string" },
            "text": { "type": "string" },
            "score": { "type": "number" },
            "pageNumber": { "type": "number" }
          }
        },
        "description": "Individual search results with source information"
      },
      "error": {
        "type": "string",
        "description": "Error message if search failed"
      }
    }
  }',
  '// This tool uses the hardcoded implementation from document-search-tool.ts
// The execute_code here is a placeholder for documentation purposes
async ({ context }) => {
  // Actual implementation is in src/mastra/tools/document-search-tool.ts
  throw new Error("Use hardcoded tool implementation");
}',
  ARRAY['documents.read', 'search.execute'],
  true,
  'system'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  scopes = EXCLUDED.scopes,
  updated_at = NOW();

-- Also seed the getDocumentAccessToken helper tool
INSERT INTO tool_definitions (
  name,
  display_name,
  description,
  input_schema,
  output_schema,
  execute_code,
  scopes,
  is_active,
  created_by
)
VALUES (
  'getDocumentAccessToken',
  'Get Document Access Token',
  'Get an access token for searching user documents. Call this first before using document-search.',
  '{
    "type": "object",
    "properties": {}
  }',
  '{
    "type": "object",
    "properties": {
      "authToken": {
        "type": "string",
        "description": "The access token to use with document-search"
      }
    }
  }',
  '// This tool uses the hardcoded implementation from document-agent.ts
async () => {
  // Actual implementation is in src/mastra/agents/document-agent.ts
  throw new Error("Use hardcoded tool implementation");
}',
  ARRAY['auth.token'],
  true,
  'system'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  scopes = EXCLUDED.scopes,
  updated_at = NOW();

