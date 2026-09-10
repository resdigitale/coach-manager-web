import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getSupabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.slice(7);

  const anon = getSupabaseAnon();
  const { data: { user }, error: authError } = await anon.auth.getUser(token);
  if (authError || !user) {
    return new Response('Non autorisé', { status: 401 });
  }

  const { text } = await request.json();
  if (!text?.trim()) {
    return new Response('Texte manquant', { status: 400 });
  }

  const speech = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'nova',
    input: text,
    speed: 1.0,
  });

  const audioBuffer = await speech.arrayBuffer();

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    },
  });
}
