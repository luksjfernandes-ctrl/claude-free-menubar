import React from 'react';
import { motion } from 'framer-motion';

interface MessageBubbleProps {
  role: 'user' | 'ai';
  content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  if (!content.trim()) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex w-full mb-4 ${role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-xl border ${
          role === 'user' 
            ? 'bg-accent text-white border-white/10 ml-8' 
            : 'bg-[#2d2d2d] text-white/90 border-white/5 mr-8'
        }`}
      >
        {content}
      </div>
    </motion.div>
  );
}
