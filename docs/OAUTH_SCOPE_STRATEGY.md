# OAuth Scope Strategy for Component Authorization

## Executive Summary

This document defines the recommended OAuth scope strategy for the Agent Server's component authorization system. After analyzing three potential approaches, we recommend a **Hybrid Hierarchical Strategy** that provides both standardized type-based permissions and component-specific granular control, while maintaining backward compatibility with existing implementations.

## Problem Statement

Our system manages applications containing multiple component types (agents, workflows, tools, scorers, networks, RAG databases). Clients need granular access control to specific components within applications. The challenge is designing a scope strategy that is:

- **Scalable**: Works as the number of components grows
- **Manageable**: Easy for administrators to grant and revoke permissions
- **Flexible**: Supports both broad and granular permissions
- **Secure**: Follows principle of least privilege
- **Maintainable**: Clear, predictable patterns

## Current Architecture Context

Our system has:
- **Applications**: Logical groupings of related components
- **Components**: Agents, workflows, tools, scorers, networks, RAG databases
- **Clients**: External systems requiring access to specific components
- **Existing Implementation**: Hybrid global + application-specific scopes

```sql
-- Current schema supports component-specific scopes
application_components (
  component_type VARCHAR(50),     -- 'agent', 'workflow', 'tool', etc.
  component_id UUID,              -- Unique component identifier
  scopes TEXT[]                   -- Required scopes for this component
)

application_client_permissions (
  client_id VARCHAR(255),
  application_id UUID,
  component_scopes TEXT[]         -- Granted scopes for this application
)
```

## Recommended Strategy: Hybrid Hierarchical Scopes

### Core Principles

1. **Three-Tier Hierarchy**: `{type}.{action}` → `{app}.{type}.{action}` → `{app}.{component-id}.{action}`
2. **Standardized Actions**: Consistent verbs across component types
3. **Application Boundaries**: Scope validation respects application membership
4. **Component Override**: Components can define additional custom scopes

### Scope Structure

#### Tier 1: Global Type Scopes (Legacy Compatibility)
```
{type}.{action}
```
**Examples**: `agent.execute`, `workflow.read`, `tool.execute`, `rag.search`

**Usage**: Broad permissions across all components of a type
**Migration**: Existing global scopes continue to work

#### Tier 2: Application Type Scopes
```
{application}.{type}.{action}
```
**Examples**: `weather-service.agent.execute`, `document-processor.workflow.execute`

**Usage**: Permissions for all components of a type within an application

#### Tier 3: Component-Specific Scopes
```
{application}.{component-id}.{action}
```
**Examples**: `weather-service.weather-agent-v1.execute`, `document-processor.pdf-parser.execute`

**Usage**: Granular permissions for specific components

#### Tier 4: Custom Component Scopes (Advanced)
```
{application}.{component-id}.{custom-action}
```
**Examples**: `weather-service.weather-agent-v1.forecast`, `analytics.data-processor.aggregate`

**Usage**: Component-defined custom actions beyond standard ones

### Standardized Actions

#### All Component Types
- `read` - View component definition and metadata
- `execute` - Run/invoke the component
- `write` - Modify component definition (admin)
- `delete` - Remove component (admin)

#### Type-Specific Actions

**Agents**:
- `chat` - Interactive conversation
- `interrupt` - Stop running execution
- `memory.read` - Access agent's memory
- `memory.write` - Modify agent's memory

**Workflows**:
- `trigger` - Start workflow execution
- `monitor` - View execution status
- `suspend` - Pause execution
- `resume` - Continue suspended execution

**Tools**:
- `invoke` - Execute tool function
- `configure` - Modify tool configuration

**RAG Databases**:
- `search` - Query database
- `index` - Add documents
- `retrieve` - Get specific documents

**Scorers**:
- `score` - Run scoring evaluation
- `benchmark` - Compare against baselines

**Networks**:
- `coordinate` - Orchestrate agent interactions
- `monitor` - View network execution status

## Scope Validation Logic

### Validation Hierarchy (Most to Least Permissive)

1. **Global Type Scope**: If client has `agent.execute`, allow execution of any agent
2. **Application Type Scope**: If client has `weather-service.agent.execute`, allow execution of any agent in weather-service
3. **Component Scope**: If client has `weather-service.weather-agent-v1.execute`, allow execution of that specific agent
4. **Custom Component Scope**: Check component-defined custom scopes

### Implementation Example

```typescript
export async function validateComponentAccess(
  clientId: string,
  applicationName: string,
  componentType: string,
  componentId: string,
  action: string,
  customScopes?: string[]
): Promise<boolean> {
  // Check global scope (legacy compatibility)
  if (await hasScope(clientId, `${componentType}.${action}`)) {
    return true;
  }
  
  // Check application type scope
  if (await hasScope(clientId, `${applicationName}.${componentType}.${action}`)) {
    return true;
  }
  
  // Check component-specific scope
  if (await hasScope(clientId, `${applicationName}.${componentId}.${action}`)) {
    return true;
  }
  
  // Check custom component scopes
  if (customScopes) {
    for (const customScope of customScopes) {
      if (await hasScope(clientId, `${applicationName}.${componentId}.${customScope}`)) {
        return true;
      }
    }
  }
  
  return false;
}
```

## Component Definition Pattern

### Standard Component Scopes

Components should define their required scopes using the standardized pattern:

```json
{
  "name": "weather-agent-v1",
  "scopes": [
    "agent.execute",              // Standard execution permission
    "agent.chat",                 // Interactive conversation
    "agent.memory.read"           // Memory access
  ]
}
```

### Custom Component Scopes

Components can define custom actions for specialized functionality:

