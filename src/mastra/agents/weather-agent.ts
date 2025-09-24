import { ai } from '../utils/ai';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { weatherTool } from '../tools/weather-tool';
import { z } from 'zod';
import { getAccessToken } from "../utils/utils";
import { createTool } from '@mastra/core/tools';
import { getSharedPostgresStore } from '../utils/database';
import { MODELS } from '../config/models';

// Factory function to create weather agent with shared PostgreSQL connection
async function createWeatherAgent() {
  const sharedPgStore = await getSharedPostgresStore();
  
  return new Agent({
    name: 'Weather Agent',
    instructions: `
        You are a helpful weather assistant that provides accurate weather information and can help planning activities based on the weather.

        Your primary function is to help users get weather details for specific locations. When responding:
        - Always ask for a location if none is provided
        - If the location name isn't in English, please translate it
        - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
        - Include relevant details like humidity, wind conditions, and precipitation
        - Keep responses concise but informative
        - If the user asks for activities and provides the weather forecast, suggest activities based on the weather forecast.
        - If the user asks for activities, respond in the format they request.

        Use the weatherTool to fetch current weather data.
  `,
    model: ai(MODELS.default.model),
    tools: { 
      weatherTool,
      getAccessToken: createTool({
        id: "getAccessToken",
        description: "Get access token for reading tickets",
        inputSchema: z.object({}),
        outputSchema: z.object({
          authToken: z.string(),
        }),
        execute: async () => {
          const clientId = process.env.CLIENT_ID || "weather-agent";
          const token = await getAccessToken(
            clientId,
            "https://tools.local/weather", [
            "weather.read",
          ]);
          return { authToken: token };
        },
      }),
     },
    memory: sharedPgStore ? new Memory({
      storage: sharedPgStore,
    }) : undefined,
  });
}

// Export the weather agent (will be created with shared connection)
export const weatherAgent = await createWeatherAgent();
