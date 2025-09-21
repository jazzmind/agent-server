
import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { VercelDeployer } from "@mastra/deployer-vercel";
 
export const mastra = new Mastra({
  deployer: new VercelDeployer(),
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
    // Disable default transports for serverless
    overrideDefaultTransports: true,
    transports: {},
  }),
});
