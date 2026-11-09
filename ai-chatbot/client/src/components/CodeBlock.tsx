// CodeBlock component for displaying code snippets with line numbers and copy functionality

import React, { useState } from 'react';
import { FaRegCopy as Copy, FaCheck as Check } from 'react-icons/fa';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.trim().split('\n');

  return (
    <div className="my-3 rounded-xl border border-syntax-border bg-[#070D19] overflow-hidden text-sm font-mono shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-syntax-border/60 bg-[#0C1322]">
        <span className="text-xs text-slate-400 font-medium">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="border-collapse text-left w-full">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="leading-relaxed hover:bg-slate-800/20">
                <td className="pr-4 select-none text-right text-xs text-slate-600 font-mono w-6">
                  {idx + 1}
                </td>
                <td className="text-slate-200 font-mono whitespace-pre">{line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};