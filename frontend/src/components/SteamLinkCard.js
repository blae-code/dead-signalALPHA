import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Link2, Unlink, Loader2, Check, Users, Gamepad2, ChevronDown, ChevronUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SteamLinkCard() {
  const [profile, setProfile] = useState(null);
  const [available, setAvailable] = useState([]);
  const [steamName, setSteamName] = useState('');
  const [steamId, setSteamId] = useState('');
  const [linking, setLinking] = useState(false);
  const [result, setResult] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/profile/me');
      setProfile(data);
      if (data.steam_name) setSteamName(data.steam_name);
      if (data.steam_id) setSteamId(data.steam_id);
    } catch { /* graceful */ }
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const { data } = await api.get('/profile/available-players');
      setAvailable(data || []);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => { fetchProfile(); fetchAvailable(); }, [fetchProfile, fetchAvailable]);

  const isLinked = !!(profile?.steam_name || profile?.steam_id);

  const handleLink = async () => {
    if (!steamName.trim() && !steamId.trim()) return;
    setLinking(true);
    setResult(null);
    try {
      const payload = {};
      if (steamName.trim()) payload.steam_name = steamName.trim();
      if (steamId.trim()) payload.steam_id = steamId.trim();
      const { data } = await api.post('/profile/link-steam', payload);
      setResult({ ok: true, msg: data.message });
      await fetchProfile();
      await fetchAvailable();
    } catch (err) {
      setResult({ ok: false, msg: err?.response?.data?.detail || 'Link failed' });
    }
    setLinking(false);
  };

  const handleUnlink = async () => {
    setLinking(true);
    setResult(null);
    try {
      await api.delete('/profile/link-steam');
      setSteamName('');
      setSteamId('');
      setResult({ ok: true, msg: 'Steam identity unlinked' });
      await fetchProfile();
      await fetchAvailable();
    } catch (err) {
      setResult({ ok: false, msg: err?.response?.data?.detail || 'Unlink failed' });
    }
    setLinking(false);
  };

  const selectPlayer = (p) => {
    setSteamName(p.steam_name || '');
    setSteamId(p.steam_id || '');
    setShowPicker(false);
  };

  return (
    <div className="space-y-4" data-testid="steam-link-card">
      {/* Link Status */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Game Identity Link</h3>
          {isLinked && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-[#6b7a3d] border border-[#6b7a3d]/30 bg-[#6b7a3d]/10 px-2 py-0.5">
              <Check className="w-3 h-3" /> Linked
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-mono text-[#88837a]">
            {isLinked
              ? `Your account is linked to in-game identity "${profile.steam_name}". Your kills, deaths, and session data are now tracked.`
              : 'Link your Steam/game identity to track personal stats, K/D, and session history.'}
          </p>

          {/* Current link info */}
          {isLinked && (
            <div className="border border-[#2a2520] bg-[#0a0a0a] p-3 space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#88837a]">Steam Name</span>
                <span className="text-[#d4cfc4]">{profile.steam_name || '—'}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#88837a]">SteamID</span>
                <span className="text-[#d4cfc4]">{profile.steam_id || '—'}</span>
              </div>
              {profile.game_level != null && (
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#88837a]">Level</span>
                  <span className="text-[#d4cfc4]">{profile.game_level}</span>
                </div>
              )}
              {profile.game_clan && (
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#88837a]">Clan</span>
                  <span className="text-[#d4cfc4]">{profile.game_clan}</span>
                </div>
              )}
            </div>
          )}

          {/* Link form */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Steam Display Name</label>
              <input
                data-testid="steam-name-input"
                value={steamName}
                onChange={(e) => setSteamName(e.target.value)}
                placeholder="e.g., blae"
                autoComplete="off"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">SteamID (17 digits)</label>
              <input
                data-testid="steam-id-input"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="e.g., 76561198054619063"
                autoComplete="off"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-2 p-2 border text-xs font-mono ${result.ok ? 'border-[#6b7a3d] text-[#6b7a3d]' : 'border-[#8b3a3a] text-[#8b3a3a]'}`} data-testid="link-result">
              {result.ok ? <Check className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
              {result.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleLink}
              disabled={(!steamName.trim() && !steamId.trim()) || linking}
              data-testid="link-steam-btn"
              className="flex-1 py-2 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {isLinked ? 'Update Link' : 'Link Identity'}
            </button>
            {isLinked && (
              <button
                onClick={handleUnlink}
                disabled={linking}
                data-testid="unlink-steam-btn"
                className="px-4 py-2 border border-[#8b3a3a] text-[#8b3a3a] font-heading text-xs uppercase tracking-widest hover:bg-[#8b3a3a]/10 transition-all disabled:opacity-40"
              >
                Unlink
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Known Players Picker */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-full border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#88837a]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#88837a]">Known Game Players ({available.length})</h3>
          </div>
          {showPicker ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
        </button>
        {showPicker && (
          <ScrollArea className="h-[250px]">
            <div className="p-3 space-y-1">
              {available.length === 0 && (
                <p className="text-xs font-mono text-[#88837a] text-center py-4">No game players detected yet</p>
              )}
              {available.map((p, i) => (
                <div
                  key={p.steam_id || p.steam_name || i}
                  className="flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111]/50 panel-hover cursor-pointer"
                  onClick={() => !p.linked_to && selectPlayer(p)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-[#d4cfc4] truncate">{p.steam_name || '?'}</span>
                      {p.steam_id && <span className="text-[#88837a]/50 text-[10px]">{p.steam_id}</span>}
                    </div>
                    <div className="flex gap-3 text-[10px] font-mono text-[#88837a]">
                      {p.level != null && <span>Lv:{p.level}</span>}
                      {p.clan && <span>Clan:{p.clan}</span>}
                      <span>{p.sessions} sessions</span>
                    </div>
                  </div>
                  {p.linked_to ? (
                    <span className="text-[10px] font-mono text-[#6b7a3d] border border-[#6b7a3d]/30 bg-[#6b7a3d]/10 px-2 py-0.5 shrink-0">
                      {p.linked_to}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#c4841d] hover:text-[#e8b84d] shrink-0">SELECT</span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
