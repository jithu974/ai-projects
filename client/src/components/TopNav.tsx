// Top navigation bar component for the application

import React from 'react';
import { FaChevronDown as ChevronDown, FaSun as Sun, FaQuestionCircle as HelpCircle } from 'react-icons/fa';

export const TopNav: React.FC = () => {
  return (
    <header className="h-14 border-b border-syntax-border bg-[#0C1220] px-6 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer">
        <span className="font-semibold text-sm text-slate-200">Syntax AI</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        <span className="flex items-center gap-1.5 ml-2 text-[11px] text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Online
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button className="text-slate-400 hover:text-slate-200 transition-colors">
          <Sun className="w-4 h-4" />
        </button>
        <button className="text-slate-400 hover:text-slate-200 transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-syntax-border">
          <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-semibold text-white">
            PPM
          </div>
          <span className="text-xs font-medium text-slate-200">Premjith PM</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </div>
      </div>
    </header>
  );
};