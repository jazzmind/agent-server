import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Document Search Tool for RAG
 * 
 * This tool searches the user's documents via the busibox search API
 * and returns relevant document chunks that can be used as context
 * for generating informed responses.
 * 
 * Authentication:
 * - For user requests: Pass the user's JWT token as authToken
 * - For service-level requests: Use SEARCH_API_SERVICE_KEY env var
 */

// Search API configuration
const SEARCH_API_URL = process.env.SEARCH_API_URL || 'http://10.96.200.204:8003';
const SEARCH_API_SERVICE_KEY = process.env.SEARCH_API_SERVICE_KEY || '';
const SEARCH_API_TIMEOUT_MS = parseInt(process.env.SEARCH_API_TIMEOUT_MS || '30000', 10);
const SEARCH_API_MAX_RETRIES = parseInt(process.env.SEARCH_API_MAX_RETRIES || '2', 10);

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

interface SearchToolOutput {
  found: boolean;
  resultCount: number;
  context: string;
  results: Array<{
    filename?: string;
    text: string;
    score: number;
    pageNumber?: number;
  }>;
  error?: string;
}

/**
 * Retry wrapper for fetch with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = SEARCH_API_MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_API_TIMEOUT_MS);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      
      // Retry on server errors (5xx) and rate limits
      if (response.status >= 500 || response.status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ [DOCUMENT-SEARCH] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a timeout
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${SEARCH_API_TIMEOUT_MS}ms`);
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [DOCUMENT-SEARCH] Retry ${attempt + 1}/${maxRetries} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Unknown fetch error');
}

/**
 * Get the appropriate authorization header
 * Priority: 1) User token, 2) Service key, 3) None
 */
function getAuthHeader(userToken?: string): Record<string, string> {
  if (userToken) {
    return {
      'Authorization': userToken.startsWith('Bearer ') ? userToken : `Bearer ${userToken}`,
    };
  }
  
  if (SEARCH_API_SERVICE_KEY) {
    return {
      'Authorization': `Bearer ${SEARCH_API_SERVICE_KEY}`,
      'X-Service-Request': 'true',
    };
  }
  
  return {};
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
    query: z.string().min(1).describe('The search query - use natural language to describe what you are looking for'),
    limit: z.number().min(1).max(50).optional().default(5).describe('Maximum number of results to return (default: 5, max: 50)'),
    mode: z.enum(['hybrid', 'semantic', 'keyword']).optional().default('hybrid').describe('Search mode: hybrid (recommended), semantic (meaning-based), or keyword (exact match)'),
    fileIds: z.array(z.string()).optional().describe('Optional: limit search to specific file IDs'),
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
  execute: async ({ context }): Promise<SearchToolOutput> => {
    const { authToken, query, limit = 5, mode = 'hybrid', fileIds } = context;
    
    console.log(`🔍 [DOCUMENT-SEARCH] Searching for: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}" (mode: ${mode}, limit: ${limit})`);
    
    try {
      // Validate auth token
      if (!authToken && !SEARCH_API_SERVICE_KEY) {
        console.error('❌ [DOCUMENT-SEARCH] No auth token provided and no service key configured');
        return {
          found: false,
          resultCount: 0,
          context: '',
          results: [],
          error: 'Authentication required. Please provide authToken to search documents.',
        };
      }
      
      // Build request body
      const requestBody: Record<string, any> = {
        query,
        limit,
        mode,
        rerank: true,
      };
      
      // Add file filter if specified
      if (fileIds && fileIds.length > 0) {
        requestBody.filters = { file_ids: fileIds };
      }
      
      // Call busibox search API with retry logic
      const searchResponse = await fetchWithRetry(
        `${SEARCH_API_URL}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(authToken),
          },
          body: JSON.stringify(requestBody),
        }
      );
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error(`❌ [DOCUMENT-SEARCH] Search API error: ${searchResponse.status} - ${errorText}`);
        
        // Provide specific error messages for common errors
        let errorMessage = `Search failed with status ${searchResponse.status}`;
        if (searchResponse.status === 401) {
          errorMessage = 'Authentication failed. The token may be invalid or expired.';
        } else if (searchResponse.status === 403) {
          errorMessage = 'Access denied. You may not have permission to search these documents.';
        } else if (searchResponse.status === 404) {
          errorMessage = 'Search service not found. Please verify the service is running.';
        } else if (searchResponse.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait and try again.';
        }
        
        return {
          found: false,
          resultCount: 0,
          context: '',
          results: [],
          error: errorMessage,
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
      const formattedResults = data.results.map((result) => ({
        filename: result.filename || `Document ${result.file_id.substring(0, 8)}`,
        text: result.text,
        score: result.score,
        pageNumber: result.page_number > 0 ? result.page_number : undefined,
      }));
      
      // Build combined context string for the LLM
      const contextParts = formattedResults.map((result, index) => {
        const pageInfo = result.pageNumber ? `, Page ${result.pageNumber}` : '';
        const source = `[Source: ${result.filename}${pageInfo}]`;
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
      
      let errorMessage = 'Unknown search error';
      if (error instanceof Error) {
        if (error.message.includes('timed out')) {
          errorMessage = 'Search request timed out. Please try again.';
        } else if (error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Could not connect to search service. Please verify the service is running.';
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        found: false,
        resultCount: 0,
        context: '',
        results: [],
        error: errorMessage,
      };
    }
  },
});

export default documentSearchTool;
