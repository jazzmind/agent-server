import { authRoutes } from "./auth-routes";
import { ragRoutes } from "./rag-routes";
import { mcpRoutes } from "./mcp-routes";
import { clientRoutes } from "./client-routes";
import { applicationRoutes } from "./application-routes";
import { agentRoutes } from "./agent-routes";
import { workflowRoutes } from "./workflow-routes";
import { resourceRoutes } from "./resources-routes";
import { healthRoutes } from "./health-routes";

// Export all routes as an array for easy registration
export const apiRoutes = [
    ...healthRoutes,
    ...authRoutes,
    ...agentRoutes,
    ...workflowRoutes,
    ...ragRoutes,
    ...mcpRoutes,
    ...clientRoutes,
    ...applicationRoutes,
    ...resourceRoutes,
  ];