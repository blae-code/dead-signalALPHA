import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Users, Clock, UserCheck, UserX, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PlayerRoster({ isAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [onlineList, setOnlineList] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/players');
      setSessions(data.recent_sessions || []);
      setOnlineList(data.online || []);
    } catch { /* graceful */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlayers();
    const i = setInterval(fetchPlayers, 30000);
    return () => clearInterval(i);
  }, []);

  const timeSince = (isoStr) => {
    if (!isoStr) return '?';
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  const kickPlayer = async (name) => {
    try {
      await api.post('/server/command', { command: `kick ${name}` });
    } catch { /* graceful */ }
  };

  const banPlayer = async (name) => {
    try {
      await api.post('/server/command', { command: `ban ${name}` });
    } catch { /* graceful */ }
  };

  // Use fetched online data
  const onlineNames = new Set(onlineList.map((p) => (typeof p === 'string' ? p : p.name)));

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="player-roster-panel">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Player Roster</h3>
          <span className="text-[10px] font-mono text-[#6b7a3d] ml-1">{onlineNames.size} ONLINE</span>
        </div>
        <button
          data-testid="refresh-players-button"
          onClick={fetchPlayers}
          className="text-[#88837a] hover:text-[#c4841d] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="p-3">
          {/* Online Players */}
          {onlineNames.size > 0 && (
            <div className="mb-4">
              <p className="text-xs font-mono text-[#88837a] uppercase tracking-widest mb-2">// ACTIVE OPERATORS</p>
              <div className="space-y-1">
                {[...onlineNames].map((name) => (
                  <div key={name} className="flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111] hover:border-[#4a5c3a] transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#6b7a3d] pulse-green" />
                      <span className="text-xs font-mono text-[#d4cfc4]">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#6b7a3d]">ONLINE</span>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button
                            data-testid={`kick-${name}`}
                            onClick={() => kickPlayer(name)}
                            className="text-[10px] font-mono border border-[#c4841d] text-[#c4841d] px-1.5 py-0.5 hover:bg-[#c4841d] hover:text-[#111111] transition-all"
                          >
                            KICK
                          </button>
                          <button
                            data-testid={`ban-${name}`}
                            onClick={() => banPlayer(name)}
                            className="text-[10px] font-mono border border-[#8b3a3a] text-[#8b3a3a] px-1.5 py-0.5 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all"
                          >
                            BAN
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          <p className="text-xs font-mono text-[#88837a] uppercase tracking-widest mb-2">// SESSION LOG</p>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 italic p-4 text-center">
                No sessions recorded. Player data populates from live console stream.
              </p>
            ) : (
              sessions.map((s, i) => {
                const isOnline = onlineNames.has(s.name);
                return (
                  <div key={i} className="flex items-center justify-between p-2 border border-transparent hover:border-[#2a2520] bg-[#111111]/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {isOnline ? (
                        <UserCheck className="w-3 h-3 text-[#6b7a3d]" />
                      ) : (
                        <UserX className="w-3 h-3 text-[#88837a]" />
                      )}
                      <span className={`text-xs font-mono ${isOnline ? 'text-[#d4cfc4]' : 'text-[#88837a]'}`}>
                        {s.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-[#88837a]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeSince(s.joined_at || s.last_seen)}
                      </span>
                      <span className={isOnline ? 'text-[#6b7a3d]' : 'text-[#88837a]'}>
                        {isOnline ? 'ACTIVE' : 'OFFLINE'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
