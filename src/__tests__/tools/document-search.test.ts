import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Document Search Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SEARCH_API_URL = 'http://test-search:8003';
    process.env.SEARCH_API_SERVICE_KEY = '';
    process.env.SEARCH_API_TIMEOUT_MS = '5000';
    process.env.SEARCH_API_MAX_RETRIES = '2';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Import and Configuration', () => {
    it('should export documentSearchTool', async () => {
      const module = await import('../../mastra/tools/document-search-tool');
      expect(module.documentSearchTool).toBeDefined();
      expect(module.documentSearchTool.id).toBe('document-search');
    });

    it('should have proper input schema', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      expect(documentSearchTool.inputSchema).toBeDefined();
    });

    it('should have proper output schema', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      expect(documentSearchTool.outputSchema).toBeDefined();
    });
  });

  describe('Authentication Handling', () => {
    it('should return error when no auth token and no service key', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      const result = await documentSearchTool.execute({
        context: {
          authToken: '',
          query: 'test query',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('Authentication');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should add Bearer prefix to token without it', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'hybrid' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'raw-token',
          query: 'test query',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer raw-token',
          }),
        })
      );
    });

    it('should not double-prefix Bearer token', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'hybrid' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'Bearer already-prefixed',
          query: 'test query',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer already-prefixed',
          }),
        })
      );
    });
  });

  describe('Search Request Building', () => {
    it('should build correct request body', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'hybrid' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test query',
          limit: 10,
          mode: 'semantic',
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.query).toBe('test query');
      expect(body.limit).toBe(10);
      expect(body.mode).toBe('semantic');
      expect(body.rerank).toBe(true);
    });

    it('should include file filters when specified', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'hybrid' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test query',
          limit: 5,
          mode: 'hybrid',
          fileIds: ['file-1', 'file-2'],
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.filters).toEqual({ file_ids: ['file-1', 'file-2'] });
    });
  });

  describe('Successful Search Results', () => {
    it('should format results correctly', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              file_id: 'file-123',
              filename: 'report.pdf',
              chunk_index: 0,
              page_number: 5,
              text: 'Key findings from the report.',
              score: 0.95,
              metadata: {},
            },
            {
              file_id: 'file-456',
              filename: 'summary.docx',
              chunk_index: 1,
              page_number: 2,
              text: 'Additional relevant content.',
              score: 0.85,
              metadata: {},
            },
          ],
          total: 2,
          query: 'findings',
          mode: 'hybrid',
        }),
      });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'findings',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(true);
      expect(result.resultCount).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].filename).toBe('report.pdf');
      expect(result.results[0].pageNumber).toBe(5);
      expect(result.results[1].filename).toBe('summary.docx');
    });

    it('should build combined context with citations', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              file_id: 'file-123',
              filename: 'report.pdf',
              chunk_index: 0,
              page_number: 5,
              text: 'Important content here.',
              score: 0.9,
              metadata: {},
            },
          ],
          total: 1,
          query: 'test',
          mode: 'hybrid',
        }),
      });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.context).toContain('report.pdf');
      expect(result.context).toContain('Page 5');
      expect(result.context).toContain('Important content here.');
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 authentication errors', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'invalid-token',
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('Authentication');
    });

    it('should handle 403 forbidden errors', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should handle 429 rate limit errors', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      // First call returns 429, second call succeeds (retry logic)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limited'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limited'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limited'),
        });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should handle network errors', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('connect');
    });
  });

  describe('Empty Results Handling', () => {
    it('should handle no results gracefully', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [],
          total: 0,
          query: 'nonexistent',
          mode: 'hybrid',
        }),
      });

      const result = await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'nonexistent',
          limit: 5,
          mode: 'hybrid',
        },
      });

      expect(result.found).toBe(false);
      expect(result.resultCount).toBe(0);
      expect(result.context).toContain('No relevant documents');
      expect(result.results).toEqual([]);
    });
  });

  describe('Search Modes', () => {
    it('should use hybrid mode by default', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'hybrid' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test query',
          limit: 5,
          // mode not specified
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.mode).toBe('hybrid');
    });

    it('should support semantic mode', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'semantic' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test query',
          limit: 5,
          mode: 'semantic',
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.mode).toBe('semantic');
    });

    it('should support keyword mode', async () => {
      const { documentSearchTool } = await import('../../mastra/tools/document-search-tool');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0, query: 'test', mode: 'keyword' }),
      });

      await documentSearchTool.execute({
        context: {
          authToken: 'test-token',
          query: 'test query',
          limit: 5,
          mode: 'keyword',
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.mode).toBe('keyword');
    });
  });
});

