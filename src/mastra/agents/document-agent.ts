import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ai } from '../utils/ai';
import { documentSearchTool } from '../tools/document-search-tool';
import { Memory } from '@mastra/memory';
import { MODELS } from '../config/models';
import { getSharedPostgresStore } from '../utils/database';
import { getAccessToken } from '../utils/utils';

async function createDocumentAgent() {
  const sharedPgStore = await getSharedPostgresStore();
  
  return new Agent({
    name: 'Document Assistant',
    description: 'AI assistant that can search and answer questions about your uploaded documents',
    instructions: `You are an intelligent document assistant that helps users find information in their uploaded documents.

## Your Capabilities

1. **Document Search**: You can search through the user's documents to find relevant information
2. **Question Answering**: You provide accurate answers based on document content
3. **Citation**: You always cite which document and section your information comes from

## How to Answer Questions

When a user asks a question:

1. **Search First**: ALWAYS use the document-search tool to find relevant content
   - First, get an access token using the getDocumentAccessToken tool
   - Then use the document-search tool with that token and the user's query
   
2. **Use Retrieved Context**: Base your answer ONLY on the document content returned by the search
   - If the search returns relevant results, use them to answer the question
   - Quote or paraphrase the relevant sections
   - Cite the source document (filename, page number if available)

3. **Be Honest About Limitations**:
   - If no relevant documents are found, tell the user
   - If the answer is not in the documents, say so
   - Never make up information not present in the documents

## Response Format

When answering from documents:
- Start with a direct answer to the question
- Provide supporting details from the documents
- End with source citations

Example:
"Based on your documents, [answer]. According to [Document Name], [relevant quote/detail]. (Source: filename.pdf, Page X)"

## Tool Usage Flow

1. Call getDocumentAccessToken to get an authentication token
2. Call document-search with:
   - authToken: the token from step 1
   - query: the user's question or search terms
   - limit: 5 (default, increase for more comprehensive answers)
   - mode: "hybrid" (recommended for best results)
3. Use the returned context to formulate your answer

Remember: Always search the documents before answering. Never guess or make assumptions about document content.`,

    model: ai(MODELS.default.model),
    
    tools: {
      documentSearchTool,
      getDocumentAccessToken: createTool({
        id: "getDocumentAccessToken",
        description: "Get an access token for searching user documents. Call this first before using document-search.",
        inputSchema: z.object({}),
        outputSchema: z.object({
          authToken: z.string(),
        }),
        execute: async () => {
          try {
            const clientId = process.env.CLIENT_ID || "document-agent";
            const token = await getAccessToken(
              clientId,
              "https://search.busibox.local",
              ["documents.read", "search.execute"]
            );
            return { authToken: token };
          } catch (error) {
            console.error('Failed to get document access token:', error);
            // Return empty token - the search tool will handle the error
            return { authToken: '' };
          }
        },
      }),
    },
    
    memory: sharedPgStore ? new Memory({
      storage: sharedPgStore,
    }) : undefined,
  });
}

// Export the document agent (will be created with shared connection)
export const documentAgent = await createDocumentAgent();

