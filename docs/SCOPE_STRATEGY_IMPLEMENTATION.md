# OAuth Scope Strategy Implementation Guide

## Overview

This document provides concrete implementation examples for the Hybrid Hierarchical OAuth Scope Strategy, showing how to migrate from the current system and implement the new patterns.

## Current vs. Recommended Implementation

### Current Scope Validation (Legacy)

```typescript
// Current global scope check
const hasAccess = await verifyApplicationScope(
  clientId, 
  'weather-service',
  'agent.execute'
);
```

### New Hierarchical Scope Validation

```typescript
// Enhanced hierarchical validation
const hasAccess = await validateComponentAccess(
  clientId,
  'weather-service',        // application
  'agent',                  // component type
  'weather-agent-v1',      // component id
  'execute',               // action
  ['forecast', 'alerts']   // custom component scopes
);
```

## Implementation Steps

### Step 1: Update Scope Validation Logic

Create enhanced validation function in `/src/api/auth-routes.ts`:

```typescript
export async function validateComponentAccess(
  clientId: string,
  applicationName: string,
  componentType: string,
  componentId: string,
  action: string,
  customActions?: string[]
): Promise<boolean> {
  try {
    // Tier 1: Check global type scope (legacy compatibility)
    const globalScope = `${componentType}.${action}`;
    if (await verifyApplicationScope(clientId, applicationName, globalScope)) {
      console.log(`✅ Global scope granted: ${clientId} has ${globalScope}`);
      return true;
    }

    // Tier 2: Check application type scope
    const appTypeScope = `${applicationName}.${componentType}.${action}`;
    if (await verifyApplicationScope(clientId, applicationName, appTypeScope)) {
      console.log(`✅ App type scope granted: ${clientId} has ${appTypeScope}`);
      return true;
    }

    // Tier 3: Check component-specific scope
    const componentScope = `${applicationName}.${componentId}.${action}`;
    if (await verifyApplicationScope(clientId, applicationName, componentScope)) {
      console.log(`✅ Component scope granted: ${clientId} has ${componentScope}`);
      return true;
    }

    // Tier 4: Check custom component scopes
    if (customActions) {
      for (const customAction of customActions) {
        const customScope = `${applicationName}.${componentId}.${customAction}`;
        if (await verifyApplicationScope(clientId, applicationName, customScope)) {
          console.log(`✅ Custom scope granted: ${clientId} has ${customScope}`);
          return true;
        }
      }
    }

    console.log(`❌ Access denied: ${clientId} lacks access to ${componentType}:${componentId}.${action} in ${applicationName}`);
    return false;
  } catch (error: any) {
    console.error(`❌ Scope validation error: ${error.message}`);
    return false;
  }
}
```

### Step 2: Update Component Definition Service

Enhance the dynamic loader to support standardized and custom scopes:

```typescript
// In /src/mastra/services/dynamic-loader.ts

interface EnhancedComponentDefinition {
  id: string;
  name: string;
  scopes: string[];           // Standard + custom scopes
  custom_actions?: string[];  // Additional custom actions
}

export class ComponentScopeManager {
  // Standard actions for each component type
  private static STANDARD_ACTIONS = {
    agent: ['read', 'execute', 'chat', 'interrupt', 'memory.read', 'memory.write'],
    workflow: ['read', 'execute', 'trigger', 'monitor', 'suspend', 'resume'],
    tool: ['read', 'execute', 'invoke', 'configure'],
    rag_database: ['read', 'search', 'index', 'retrieve'],
    scorer: ['read', 'execute', 'score', 'benchmark'],
    network: ['read', 'execute', 'coordinate', 'monitor']
  };

  // Validate component scopes against standards
  static validateComponentScopes(
    componentType: string, 
    scopes: string[]
  ): { valid: string[], invalid: string[], custom: string[] } {
    const standardActions = this.STANDARD_ACTIONS[componentType] || [];
    const valid: string[] = [];
    const invalid: string[] = [];
    const custom: string[] = [];

    for (const scope of scopes) {
      // Extract action from scope (handle both type.action and custom patterns)
      const parts = scope.split('.');
      const action = parts.length > 1 ? parts.slice(1).join('.') : scope;

      if (standardActions.includes(action)) {
        valid.push(scope);
      } else if (scope.includes('.')) {
        // Custom scope (has namespace)
        custom.push(scope);
      } else {
        invalid.push(scope);
      }
    }

    return { valid, invalid, custom };
  }

  // Generate standard scopes for a component
  static generateStandardScopes(
    componentType: string,
    requiredActions: string[]
  ): string[] {
    const standardActions = this.STANDARD_ACTIONS[componentType] || [];
    return requiredActions
      .filter(action => standardActions.includes(action))
      .map(action => `${componentType}.${action}`);
  }
}
```

