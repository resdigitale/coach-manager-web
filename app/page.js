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
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    async function initAuth() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);

      // Load message history for this bot
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

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: input.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    // Build API payload: exclude static WELCOME, strip isPast flag
    const apiMessages = history
      .filter((m, i) => !(i === 0 && m === WELCOME))
      .map(({ role, content }) => ({ role, content }));

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: text };
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
            // Show a "session en cours" separator when past messages end
            const showSeparator =
              !isPast && messages[i - 1]?.isPast === true;

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
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Décrivez votre situation managériale..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 overflow-y-auto"
              style={{ minHeight: '48px', maxHeight: '128px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">
            Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne
          </p>
        </div>
      </footer>
    </div>
  );
}
