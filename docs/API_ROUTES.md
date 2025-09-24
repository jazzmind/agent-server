# API Routes Documentation

This document describes the admin API routes for managing agents and workflows in the Mastra server.

## Authentication

All routes require admin authentication using Bearer tokens with appropriate scopes:
- `admin.read` - for read operations
- `admin.write` - for write operations

## Agent Routes

### List Agents
- **GET** `/agents`
- **Query Parameters:**
  - `active_only=true` - Only return active agents
  - `scopes=scope1,scope2` - Filter by scopes
  - `limit=10` - Limit results
  - `offset=0` - Offset for pagination
- **Required Scope:** `admin.read`

### Create Agent
- **POST** `/agents`
- **Required Fields:** `name`, `display_name`, `instructions`
- **Optional Fields:** `model`, `tools`, `scopes`, `created_by`
- **Required Scope:** `admin.write`

### Get Agent
- **GET** `/agents/:id`
- **Required Scope:** `admin.read`

### Update Agent
- **PUT** `/agents/:id`
- **Optional Fields:** `display_name`, `instructions`, `model`, `tools`, `scopes`, `is_active`
- **Required Scope:** `admin.write`

### Delete Agent
- **DELETE** `/agents/:id`
- **Required Scope:** `admin.write`

### Activate Agent
- **POST** `/agents/:id/activate`
- **Required Scope:** `admin.write`

### Deactivate Agent
- **POST** `/agents/:id/deactivate`
- **Required Scope:** `admin.write`

### Search Agents
- **GET** `/agents/search?q=search_term`
- **Query Parameters:**
  - `q` - Search term (required)
  - `active_only=true` - Only search active agents
- **Required Scope:** `admin.read`

### Get Agents by Scope
- **GET** `/agents/scope/:scope`
- **Required Scope:** `admin.read`

## Workflow Routes

### List Workflows
- **GET** `/workflows`
- **Query Parameters:**
  - `active_only=true` - Only return active workflows
  - `scopes=scope1,scope2` - Filter by scopes
  - `limit=10` - Limit results
  - `offset=0` - Offset for pagination
- **Required Scope:** `admin.read`

### Create Workflow
- **POST** `/workflows`
- **Required Fields:** `name`, `display_name`
- **Optional Fields:** `description`, `steps`, `triggers`, `scopes`, `created_by`
- **Required Scope:** `admin.write`

### Get Workflow
- **GET** `/workflows/:id`
- **Query Parameters:**
  - `include_steps=true` - Include workflow steps in response
- **Required Scope:** `admin.read`

### Update Workflow
- **PUT** `/workflows/:id`
- **Optional Fields:** `display_name`, `description`, `steps`, `triggers`, `scopes`, `is_active`
- **Required Scope:** `admin.write`

### Delete Workflow
- **DELETE** `/workflows/:id`
- **Note:** This also deletes all associated workflow steps
- **Required Scope:** `admin.write`

### Search Workflows
- **GET** `/workflows/search?q=search_term`
- **Query Parameters:**
  - `q` - Search term (required)
  - `active_only=true` - Only search active workflows
- **Required Scope:** `admin.read`

## Data Models

### Agent Definition
```typescript
interface AgentDefinition {
  id: string;
  name: string;
  display_name: string;
  instructions: string;
  model: string;
  tools: any[];
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}
```

### Workflow Definition
```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  steps: any[];
  triggers: any[];
  scopes: string[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}
```

## Error Responses

All routes return consistent error responses:

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate name/identifier)
- `500` - Internal Server Error

## Example Usage

### Creating an Agent
```bash
curl -X POST http://localhost:3000/agents \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "customer-support-agent",
    "display_name": "Customer Support Agent",
    "instructions": "You are a helpful customer support agent...",
    "model": "gpt-4",
    "scopes": ["customer.read", "tickets.write"]
  }'
```

### Creating a Workflow
```bash
curl -X POST http://localhost:3000/workflows \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "data-processing-workflow",
    "display_name": "Data Processing Workflow",
    "description": "Processes incoming data through multiple steps",
    "scopes": ["data.read", "data.write"]
  }'
```
