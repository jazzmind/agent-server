import { Agent } from '@mastra/core/agent';
import { ai } from '../utils/ai';
import { MODELS } from '../config/models';
import { documentSearchTool } from '../tools/document-search-tool';

export const ragSearchAgent = new Agent({
  name: 'rag-search-agent',
  description: 'Searches user documents and returns grounded answers with citations.',
  instructions: `You are a RAG agent.
- Always call document-search first with the user's query.
- Ground your answer strictly in the returned snippets and cite filenames/pages.
- If no results, say so clearly.`,
  model: ai(MODELS.default.model),
  tools: {
    documentSearch: documentSearchTool,
  },
});
