# Application-Based Scope Management

## Overview

The Agent Server now supports application-based scope management, allowing you to organize agents, workflows, tools, and RAG databases into logical applications and grant clients granular access to specific application components.

## Architecture

### Before: Global Scopes
Previously, clients had global scopes that granted access to all resources of a given type:
```
Client A: ['agent.execute', 'workflow.execute'] → Access to ALL agents and workflows
```

### After: Application-Based Scopes
Now, clients can be granted specific scopes for individual applications:
```
Client A: 
  - Weather App: ['agent.execute', 'rag.read']
  - Document App: ['workflow.execute']
Client B:
  - Weather App: ['rag.read'] (read-only access)
```

## Database Schema

### Applications
```sql
applications (
  id UUID PRIMARY KEY,
  name VARCHAR(255) UNIQUE,           -- machine-readable name
  display_name VARCHAR(255),          -- human-readable name  
  description TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Application Components
```sql
application_components (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES applications(id),
  component_type VARCHAR(50),         -- 'agent', 'workflow', 'tool', 'rag_database'
  component_id UUID,                  -- References the actual component
  component_name VARCHAR(255),        -- Denormalized for easier queries
  scopes TEXT[],                      -- Required scopes for this component
  created_at TIMESTAMP
)
```

### Client Permissions
```sql
application_client_permissions (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) REFERENCES client_registrations(client_id),
  application_id UUID REFERENCES applications(id),
  component_scopes TEXT[],            -- Scopes granted to this client for this app
  granted_by VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## API Endpoints

### Application Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/applications` | List all applications |
| POST | `/applications` | Create new application |
| GET | `/applications/:id` | Get application details with components and permissions |
| PUT | `/applications/:id` | Update application details |
| DELETE | `/applications/:id` | Delete application (cascades to components and permissions) |

### Component Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/applications/:id/components` | Add component to application |
| DELETE | `/applications/:id/components/:type/:componentId` | Remove component from application |

### Permission Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/applications/:id/permissions` | Grant client permission to application |
| DELETE | `/applications/:id/permissions/:clientId` | Revoke client permission from application |
| GET | `/clients/:clientId/permissions` | Get all application permissions for a client |

## Usage Examples

### 1. Create an Application

```bash
curl -X POST https://your-agent-server.com/applications \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-service",
    "display_name": "Weather Service Application",
    "description": "Provides weather data and forecasting capabilities"
  }'
```

### 2. Add Components to Application

```bash
# Add a weather agent
curl -X POST https://your-agent-server.com/applications/$APP_ID/components \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "component_type": "agent",
    "component_id": "weather-agent-v1",
    "component_name": "Weather Agent",
    "scopes": ["agent.execute", "weather.read"]
  }'

# Add a RAG database
curl -X POST https://your-agent-server.com/applications/$APP_ID/components \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "component_type": "rag_database",
    "component_id": "weather-knowledge-base",
    "component_name": "Weather Knowledge Base",
    "scopes": ["rag.read", "rag.search"]
  }'
```

### 3. Grant Client Access

```bash
curl -X POST https://your-agent-server.com/applications/$APP_ID/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "weather-mobile-app",
    "component_scopes": ["agent.execute", "rag.read"],
    "granted_by": "admin"
  }'
```

## Admin UI

The admin interface includes a new "Applications" tab that provides:

1. **Application Management**
   - Create, edit, and delete applications
   - View application details and descriptions

2. **Component Management**
   - Add agents, workflows, tools, and RAG databases to applications
   - Define required scopes for each component
   - Visual component type indicators

3. **Permission Management**
   - Grant specific scopes to clients for applications
   - Visual scope management with checkboxes
   - View existing client permissions

## Scope Validation

### Legacy Compatibility
The system maintains backward compatibility with existing global scopes:

```typescript
// This still works for existing clients with global scopes
if (clientHasGlobalScope(clientId, 'agent.execute')) {
  // Allow access
}
```

### Application-Aware Validation
New validation functions check both legacy and application-specific scopes:

```typescript
// Enhanced validation
const hasAccess = await verifyApplicationScope(
  clientId, 
  'weather-service',
  'agent.execute'
);
```

### Validation Flow
1. Check if client has legacy global scope for the requested action
2. If not, check application-specific permissions
3. Grant access if either check passes

## Migration Strategy

### Phase 1: Add Application Support (Current)
- ✅ Database schema for applications and permissions
- ✅ API endpoints for application management
- ✅ Admin UI for managing applications
- ✅ Backward-compatible scope validation

### Phase 2: Migrate Existing Components (Next)
- Create default applications for existing agents, workflows, tools
- Migrate existing client scopes to application-specific permissions
- Provide migration tools and documentation

### Phase 3: Deprecate Global Scopes (Future)
- Add warnings for global scope usage
- Provide migration timeline
- Remove global scope support

## Best Practices

### Application Design
1. **Logical Grouping**: Group related components that work together
2. **Granular Scopes**: Define specific scopes for different access levels
3. **Clear Naming**: Use descriptive names and descriptions
4. **Documentation**: Document application purpose and components

### Permission Management
1. **Principle of Least Privilege**: Grant only necessary scopes
2. **Regular Audits**: Review client permissions periodically
3. **Scope Documentation**: Document what each scope grants access to
4. **Testing**: Test application access before granting to clients

### Client Integration
1. **Scope Requests**: Request specific scopes for specific applications
2. **Error Handling**: Handle scope-related errors gracefully
3. **Token Management**: Use application-specific tokens when possible
4. **Documentation**: Document required scopes for your application

## Available Scopes

### Agent Scopes
- `agent.read` - Read agent definitions
- `agent.write` - Modify agent definitions
- `agent.execute` - Execute agents

### Workflow Scopes
- `workflow.read` - Read workflow definitions
- `workflow.write` - Modify workflow definitions
- `workflow.execute` - Execute workflows

### Tool Scopes
- `tool.read` - Read tool definitions
- `tool.write` - Modify tool definitions
- `tool.execute` - Execute tools

### RAG Scopes
- `rag.read` - Read RAG database contents
- `rag.write` - Modify RAG database contents
- `rag.search` - Search RAG databases

### Admin Scopes
- `admin.read` - Read admin functions
- `admin.write` - Modify admin functions

## Security Considerations

1. **Scope Validation**: Always validate scopes on the server side
2. **Token Security**: Protect access tokens appropriately
3. **Audit Logging**: Log permission grants and scope usage
4. **Regular Reviews**: Periodically review application permissions
5. **Client Authentication**: Ensure proper client authentication

## Troubleshooting

### Common Issues

1. **Scope Denied Errors**
   - Check if client has required scope for the application
   - Verify application exists and contains the component
   - Check if component requires additional scopes

2. **Application Not Found**
   - Verify application ID/name is correct
   - Check if application was deleted
   - Ensure proper API authentication

3. **Permission Not Working**
   - Verify permission was granted correctly
   - Check scope spelling and casing
   - Ensure client ID matches exactly

### Debug Commands

```bash
# Check client permissions
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-agent-server.com/clients/$CLIENT_ID/permissions

# Check application details
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-agent-server.com/applications/$APP_ID

# List all applications
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-agent-server.com/applications
```
