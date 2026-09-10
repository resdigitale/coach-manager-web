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

// Client anon pour les lectures publiques (table bots, politique bots_public_read)
function getSupabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Client authentifié avec le JWT de l'utilisateur pour les écritures RLS-protégées
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
  if (error) console.error('[getBotId] Erreur DB:', error.message);
  if (data?.id) cachedBotId = data.id;
  return data?.id ?? null;
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.slice(7); // Remove "Bearer "

  // Vérification du token via le client anon
  const anon = getSupabaseAnon();
  const { data: { user }, error: authError } = await anon.auth.getUser(token);
  console.log('[DEBUG] user.id:', user?.id ?? 'null', '| authError:', authError?.message ?? 'aucune');
  if (authError || !user) {
    return new Response('Non autorisé', { status: 401 });
  }

  const { messages } = await request.json();
  const userMessage = messages[messages.length - 1];

  const botId = await getBotId();
  console.log('[DEBUG] botId:', botId);

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
        console.log('[DEBUG] Insert payload:', JSON.stringify(rows));
        const userClient = getSupabaseUser(token);
        const { data: insertData, error: insertError } = await userClient
          .from('messages')
          .insert(rows)
          .select();
        console.log('[DEBUG] Insert data:', JSON.stringify(insertData));
        console.log('[DEBUG] Insert error:', insertError ? JSON.stringify(insertError) : 'aucune');
      } else {
        console.error('[messages] bot_id introuvable — aucun bot avec slug="coach-manager" en DB');
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
