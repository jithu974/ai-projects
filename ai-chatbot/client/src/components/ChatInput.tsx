// ChatInput component for sending messages in the chat interface

import React, { useState } from 'react';
import { FaPaperclip as Paperclip, FaMicrophone as Mic, FaPaperPlane as Send } from 'react-icons/fa';

interface Props {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<Props> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <footer className="p-6 bg-[#0B0F19] border-t border-syntax-border/50">
      <form
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto flex items-center gap-3 bg-[#131B2E] border border-syntax-border rounded-2xl px-4 py-2.5 shadow-xl focus-within:border-cyan-500/60"
      >
        <button type="button" className="text-slate-400 hover:text-slate-200 transition-colors">
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          className="flex-1 bg-transparent text-slate-200 text-sm focus:outline-none placeholder:text-slate-500"
        />
        <button type="button" className="text-slate-400 hover:text-slate-200 transition-colors">
          <Mic className="w-4 h-4" />
        </button>
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <div className="text-center mt-2.5 text-[11px] text-slate-500">
        Syntax AI can make mistakes. Please verify important information.
      </div>
    </footer>
  );
};