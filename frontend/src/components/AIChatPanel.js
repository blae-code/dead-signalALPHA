import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Radio, Send, Loader2, AlertTriangle, CheckCircle, XCircle,
  Terminal, ChevronRight, RotateCcw, Zap, Shield, Clock,
  MessageSquare, Plus,
} from 'lucide-react';

const SUGGESTED_GM = [
  "Who's online right now?",
  "Give me a sitrep",
  "What's the current danger level and why?",
  "Broadcast: A supply drop is inbound at grid C7",
  "How's the economy looking?",
  "Show me recent combat events",
  "Create a supply run mission for any faction",
];

const SUGGESTED_PLAYER = [
  "Where can I find antibiotics?",
  "What's the current weather and danger level?",
  "Which faction controls the most territory?",
  "Is now a good time to trade water?",
  "What missions are active right now?",
  "What resources are scarce?",
];

export default function AIChatPanel({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const isAdmin = user?.role === 'system_admin' || user?.role === 'server_admin';
  const suggestions = isAdmin ? SUGGESTED_GM : SUGGESTED_PLAYER;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/ai/sessions?limit=15');
      setSessions(data || []);
    } catch {}
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load session history
  const loadSession = async (sid) => {
    try {
      const { data } = await api.get(`/ai/history?session_id=${sid}&limit=50`);
      const msgs = [];
      for (const entry of data) {
        msgs.push({ role: 'user', text: entry.user_message, timestamp: entry.timestamp });
        msgs.push({
          role: 'ai',
          text: entry.ai_response,
          actions: entry.actions_taken || [],
          pending: entry.pending_confirmation,
          timestamp: entry.timestamp,
        });
      }
      setMessages(msgs);
      setSessionId(sid);
      setShowSessions(false);
      setPendingConfirm(null);
    } catch {}
  };

  const newSession = () => {
    setMessages([]);
    setSessionId(null);
    setPendingConfirm(null);
    setInput('');
    inputRef.current?.focus();
  };

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg = { role: 'user', text: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const payload = {
        message: msg,
        session_id: sessionId || undefined,
      };
      if (pendingConfirm) {
        payload.confirm_action = pendingConfirm.command;
      }

      const { data } = await api.post('/ai/chat', payload);

      if (!sessionId && data.session_id) {
        setSessionId(data.session_id);
      }

      const aiMsg = {
        role: 'ai',
        text: data.response,
        actions: data.actions_taken || [],
        pending: data.pending_confirmation || null,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setPendingConfirm(data.pending_confirmation || null);

      // Refresh sessions list
      loadSessions();
    } catch (e) {
      const errMsg = {
        role: 'error',
        text: e.response?.data?.detail || 'Signal lost. Retrying on backup frequency...',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    }
    setSending(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="flex h-full gap-3" data-testid="ai-chat-panel">
      {/* Sessions sidebar */}
      <div className={`${showSessions ? 'block' : 'hidden'} lg:block w-full lg:w-52 flex-shrink-0`}>
        <div className="border border-[#2a2520] bg-[#111111] h-full flex flex-col">
          <div className="border-b border-[#2a2520] p-2 flex items-center justify-between">
            <span className="text-[9px] font-heading uppercase tracking-widest text-[#88837a]">Sessions</span>
            <button onClick={newSession} data-testid="new-chat-session"
              className="text-[#c4841d] hover:text-[#e8b84d] transition-colors p-0.5" title="New session">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1 space-y-0.5">
              {sessions.length === 0 ? (
                <p className="text-[10px] font-mono text-[#88837a]/50 text-center py-4">No sessions yet</p>
              ) : sessions.map(s => (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  data-testid={`session-${s.session_id}`}
                  className={`w-full text-left p-2 border transition-all ${
                    sessionId === s.session_id
                      ? 'border-[#c4841d]/40 bg-[#c4841d]/5'
                      : 'border-transparent hover:border-[#2a2520] hover:bg-[#1a1a1a]'
                  }`}
                >
                  <p className="text-[10px] font-mono text-[#d4cfc4] truncate leading-tight">
                    {s.last_message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-2.5 h-2.5 text-[#88837a]/50" />
                    <span className="text-[9px] font-mono text-[#88837a]/50">
                      {s.last_timestamp?.slice(5, 16).replace('T', ' ')}
                    </span>
                    <span className="text-[9px] font-mono text-[#88837a]/30 ml-auto">{s.message_count}msg</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col ds-panel min-w-0">
        {/* Header */}
        <div className="ds-panel-header">
          <button onClick={() => setShowSessions(s => !s)} className="lg:hidden text-[#88837a] hover:text-[#c4841d] transition-colors">
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 border border-[#c4841d] flex items-center justify-center flex-shrink-0 glow-amber-soft">
            <Radio className="w-3.5 h-3.5 text-[#c4841d]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-heading uppercase tracking-widest text-[#c4841d]">
              SIGINT — {isAdmin ? 'Command Intelligence' : 'Field Intelligence'}
            </p>
            <p className="text-[9px] font-mono text-[#88837a]">
              {isAdmin ? 'Full server access · RCON enabled · Natural language commands' : 'Read-only intel · Survival advice · World analysis'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 px-2 py-0.5 border border-[#6b7a3d]/30 bg-[#6b7a3d]/5">
              <Shield className="w-3 h-3 text-[#6b7a3d]" />
              <span className="text-[9px] font-mono text-[#6b7a3d]">GM</span>
            </div>
          )}
          <button onClick={newSession} title="New conversation"
            className="text-[#88837a] hover:text-[#c4841d] p-1 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Message area */}
        <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            {messages.length === 0 ? (
              <EmptyState
                isAdmin={isAdmin}
                suggestions={suggestions}
                onSuggest={(s) => sendMessage(s)}
              />
            ) : (
              messages.map((msg, i) => (
                <ChatBubble key={i} msg={msg} isAdmin={isAdmin} />
              ))
            )}

            {/* Pending confirmation */}
            {pendingConfirm && !sending && (
              <ConfirmationPrompt
                pending={pendingConfirm}
                onConfirm={() => sendMessage('yes')}
                onCancel={() => sendMessage('no')}
              />
            )}

            {/* Typing indicator */}
            {sending && (
              <div className="flex items-center gap-2 pl-10 text-[#88837a]">
                <div className="flex items-center gap-3 border border-[#2a2520] bg-[#111111] px-3 py-2">
                  <Loader2 className="w-3 h-3 animate-spin text-[#c4841d]" />
                  <span className="text-[10px] font-mono tracking-wider animate-pulse">
                    SIGINT processing...
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-[#2a2520] bg-[#111111] p-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isAdmin ? 'Command SIGINT... (e.g. "broadcast a storm warning")' : 'Ask SIGINT... (e.g. "where can I find medical supplies?")'}
                disabled={sending}
                data-testid="ai-chat-input"
                className="w-full bg-[#0a0a0a] border border-[#2a2520] text-[#d4cfc4] text-xs font-mono px-3 py-2.5 pr-8 placeholder-[#88837a]/40 focus:outline-none focus:border-[#c4841d] transition-all disabled:opacity-50"
              />
              <Terminal className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2a2520]" />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || sending}
              data-testid="ai-chat-send"
              className="px-4 py-2.5 border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="text-[10px] font-heading uppercase tracking-widest hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Sub-components ───

function EmptyState({ isAdmin, suggestions, onSuggest }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-14 h-14 border-2 border-[#c4841d]/30 flex items-center justify-center mb-5">
        <Radio className="w-7 h-7 text-[#c4841d]/40" />
      </div>
      <p className="text-[11px] font-heading uppercase tracking-[0.2em] text-[#c4841d]/60 mb-1">
        SIGINT READY
      </p>
      <p className="text-[10px] font-mono text-[#88837a]/50 mb-6 text-center max-w-md leading-relaxed">
        {isAdmin
          ? 'Natural language server control. Ask questions, issue RCON commands, generate missions, manage players — all through conversation.'
          : 'Your AI field intelligence officer. Ask about the game world, loot locations, trade strategy, faction politics, and current conditions.'
        }
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full max-w-lg">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest(s)}
            data-testid={`suggestion-${i}`}
            className="text-left text-[10px] font-mono text-[#88837a] border border-[#2a2520] px-3 py-2 hover:border-[#c4841d]/40 hover:text-[#d4cfc4] transition-all group"
          >
            <ChevronRight className="w-2.5 h-2.5 inline mr-1.5 text-[#2a2520] group-hover:text-[#c4841d] transition-colors" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}


function ChatBubble({ msg, isAdmin }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] border border-[#c4841d]/20 bg-[#c4841d]/5 px-3 py-2">
          <p className="text-[11px] font-mono text-[#d4cfc4] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          <p className="text-[9px] font-mono text-[#88837a]/40 mt-1 text-right">
            {msg.timestamp?.slice(11, 16)}
          </p>
        </div>
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="flex items-start gap-2 pl-1">
        <div className="w-6 h-6 border border-[#8b3a3a] flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle className="w-3 h-3 text-[#8b3a3a]" />
        </div>
        <div className="border border-[#8b3a3a]/30 bg-[#8b3a3a]/5 px-3 py-2 max-w-[85%]">
          <p className="text-[11px] font-mono text-[#8b3a3a] leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  // AI response
  return (
    <div className="flex items-start gap-2 pl-1">
      <div className="w-6 h-6 border border-[#c4841d]/30 flex items-center justify-center flex-shrink-0 mt-0.5 glow-amber-soft">
        <Radio className="w-3 h-3 text-[#c4841d]" />
      </div>
      <div className="max-w-[85%] space-y-2">
        <div className="border border-[#2a2520] bg-[#111111] px-3 py-2 scan-reveal" style={{ borderLeft: '2px solid rgba(196,132,29,0.3)' }}>
          <p className="text-[11px] font-mono text-[#d4cfc4] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          <p className="text-[9px] font-mono text-[#88837a]/30 mt-1">
            SIGINT {msg.timestamp?.slice(11, 19)}
          </p>
        </div>

        {/* Actions taken */}
        {msg.actions?.length > 0 && (
          <div className="space-y-1">
            {msg.actions.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 border text-[10px] font-mono ${
                a.success
                  ? 'border-[#6b7a3d]/30 bg-[#6b7a3d]/5 text-[#6b7a3d]'
                  : 'border-[#8b3a3a]/30 bg-[#8b3a3a]/5 text-[#8b3a3a]'
              }`}>
                {a.success
                  ? <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  : <XCircle className="w-3 h-3 flex-shrink-0" />
                }
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function ConfirmationPrompt({ pending, onConfirm, onCancel }) {
  return (
    <div className="flex items-start gap-2 pl-1">
      <div className="w-6 h-6 border border-[#c4841d] flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
        <Zap className="w-3 h-3 text-[#c4841d]" />
      </div>
      <div className="border border-[#c4841d]/40 bg-[#c4841d]/5 px-3 py-3 max-w-[85%] space-y-2">
        <p className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">
          Confirmation Required
        </p>
        <div className="border border-[#2a2520] bg-[#0a0a0a] px-2.5 py-1.5">
          <p className="text-[11px] font-mono text-[#d4cfc4]">
            {pending.type === 'power' ? 'Power: ' : 'RCON: '}
            <span className="text-[#c4841d]">{pending.command}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            data-testid="confirm-action-yes"
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 transition-all"
          >
            <CheckCircle className="w-3 h-3" /> Execute
          </button>
          <button
            onClick={onCancel}
            data-testid="confirm-action-no"
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#8b3a3a] text-[#8b3a3a] hover:bg-[#8b3a3a]/10 transition-all"
          >
            <XCircle className="w-3 h-3" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