### Step 3: Update Agent Route Protection

Modify agent execution routes to use new validation:

```typescript
// In agent execution endpoint
export const executeAgentRoute = registerApiRoute('/agents/:agentId/execute', {
  method: 'POST',
  handler: async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const authHeader = c.req.header('Authorization');
      
      // Verify token and extract client info
      const tokenInfo = await verifyClientBearerToken(authHeader);
      const clientId = tokenInfo.clientId;

      // Find which application this agent belongs to
      const application = await applicationService.findApplicationByComponent(
        'agent', 
        agentId
      );
      
      if (!application) {
        return c.json({ error: 'Agent not found in any application' }, 404);
      }

      // Get agent definition to check for custom scopes
      const agent = await agentService.getAgent(agentId);
      const customActions = agent?.custom_actions || [];

      // Check hierarchical permissions
      const hasAccess = await validateComponentAccess(
        clientId,
        application.name,
        'agent',
        agentId,
        'execute',
        customActions
      );

      if (!hasAccess) {
        return c.json({ 
          error: 'insufficient_scope',
          required_scopes: [
            `agent.execute`,                    // Global
            `${application.name}.agent.execute`, // App type
            `${application.name}.${agentId}.execute` // Component
          ]
        }, 403);
      }

      // Execute agent...
      const result = await executeAgent(agentId, /* ... */);
      return c.json(result);
      
    } catch (error: any) {
      console.error('Agent execution error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
});
```

### Step 4: Update Admin UI for Scope Management

Enhance the admin interface to support hierarchical scope selection:

