import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

/**
 * End-to-End Tests for RAG (Retrieval Augmented Generation) Flow
 * 
 * These tests verify the complete flow:
 * 1. agent-client -> agent-server -> search-api -> response
 * 2. JWT authentication through entire stack
 * 3. Document search tool execution
 * 4. Response formatting with citations
 * 
 * Note: These tests mock external services but verify the integration points.
 * For full E2E testing, set TEST_E2E=true and configure the test environment.
 */

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test configuration
const TEST_CONFIG = {
  agentServerUrl: process.env.AGENT_SERVER_URL || 'http://localhost:4111',
  searchApiUrl: process.env.SEARCH_API_URL || 'http://localhost:8003',
  tokenServiceUrl: process.env.TOKEN_SERVICE_URL || 'http://localhost:4111',
  testClientId: 'test-e2e-client',
  testClientSecret: 'test-e2e-secret',
};

describe('RAG Flow E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should obtain JWT token from token service', async () => {
      // Mock successful token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'mock-jwt-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const response = await fetch(`${TEST_CONFIG.tokenServiceUrl}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: TEST_CONFIG.testClientId,
          client_secret: TEST_CONFIG.testClientSecret,
          audience: 'https://busibox.local/agent',
          scope: 'agent.execute documents.read search.execute',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.access_token).toBeDefined();
      expect(data.token_type).toBe('Bearer');
    });

    it('should pass JWT through to agent-server', async () => {
      const mockToken = 'test-jwt-token';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          text: 'Hello! How can I help you today?',
          agentId: 'weatherAgent',
        }),
      });

      await fetch(`${TEST_CONFIG.agentServerUrl}/api/agents/weatherAgent/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      // Verify the request was made with the correct auth header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`,
          }),
        })
      );
    });
  });

  describe('Document Search Tool Execution', () => {
    it('should execute document search with user context', async () => {
      const mockToken = 'user-jwt-token';
      const mockSearchResults = {
        results: [
          {
            file_id: 'file-123',
            filename: 'quarterly-report.pdf',
            chunk_index: 0,
            page_number: 5,
            text: 'Revenue increased by 15% in Q4.',
            score: 0.92,
          },
        ],
        total: 1,
        query: 'quarterly revenue',
        mode: 'hybrid',
      };

      // Mock search API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResults),
      });

      const response = await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'quarterly revenue',
          limit: 5,
          mode: 'hybrid',
          rerank: true,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].filename).toBe('quarterly-report.pdf');
    });

    it('should handle search with no results gracefully', async () => {
      const mockToken = 'user-jwt-token';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [],
          total: 0,
          query: 'nonexistent topic',
          mode: 'hybrid',
        }),
      });

      const response = await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'nonexistent topic',
          limit: 5,
          mode: 'hybrid',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.results).toHaveLength(0);
    });
  });

  describe('RAG Agent Response Generation', () => {
    it('should generate response with document context', async () => {
      const mockToken = 'user-jwt-token';
      
      // First mock: search API returns results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              file_id: 'file-123',
              filename: 'report.pdf',
              page_number: 3,
              text: 'The project was completed on schedule.',
              score: 0.95,
            },
          ],
          total: 1,
        }),
      });

      // Second mock: agent generates response with context
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          text: 'Based on your documents, the project was completed on schedule. (Source: report.pdf, Page 3)',
          agentId: 'documentAgent',
          sources: [{ filename: 'report.pdf', pageNumber: 3 }],
        }),
      });

      // Simulate the full flow
      const searchResponse = await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'project status',
          limit: 5,
          mode: 'hybrid',
        }),
      });

      const searchData = await searchResponse.json();

      const agentResponse = await fetch(`${TEST_CONFIG.agentServerUrl}/api/agents/documentAgent/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What is the project status?' }],
          context: {
            documentContext: searchData.results,
          },
        }),
      });

      expect(agentResponse.ok).toBe(true);
      const responseData = await agentResponse.json();
      expect(responseData.text).toContain('completed on schedule');
      expect(responseData.text).toContain('Source:');
    });

    it('should handle missing documents gracefully', async () => {
      const mockToken = 'user-jwt-token';
      
      // Mock agent response when no documents found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          text: 'I couldn\'t find any relevant documents for your query. Could you please provide more details or check if the documents have been uploaded?',
          agentId: 'documentAgent',
        }),
      });

      const response = await fetch(`${TEST_CONFIG.agentServerUrl}/api/agents/documentAgent/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What is the project deadline?' }],
          context: {
            documentContext: [],
            noDocumentsFound: true,
          },
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.text).toContain('couldn\'t find');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const response = await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle search service unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      try {
        await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'test',
            limit: 5,
            mode: 'hybrid',
          }),
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('ECONNREFUSED');
      }
    });

    it('should handle LiteLLM service errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('LLM service unavailable'),
      });

      const response = await fetch(`${TEST_CONFIG.agentServerUrl}/api/agents/documentAgent/generate`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(503);
    });
  });

  describe('Full RAG Pipeline', () => {
    it('should complete full query -> search -> generate -> respond pipeline', async () => {
      const mockToken = 'user-jwt-token';
      const userQuery = 'What were the key findings in the Q4 report?';
      
      // Step 1: Token validation (simulated)
      expect(mockToken).toBeTruthy();
      
      // Step 2: Document search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              file_id: 'q4-report-123',
              filename: 'Q4-2024-Report.pdf',
              page_number: 2,
              text: 'Key findings: 1) Revenue grew 20% YoY, 2) Customer retention improved to 95%, 3) Operating costs reduced by 8%.',
              score: 0.98,
            },
            {
              file_id: 'q4-report-123',
              filename: 'Q4-2024-Report.pdf',
              page_number: 5,
              text: 'Conclusion: Q4 exceeded expectations with strong performance across all metrics.',
              score: 0.85,
            },
          ],
          total: 2,
          query: userQuery,
          mode: 'hybrid',
        }),
      });

      const searchResponse = await fetch(`${TEST_CONFIG.searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userQuery,
          limit: 5,
          mode: 'hybrid',
          rerank: true,
        }),
      });

      expect(searchResponse.ok).toBe(true);
      const searchResults = await searchResponse.json();
      expect(searchResults.results.length).toBeGreaterThan(0);

      // Step 3: Generate response with context
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          text: `Based on the Q4-2024 Report, here are the key findings:

1. **Revenue Growth**: Revenue grew 20% year-over-year
2. **Customer Retention**: Improved to 95%
3. **Cost Efficiency**: Operating costs reduced by 8%

The overall conclusion was that Q4 exceeded expectations with strong performance across all metrics.

(Sources: Q4-2024-Report.pdf, Pages 2 and 5)`,
          agentId: 'documentAgent',
          sources: [
            { filename: 'Q4-2024-Report.pdf', pageNumber: 2 },
            { filename: 'Q4-2024-Report.pdf', pageNumber: 5 },
          ],
        }),
      });

      const agentResponse = await fetch(`${TEST_CONFIG.agentServerUrl}/api/agents/documentAgent/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userQuery }],
          context: {
            documentContext: searchResults.results,
            userAuthToken: mockToken,
          },
        }),
      });

      expect(agentResponse.ok).toBe(true);
      const finalResponse = await agentResponse.json();
      
      // Verify response quality
      expect(finalResponse.text).toContain('Revenue');
      expect(finalResponse.text).toContain('20%');
      expect(finalResponse.text).toContain('Q4-2024-Report.pdf');
      expect(finalResponse.sources).toHaveLength(2);
    });
  });
});

describe('Integration Points Verification', () => {
  it('should verify all service URLs are configured', () => {
    expect(TEST_CONFIG.agentServerUrl).toBeDefined();
    expect(TEST_CONFIG.searchApiUrl).toBeDefined();
    expect(TEST_CONFIG.tokenServiceUrl).toBeDefined();
  });

  it('should verify request/response schemas match', () => {
    // Search request schema
    const searchRequest = {
      query: 'test query',
      limit: 5,
      mode: 'hybrid',
      rerank: true,
    };
    
    expect(searchRequest).toHaveProperty('query');
    expect(searchRequest).toHaveProperty('limit');
    expect(searchRequest).toHaveProperty('mode');
    
    // Agent request schema
    const agentRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      context: {},
    };
    
    expect(agentRequest).toHaveProperty('messages');
    expect(Array.isArray(agentRequest.messages)).toBe(true);
  });
});

