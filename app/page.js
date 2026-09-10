'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const WELCOME = {
  role: 'assistant',
  content:
    "Bonjour, je suis votre Coach Manager. Décrivez-moi une situation concrète que vous traversez en ce moment avec votre équipe.",
};

function CoachAvatar({ faded }) {
  return (
    <div
      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mt-1 ${
        faded ? 'bg-blue-300' : 'bg-blue-600'
      }`}
    >
      CM
    </div>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const startupPlayedRef = useRef(false);

  // Lazy AudioContext — must be created inside a user gesture
  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  // Synthetic sound design via Web Audio API oscillators + ADSR
  function playSound(type) {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      const note = (freq1, freq2, dur, gain, offset = 0) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq1, now + offset);
        osc.frequency.exponentialRampToValueAtTime(freq2, now + offset + dur * 0.6);
        g.gain.setValueAtTime(0, now + offset);
        g.gain.linearRampToValueAtTime(gain, now + offset + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
        osc.start(now + offset);
        osc.stop(now + offset + dur);
      };

      if (type === 'startup') {
        // Deux notes ascendantes douces : "connexion établie"
        note(440, 660, 0.3, 0.06, 0);
        note(550, 880, 0.3, 0.04, 0.15);
      } else if (type === 'send') {
        // Bref clic montant : "message envoyé"
        note(600, 950, 0.1, 0.05, 0);
      } else if (type === 'response') {
        // Note douce descendante : "réponse reçue"
        note(500, 380, 0.2, 0.04, 0);
      }
    } catch {}
  }

  // Son de connexion au premier geste utilisateur après authentification
  useEffect(() => {
    if (!user || startupPlayedRef.current) return;
    function onFirst() {
      if (startupPlayedRef.current) return;
      startupPlayedRef.current = true;
      playSound('startup');
      window.removeEventListener('pointerdown', onFirst);
    }
    window.addEventListener('pointerdown', onFirst);
    return () => window.removeEventListener('pointerdown', onFirst);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function initAuth() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);

      try {
        const { data: bot } = await supabase
          .from('bots')
          .select('id')
          .eq('slug', 'coach-manager')
          .single();

        if (bot) {
          const { data: history } = await supabase
            .from('messages')
            .select('role, content')
            .eq('bot_id', bot.id)
            .order('created_at', { ascending: true });

          const pastMessages = (history || []).map((m) => ({ ...m, isPast: true }));
          setMessages([WELCOME, ...pastMessages]);
        } else {
          setMessages([WELCOME]);
        }
      } catch {
        setMessages([WELCOME]);
      }

      setAuthLoading(false);
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  // — TTS —
  function stopTTS() {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = '';
      ttsAudioRef.current = null;
    }
    setIsTTSPlaying(false);
  }

  async function speakText(text, token) {
    stopTTS();
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      setIsTTSPlaying(true);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        ttsAudioRef.current = null;
        setIsTTSPlaying(false);
      };
      audio.play();
    } catch {}
  }

  // — Enregistrement vocal —
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {}
  }

  async function stopRecordingAndTranscribe() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    setIsRecording(false);
    setIsTranscribing(true);

    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    micStreamRef.current?.getTracks().forEach((t) => t.stop());

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const { text } = await res.json();
      if (text?.trim()) {
        setInput(text.trim());
        sendMessage(text.trim());
      }
    } catch {}

    setIsTranscribing(false);
  }

  async function handleMicPointerDown(e) {
    e.preventDefault();
    stopTTS();
    await startRecording();

    function onRelease() {
      window.removeEventListener('pointerup', onRelease);
      stopRecordingAndTranscribe();
    }
    window.addEventListener('pointerup', onRelease);
  }

  // — Envoi de message (texte ou voix) —
  async function sendMessage(overrideText) {
    const text = overrideText ?? input;
    if (!text.trim() || isStreaming) return;

    playSound('send');

    const userMsg = { role: 'user', content: text.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    const apiMessages = history
      .filter((m, i) => !(i === 0 && m === WELCOME))
      .map(({ role, content }) => ({ role, content }));

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    let fullText = '';
    let firstChunk = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstChunk) {
          playSound('response');
          firstChunk = false;
        }
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: fullText };
          return next;
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: "Désolé, une erreur s'est produite. Veuillez réessayer.",
        };
        return next;
      });
    } finally {
      setIsStreaming(false);
    }

    // TTS lancé après la fin du streaming (non-bloquant pour l'UI)
    if (fullText.trim()) {
      speakText(fullText, token);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (authLoading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 items-center justify-center">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
        </div>
      </div>
    );
  }

  const micDisabled = isStreaming || isTranscribing;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            CM
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">
              Coach Manager IA
            </h1>
            <p className="text-xs text-gray-500">Coaching managérial · TPE</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="text-xs text-gray-500">En ligne</span>
            </div>
            <span className="hidden sm:block text-xs text-gray-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:border-gray-300"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, i) => {
            const isPast = !!msg.isPast;
            const showSeparator = !isPast && messages[i - 1]?.isPast === true;

            return (
              <div key={i}>
                {showSeparator && (
                  <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">Session en cours</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <div
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && <CoachAvatar faded={isPast} />}
                  <div
                    className={`max-w-[80%] sm:max-w-[70%] px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? isPast
                          ? 'bg-blue-200 text-blue-800 rounded-2xl rounded-tr-sm'
                          : 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                        : isPast
                        ? 'bg-gray-100 text-gray-500 border border-gray-100 rounded-2xl rounded-tl-sm'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.content || (
                      isStreaming && i === messages.length - 1 ? (
                        <LoadingDots />
                      ) : null
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="bg-white border-t border-gray-200 flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? 'Parlez...'
                  : isTranscribing
                  ? 'Transcription en cours...'
                  : 'Décrivez votre situation managériale...'
              }
              rows={1}
              disabled={isStreaming || isRecording || isTranscribing}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 overflow-y-auto"
              style={{ minHeight: '48px', maxHeight: '128px' }}
            />

            {/* Bouton micro / arrêt TTS */}
            {isTTSPlaying ? (
              <button
                type="button"
                onClick={stopTTS}
                title="Arrêter la lecture"
                className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={handleMicPointerDown}
                disabled={micDisabled}
                title={isRecording ? 'Relâchez pour envoyer' : 'Maintenir pour parler'}
                className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors select-none touch-none ${
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : micDisabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isTranscribing ? <SpinnerIcon /> : <MicIcon />}
              </button>
            )}

            {/* Bouton envoyer */}
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <SendIcon />
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-2">
            {isRecording
              ? 'Relâchez le micro pour transcrire et envoyer'
              : isTTSPlaying
              ? 'Cliquez sur le bouton orange pour couper la lecture'
              : 'Entrée pour envoyer · Maintenir le micro pour parler'}
          </p>
        </div>
      </footer>
    </div>
  );
}
