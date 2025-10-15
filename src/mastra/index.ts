
import { webcrypto } from 'crypto';

// Polyfill for Node.js 18
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

import { Mastra } from '@mastra/core/mastra';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { weatherTool } from './tools/weather-tool';
import { VercelDeployer } from "@mastra/deployer-vercel";
import { ConsoleLogger } from '@mastra/core/logger';
import { apiRoutes } from '../api/index';
import { DynamicLoader } from './services/dynamic-loader';
import { verifyBearerToken } from './auth/auth-utils';

// Initialize dynamic loader
const dynamicLoader = new DynamicLoader();
// Enhance Mastra instance with dynamic features
async function enhanceMastraWithDynamicFeatures(): Promise<{ allAgents: Record<string, any>; allWorkflows: Record<string, any>; allScorers: Record<string, any>; allTools: Record<string, any>; allNetworks: Record<string, any> }> {
  try {
    console.log('🔄 Loading dynamic agents, tools, workflows, scorers and networks...');
    
    // The dynamic loader will now properly wait for PostgreSQL to be ready
    const allAgents = await dynamicLoader.getAllAgents({ weatherAgent });
    const allWorkflows = await dynamicLoader.getAllWorkflows({ weatherWorkflow });
    const allScorers = await dynamicLoader.getAllScorers({  });
    const allTools = await dynamicLoader.getAllTools({ weatherTool });
    const allNetworks = await dynamicLoader.getAllNetworks({  });

    // Update the Mastra instance with dynamic features
    // Note: This is a simplified approach - in a real implementation,
    // you might need to use Mastra's hot-reload capabilities
    console.log(`✅ Loaded ${Object.keys(allAgents).length} agents, ${Object.keys(allTools).length} tools, ${Object.keys(allWorkflows).length} workflows, ${Object.keys(allScorers).length} scorers and ${Object.keys(allNetworks).length} networks`);
    console.log('✅ Enhanced Mastra with dynamic features');
    return { allAgents, allWorkflows, allScorers, allTools, allNetworks };
  } catch (error) {
    console.error('❌ Failed to enhance Mastra with dynamic features:', error);
  }
  return { allAgents: {}, allWorkflows: {}, allScorers: {}, allTools: {}, allNetworks: {} };
}

// Start enhancement process (now properly sequenced)
const { allAgents, allWorkflows, allScorers, allTools, allNetworks } = await enhanceMastraWithDynamicFeatures();

// Create base Mastra instance synchronously for telemetry extraction
// Note: We'll enhance this with shared storage and dynamic features after initialization
const config = {
  // Start with hardcoded agents/workflows, will be enhanced with dynamic ones at runtime
  agents: allAgents,
  workflows: allWorkflows,
  scorers: allScorers,
  logger: new ConsoleLogger(),
  // Start without storage to avoid duplicate connections - will be set up in enhancement
  server: {
    apiRoutes: apiRoutes,
    middleware: [
      {
        handler: async (c: any, next: any) => {
          // Skip auth for playground API routes in development
          // const url = new URL(c.req.url);
          // const isPlaygroundRoute = url.pathname.startsWith('/api/agents') ||
          //                          url.pathname.startsWith('/api/tools') ||
          //                          url.pathname.startsWith('/api/workflows') ||
          //                          url.pathname.startsWith('/api/networks') ||
          //                          url.pathname.startsWith('/api/scorers');

          // if (process.env.NODE_ENV === 'development' && isPlaygroundRoute) {
          //   await next();
          //   return;
          // }

          // Require auth for other /api/* routes
          const authHeader = c.req.header("Authorization");
          if (!authHeader) {
            return new Response("Unauthorized", { status: 401 });
          }
          // Verify Bearer token is valid; we'll check the scopes later
          await verifyBearerToken(authHeader, []);
          await next();
        },
        path: "/api/*",
      },
      // Add a global request logger
      async (c: any, next: any) => {
        console.log(`${c.req.method} ${c.req.url}`);
        await next();
      },
    ],
  },
  telemetry: {
    enabled: false
  }
} as any;

if (process.env.NODE_ENV === 'vercel') {
  config.deployer = new VercelDeployer();
}

export const mastra = new Mastra(config);

// Export dynamic loader for hot-reloading
export { dynamicLoader };

// Re-export memory config for convenience
// export { memoryConfig } from './config/memory';

