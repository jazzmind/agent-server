import { Agent } from '@mastra/core/agent';
import { ai } from '../utils/ai';
import { MODELS } from '../config/models';

export const chatAgent = new Agent({
  name: 'chat-agent',
  description: 'General chat agent that uses provided context (doc/web/attachments) to respond.',
  instructions: `You are the final chat agent.
- Use provided document context when available and cite filenames.
- If web context says results pending/unavailable, say so briefly.
- Respect attachment decision notes (e.g., mention uploads done).
- Be concise and avoid fabrication.`,
  model: ai(MODELS.default.model),
  tools: {},
});
