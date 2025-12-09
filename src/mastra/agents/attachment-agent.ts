import { Agent } from '@mastra/core/agent';
import { ai } from '../utils/ai';
import { MODELS } from '../config/models';

export const attachmentAgent = new Agent({
  name: 'attachment-agent',
  description: 'Decides how to handle attachments (upload, inline, reject) and suggests model hints.',
  instructions: `You are an attachment handling agent.
- If no attachments: action=none, target=none, note='No attachments'.
- If images: action=upload, target=doc-library, modelHint=multimodal.
- If text/pdf/docs: action=upload, target=doc-library, modelHint=text.
- If archives (zip/tar): action=preprocess, target=doc-library, note='Extract before use'.
- Return a concise JSON decision.`,
  model: ai(MODELS.default.model),
  tools: {},
});