```typescript
// Component for scope selection in admin UI
interface ScopeManagerProps {
  applicationName: string;
  availableComponents: Component[];
  currentScopes: string[];
  onScopesChange: (scopes: string[]) => void;
}

export function HierarchicalScopeManager({ 
  applicationName, 
  availableComponents, 
  currentScopes, 
  onScopesChange 
}: ScopeManagerProps) {
  const [selectedLevel, setSelectedLevel] = useState<'global' | 'type' | 'component'>('component');

  const renderGlobalScopes = () => (
    <div className="space-y-2">
      <h4>Global Type Scopes (Legacy)</h4>
      {['agent.execute', 'workflow.execute', 'tool.execute', 'rag.search'].map(scope => (
        <label key={scope} className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={currentScopes.includes(scope)}
            onChange={(e) => handleScopeToggle(scope, e.target.checked)}
          />
          <span>{scope}</span>
          <span className="text-yellow-600 text-sm">(grants access to ALL {scope.split('.')[0]}s)</span>
        </label>
      ))}
    </div>
  );

  const renderApplicationTypeScopes = () => (
    <div className="space-y-2">
      <h4>Application Type Scopes</h4>
      {['agent', 'workflow', 'tool', 'rag_database'].map(type => (
        <div key={type} className="space-y-1">
          <h5>{type.toUpperCase()} Permissions</h5>
          {['read', 'execute', 'write'].map(action => {
            const scope = `${applicationName}.${type}.${action}`;
            return (
              <label key={scope} className="flex items-center space-x-2 ml-4">
                <input
                  type="checkbox"
                  checked={currentScopes.includes(scope)}
                  onChange={(e) => handleScopeToggle(scope, e.target.checked)}
                />
                <span>{scope}</span>
                <span className="text-blue-600 text-sm">(all {type}s in {applicationName})</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderComponentScopes = () => (
    <div className="space-y-4">
      <h4>Component-Specific Scopes</h4>
      {availableComponents.map(component => (
        <div key={component.id} className="border rounded p-3">
          <h5>{component.name} ({component.type})</h5>
          
          {/* Standard scopes */}
          <div className="mt-2">
            <h6 className="text-sm font-medium">Standard Actions</h6>
            {getStandardActionsForType(component.type).map(action => {
              const scope = `${applicationName}.${component.id}.${action}`;
              return (
                <label key={scope} className="flex items-center space-x-2 ml-2">
                  <input
                    type="checkbox"
                    checked={currentScopes.includes(scope)}
                    onChange={(e) => handleScopeToggle(scope, e.target.checked)}
                  />
                  <span>{scope}</span>
                </label>
              );
            })}
          </div>

          {/* Custom scopes */}
          {component.custom_actions && (
            <div className="mt-2">
              <h6 className="text-sm font-medium text-purple-700">Custom Actions</h6>
              {component.custom_actions.map(action => {
                const scope = `${applicationName}.${component.id}.${action}`;
                return (
                  <label key={scope} className="flex items-center space-x-2 ml-2">
                    <input
                      type="checkbox"
                      checked={currentScopes.includes(scope)}
                      onChange={(e) => handleScopeToggle(scope, e.target.checked)}
                    />
                    <span>{scope}</span>
                    <span className="text-purple-600 text-xs">(custom)</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Level selector */}
      <div className="flex space-x-4">
        <button
          className={`px-3 py-1 rounded ${selectedLevel === 'global' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSelectedLevel('global')}
        >
          Global Scopes
        </button>
        <button
          className={`px-3 py-1 rounded ${selectedLevel === 'type' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSelectedLevel('type')}
        >
          Type Scopes
        </button>
        <button
          className={`px-3 py-1 rounded ${selectedLevel === 'component' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSelectedLevel('component')}
        >
          Component Scopes
        </button>
      </div>

      {/* Scope selection based on level */}
      {selectedLevel === 'global' && renderGlobalScopes()}
      {selectedLevel === 'type' && renderApplicationTypeScopes()}
      {selectedLevel === 'component' && renderComponentScopes()}

      {/* Current selection summary */}
      <div className="mt-6 p-3 bg-gray-50 rounded">
        <h4>Selected Scopes ({currentScopes.length})</h4>
        <div className="text-sm space-y-1">
          {currentScopes.map(scope => (
            <div key={scope} className="flex justify-between">
              <span>{scope}</span>
              <button
                onClick={() => handleScopeToggle(scope, false)}
                className="text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Migration Examples

### Example 1: Migrating Weather Service

**Current Configuration**:
```json
{
  "client_id": "weather-mobile-app",
  "scopes": ["agent.execute", "weather.read"]
}
```

**Migrated Configuration**:
```json
{
  "client_id": "weather-mobile-app",
  "application_permissions": [
    {
      "application_name": "weather-service",
      "component_scopes": [
        "weather-service.weather-agent-v1.execute",
        "weather-service.weather-agent-v1.forecast",
        "weather-service.weather-data-rag.search"
      ]
    }
  ]
}
```

### Example 2: Admin Client Migration

**Current Configuration**:
```json
{
  "client_id": "admin-dashboard",
  "scopes": ["agent.read", "agent.write", "workflow.execute", "admin.write"]
}
```

**Migrated Configuration**:
```json
{
  "client_id": "admin-dashboard",
  "application_permissions": [
    {
      "application_name": "weather-service",
      "component_scopes": [
        "weather-service.agent.read",
        "weather-service.agent.write",
        "weather-service.workflow.execute"
      ]
    },
    {
      "application_name": "document-processor",
      "component_scopes": [
        "document-processor.agent.read",
        "document-processor.workflow.execute"
      ]
    }
  ]
}
```

## Testing the Implementation

### Unit Tests

```typescript
// Test scope validation logic
describe('validateComponentAccess', () => {
  it('should grant access with global scope', async () => {
    // Mock client with global scope
    mockClientScopes('test-client', ['agent.execute']);
    
    const hasAccess = await validateComponentAccess(
      'test-client',
      'weather-service',
      'agent',
      'weather-agent-v1',
      'execute'
    );
    
    expect(hasAccess).toBe(true);
  });

  it('should grant access with application type scope', async () => {
    mockClientScopes('test-client', ['weather-service.agent.execute']);
    
    const hasAccess = await validateComponentAccess(
      'test-client',
      'weather-service',
      'agent',
      'weather-agent-v1',
      'execute'
    );
    
    expect(hasAccess).toBe(true);
  });

  it('should grant access with component-specific scope', async () => {
    mockClientScopes('test-client', ['weather-service.weather-agent-v1.execute']);
    
    const hasAccess = await validateComponentAccess(
      'test-client',
      'weather-service',
      'agent',
      'weather-agent-v1',
      'execute'
    );
    
    expect(hasAccess).toBe(true);
  });

  it('should grant access with custom scope', async () => {
    mockClientScopes('test-client', ['weather-service.weather-agent-v1.forecast']);
    
    const hasAccess = await validateComponentAccess(
      'test-client',
      'weather-service',
      'agent',
      'weather-agent-v1',
      'forecast',
      ['forecast']
    );
    
    expect(hasAccess).toBe(true);
  });

  it('should deny access without proper scope', async () => {
    mockClientScopes('test-client', ['weather-service.weather-agent-v1.read']);
    
    const hasAccess = await validateComponentAccess(
      'test-client',
      'weather-service',
      'agent',
      'weather-agent-v1',
      'execute'
    );
    
    expect(hasAccess).toBe(false);
  });
});
```

### Integration Tests

```typescript
// Test end-to-end scope enforcement
describe('Agent Execution with Scopes', () => {
  it('should execute agent with proper scope', async () => {
    const client = await createTestClient('test-client', [
      'weather-service.weather-agent-v1.execute'
    ]);
    
    const token = await getAccessToken(client.id, client.secret, [
      'weather-service.weather-agent-v1.execute'
    ]);
    
    const response = await request(app)
      .post('/agents/weather-agent-v1/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What is the weather?' });
    
    expect(response.status).toBe(200);
  });

  it('should reject execution without proper scope', async () => {
    const client = await createTestClient('test-client', [
      'weather-service.weather-agent-v1.read' // Wrong scope
    ]);
    
    const token = await getAccessToken(client.id, client.secret, [
      'weather-service.weather-agent-v1.read'
    ]);
    
    const response = await request(app)
      .post('/agents/weather-agent-v1/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What is the weather?' });
    
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('insufficient_scope');
  });
});
```

## Performance Considerations

### Scope Caching

```typescript
// Cache scope validation results to reduce database queries
const scopeCache = new Map<string, { result: boolean, expires: number }>();

export async function validateComponentAccessCached(
  clientId: string,
  applicationName: string,
  componentType: string,
  componentId: string,
  action: string,
  customActions?: string[]
): Promise<boolean> {
  const cacheKey = `${clientId}:${applicationName}:${componentType}:${componentId}:${action}`;
  
  // Check cache
  const cached = scopeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }
  
  // Perform validation
  const result = await validateComponentAccess(
    clientId, applicationName, componentType, componentId, action, customActions
  );
  
  // Cache result for 5 minutes
  scopeCache.set(cacheKey, {
    result,
    expires: Date.now() + 5 * 60 * 1000
  });
  
  return result;
}
```

### Database Query Optimization

```sql
-- Index for efficient scope lookups
CREATE INDEX IF NOT EXISTS idx_application_client_permissions_client_scopes 
ON application_client_permissions USING gin(component_scopes);

-- Query to check all client scopes for an application
SELECT component_scopes 
FROM application_client_permissions 
WHERE client_id = $1 AND application_id = (
  SELECT id FROM applications WHERE name = $2
);
```

## Deployment Checklist

### Pre-Deployment
- [ ] Backup current client permissions
- [ ] Test scope validation logic with existing data
- [ ] Prepare migration scripts for client permissions
- [ ] Update admin UI components
- [ ] Create documentation for client developers

### Deployment
- [ ] Deploy new scope validation logic (backward compatible)
- [ ] Update admin UI to support hierarchical scopes
- [ ] Run migration scripts for existing clients
- [ ] Monitor scope validation performance
- [ ] Validate all existing clients still have access

### Post-Deployment
- [ ] Monitor application logs for scope-related errors
- [ ] Gather feedback from admin users on new UI
- [ ] Performance metrics for scope validation
- [ ] Plan timeline for deprecating global scopes

This implementation guide provides a complete roadmap for migrating to the new hierarchical scope strategy while maintaining backward compatibility and system stability.
