# Agent Server Architecture

## Overview

The Agent Server is a production-ready Mastra-powered system that provides:
- Secure OAuth 2.0 authentication with scope-based authorization
- Dynamic agent/workflow/tool loading from PostgreSQL database
- Client management with granular permissions
- Admin UI for comprehensive system management
- Foundation for RAG database management (planned)
- MCP server integration for external tool access (planned)

## System Architecture

```mermaid
graph TB
    subgraph "Admin Client (Next.js)"
        AdminUI[Admin UI]
        ClientMgmt[Client Management]
        AgentMgmt[Agent Management]
        RAGMgmt[RAG Management]
        ToolMgmt[Tool Management]
    end
    
    subgraph "Agent Server (Mastra)"
        AuthRoutes[Auth Routes]
        DynamicLoader[Dynamic Loader]
        WeatherAgent[Weather Agent]
        MCPServer[MCP Server]
        RAGService[RAG Service]
    end
    
    subgraph "Database Layer"
        PostgreSQL[(PostgreSQL)]
        RAGDatabases[(RAG Databases)]
    end
    
    AdminUI --> AuthRoutes
    ClientMgmt --> AuthRoutes
    AgentMgmt --> DynamicLoader
    RAGMgmt --> RAGService
    ToolMgmt --> DynamicLoader
    
    AuthRoutes --> PostgreSQL
    DynamicLoader --> PostgreSQL
    RAGService --> RAGDatabases
    MCPServer --> DynamicLoader
    
    WeatherAgent --> RAGService
```

## Components

### 1. Authentication System

**Location**: `src/mastra/auth/auth-routes.ts`

**Responsibilities**:
- OAuth 2.0 client credentials flow
- Management client authentication for admin operations
- Scope-based authorization
- Client registration, update, and deletion
- JWT token generation and verification

**Key Features**:
- Environment-based security with management client credentials
- PostgreSQL-backed client storage with memory fallback
- Comprehensive error handling and logging
- JWKS endpoint for public key discovery

**Database Tables**:
```sql
client_registrations (
  client_id VARCHAR(255) PRIMARY KEY,
  client_secret VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  registered_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### 2. Dynamic Loading System

**Location**: `src/mastra/services/dynamic-loader.ts`

**Responsibilities**:
- Load agents, workflows, and tools from database
- Combine hardcoded and dynamic definitions
- Hot-reload support for runtime updates
- Schema parsing and validation

**Key Features**:
- PostgreSQL-based storage for definitions
- Safe code execution for dynamic tools
- Comprehensive error handling
- Memory caching for performance

**Database Tables**:
```sql
agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  model VARCHAR(255) NOT NULL DEFAULT 'gpt-5',
  tools JSONB DEFAULT '[]',
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,
  triggers JSONB DEFAULT '[]',
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  execute_code TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### 3. Admin Client System

**Location**: `agent-client/`

**Responsibilities**:
- Secure admin interface with OAuth 2.0
- Client management (CRUD operations)
- Agent/workflow/tool management UI
- Chat interface for testing
- RAG database management (planned)

**Key Components**:
- Next.js API routes as proxy layer
- React components with modern UI
- Environment-based configuration
- Comprehensive error handling

**Security Model**:
- Management client pattern for admin operations
- Server-to-server authentication
- Scope-based access control
- Input validation and sanitization

## Security Architecture

### Authentication Flow

1. **Management Client Authentication**:
   ```
   Admin UI → Management Credentials → Agent Server → PostgreSQL
   ```

2. **Regular Client Authentication**:
   ```
   Client → OAuth 2.0 → Access Token → Protected Resources
   ```

3. **Scope Verification**:
   ```
   Request → Token Validation → Scope Check → Resource Access
   ```

### Security Features

- **Environment Variable Security**: Sensitive credentials stored securely
- **Management Client Pattern**: Separate elevated credentials for admin operations
- **Scope-Based Authorization**: Granular permissions for different operations
- **Input Validation**: Comprehensive validation and sanitization
- **Error Handling**: Security-conscious error messages
- **Database Security**: Prepared statements and proper escaping

## Data Flow

### Client Registration Flow

1. Admin UI sends registration request with management credentials
2. Agent server verifies management client credentials
3. New client credentials generated and stored in database
4. Client secret returned to admin for secure storage

### Agent Execution Flow

1. Client requests access token with OAuth 2.0
2. Agent server validates credentials and generates JWT
3. Client uses JWT to access agent endpoints
4. Agent server validates JWT and scopes before execution

### Dynamic Loading Flow

1. Agent server startup triggers dynamic loader
2. Database queried for active definitions
3. Agents/workflows/tools instantiated from definitions
4. Combined with hardcoded definitions in Mastra instance

## Environment Variables

### Agent Server
```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Management Client
MANAGEMENT_CLIENT_ID=admin-client
MANAGEMENT_CLIENT_SECRET=secure-secret-here

# Token Service
TOKEN_SERVICE_PRIVATE_KEY={"kty":"OKP",...}
TOKEN_SERVICE_PUBLIC_KEY={"kty":"OKP",...}
MASTRA_JWT_SECRET=jwt-secret-here

# Optional
NODE_ENV=development|production
KEYS_DIR=keys
SERVERS_DB_FILE=servers.json
```

