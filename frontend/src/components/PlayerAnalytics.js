import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart3, Users, Clock, Activity, AlertTriangle, TrendingDown, TrendingUp, RefreshCw,
} from 'lucide-react';

const STATUS_BADGE = {
  dominant: { color: 'text-[#c4841d] border-[#c4841d]', icon: <TrendingUp className="w-3 h-3" /> },
  active: { color: 'text-[#6b7a3d] border-[#6b7a3d]', icon: <Activity className="w-3 h-3" /> },
  moderate: { color: 'text-[#88837a] border-[#88837a]', icon: null },
  declining: { color: 'text-[#c4841d] border-[#c4841d]', icon: <TrendingDown className="w-3 h-3" /> },
  inactive: { color: 'text-[#8b3a3a] border-[#8b3a3a]', icon: <AlertTriangle className="w-3 h-3" /> },
};

function classifyPlayer(p) {
  const hours = p.total_playtime_hours || 0;
  const kills = p.kill_count || 0;
  const recentSessions = p.sessions_7d || 0;

  if (kills > 10 && hours > 5) return 'dominant';
  if (recentSessions >= 3) return 'active';
  if (recentSessions >= 1) return 'moderate';
  if (hours > 0 && recentSessions === 0) return 'declining';
  return 'inactive';
}

export default function PlayerAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('playtime');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/analytics/players');
      setData(d);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const players = data?.players || [];

  const sorted = [...players].sort((a, b) => {
    if (sortBy === 'playtime') return (b.total_playtime_hours || 0) - (a.total_playtime_hours || 0);
    if (sortBy === 'kills') return (b.kill_count || 0) - (a.kill_count || 0);
    if (sortBy === 'recent') return (b.sessions_7d || 0) - (a.sessions_7d || 0);
    if (sortBy === 'risk') {
      const ar = classifyPlayer(a);
      const br = classifyPlayer(b);
      const order = ['inactive', 'declining', 'moderate', 'active', 'dominant'];
      return order.indexOf(ar) - order.indexOf(br);
    }
    return 0;
  });

  const statusCounts = { dominant: 0, active: 0, moderate: 0, declining: 0, inactive: 0 };
  sorted.forEach((p) => { statusCounts[classifyPlayer(p)]++; });

  return (
    <div className="space-y-4" data-testid="player-analytics">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Object.entries(statusCounts).map(([status, count]) => {
          const badge = STATUS_BADGE[status] || STATUS_BADGE.moderate;
          return (
            <div key={status} className={`border ${badge.color.split(' ')[1]} bg-[#111111] p-3 text-center`}>
              <p className={`text-[10px] font-heading uppercase tracking-widest ${badge.color.split(' ')[0]}`}>{status}</p>
              <p className="font-heading text-2xl text-[#d4cfc4]">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Player Table */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Player Behaviour Analytics</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {['playtime', 'kills', 'recent', 'risk'].map((s) => (
                <button key={s} onClick={() => setSortBy(s)} data-testid={`sort-${s}`}
                  className={`text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${sortBy === s ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="refresh-analytics">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <ScrollArea className="h-[450px]">
          {/* Header Row */}
          <div className="sticky top-0 z-10 grid grid-cols-7 gap-2 px-3 py-2 bg-[#111111] border-b border-[#2a2520] text-[9px] font-heading uppercase tracking-widest text-[#88837a]">
            <span>Player</span>
            <span className="text-center">Status</span>
            <span className="text-center">Playtime</span>
            <span className="text-center">Sessions</span>
            <span className="text-center">Last 7d</span>
            <span className="text-center">Kills</span>
            <span className="text-center">Last Seen</span>
          </div>

          <div className="p-1">
            {sorted.map((p, i) => {
              const status = classifyPlayer(p);
              const badge = STATUS_BADGE[status];
              return (
                <div key={p.callsign || i} className="event-enter grid grid-cols-7 gap-2 px-3 py-2 border-b border-[#2a2520]/30 hover:bg-[#111111] transition-colors text-xs font-mono" style={{ animationDelay: `${Math.min(i * 0.03, 0.5)}s` }} data-testid={`player-row-${i}`}>
                  <span className="text-[#d4cfc4] truncate">{p.callsign}</span>
                  <span className={`text-center text-[10px] uppercase ${badge.color.split(' ')[0]}`}>
                    {status}
                  </span>
                  <span className="text-center text-[#88837a]">{p.total_playtime_hours || 0}h</span>
                  <span className="text-center text-[#88837a]">{p.total_sessions || 0}</span>
                  <span className="text-center text-[#88837a]">{p.sessions_7d || 0}</span>
                  <span className="text-center text-[#c4841d]">{p.kill_count || 0}</span>
                  <span className="text-center text-[#88837a]/60 text-[10px] truncate">
                    {p.last_seen ? new Date(p.last_seen).toLocaleDateString() : '—'}
                  </span>
                </div>
              );
            })}
            {sorted.length === 0 && !loading && (
              <p className="text-xs font-mono text-[#88837a] text-center py-8">No player data available</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
