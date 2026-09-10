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

  const formData = await request.formData();
  const audioFile = formData.get('audio');
  if (!audioFile) {
    return Response.json({ error: 'Fichier audio manquant' }, { status: 400 });
  }

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'fr',
  });

  return Response.json({ text: transcription.text });
}
