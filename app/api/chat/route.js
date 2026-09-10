import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic();

const SYSTEM_PROMPT =
  "Tu es un coach en management pour managers de TPE. Tu utilises une approche " +
  "de coaching situationnel : tu poses des questions pour comprendre la situation " +
  "avant de conseiller. Tu utilises des outils concrets : CNV, feedback SBI, " +
  "management situationnel de Hersey-Blanchard. Tu poses UNE SEULE question à " +
  "la fois. Tu commences toujours par comprendre le contexte avant de donner " +
  "des conseils.";

// Cache the bot_id to avoid repeated DB lookups
let cachedBotId = null;

function getSupabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function getSupabaseUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

async function getBotId() {
  if (cachedBotId) return cachedBotId;
  const anon = getSupabaseAnon();
  const { data, error } = await anon
    .from('bots')
    .select('id')
    .eq('slug', 'coach-manager')
    .single();
  if (data?.id) cachedBotId = data.id;
  return data?.id ?? null;
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.slice(7); // Remove "Bearer "

  const anon = getSupabaseAnon();
  const { data: { user }, error: authError } = await anon.auth.getUser(token);
  if (authError || !user) {
    return new Response('Non autorisé', { status: 401 });
  }

  const { messages } = await request.json();
  const userMessage = messages[messages.length - 1];

  const botId = await getBotId();

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = '';

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          fullText += chunk.delta.text;
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }

      // Save user message and assistant response once streaming is complete
      if (botId) {
        const rows = [
          { user_id: user.id, bot_id: botId, role: 'user', content: userMessage.content },
          { user_id: user.id, bot_id: botId, role: 'assistant', content: fullText },
        ];
        const userClient = getSupabaseUser(token);
        await userClient.from('messages').insert(rows);
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
