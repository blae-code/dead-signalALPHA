/**
 * PlayerStats
 * -----------
 * Personal stats panel for a player: K/D, playtime, session history, activity score.
 * Backend: /api/stats/me  (stats.py)
 *
 * TODO:
 *  - Wire up /api/stats/history to render a sparkline using recharts or a simple
 *    CSS bar chart.  The history endpoint returns daily { date, kills, deaths } buckets.
 *  - Add a leaderboard view (tab toggle) that fetches /api/stats/leaderboard and
 *    renders a ranked table with medals for top 3.
 *  - Once sessions are rich (playtime tracked per-session), render a session timeline
 *    as a horizontal bar or calendar heatmap.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Crosshair, Skull, Clock, Activity, TrendingUp, Award,
  RefreshCw, BarChart2, Calendar,
} from 'lucide-react';

function StatCard({ icon, label, value, sub, color = 'text-[#c4841d]' }) {
  return (
    <div className="border border-[#3a3832] rounded p-3 flex items-center gap-3 bg-[#0d0c0a]">
      <div className={`${color} shrink-0`}>{icon}</div>
      <div>
        <div className={`text-lg font-bold font-mono ${color}`}>{value ?? '—'}</div>
        <div className="text-[10px] text-[#88837a] uppercase tracking-wider">{label}</div>
        {sub && <div className="text-[10px] text-[#4a4540]">{sub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ value, max, color = '#c4841d' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-[#1a1916] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function ActivityBar({ history }) {
  if (!history || history.length === 0) {
    return <p className="text-[#4a4540] text-xs text-center py-4">No activity history yet.</p>;
  }
  const maxKills = Math.max(...history.map(d => d.kills || 0), 1);

  return (
    <div className="space-y-1">
      {history.slice(-14).map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-[#4a4540] w-16 shrink-0">
            {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <div className="flex-1">
            <MiniBar value={d.kills || 0} max={maxKills} color="#c4841d" />
          </div>
          <span className="text-[10px] text-[#88837a] w-6 text-right">{d.kills || 0}</span>
        </div>
      ))}
    </div>
  );
}

function SessionRow({ session }) {
  const connected = session.connected_at ? new Date(session.connected_at) : null;
  const lastSeen  = session.last_seen   ? new Date(session.last_seen)    : null;
  let duration = '';
  if (connected && lastSeen) {
    const mins = Math.round((lastSeen - connected) / 60000);
    duration = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <div className="flex items-center justify-between text-[11px] py-1 border-b border-[#1a1916]">
      <span className="text-[#88837a]">{connected?.toLocaleDateString() || '—'}</span>
      <span className="text-[#4a4540]">{connected?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span className={`font-mono ${session.online ? 'text-[#6b7a3d]' : 'text-[#4a4540]'}`}>
        {session.online ? '● ONLINE' : duration || '—'}
      </span>
    </div>
  );
}

export default function PlayerStats({ user }) {
  const [stats, setStats]     = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('stats');  // stats | history

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, histRes] = await Promise.all([
        api.get('/stats/me'),
        api.get('/stats/history').catch(() => ({ data: { history: [] } })),
      ]);
      setStats(statsRes.data);
      setHistory(histRes.data.history || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const s = stats || {};
  const kd = s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : (s.kills || 0);
  const hours = s.total_playtime_minutes ? Math.floor(s.total_playtime_minutes / 60) : 0;
  const mins  = s.total_playtime_minutes ? s.total_playtime_minutes % 60 : 0;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#c4841d] tracking-wider uppercase">
          {user?.callsign || 'My Stats'}
        </span>
        <button onClick={fetchStats} className="text-[#88837a] hover:text-[#c9b89a]">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#3a3832] pb-2">
        {[
          { id: 'stats',   label: 'Overview',   icon: <Activity className="w-3 h-3" /> },
          { id: 'history', label: 'Activity',    icon: <BarChart2 className="w-3 h-3" /> },
          { id: 'sessions', label: 'Sessions',   icon: <Calendar className="w-3 h-3" /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
              tab === t.id
                ? 'bg-[#c4841d]/10 text-[#c4841d] border border-[#c4841d]/30'
                : 'text-[#88837a] hover:text-[#c9b89a]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {tab === 'stats' && (
          <div className="grid grid-cols-2 gap-2 pr-2">
            <StatCard icon={<Crosshair className="w-5 h-5" />} label="Kills"      value={s.kills ?? 0} />
            <StatCard icon={<Skull className="w-5 h-5" />}     label="Deaths"     value={s.deaths ?? 0} color="text-[#8b3a3a]" />
            <StatCard icon={<TrendingUp className="w-5 h-5" />} label="K/D Ratio" value={kd} />
            <StatCard icon={<Clock className="w-5 h-5" />}      label="Playtime"  value={`${hours}h ${mins}m`} color="text-[#6b7a3d]" />
            <StatCard icon={<Activity className="w-5 h-5" />}   label="Sessions"  value={s.session_count ?? 0} />
            <StatCard
              icon={<Award className="w-5 h-5" />}
              label="Activity Score"
              value={s.activity_score ?? 0}
              sub="Engagement metric"
              color="text-[#7a3d6b]"
            />
          </div>
        )}

        {tab === 'history' && (
          <div className="pr-2 space-y-2">
            <p className="text-[10px] text-[#4a4540] uppercase tracking-widest">Kills per day (last 14 days)</p>
            <ActivityBar history={history} />
          </div>
        )}

        {tab === 'sessions' && (
          <div className="pr-2 space-y-1">
            <p className="text-[10px] text-[#4a4540] uppercase tracking-widest mb-2">Recent sessions</p>
            {(s.recent_sessions || []).length === 0 && (
              <p className="text-[#4a4540] text-xs text-center py-4">No session data yet.</p>
            )}
            {(s.recent_sessions || []).map((sess, i) => (
              <SessionRow key={i} session={sess} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
