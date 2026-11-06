import React from 'react';
import { FaRobot as Bot, FaPlus as Plus, FaGem as Diamond } from 'react-icons/fa';
import { FaMessage as MessageSquare, FaGear as Settings, FaRightFromBracket as LogOut } from 'react-icons/fa6';

export const Sidebar: React.FC<{ onNewChat: () => void }> = ({ onNewChat }) => {

  return (
    <aside className="w-64 bg-syntax-sidebar border-r border-syntax-border flex flex-col justify-between p-4 h-screen select-none">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <span className="font-bold text-lg text-white tracking-wide">Syntax AI</span>
        </div>

        {/* New Chat Button */}
        <button onClick={() => {onNewChat();}} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-syntax-border bg-[#162038] hover:bg-[#1E2B4B] text-slate-200 text-sm font-medium transition-all">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Chat</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-800 border border-slate-700 rounded text-slate-400">
            ⌘K
          </kbd>
        </button>

        {/* History List */}
        <div className="space-y-4 text-xs overflow-y-auto max-h-[calc(100vh-360px)] pr-1">
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] px-2">Today</span>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#18233C] text-cyan-400 font-medium">
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Explain async/await in JS</span>
                </div>
                <span className="text-[10px] text-slate-400">10:24 AM</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40">
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Best practices for API design</span>
                </div>
                <span className="text-[10px] text-slate-500">9:15 AM</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade & Footer Controls */}
      <div className="space-y-4 pt-4 border-t border-syntax-border/70">
        <div className="rounded-xl p-3 bg-gradient-to-br from-indigo-950/60 to-cyan-950/40 border border-cyan-900/40">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
            <Diamond className="w-4 h-4" />
            <span>Upgrade to Pro</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Unlock unlimited messages, priority access, and more.</p>
          <button className="mt-2.5 w-full py-1 text-xs font-medium text-center text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors">
            Upgrade Now →
          </button>
        </div>

        <div className="space-y-1 text-slate-400 text-xs font-medium">
          <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:text-slate-200 hover:bg-slate-800/40">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:text-slate-200 hover:bg-slate-800/40">
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};