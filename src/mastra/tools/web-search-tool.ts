import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Placeholder web search tool.
 * Replace this with a real provider integration (e.g., Tavily, SerpAPI).
 */
export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for up-to-date information.',
  inputSchema: z.object({
    query: z.string().min(1, 'query is required'),
    maxResults: z.number().min(1).max(10).optional().default(5),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })
    ),
    provider: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    // TODO: integrate real web search provider
    return {
      results: [],
      provider: 'not-configured',
      error: 'Web search provider not configured',
    };
  },
});
