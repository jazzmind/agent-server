
import { Mastra } from '@mastra/core/mastra';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { VercelDeployer } from "@mastra/deployer-vercel";
import { createLogger } from '@mastra/core/logger';
import { PostgresStore } from '@mastra/pg';
import { MastraJwtAuth } from '@mastra/auth';
import { authRoutes } from './auth/auth-routes';
 
export const mastra = new Mastra({
  deployer: new VercelDeployer(),
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
  }),
  server: {
    experimental_auth: new MastraJwtAuth({
      secret: process.env.MASTRA_JWT_SECRET,
    }),
    apiRoutes: authRoutes,
  },
  bundler: {
    externals: ['jose', 'pg', '@mastra/pg'],
    sourcemap: false,
    transpilePackages: ['@mastra/core', '@mastra/auth']
  }
});

// Re-export memory config for convenience
// export { memoryConfig } from './config/memory';

