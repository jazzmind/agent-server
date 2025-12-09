import { Agent } from '@mastra/core/agent';
import { ai } from '../utils/ai';
import { MODELS } from '../config/models';
import { webSearchTool } from '../tools/web-search-tool';

export const webSearchAgent = new Agent({
  name: 'web-search-agent',
  description: 'Finds up-to-date information on the web.',
  instructions: `You are a web search specialist.
- Always call the web-search tool first with the user's query.
- Return concise answers and cite URLs.
- If the provider is not configured, explain that web search is unavailable.`,
  model: ai(MODELS.default.model),
  tools: {
    webSearch: webSearchTool,
  },
});
