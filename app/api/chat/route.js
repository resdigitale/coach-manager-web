import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT =
  "Tu es un coach en management pour managers de TPE. Tu utilises une approche " +
  "de coaching situationnel : tu poses des questions pour comprendre la situation " +
  "avant de conseiller. Tu utilises des outils concrets : CNV, feedback SBI, " +
  "management situationnel de Hersey-Blanchard. Tu poses UNE SEULE question à " +
  "la fois. Tu commences toujours par comprendre le contexte avant de donner " +
  "des conseils.";

export async function POST(request) {
  const { messages } = await request.json();

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
