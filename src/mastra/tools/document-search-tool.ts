import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Document Search Tool for RAG
 * 
 * This tool searches the user's documents via the busibox search API
 * and returns relevant document chunks that can be used as context
 * for generating informed responses.
 */

// Search API configuration
const SEARCH_API_URL = process.env.SEARCH_API_URL || 'http://10.96.200.204:8003';

interface SearchResult {
  file_id: string;
  filename?: string;
  chunk_index: number;
  page_number: number;
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  mode: string;
}

export const documentSearchTool = createTool({
  id: 'document-search',
  description: `Search through the user's uploaded documents to find relevant information.
Use this tool when:
- The user asks a question that might be answered by their documents
- You need to find specific information from uploaded files
- You want to provide context-aware answers based on the user's data

The tool returns relevant text chunks from documents that match the query.
Always use the returned text to inform your response - cite the source document when possible.

IMPORTANT: You must provide the authToken parameter to search the user's documents.`,
  inputSchema: z.object({
    authToken: z.string().describe('The user authentication token (JWT) for accessing their documents'),
    query: z.string().describe('The search query - use natural language to describe what you are looking for'),
    limit: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)'),
    mode: z.enum(['hybrid', 'semantic', 'keyword']).optional().default('hybrid').describe('Search mode: hybrid (recommended), semantic (meaning-based), or keyword (exact match)'),
  }),
  outputSchema: z.object({
    found: z.boolean().describe('Whether any relevant documents were found'),
    resultCount: z.number().describe('Number of results returned'),
    context: z.string().describe('Combined context from relevant document chunks'),
    results: z.array(z.object({
      filename: z.string().optional(),
      text: z.string(),
      score: z.number(),
      pageNumber: z.number().optional(),
    })).describe('Individual search results with source information'),
    error: z.string().optional().describe('Error message if search failed'),
  }),
  execute: async ({ context }) => {
    const { authToken, query, limit = 5, mode = 'hybrid' } = context;
    
    console.log(`🔍 [DOCUMENT-SEARCH] Searching for: "${query}" (mode: ${mode}, limit: ${limit})`);
    
    try {
      if (!authToken) {
        console.error('❌ [DOCUMENT-SEARCH] No auth token provided - cannot search user documents');
        return {
          found: false,
          resultCount: 0,
          context: '',
          results: [],
          error: 'Authentication required. Please provide authToken to search documents.',
        };
      }
      
      // Call busibox search API
      const searchResponse = await fetch(`${SEARCH_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          query,
          limit,
          mode,
          rerank: true,  // Enable reranking for better results
        }),
      });
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error(`❌ [DOCUMENT-SEARCH] Search API error: ${searchResponse.status} - ${errorText}`);
        return {
          found: false,
          resultCount: 0,
          context: '',
          results: [],
          error: `Search failed: ${searchResponse.status}`,
        };
      }
      
      const data: SearchResponse = await searchResponse.json();
      
      console.log(`✅ [DOCUMENT-SEARCH] Found ${data.results?.length || 0} results`);
      
      if (!data.results || data.results.length === 0) {
        return {
          found: false,
          resultCount: 0,
          context: 'No relevant documents found for this query.',
          results: [],
        };
      }
      
      // Format results for agent consumption
      const formattedResults = data.results.map((result, index) => ({
        filename: result.filename || `Document ${result.file_id}`,
        text: result.text,
        score: result.score,
        pageNumber: result.page_number || undefined,
      }));
      
      // Build combined context string for the LLM
      const contextParts = formattedResults.map((result, index) => {
        const source = result.filename ? `[Source: ${result.filename}${result.pageNumber ? `, Page ${result.pageNumber}` : ''}]` : '';
        return `--- Document ${index + 1} ${source} ---\n${result.text}`;
      });
      
      const combinedContext = contextParts.join('\n\n');
      
      console.log(`📄 [DOCUMENT-SEARCH] Returning ${formattedResults.length} chunks with ${combinedContext.length} chars of context`);
      
      return {
        found: true,
        resultCount: formattedResults.length,
        context: combinedContext,
        results: formattedResults,
      };
      
    } catch (error) {
      console.error('❌ [DOCUMENT-SEARCH] Error:', error);
      return {
        found: false,
        resultCount: 0,
        context: '',
        results: [],
        error: error instanceof Error ? error.message : 'Unknown search error',
      };
    }
  },
});

export default documentSearchTool;

