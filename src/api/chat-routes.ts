import { registerApiRoute } from '@mastra/core/server';
import OpenAI from 'openai';
import { documentSearchTool } from '../mastra/tools/document-search-tool';
import { verifyUserBearerToken } from '../mastra/auth/auth-utils';
import { MODELS } from '../mastra/config/models';

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://10.96.200.207:4000/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';

export const chatRoute = registerApiRoute('/chat', {
  method: 'POST',
  handler: async (c) => {
    try {
      const authHeader = c.req.header('Authorization');
      const user = await verifyUserBearerToken(authHeader);

      const body = await c.req.json();
      const message: string | undefined = body?.content;
      const enableWebSearch: boolean = body?.enableWebSearch === true;
      const enableDocumentSearch: boolean = body?.enableDocumentSearch === true;
      const attachmentIds: string[] | undefined = body?.attachmentIds;
      const conversationId: string | undefined = body?.conversationId;

      if (!message || typeof message !== 'string') {
        return c.json({ error: 'content is required' }, 400);
      }

      // Attachment agent (minimal heuristic)
      const attachmentSummary =
        attachmentIds && attachmentIds.length > 0
          ? `Attachments provided: ${attachmentIds.length} (ids: ${attachmentIds.join(', ')})`
          : 'No attachments provided.';
      const attachmentDecision =
        attachmentIds && attachmentIds.length > 0
          ? {
              action: 'upload',
              target: 'doc-library',
              modelHint: 'multimodal',
              note: 'Upload attachments to doc library for RAG. Use multimodal model if images present.',
            }
          : { action: 'none', target: 'none', note: 'No attachments' };

      // Document search agent
      let documentContext: string | undefined;
      let documentResults: any[] | undefined;
      if (enableDocumentSearch) {
        const docResult = await documentSearchTool.execute({
          context: {
            authToken: authHeader,
            userId: user.userId,
            roles: user.roles || [],
            query: message,
            limit: 5,
            mode: 'hybrid',
          },
        });
        documentContext = docResult.context;
        documentResults = docResult.results;
      }

      // Web search agent (placeholder)
      const webSearchContext = enableWebSearch
        ? 'Web search requested; web-search agent not yet configured.'
        : undefined;

      // Build chat agent messages
      const systemPrompt = `
You are the Chat Agent orchestrator.
- If document context exists, answer strictly from it and cite filenames.
- If web search context exists, acknowledge web results are pending/unavailable.
- If attachments are present, follow the attachment decision note.
- Be concise and do not fabricate.
`;

      const contextParts: string[] = [];
      if (documentContext) contextParts.push(`Document context:\n${documentContext}`);
      if (webSearchContext) contextParts.push(webSearchContext);
      contextParts.push(`Attachment decision: ${attachmentDecision.note}`);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: message },
      ];
      if (contextParts.length > 0) {
        messages.push({
          role: 'system' as const,
          content: `Additional context:\n${contextParts.join('\n\n')}`,
        });
      }

      // Stream via LiteLLM (through ai() wrapper)
      const client = new OpenAI({
        apiKey: LITELLM_API_KEY,
        baseURL: LITELLM_BASE_URL,
      });

      const stream = await client.chat.completions.create({
        model: body?.model || process.env.AGENT_SERVER_DEFAULT_MODEL || MODELS.default.model,
        messages,
        stream: true,
        temperature: 0.3,
      });

      // Build routing debug payload
      const routingDebug = {
        userId: user.userId,
        email: user.email,
        conversationId,
        dualModel: false,
        toolsUsed: enableDocumentSearch,
        visionUsed: false,
        routingPath: [
          enableDocumentSearch ? 'document-agent: search' : 'document-agent: skipped',
          enableWebSearch ? 'web-agent: pending' : 'web-agent: skipped',
          'chat-agent: respond',
        ],
        request: {
          enableWebSearch,
          enableDocumentSearch,
          attachmentCount: attachmentIds?.length || 0,
          model: body?.model,
        },
        docResults: documentResults,
        attachmentDecision,
      };

      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          // prepend routing debug marker
          controller.enqueue(
            encoder.encode(
              `<!-- ROUTING_DEBUG:${JSON.stringify(routingDebug)}:END_ROUTING -->\n\n`
            )
          );
          try {
            for await (const chunk of stream as any) {
              const content = chunk.choices?.[0]?.delta?.content || '';
              if (content) controller.enqueue(encoder.encode(content));
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `\n\n[agent-server chat] stream error: ${(err as Error).message}`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    } catch (error: any) {
      console.error('[chat-route] error:', error);
      return c.json({ error: 'chat failed', details: error.message }, 500);
    }
  },
});

export const chatRoutes = [chatRoute];
