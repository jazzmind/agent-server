import { registerApiRoute } from '@mastra/core/server';
import { MCPServerService } from '../mastra/services/mcp-server';
import { verifyAdminBearerToken } from '../mastra/auth/auth-utils';

// Initialize MCP server service
const mcpServerService = new MCPServerService();

/**
 * Create/Initialize MCP server endpoint
 */
export const createMCPServerRoute = registerApiRoute('/mcp/server', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
      // Parse request body
      const config = await c.req.json().catch(() => ({}));
      
      // Create MCP server
      const mcpServer = await mcpServerService.createMCPServer(config);
      
      return c.json({ 
        message: 'MCP server created successfully',
        serverInfo: mcpServer.getServerInfo()
      }, 201);
    } catch (error: any) {
      console.error('Failed to create MCP server:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Get MCP server information
 */
export const getMCPServerInfoRoute = registerApiRoute('/mcp/server', {
  method: 'GET',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin read permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.read']);
      
      // Get MCP server info
      const serverInfo = mcpServerService.getMCPServerInfo();
      
      if (!serverInfo) {
        return c.json({ 
          error: 'MCP server not initialized',
          details: 'Call POST /mcp/server to create the server first'
        }, 404);
      }
      
      return c.json(serverInfo);
    } catch (error: any) {
      console.error('Failed to get MCP server info:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * Reload MCP server with updated definitions
 */
export const reloadMCPServerRoute = registerApiRoute('/mcp/server/reload', {
  method: 'POST',
  handler: async (c) => {
    try {
      // Verify Bearer token with admin write permission
      const authHeader = c.req.header('Authorization');
      await verifyAdminBearerToken(authHeader, ['admin.write']);
      
      // Parse request body
      const config = await c.req.json().catch(() => ({}));
      
      // Reload MCP server
      const mcpServer = await mcpServerService.reloadMCPServer(config);
      
      return c.json({ 
        message: 'MCP server reloaded successfully',
        serverInfo: mcpServer.getServerInfo()
      });
    } catch (error: any) {
      console.error('Failed to reload MCP server:', error);
      return c.json({ error: 'Server error', details: error.message }, 500);
    }
  },
});

/**
 * MCP HTTP transport endpoint
 */
export const mcpHttpRoute = registerApiRoute('/mcp', {
  method: 'POST',
  handler: async (c) => {
    try {
      const url = new URL(c.req.url);
      
      // Get or create MCP server
      let mcpServer = mcpServerService.getMCPServer();
      if (!mcpServer) {
        // Auto-create with default configuration
        mcpServer = await mcpServerService.createMCPServer();
      }
      
      // Start HTTP transport
      await mcpServerService.startHTTP({
        url,
        httpPath: '/mcp',
        req: c.req.raw,
        res: c.res,
      });
      
      // Response is handled by MCP server
      return c.newResponse(null, 200);
    } catch (error: any) {
      console.error('MCP HTTP transport error:', error);
      return c.json({ error: 'MCP transport error', details: error.message }, 500);
    }
  },
});

/**
 * MCP SSE transport endpoint
 */
export const mcpSseRoute = registerApiRoute('/mcp/sse', {
  method: 'GET',
  handler: async (c) => {
    try {
      const url = new URL(c.req.url);
      
      // Get or create MCP server
      let mcpServer = mcpServerService.getMCPServer();
      if (!mcpServer) {
        // Auto-create with default configuration
        mcpServer = await mcpServerService.createMCPServer();
      }
      
      // Start SSE transport
      await mcpServerService.startSSE({
        url,
        ssePath: '/mcp/sse',
        messagePath: '/mcp/message',
        req: c.req.raw,
        res: c.res,
      });
      
      // Response is handled by MCP server
      return c.newResponse(null, 200);
    } catch (error: any) {
      console.error('MCP SSE transport error:', error);
      return c.json({ error: 'MCP transport error', details: error.message }, 500);
    }
  },
});

/**
 * MCP message endpoint for SSE transport
 */
export const mcpMessageRoute = registerApiRoute('/mcp/message', {
  method: 'POST',
  handler: async (c) => {
    try {
      const url = new URL(c.req.url);
      
      // Get or create MCP server
      let mcpServer = mcpServerService.getMCPServer();
      if (!mcpServer) {
        // Auto-create with default configuration
        mcpServer = await mcpServerService.createMCPServer();
      }
      
      // Start SSE transport (handles both SSE and message endpoints)
      await mcpServerService.startSSE({
        url,
        ssePath: '/mcp/sse',
        messagePath: '/mcp/message',
        req: c.req.raw,
        res: c.res,
      });
      
      // Response is handled by MCP server
      return c.newResponse(null, 200);
    } catch (error: any) {
      console.error('MCP message transport error:', error);
      return c.json({ error: 'MCP transport error', details: error.message }, 500);
    }
  },
});

// Export all MCP routes
export const mcpRoutes = [
  createMCPServerRoute,
  getMCPServerInfoRoute,
  reloadMCPServerRoute,
  mcpHttpRoute,
  mcpSseRoute,
  mcpMessageRoute,
];
