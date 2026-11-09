// Chat Feed & Content Formatter

import React from 'react';
import { type Message } from '../types/chat';
import { CodeBlock } from './CodeBlock';
import { FaRobot as Bot, FaThumbsUp as ThumbsUp, FaThumbsDown as ThumbsDown, FaChevronDown as ChevronDown, FaCheckDouble as CheckCheck } from 'react-icons/fa';

interface Props {
  messages: Message[];
}

export const MessageList: React.FC<Props> = ({ messages }) => {
  const renderFormattedBotMessage = (text: string) => {
    // Regex splits markdown code blocks: ```lang ... ```
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        elements.push(
          <div key={`text-${lastIndex}`} className="whitespace-pre-wrap leading-relaxed text-slate-200">
            {text.substring(lastIndex, match.index)}
          </div>
        );
      }
      elements.push(
        <CodeBlock key={`code-${match.index}`} language={match[1] || 'text'} code={match[2]} />
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      elements.push(
        <div key={`text-${lastIndex}`} className="whitespace-pre-wrap leading-relaxed text-slate-200">
          {text.substring(lastIndex)}
        </div>
      );
    }

    return elements;
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {messages.map((msg) => (
        <div key={msg.id} className="w-full">
          {msg.role === 'user' ? (
            <div className="flex justify-end items-end gap-2">
              <div className="max-w-2xl bg-[#1C2640] border border-syntax-border/70 text-slate-100 rounded-2xl rounded-br-sm px-5 py-3 shadow-md">
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <div className="flex items-center justify-end gap-1.5 mt-2 text-[11px] text-slate-400">
                  <span>{msg.timestamp}</span>
                  <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4 max-w-4xl">
              <div className="w-8 h-8 rounded-full border border-cyan-500/30 bg-cyan-950/40 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex-1 bg-[#131B2E] border border-syntax-border rounded-2xl p-6 shadow-md">
                <div className="space-y-4 text-sm">{renderFormattedBotMessage(msg.text)}</div>

                {/* Response Footer matching mockup */}
                <div className="flex items-center justify-between pt-4 mt-6 border-t border-syntax-border/50 text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span>Was this helpful?</span>
                    <button className="hover:text-cyan-400 transition-colors">
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button className="hover:text-cyan-400 transition-colors">
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1C2640] border border-syntax-border hover:bg-slate-700/50 transition-colors">
                    <span>Sources</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};