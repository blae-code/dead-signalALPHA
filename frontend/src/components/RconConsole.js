import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { Terminal, Send, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function RconConsole({ isAdmin, consoleLogs = [] }) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, consoleLogs]);

  const sendCommand = async () => {
    if (!command.trim()) return;
    const cmd = command.trim();
    setCommand('');
    setHistory((h) => [...h, { type: 'input', text: cmd, time: new Date().toLocaleTimeString('en-US', { hour12: false }) }]);
    setSending(true);
    try {
      const { data } = await api.post('/server/command', { command: cmd });
      if (data.error) {
        setHistory((h) => [...h, { type: 'error', text: data.error, time: new Date().toLocaleTimeString('en-US', { hour12: false }) }]);
      } else {
        setHistory((h) => [...h, { type: 'output', text: `Command sent: ${cmd}`, time: new Date().toLocaleTimeString('en-US', { hour12: false }) }]);
      }
    } catch (err) {
      setHistory((h) => [...h, {
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Transmission failed',
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      }]);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendCommand();
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="rcon-console-panel">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Command Terminal</h3>
        </div>
        {!isAdmin && (
          <span className="text-[10px] font-mono text-[#8b3a3a] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> ADMIN ACCESS REQUIRED
          </span>
        )}
        {isAdmin && (
          <button
            data-testid="toggle-live-console"
            onClick={() => setShowLive(!showLive)}
            className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${
              showLive ? 'border-[#6b7a3d] text-[#6b7a3d]' : 'border-[#88837a] text-[#88837a]'
            }`}
          >
            {showLive ? 'LIVE FEED ON' : 'LIVE FEED OFF'}
          </button>
        )}
      </div>

      <ScrollArea className="h-[500px]" ref={scrollRef}>
        <div className="p-4 space-y-1 font-mono text-xs">
          {/* Boot sequence */}
          <p className="text-[#88837a]">Dead Signal Command Terminal v1.0</p>
          <p className="text-[#88837a]">Connected to server via Pterodactyl WebSocket relay</p>
          <p className="text-[#88837a]">Type commands below. Live console output streams below.</p>
          <p className="text-[#2a2520]">{'='.repeat(60)}</p>

          {/* Live console output from WebSocket */}
          {showLive && consoleLogs.map((log, i) => (
            <div key={`live-${i}`} className="flex items-start gap-2">
              <span className="text-[#88837a] text-[10px] min-w-[65px]">
                [{new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}]
              </span>
              <span className="text-[#88837a]/70">{log.line}</span>
            </div>
          ))}

          {/* Command history */}
          {history.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[#88837a] text-[10px] min-w-[65px]">[{entry.time}]</span>
              {entry.type === 'input' && (
                <span className="text-[#c4841d]">{'>'} {entry.text}</span>
              )}
              {entry.type === 'output' && (
                <span className="text-[#6b7a3d]">{entry.text}</span>
              )}
              {entry.type === 'error' && (
                <span className="text-[#a94442]">[ERR] {entry.text}</span>
              )}
            </div>
          ))}

          {sending && (
            <div className="text-[#88837a] animate-pulse">Transmitting...</div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-[#2a2520] p-3 flex items-center gap-2">
        <span className="text-[#c4841d] font-mono text-sm">{'>'}</span>
        <input
          ref={inputRef}
          data-testid="rcon-command-input"
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isAdmin || sending}
          placeholder={isAdmin ? 'Enter command...' : 'Insufficient clearance'}
          className="flex-1 bg-transparent border-none text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/40 focus:outline-none disabled:opacity-40"
        />
        <button
          data-testid="rcon-submit-button"
          onClick={sendCommand}
          disabled={!isAdmin || sending || !command.trim()}
          className="border border-[#c4841d] text-[#c4841d] p-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
