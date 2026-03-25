import React, { useState, useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { motion, AnimatePresence } from 'framer-motion';

export function CompactChat({ isActive }: { isActive: boolean }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Função para limpar códigos ANSI e sequências de controle TUI/XTerm
  const cleanData = (data: string) => {
    return data
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // ANSI escape codes
      .replace(/\u001b[()][ABGT]/g, '')       // Character set sequences
      .replace(/\r/g, '\n')                  // Normalize line returns
      .replace(/\u0008/g, '');               // Backspaces
  };

  useEffect(() => {
    if (!isActive) return;

    const unsubscribe = window.claude.onData((rawData: string) => {
      const cleanText = cleanData(rawData);
      if (!cleanText) return;

      setIsStreaming(true);

      // Reset inactivity timer
      if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current);
      streamingTimeoutRef.current = setTimeout(() => {
        setIsStreaming(false);
      }, 3000);

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'ai') {
          return [...prev.slice(0, -1), { ...last, content: last.content + cleanText }];
        }
        return [...prev, { role: 'ai', content: cleanText }];
      });
    });

    return () => {
      unsubscribe();
      if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current);
    };
  }, [isActive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !isActive) return;

    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsStreaming(true);

    await window.claude.send(userMsg);
  };

  const handleQuickCommand = async (cmd: string) => {
    setIsStreaming(true);
    await window.claude.send(cmd);
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-white/10 opacity-50">
            <p className="text-[10px] uppercase tracking-[0.3em]">Modo Compacto Ativo</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))}
        </AnimatePresence>
        {isStreaming && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start mb-4">
            <div className="bg-[#2d2d2d] p-3 rounded-2xl border border-white/5">
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#252525]/50 border-t border-white/5">
        <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
          {['/compact', '/clear', '/help'].map((cmd) => (
            <button 
              key={cmd}
              onClick={() => handleQuickCommand(cmd)}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/40 hover:text-white hover:bg-white/10 transition-all font-medium"
            >
              {cmd}
            </button>
          ))}
        </div>

        <div className="relative flex items-center bg-[#2d2d2d] border border-white/10 rounded-xl p-2 focus-within:border-accent/40 transition-all shadow-2xl">
          <textarea
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-1 px-2 resize-none max-h-32 placeholder-white/10 text-white"
            placeholder="Comando para o Claude..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`ml-2 p-2 rounded-lg transition-all ${
              input.trim() ? 'bg-accent text-white shadow-lg' : 'bg-white/5 text-white/10'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
