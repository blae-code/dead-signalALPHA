import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crosshair, MapPin, AlertTriangle, ShieldCheck, X, Layers } from 'lucide-react';

const GRID_SIZE = 16;

const ZONE_TYPES = [
  { value: 'territory', label: 'Territory' },
  { value: 'base', label: 'Base' },
  { value: 'outpost', label: 'Outpost' },
  { value: 'contested', label: 'Contested' },
];

function coordLabel(x, y) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export default function GridMap() {
  const [territories, setTerritories] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [factions, setFactions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selected, setSelected] = useState(null); // {x, y}
  const [assignFaction, setAssignFaction] = useState('');
  const [assignType, setAssignType] = useState('territory');
  const [assignLabel, setAssignLabel] = useState('');
  const [hovered, setHovered] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, mRes, fRes, sRes] = await Promise.all([
        api.get('/territories'),
        api.get('/territories/markers'),
        api.get('/factions'),
        api.get('/territories/summary'),
      ]);
      setTerritories(tRes.data || []);
      setMarkers(mRes.data || []);
      setFactions(fRes.data || []);
      setSummary(sRes.data || []);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build territory lookup: "x-y" -> territory data
  const territoryMap = {};
  territories.forEach((t) => { territoryMap[t.territory_id] = t; });

  const handleCellClick = (x, y) => {
    const t = territoryMap[`${x}-${y}`];
    if (selected?.x === x && selected?.y === y) {
      setSelected(null);
    } else {
      setSelected({ x, y });
      setAssignFaction(t?.faction_id || '');
      setAssignType(t?.zone_type || 'territory');
      setAssignLabel(t?.label || '');
    }
  };

  const handleClaim = async () => {
    if (!assignFaction) return;
    try {
      await api.post('/territories/claim', {
        x: selected.x,
        y: selected.y,
        faction_id: assignFaction,
        zone_type: assignType,
        label: assignLabel || undefined,
      });
      setSelected(null);
      await fetchData();
    } catch { /* graceful */ }
  };

  const handleRelease = async () => {
    if (!selected) return;
    try {
      await api.delete('/territories/claim', { data: { x: selected.x, y: selected.y } });
      setSelected(null);
      await fetchData();
    } catch { /* graceful */ }
  };

  // Unique faction colors
  const factionColors = {};
  factions.forEach((f) => { factionColors[f.faction_id] = f.color || '#c4841d'; });
  summary.forEach((s) => { factionColors[s.faction_id] = s.color || '#c4841d'; });

  return (
    <div className="space-y-4" data-testid="grid-map-panel">
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Tactical Map</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className={`flex items-center gap-1 text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${showOverlay ? 'border-[#c4841d] text-[#c4841d]' : 'border-[#2a2520] text-[#88837a]'}`}
              data-testid="toggle-overlay"
            >
              <Layers className="w-3 h-3" /> Territories
            </button>
            <button onClick={fetchData} className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors">[REFRESH]</button>
          </div>
        </div>

        <div className="p-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-3 text-[10px] font-mono">
            {summary.map((s) => (
              <div key={s.faction_id} className="flex items-center gap-1.5">
                <div className="w-3 h-3 border" style={{ backgroundColor: `${factionColors[s.faction_id]}20`, borderColor: factionColors[s.faction_id] }} />
                <span className="text-[#d4cfc4]">{s.tag}</span>
                <span className="text-[#88837a]">({s.total})</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-[#4a5c3a]" />
              <span className="text-[#88837a]">Base</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-[#8b3a3a]" />
              <span className="text-[#88837a]">Danger</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-[#c4841d] rounded-full" />
              <span className="text-[#88837a]">Airdrop</span>
            </div>
          </div>

          {/* Grid */}
          <div className="relative border border-[#2a2520] bg-[#0d0d0d] overflow-hidden">
            {/* Column headers */}
            <div className="flex pl-4">
              {Array.from({ length: GRID_SIZE }, (_, i) => (
                <div key={i} className="flex-1 text-center text-[8px] font-mono text-[#88837a]/40 py-0.5">
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>

            <div className="flex">
              {/* Row headers */}
              <div className="flex flex-col w-4">
                {Array.from({ length: GRID_SIZE }, (_, i) => (
                  <div key={i} className="flex-1 flex items-center justify-center text-[8px] font-mono text-[#88837a]/40">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Grid cells */}
              <div
                className="flex-1 grid gap-0"
                style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, aspectRatio: '1' }}
              >
                {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                  const x = i % GRID_SIZE;
                  const y = Math.floor(i / GRID_SIZE);
                  const tid = `${x}-${y}`;
                  const t = territoryMap[tid];
                  const isSelected = selected?.x === x && selected?.y === y;
                  const isHovered = hovered?.x === x && hovered?.y === y;
                  const fColor = t ? factionColors[t.faction_id] || '#c4841d' : null;

                  return (
                    <div
                      key={tid}
                      className={`aspect-square relative flex items-center justify-center cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-[#c4841d] z-20 ring-1 ring-[#c4841d]/50'
                          : 'border-[#1a1a1a]/40 hover:border-[#2a2520]'
                      }`}
                      style={t && showOverlay ? {
                        backgroundColor: `${fColor}15`,
                        borderColor: isSelected ? '#c4841d' : `${fColor}40`,
                      } : undefined}
                      onClick={() => handleCellClick(x, y)}
                      onMouseEnter={() => setHovered({ x, y })}
                      onMouseLeave={() => setHovered(null)}
                      title={t ? `${coordLabel(x, y)} — ${t.faction?.name || ''} (${t.zone_type})` : coordLabel(x, y)}
                    >
                      {/* Zone type icon */}
                      {t?.zone_type === 'base' && <MapPin className="w-2.5 h-2.5 drop-shadow-lg" style={{ color: fColor }} />}
                      {t?.zone_type === 'outpost' && <ShieldCheck className="w-2 h-2 opacity-70" style={{ color: fColor }} />}
                      {t?.zone_type === 'contested' && <AlertTriangle className="w-2 h-2 text-[#8b3a3a] animate-pulse" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center crosshair */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <Crosshair className="w-8 h-8 text-[#c4841d]/5" />
            </div>
          </div>

          {/* Hover tooltip */}
          {hovered && (
            <div className="mt-1 text-[10px] font-mono text-[#88837a]">
              Grid: {coordLabel(hovered.x, hovered.y)}
              {territoryMap[`${hovered.x}-${hovered.y}`] && (
                <span className="ml-2 text-[#d4cfc4]">
                  {territoryMap[`${hovered.x}-${hovered.y}`].faction?.name || ''} — {territoryMap[`${hovered.x}-${hovered.y}`].zone_type}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assignment Panel */}
      {selected && (
        <div className="border border-[#c4841d]/30 bg-[#1a1a1a]/95 panel-inset noise-bg p-4 space-y-3" data-testid="territory-assign-panel">
          <div className="flex items-center justify-between">
            <h4 className="font-heading text-xs uppercase tracking-widest text-[#c4841d]">
              Assign Territory — {coordLabel(selected.x, selected.y)}
            </h4>
            <button onClick={() => setSelected(null)} className="text-[#88837a] hover:text-[#c4841d] transition-colors"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Faction</label>
              <select
                value={assignFaction}
                onChange={(e) => setAssignFaction(e.target.value)}
                data-testid="territory-faction-select"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none"
              >
                <option value="">Select faction...</option>
                {factions.map((f) => (
                  <option key={f.faction_id} value={f.faction_id}>{f.name} [{f.tag}]</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Zone Type</label>
              <select
                value={assignType}
                onChange={(e) => setAssignType(e.target.value)}
                data-testid="territory-type-select"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none"
              >
                {ZONE_TYPES.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Label (optional)</label>
            <input
              value={assignLabel}
              onChange={(e) => setAssignLabel(e.target.value)}
              placeholder="e.g., Alpha HQ, Northern Outpost"
              data-testid="territory-label"
              className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleClaim}
              disabled={!assignFaction}
              data-testid="claim-territory-btn"
              className="flex-1 py-2 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-widest transition-all disabled:opacity-40"
            >
              Assign Territory
            </button>
            {territoryMap[`${selected.x}-${selected.y}`] && (
              <button
                onClick={handleRelease}
                data-testid="release-territory-btn"
                className="px-4 py-2 border border-[#8b3a3a] text-[#8b3a3a] font-heading text-xs uppercase tracking-widest hover:bg-[#8b3a3a]/10 transition-all"
              >
                Release
              </button>
            )}
          </div>
        </div>
      )}

      {/* Territory Summary */}
      {summary.length > 0 && (
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#88837a]">Territory Control</h3>
          </div>
          <div className="p-3 space-y-2">
            {summary.map((s) => (
              <div key={s.faction_id} className="flex items-center gap-3 text-xs font-mono">
                <div className="w-3 h-3 border" style={{ backgroundColor: `${s.color}30`, borderColor: s.color }} />
                <span className="text-[#d4cfc4] w-28 truncate">{s.name}</span>
                <div className="flex-1 h-1.5 bg-[#111111] border border-[#2a2520]">
                  <div className="h-full transition-all" style={{ width: `${Math.min((s.total / (GRID_SIZE * GRID_SIZE)) * 100 * 10, 100)}%`, backgroundColor: s.color }} />
                </div>
                <span className="text-[#88837a] w-16 text-right">{s.total} zones</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
