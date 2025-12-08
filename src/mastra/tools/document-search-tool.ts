import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Document Search Tool for RAG
 *
 * RLS-aware: callers should provide a Bearer token with role claims. If explicit
 * roles are provided, the tool will try to mint a scoped token via the authz
 * service. Falls back to a service key when provided.
 */

const SEARCH_API_URL = process.env.SEARCH_API_URL || 'http://10.96.200.204:8003';
const AUTHZ_API_URL = process.env.AUTHZ_API_URL || 'http://10.96.200.206:8002/authz/token';
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
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [DOCUMENT-SEARCH] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${SEARCH_API_TIMEOUT_MS}ms`);
      }
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [DOCUMENT-SEARCH] Retry ${attempt + 1}/${maxRetries} after error: ${lastError.message}`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
    }
  }
  throw lastError || new Error('Unknown fetch error');
}

async function mintScopedToken(roles: any[]): Promise<string | null> {
  try {
    const res = await fetch(AUTHZ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'agent-user', // TODO: pass real user id when available
        roles,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data.token as string;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  } catch (err) {
    console.warn('⚠️ [DOCUMENT-SEARCH] Authz mint failed', err);
    return null;
  }
}

function getAuthHeader(token?: string): Record<string, string> {
  if (token && token.length > 0) {
    return { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
  }
  if (SEARCH_API_SERVICE_KEY) {
    return {
      Authorization: `Bearer ${SEARCH_API_SERVICE_KEY}`,
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
- You want to provide context-aware answers based on the user's data`,
  inputSchema: z.object({
    authToken: z.string().optional().describe('User JWT. Optional if service key is configured.'),
    roles: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    })).optional().describe('Optional explicit role claims for scoped token minting'),
    query: z.string().min(1).describe('The search query'),
    limit: z.number().min(1).max(50).optional().default(5).describe('Max results (default 5, max 50)'),
    mode: z.enum(['hybrid', 'semantic', 'keyword']).optional().default('hybrid').describe('Search mode'),
    fileIds: z.array(z.string()).optional().describe('Optional filter to specific file IDs'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    resultCount: z.number(),
    context: z.string(),
    results: z.array(z.object({
      filename: z.string().optional(),
      text: z.string(),
      score: z.number(),
      pageNumber: z.number().optional(),
    })),
    error: z.string().optional(),
  }),
  execute: async ({ context }): Promise<SearchToolOutput> => {
    const { authToken, query, limit = 5, mode = 'hybrid', roles, fileIds } = context;
    console.log(`🔍 [DOCUMENT-SEARCH] Searching: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}" (mode=${mode}, limit=${limit})`);

    let bearer: string | undefined = authToken && authToken.length > 0 ? (authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`) : undefined;
    if ((!bearer) && roles && roles.length > 0) {
      const minted = await mintScopedToken(roles);
      if (minted) bearer = minted;
    }
    if (!bearer && !SEARCH_API_SERVICE_KEY) {
      return {
        found: false,
        resultCount: 0,
        context: '',
        results: [],
        error: 'Authentication required: provide authToken or configure SEARCH_API_SERVICE_KEY',
      };
    }

    const requestBody: Record<string, any> = {
      query,
      limit,
      mode,
      rerank: true,
    };
    if (fileIds && fileIds.length > 0) {
      requestBody.filters = { file_ids: fileIds };
    }

    try {
      const searchResponse = await fetchWithRetry(
        `${SEARCH_API_URL}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(bearer),
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error(`❌ [DOCUMENT-SEARCH] Search API error: ${searchResponse.status} - ${errorText}`);
        let errorMessage = `Search failed with status ${searchResponse.status}`;
        if (searchResponse.status === 401) errorMessage = 'Authentication failed.';
        else if (searchResponse.status === 403) errorMessage = 'Access denied.';
        else if (searchResponse.status === 404) errorMessage = 'Search service not found.';
        else if (searchResponse.status === 429) errorMessage = 'Rate limit exceeded.';
        return { found: false, resultCount: 0, context: '', results: [], error: errorMessage };
      }

      const data: SearchResponse = await searchResponse.json();
      if (!data.results || data.results.length === 0) {
        return { found: false, resultCount: 0, context: 'No relevant documents found.', results: [] };
      }

      const formattedResults = data.results.map((result) => ({
        filename: result.filename || `Document ${result.file_id.substring(0, 8)}`,
        text: result.text,
        score: result.score,
        pageNumber: result.page_number > 0 ? result.page_number : undefined,
      }));

      const contextParts = formattedResults.map((result, index) => {
        const pageInfo = result.pageNumber ? `, Page ${result.pageNumber}` : '';
        const source = `[Source: ${result.filename}${pageInfo}]`;
        return `--- Document ${index + 1} ${source} ---\n${result.text}`;
      });

      return {
        found: true,
        resultCount: formattedResults.length,
        context: contextParts.join('\n\n'),
        results: formattedResults,
      };
    } catch (error) {
      console.error('❌ [DOCUMENT-SEARCH] Error:', error);
      let errorMessage = 'Unknown search error';
      if (error instanceof Error) {
        if (error.message.includes('timed out')) errorMessage = 'Search request timed out.';
        else if (error.message.includes('ECONNREFUSED')) errorMessage = 'Could not connect to search service.';
        else errorMessage = error.message;
      }
      return { found: false, resultCount: 0, context: '', results: [], error: errorMessage };
    }
  },
});

