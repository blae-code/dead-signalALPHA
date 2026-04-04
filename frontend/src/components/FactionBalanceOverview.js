import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Swords, Users, Shield, Handshake, RefreshCw, Crown, TrendingUp } from 'lucide-react';

export default function FactionBalanceOverview() {
  const [factions, setFactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/gm/factions/overview');
      setFactions(data || []);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const maxMembers = Math.max(...factions.map((f) => f.member_count || 0), 1);

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="faction-balance">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Faction Balance Overview</h3>
          <span className="text-[10px] font-mono text-[#88837a]">({factions.length})</span>
        </div>
        <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="refresh-faction-balance">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="p-3 space-y-3">
          {factions.length === 0 && !loading && (
            <p className="text-xs font-mono text-[#88837a] text-center py-8">No factions registered</p>
          )}
          {factions.map((f, i) => (
            <div key={f.faction_id || i} className="border border-[#2a2520] bg-[#111111] panel-hover" data-testid={`faction-overview-${i}`}>
              {/* Header */}
              <div className="border-b border-[#2a2520] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {i === 0 && <Crown className="w-3.5 h-3.5 text-[#c4841d]" />}
                  <span className="font-heading text-sm uppercase tracking-widest text-[#d4cfc4]">{f.name}</span>
                  {f.tag && <span className="text-[10px] font-mono text-[#c4841d]">[{f.tag}]</span>}
                </div>
                <span className="text-[10px] font-mono text-[#88837a] uppercase">{f.status || 'active'}</span>
              </div>

              <div className="p-3">
                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-[#88837a] uppercase">Members</p>
                    <p className="font-heading text-lg text-[#d4cfc4]">{f.member_count || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-[#88837a] uppercase">Alliances</p>
                    <p className="font-heading text-lg text-[#6b7a3d]">{f.alliance_count || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-[#88837a] uppercase">Enemies</p>
                    <p className="font-heading text-lg text-[#8b3a3a]">{f.enemy_count || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-[#88837a] uppercase">Reputation</p>
                    <p className="font-heading text-lg text-[#c4841d]">{typeof f.reputation === 'number' ? f.reputation : 0}</p>
                  </div>
                </div>

                {/* Power Bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-[#88837a] uppercase">Power</span>
                    <span className="text-[9px] font-mono text-[#88837a]">{f.member_count || 0} / {maxMembers}</span>
                  </div>
                  <div className="h-2 bg-[#0a0a0a] border border-[#2a2520]">
                    <div
                      className="h-full bg-[#c4841d]/60"
                      style={{
                        width: `${((f.member_count || 0) / maxMembers) * 100}%`,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Leader & Created */}
                <div className="flex items-center justify-between text-[10px] font-mono text-[#88837a]">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Leader: <span className="text-[#d4cfc4]">{f.leader || 'Unknown'}</span>
                  </span>
                  <span>
                    {f.created_at ? new Date(f.created_at).toLocaleDateString() : ''}
                  </span>
                </div>

                {/* Relations */}
                {(f.alliances?.length > 0 || f.enemies?.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-[#2a2520]">
                    {f.alliances?.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mb-1">
                        <Handshake className="w-3 h-3 text-[#6b7a3d]" />
                        {f.alliances.map((a, j) => (
                          <span key={j} className="text-[9px] font-mono text-[#6b7a3d] px-1 border border-[#6b7a3d]/30">{a}</span>
                        ))}
                      </div>
                    )}
                    {f.enemies?.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Swords className="w-3 h-3 text-[#8b3a3a]" />
                        {f.enemies.map((e, j) => (
                          <span key={j} className="text-[9px] font-mono text-[#8b3a3a] px-1 border border-[#8b3a3a]/30">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