### Admin Client
```bash
# Server Configuration
MASTRA_API_URL=https://agent-server.vercel.app

# Management Client (same as agent server)
MANAGEMENT_CLIENT_ID=admin-client
MANAGEMENT_CLIENT_SECRET=secure-secret-here

# Chat Client
CLIENT_ID=admin-ui-client
CLIENT_SECRET=generated-from-registration

# OAuth
TOKEN_SERVICE_URL=https://agent-server.vercel.app
TOKEN_SERVICE_AUD=https://tools.local/admin
```

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/.well-known/jwks.json` | Public keys for JWT verification | None |
| POST | `/token` | OAuth 2.0 token endpoint | Client credentials |
| POST | `/clients/register` | Register new client | Management client |
| GET | `/clients` | List all clients | Management client |
| DELETE | `/clients/:clientId` | Delete client | Management client |
| POST | `/admin/reload` | Reload dynamic definitions | Management client |
| GET | `/auth/health` | System health check | None |

### Admin Client Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/clients` | List clients |
| POST | `/api/admin/clients` | Register client |
| DELETE | `/api/admin/clients/[clientId]` | Delete client |
| PATCH | `/api/admin/clients/[clientId]` | Update client scopes |

## Available Scopes

- `weather.read` - Read weather information
- `weather.write` - Modify weather settings
- `agent.execute` - Execute agents
- `workflow.execute` - Run workflows
- `tool.execute` - Use tools
- `admin.read` - Read admin functions
- `admin.write` - Write admin functions
- `rag.read` - Read RAG databases (planned)
- `rag.write` - Modify RAG databases (planned)
- `mcp.access` - Access MCP resources (planned)

## Testing Strategy

### Current Testing Gaps

1. **Unit Tests**: Missing for all components
2. **Integration Tests**: No automated testing of auth flow
3. **Security Tests**: No automated security validation
4. **Performance Tests**: No load testing
5. **Database Tests**: No schema validation tests

### Planned Testing

1. **Unit Tests**:
   - Authentication functions
   - Dynamic loader components
   - Admin API endpoints
   - Utility functions

2. **Integration Tests**:
   - End-to-end authentication flow
   - Client registration and management
   - Agent execution with different scopes
   - Database operations

3. **Security Tests**:
   - Unauthorized access attempts
   - Scope enforcement validation
   - Input sanitization tests
   - Token expiration handling

## Deployment Architecture

### Development
- Local PostgreSQL instance
- File-based key storage
- Development environment variables
- Hot-reload for rapid iteration

### Production
- Managed PostgreSQL (e.g., Vercel Postgres)
- Environment variable key storage
- Production security settings
- Monitoring and logging

## Current Gaps and Limitations

### Technical Gaps

1. **RAG Integration**: No RAG database management system
2. **MCP Server**: No Model Context Protocol server implementation
3. **Testing**: Comprehensive test suite missing
4. **Monitoring**: No metrics or observability
5. **Documentation**: API documentation incomplete

### Security Gaps

1. **Rate Limiting**: No protection against abuse
2. **Audit Logging**: No audit trail for admin operations
3. **Secret Rotation**: No automated secret rotation
4. **Input Validation**: Limited validation on dynamic code execution
5. **CORS**: Basic CORS configuration

### Operational Gaps

1. **Backup Strategy**: No automated database backups
2. **Health Checks**: Limited health monitoring
3. **Error Tracking**: No centralized error tracking
4. **Performance Monitoring**: No performance metrics
5. **Scaling**: No horizontal scaling considerations

### User Experience Gaps

1. **Agent Management**: Limited UI for agent creation
2. **Workflow Builder**: No visual workflow editor
3. **Tool Editor**: No code editor for custom tools
4. **Documentation**: User guides incomplete
5. **Error Messages**: User-friendly error messages needed

## Future Enhancements

### Immediate (Current Sprint)

1. **RAG Database Management**:
   - Multiple RAG database support
   - Document upload and management
   - Search and retrieval interfaces
   - Vector store integration

2. **MCP Server Integration**:
   - MCPServer wrapper for agents
   - Tool and resource exposure
   - Protocol compliance
   - External system integration

3. **Testing Infrastructure**:
   - Unit test framework setup
   - Integration test suite
   - Security test automation
   - Performance benchmarks

### Medium Term

1. **Enhanced Security**:
   - Rate limiting implementation
   - Audit logging system
   - Secret rotation automation
   - Advanced input validation

2. **Improved UX**:
   - Visual workflow builder
   - Code editor integration
   - Real-time collaboration
   - Better error handling

3. **Operational Excellence**:
   - Monitoring and alerting
   - Automated backups
   - Health check improvements
   - Documentation completion

### Long Term

1. **Advanced Features**:
   - Multi-tenant support
   - Advanced analytics
   - A/B testing framework
   - Machine learning insights

2. **Enterprise Features**:
   - SSO integration
   - Advanced RBAC
   - Compliance reporting
   - Enterprise-grade security

## Conclusion

The current architecture provides a solid foundation for a production-ready agent management system. The security model is robust, the dynamic loading system is flexible, and the admin interface is comprehensive. The planned RAG and MCP integrations will significantly enhance the system's capabilities while maintaining security and reliability standards.
