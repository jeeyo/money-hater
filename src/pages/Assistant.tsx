import React, { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles, Loader2, Bot, User } from 'lucide-react';
import Layout from '../components/Layout';
import { sendAssistantMessage } from '../services/assistantService';
import type { AssistantMessage } from '../types';

const SUGGESTIONS = [
  'How much did I spend on Food & Dining last month?',
  'What places do I go to most often?',
  'Where does most of my money go?',
];

const Assistant: React.FC = () => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (history: AssistantMessage[]) => sendAssistantMessage(history),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I could not answer that right now. Please try again.',
        },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, mutation.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || mutation.isPending) return;
    const next: AssistantMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    mutation.mutate(next.slice(-20));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-7rem)]">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500
              flex items-center justify-center shadow-lg shadow-violet-600/20"
          >
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">Assistant</h1>
            <p className="text-xs text-slate-500">
              Ask about your spending — it can search the web, look up places, and recall your
              history.
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-2xl bg-surface/60 border border-white/5 p-4 space-y-4"
        >
          {messages.length === 0 && !mutation.isPending && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <Bot className="w-10 h-10 text-violet-400/60" />
              <p className="text-sm text-slate-500 max-w-sm">
                Ask me anything about your money. Try one of these:
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-sm px-3 py-2 rounded-xl bg-white/5 border border-white/10
                      text-slate-300 hover:border-violet-500/40 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <span
                className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                  m.role === 'user'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-violet-500/15 text-violet-300'
                }`}
              >
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </span>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-amber-500/10 text-amber-50 border border-amber-500/15'
                    : 'bg-white/5 text-slate-200 border border-white/10'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {mutation.isPending && (
            <div className="flex gap-3">
              <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-violet-500/15 text-violet-300">
                <Bot className="w-4 h-4" />
              </span>
              <div className="rounded-2xl px-3.5 py-2.5 bg-white/5 border border-white/10">
                <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your spending…"
            disabled={mutation.isPending}
            className="flex-1 bg-white/5 border border-white/10 text-white rounded-xl outline-none
              transition-all placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 p-3"
          />
          <button
            type="submit"
            disabled={mutation.isPending || !input.trim()}
            className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500
              hover:from-violet-500 hover:to-indigo-400 text-white transition-all
              shadow-lg shadow-violet-600/20 disabled:opacity-40"
            aria-label="Send"
          >
            {mutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default Assistant;
