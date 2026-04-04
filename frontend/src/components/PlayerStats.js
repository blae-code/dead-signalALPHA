import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Crosshair, Skull, Clock, TrendingUp, Award, Users, Activity, BarChart3, Calendar,
} from 'lucide-react';

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function StatCard({ icon, label, value, sub, color = '#c4841d' }) {
  return (
    <div className="border border-[#2a2520] bg-[#111111] p-3 panel-hover" data-testid={`stat-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-heading uppercase tracking-widest text-[#88837a]">{label}</span>
      </div>
      <p className="font-heading text-2xl text-[#d4cfc4]" style={{ transition: 'color 0.3s' }}>{value}</p>
      {sub && <p className="text-[10px] font-mono text-[#88837a] mt-0.5">{sub}</p>}
    </div>
  );
}

function LeaderboardTable({ data, valueKey, valueLabel, showKD }) {
  if (!data?.length) return <p className="text-xs font-mono text-[#88837a] text-center py-4">No data yet</p>;
  return (
    <div className="space-y-1">
      {data.map((p, i) => (
        <div key={i} className="flex items-center gap-3 p-2 border border-[#2a2520] bg-[#111111]/50 text-xs font-mono" data-testid={`leaderboard-row-${i}`}>
          <span className={`w-6 text-center font-bold ${i === 0 ? 'text-[#c4841d]' : i === 1 ? 'text-[#88837a]' : 'text-[#88837a]/60'}`}>
            #{p.rank}
          </span>
          <span className="flex-1 text-[#d4cfc4]">{p.callsign}</span>
          <span className="text-[#c4841d] font-bold">{p[valueKey]}{valueLabel}</span>
          {showKD && <span className="text-[#88837a] w-16 text-right">{p.kd_ratio} K/D</span>}
        </div>
      ))}
    </div>
  );
}

function ActivityGraph({ history }) {
  if (!history?.length) return null;
  const maxEvents = Math.max(...history.map((d) => d.event_count), 1);
  return (
    <div className="border border-[#2a2520] bg-[#111111] p-3 panel-hover" data-testid="activity-graph">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-[#c4841d]" />
        <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">Activity Timeline</span>
      </div>
      <div className="flex items-end gap-1 h-20">
        {history.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
            <div className="relative w-full flex flex-col justify-end" style={{ height: '60px' }}>
              {d.kills > 0 && (
                <div
                  className="w-full bg-[#8b3a3a]/60"
                  style={{ height: `${Math.max((d.kills / maxEvents) * 60, 2)}px`, transition: 'height 0.5s' }}
                  title={`${d.kills} kills`}
                />
              )}
              <div
                className="w-full bg-[#c4841d]/40"
                style={{ height: `${Math.max((d.event_count / maxEvents) * 60, 2)}px`, transition: 'height 0.5s' }}
                title={`${d.event_count} events`}
              />
            </div>
            <span className="text-[8px] font-mono text-[#88837a]/40 group-hover:text-[#88837a]" style={{ transition: 'color 0.2s' }}>
              {d.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 justify-center">
        <span className="flex items-center gap-1 text-[9px] font-mono text-[#88837a]"><span className="w-2 h-2 bg-[#c4841d]/40" /> Events</span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-[#88837a]"><span className="w-2 h-2 bg-[#8b3a3a]/60" /> Kills</span>
      </div>
    </div>
  );
}

export default function PlayerStats() {
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [history, setHistory] = useState(null);
  const [lbTab, setLbTab] = useState('kills');
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, h] = await Promise.all([
        api.get('/stats/me'),
        api.get('/stats/leaderboard?limit=10'),
        api.get('/stats/history?days=14'),
      ]);
      setStats(s.data);
      setLeaderboard(l.data);
      setHistory(h.data);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#c4841d] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="space-y-4" data-testid="player-stats">
      {/* Personal Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Crosshair className="w-4 h-4" />} label="Kills" value={s.kills ?? 0} color="#8b3a3a" />
        <StatCard icon={<Skull className="w-4 h-4" />} label="Deaths" value={s.deaths ?? 0} color="#88837a" />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="K/D Ratio" value={s.kd_ratio ?? '0.00'} sub={`Best streak: ${s.best_kill_streak ?? 0}`} />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Playtime" value={`${s.total_playtime_hours ?? 0}h`} sub={`${s.total_sessions ?? 0} sessions`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Events Logged" value={s.events_logged ?? 0} />
        <StatCard icon={<Users className="w-4 h-4" />} label="Faction" value={s.faction_name || 'None'} sub={s.faction_tag ? `[${s.faction_tag}]` : 'Join or create a faction'} />
        <StatCard
          icon={<Award className="w-4 h-4" />}
          label="Most Active"
          value={s.most_active_hours?.length ? HOUR_LABELS[s.most_active_hours[0].hour] : '--'}
          sub={s.most_active_hours?.length > 1 ? `Also: ${HOUR_LABELS[s.most_active_hours[1]?.hour]}` : ''}
        />
      </div>

      {/* Activity Graph */}
      <ActivityGraph history={history?.history} />

      {/* Leaderboard */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="leaderboard">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Leaderboard</h3>
          </div>
          <div className="flex gap-1">
            {['kills', 'playtime', 'kd'].map((t) => (
              <button key={t} onClick={() => setLbTab(t)} data-testid={`lb-tab-${t}`}
                className={`text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${lbTab === t ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-3">
            {lbTab === 'kills' && <LeaderboardTable data={leaderboard?.by_kills} valueKey="kill_count" valueLabel=" kills" showKD />}
            {lbTab === 'playtime' && <LeaderboardTable data={leaderboard?.by_playtime} valueKey="total_playtime_hours" valueLabel="h" />}
            {lbTab === 'kd' && <LeaderboardTable data={leaderboard?.by_kd} valueKey="kd_ratio" valueLabel=" K/D" showKD={false} />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