```json
{
  "name": "weather-agent-v1", 
  "scopes": [
    "agent.execute",
    "agent.forecast",             // Custom: Generate weather forecasts
    "agent.alerts.create",        // Custom: Create weather alerts
    "agent.historical.query"      // Custom: Query historical data
  ]
}
```

## Client Permission Management

### Administrative Scope Grants

#### Broad Application Access
```bash
# Grant execution access to all agents in weather-service
curl -X POST /applications/weather-service/permissions \
  -d '{
    "client_id": "mobile-app",
    "component_scopes": ["agent.execute", "rag.search"]
  }'
```

#### Granular Component Access
```bash
# Grant access to specific agent only
curl -X POST /applications/weather-service/permissions \
  -d '{
    "client_id": "mobile-app", 
    "component_scopes": ["weather-agent-v1.execute", "weather-agent-v1.forecast"]
  }'
```

#### Mixed Permission Levels
```bash
# Combine broad and specific permissions
curl -X POST /applications/document-processor/permissions \
  -d '{
    "client_id": "enterprise-client",
    "component_scopes": [
      "workflow.execute",           // All workflows
      "pdf-parser.configure",       // Specific tool configuration
      "rag.search"                  // All RAG databases
    ]
  }'
```

## Migration Strategy

### Phase 1: Implement Hybrid Validation (Current)
- ✅ Add new scope validation logic that checks hierarchical scopes
- ✅ Maintain backward compatibility with existing global scopes
- ✅ Update admin UI to support new scope patterns

### Phase 2: Standardize Component Definitions
- Update existing components to use standardized scope patterns
- Migrate custom scopes to new naming convention
- Provide migration tools for bulk updates

### Phase 3: Deprecate Global Scopes (Future)
- Add warnings for global scope usage in admin UI
- Provide migration timeline (6+ months notice)
- Gradually remove global scope support

## Implementation Examples

### Example 1: Weather Service Application

**Components**:
- `weather-agent-v1` (Agent)
- `forecast-workflow` (Workflow) 
- `weather-data-rag` (RAG Database)

**Client Permissions**:

```typescript
// Mobile app - basic weather access
{
  "client_id": "weather-mobile-app",
  "component_scopes": [
    "weather-service.weather-agent-v1.execute",
    "weather-service.weather-agent-v1.forecast",
    "weather-service.weather-data-rag.search"
  ]
}

// Admin dashboard - full management
{
  "client_id": "admin-dashboard",
  "component_scopes": [
    "weather-service.agent.read",
    "weather-service.agent.write", 
    "weather-service.workflow.execute",
    "weather-service.rag.index"
  ]
}

// Analytics service - read-only access
{
  "client_id": "analytics-service",
  "component_scopes": [
    "weather-service.agent.read",
    "weather-service.workflow.monitor",
    "weather-service.weather-data-rag.retrieve"
  ]
}
```

### Example 2: Document Processing Application

**Components**:
- `pdf-parser` (Tool)
- `text-extraction-workflow` (Workflow)
- `document-classifier-agent` (Agent)
- `document-store-rag` (RAG Database)

**Client Permissions**:

```typescript
// Document processing API
{
  "client_id": "doc-api",
  "component_scopes": [
    "document-processor.pdf-parser.execute",
    "document-processor.text-extraction-workflow.execute", 
    "document-processor.document-store-rag.index"
  ]
}

// Search interface
{
  "client_id": "search-ui",
  "component_scopes": [
    "document-processor.document-classifier-agent.execute",
    "document-processor.document-store-rag.search",
    "document-processor.document-store-rag.retrieve"
  ]
}
```

## Security Considerations

### Principle of Least Privilege
- Grant minimum necessary scopes for client functionality
- Use component-specific scopes instead of broad type scopes when possible
- Regular audits of client permissions

### Scope Validation
- Always validate scopes server-side before component access
- Log all scope checks for audit trails
- Fail securely - deny access if scope validation fails

### Token Security
- Include granted scopes in JWT tokens
- Validate token scopes match requested actions
- Implement scope-based rate limiting

## Benefits of This Strategy

### For Administrators
- **Flexible Permissions**: Can grant broad or granular access as needed
- **Clear Patterns**: Predictable scope naming makes management easier
- **Application Boundaries**: Natural grouping aligns with business logic

### For Developers
- **Standardized Actions**: Consistent verbs across component types
- **Custom Extensions**: Can define specialized actions when needed
- **Clear Validation**: Hierarchical checking is easy to understand

### For Security
- **Granular Control**: Component-level permissions support zero-trust
- **Audit Trails**: Clear scope patterns enable detailed logging
- **Principle of Least Privilege**: Easy to grant minimal necessary permissions

## Conclusion

The **Hybrid Hierarchical Strategy** provides the optimal balance of flexibility, security, and manageability for our OAuth scope system. It supports both broad administrative permissions and granular component access while maintaining backward compatibility with existing implementations.

This strategy scales with the system's growth, provides clear patterns for developers and administrators, and maintains the security posture required for a production system managing sensitive AI capabilities.

## Implementation Tasks

1. **Update Scope Validation Logic**: Implement hierarchical scope checking
2. **Standardize Component Definitions**: Migrate existing components to new patterns
3. **Update Admin UI**: Support new scope management patterns
4. **Documentation**: Update client integration guides
5. **Migration Tools**: Provide scripts for bulk permission updates
6. **Testing**: Comprehensive testing of new scope validation logic

---

**Related Documents**:
- [Application Scopes Documentation](./APPLICATION_SCOPES.md)
- [Authentication Setup Guide](./AUTHENTICATION.md)
- [API Routes Documentation](./API_ROUTES.md)