export default documentSearchTool;
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Document Search Tool for RAG
 *
 * This tool searches the user's documents via the busibox search API
 * and returns relevant document chunks that can be used as context
 * for generating informed responses.
<<<<<<< Updated upstream
 * 
 * Authentication:
 * - For user requests: Pass the user's JWT token as authToken
 * - For service-level requests: Use SEARCH_API_SERVICE_KEY env var
=======
 *
 * RLS-aware: callers must pass a Bearer token that encodes role claims.
>>>>>>> Stashed changes
 */

// Service endpoints
const SEARCH_API_URL = process.env.SEARCH_API_URL || 'http://10.96.200.204:8003';
<<<<<<< Updated upstream
const SEARCH_API_SERVICE_KEY = process.env.SEARCH_API_SERVICE_KEY || '';
const SEARCH_API_TIMEOUT_MS = parseInt(process.env.SEARCH_API_TIMEOUT_MS || '30000', 10);
const SEARCH_API_MAX_RETRIES = parseInt(process.env.SEARCH_API_MAX_RETRIES || '2', 10);
=======
const AUTHZ_API_URL = process.env.AUTHZ_API_URL || 'http://10.96.200.206:8002/authz/token';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
    query: z.string().min(1).describe('The search query - use natural language to describe what you are looking for'),
    limit: z.number().min(1).max(50).optional().default(5).describe('Maximum number of results to return (default: 5, max: 50)'),
=======
    roles: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    })).optional().describe('Optional explicit role claims; if omitted, token is used as-is'),
    query: z.string().describe('The search query - use natural language to describe what you are looking for'),
    limit: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)'),
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  execute: async ({ context }): Promise<SearchToolOutput> => {
    const { authToken, query, limit = 5, mode = 'hybrid', fileIds } = context;
=======
  execute: async ({ context }) => {
    const { authToken, query, limit = 5, mode = 'hybrid', roles } = context;
>>>>>>> Stashed changes
    
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
      
<<<<<<< Updated upstream
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
=======
      // Optionally mint a scoped token with explicit roles (if provided)
      let bearer = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
      if (roles && roles.length > 0) {
        try {
          const res = await fetch(AUTHZ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: 'agent-user', // placeholder: upstream should pass actual user ID if needed
              roles,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            bearer = data.token.startsWith('Bearer ') ? data.token : `Bearer ${data.token}`;
            console.log('🔐 [DOCUMENT-SEARCH] Scoped token minted via authz');
          } else {
            console.warn('⚠️ [DOCUMENT-SEARCH] Failed to mint scoped token, falling back to provided token');
          }
        } catch (err) {
          console.warn('⚠️ [DOCUMENT-SEARCH] Authz token mint failed, falling back', err);
        }
      }

      // Call busibox search API
      const searchResponse = await fetch(`${SEARCH_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearer ? { 'Authorization': bearer } : {}),
        },
        body: JSON.stringify({
          query,
          limit,
          mode,
          rerank: true,  // Enable reranking for better results
        }),
      });
>>>>>>> Stashed changes
      
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
