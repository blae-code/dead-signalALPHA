import { useState, useEffect, useCallback, useRef } from 'react';
import api, { formatError } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Layers, Package, MapPin, Search, Hammer, Plus, X, Save, Trash2,
  RefreshCw, ChevronRight, ChevronDown, AlertTriangle, CheckCircle,
  Crosshair, Shield, Zap, Home, Eye, Archive, Target, Scan, Edit3,
  ArrowRight, Loader, Download,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_COLORS = {
  storage_room: '#c4841d', armory: '#8b3a3a', med_bay: '#3a8b6b',
  crafting_station: '#3a6b8b', watchtower: '#6b7a3d', generator_room: '#c4841d',
  kitchen: '#8b6b3a', barricade: '#88837a', metal_wall: '#5a5a5a',
  concrete_bunker: '#4a4a4a', sleeping_quarters: '#5c4a3a', empty: '#2a2520',
};

const MODULE_ICONS = {
  storage_room: Archive, armory: Target, med_bay: Plus,
  crafting_station: Hammer, watchtower: Eye, generator_room: Zap,
  kitchen: Home, barricade: Shield, metal_wall: Shield,
  concrete_bunker: Shield, sleeping_quarters: Home, empty: null,
};

const PROB_COLORS = { high: '#6b7a3d', medium: '#c4841d', low: '#8b3a3a' };
const DANGER_COLORS = { low: '#6b7a3d', medium: '#c4841d', high: '#8b3a3a', very_high: '#ff4444' };

// ---------------------------------------------------------------------------
// Main Component — Tab switcher
// ---------------------------------------------------------------------------
export default function SurvivalPlanner() {
  const [tab, setTab] = useState('planner');

  const tabs = [
    { id: 'planner', label: 'Base Planner', icon: <Layers className="w-3 h-3" /> },
    { id: 'loot', label: 'Loot Intel', icon: <MapPin className="w-3 h-3" /> },
  ];

  return (
    <div data-testid="survival-planner">
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`planner-tab-${t.id}`}
            className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-heading uppercase tracking-widest whitespace-nowrap transition-all border ${
              tab === t.id
                ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10'
                : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4] hover:border-[#88837a]'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'planner' && <BasePlannerTab />}
      {tab === 'loot' && <LootIntelTab />}
    </div>
  );
}

// ===========================================================================
// BASE PLANNER TAB
// ===========================================================================
function BasePlannerTab() {
  const [catalog, setCatalog] = useState([]);
  const [blueprints, setBlueprints] = useState([]);
  const [activeBlueprint, setActiveBlueprint] = useState(null);
  const [grid, setGrid] = useState({}); // "x-y" -> module_type
  const [selectedModule, setSelectedModule] = useState(null);
  const [bpName, setBpName] = useState('');
  const [saving, setSaving] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const GRID_SIZE = 8;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, bpRes] = await Promise.all([
        api.get('/planner/modules'),
        api.get('/planner/blueprints'),
      ]);
      setCatalog(catRes.data || []);
      setBlueprints(bpRes.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadBlueprint = (bp) => {
    setActiveBlueprint(bp);
    setBpName(bp.name);
    const g = {};
    (bp.modules || []).forEach(m => { g[`${m.x}-${m.y}`] = m.module_type; });
    setGrid(g);
    setCalcResult(null);
    setMsg('');
  };

  const newBlueprint = () => {
    setActiveBlueprint(null);
    setBpName('');
    setGrid({});
    setCalcResult(null);
    setMsg('');
  };

  const handleCellClick = (x, y) => {
    if (!selectedModule) return;
    const key = `${x}-${y}`;
    setGrid(g => {
      const next = { ...g };
      if (next[key] === selectedModule) {
        delete next[key];
      } else {
        next[key] = selectedModule;
      }
      return next;
    });
    setCalcResult(null);
  };

  const handleCellRightClick = (e, x, y) => {
    e.preventDefault();
    const key = `${x}-${y}`;
    setGrid(g => {
      const next = { ...g };
      delete next[key];
      return next;
    });
    setCalcResult(null);
  };

  const saveBlueprint = async () => {
    if (!bpName.trim()) { setMsg('Enter a blueprint name'); return; }
    setSaving(true);
    setMsg('');
    const modules = Object.entries(grid).map(([key, module_type]) => {
      const [x, y] = key.split('-').map(Number);
      return { x, y, module_type };
    });
    try {
      if (activeBlueprint) {
        await api.put(`/planner/blueprints/${activeBlueprint.blueprint_id}`, {
          name: bpName, modules,
        });
        setMsg('Blueprint updated');
      } else {
        const { data } = await api.post('/planner/blueprints', {
          name: bpName, grid_size: GRID_SIZE, modules,
        });
        setActiveBlueprint(data);
        setMsg('Blueprint saved');
      }
      const { data: bps } = await api.get('/planner/blueprints');
      setBlueprints(bps);
    } catch (e) { setMsg(formatError(e.response?.data?.detail) || 'Save failed'); }
    setSaving(false);
  };

  const deleteBlueprint = async () => {
    if (!activeBlueprint) return;
    if (!window.confirm(`Delete "${activeBlueprint.name}"?`)) return;
    try {
      await api.delete(`/planner/blueprints/${activeBlueprint.blueprint_id}`);
      newBlueprint();
      const { data: bps } = await api.get('/planner/blueprints');
      setBlueprints(bps);
    } catch {}
  };

  const calculateMaterials = async () => {
    if (!activeBlueprint) { setMsg('Save blueprint first to calculate'); return; }
    setCalculating(true);
    try {
      const { data } = await api.post(`/planner/blueprints/${activeBlueprint.blueprint_id}/calculate`);
      setCalcResult(data);
    } catch (e) { setMsg(formatError(e.response?.data?.detail) || 'Calculation failed'); }
    setCalculating(false);
  };

  const placedCount = Object.keys(grid).length;
  const usable = catalog.filter(m => m.module_type !== 'empty');

  if (loading) return <LoadingState />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Left: Module palette + saved blueprints */}
      <div className="space-y-4">
        {/* Module Palette */}
        <Panel title="Modules" icon={<Layers className="w-3.5 h-3.5 text-[#c4841d]" />}>
          <div className="grid grid-cols-2 gap-1.5">
            {usable.map(m => {
              const Icon = MODULE_ICONS[m.module_type];
              const active = selectedModule === m.module_type;
              return (
                <button key={m.module_type} onClick={() => setSelectedModule(active ? null : m.module_type)}
                  data-testid={`module-${m.module_type}`}
                  className={`flex items-center gap-2 p-2 text-left border transition-all ${
                    active ? 'border-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] hover:border-[#88837a]'
                  }`}>
                  <div className="w-5 h-5 flex items-center justify-center border flex-shrink-0" style={{
                    borderColor: m.color, backgroundColor: `${m.color}20`,
                  }}>
                    {Icon && <Icon className="w-3 h-3" style={{ color: m.color }} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-heading uppercase tracking-widest text-[#d4cfc4] truncate">{m.label}</p>
                    <p className="text-[8px] font-mono text-[#88837a] truncate">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[9px] font-mono text-[#88837a] mt-2">
            {selectedModule ? `Click grid to place. Right-click to remove.` : `Select a module above, then click the grid.`}
          </p>
        </Panel>

        {/* Saved Blueprints */}
        <Panel title="Saved Blueprints" icon={<Archive className="w-3.5 h-3.5 text-[#c4841d]" />}
          actions={<button onClick={newBlueprint} className="text-[9px] font-mono text-[#6b7a3d] hover:text-[#8ba05d]">+ NEW</button>}>
          {blueprints.length === 0 ? (
            <p className="text-[10px] font-mono text-[#88837a] text-center py-3 italic">No blueprints saved yet</p>
          ) : (
            <div className="space-y-1">
              {blueprints.map(bp => (
                <button key={bp.blueprint_id} onClick={() => loadBlueprint(bp)}
                  data-testid={`blueprint-${bp.blueprint_id}`}
                  className={`w-full flex items-center gap-2 p-2 text-left border transition-all ${
                    activeBlueprint?.blueprint_id === bp.blueprint_id
                      ? 'border-[#c4841d] bg-[#c4841d]/10'
                      : 'border-[#2a2520] hover:border-[#88837a]'
                  }`}>
                  <Layers className="w-3.5 h-3.5 text-[#c4841d] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-heading text-[#d4cfc4] truncate">{bp.name}</p>
                    <p className="text-[9px] font-mono text-[#88837a]">{bp.modules?.length || 0} modules</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-[#2a2520]" />
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Center: Grid Canvas */}
      <div className="space-y-3">
        <Panel title="Blueprint Canvas" icon={<Crosshair className="w-3.5 h-3.5 text-[#c4841d]" />}
          actions={
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-[#88837a]">{placedCount} placed</span>
              {activeBlueprint && (
                <button onClick={deleteBlueprint} className="text-[#88837a] hover:text-[#8b3a3a]" title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          }>
          <div className="mb-2 flex gap-2 items-center">
            <input value={bpName} onChange={e => setBpName(e.target.value)} placeholder="Blueprint name..."
              data-testid="blueprint-name-input"
              className="flex-1 bg-[#0a0a0a] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono focus:outline-none focus:border-[#c4841d]" />
            <button onClick={saveBlueprint} disabled={saving} data-testid="save-blueprint-btn"
              className="flex items-center gap-1 px-3 py-1.5 border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 text-[10px] font-heading uppercase tracking-widest disabled:opacity-40">
              <Save className="w-3 h-3" /> {saving ? '...' : 'Save'}
            </button>
          </div>

          {/* Grid */}
          <div className="border border-[#2a2520] bg-[#0a0a0a] p-1" data-testid="planner-grid">
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE;
                const y = Math.floor(i / GRID_SIZE);
                const key = `${x}-${y}`;
                const modType = grid[key];
                const color = modType ? (MODULE_COLORS[modType] || '#c4841d') : '#1a1a1a';
                const Icon = modType ? MODULE_ICONS[modType] : null;
                const catEntry = modType ? catalog.find(m => m.module_type === modType) : null;

                return (
                  <div key={key}
                    onClick={() => handleCellClick(x, y)}
                    onContextMenu={(e) => handleCellRightClick(e, x, y)}
                    title={catEntry ? `${catEntry.label} (${x},${y})` : `Empty (${x},${y})`}
                    className="aspect-square flex items-center justify-center cursor-pointer border transition-all hover:brightness-125"
                    style={{
                      backgroundColor: modType ? `${color}25` : '#111',
                      borderColor: modType ? `${color}60` : '#1e1e1e',
                    }}>
                    {Icon && <Icon className="w-3 h-3" style={{ color }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {msg && <p className="text-[10px] font-mono text-[#88837a] mt-2">{msg}</p>}
        </Panel>

        {/* Calculate button */}
        <button onClick={calculateMaterials} disabled={calculating || !activeBlueprint || placedCount === 0}
          data-testid="calculate-blueprint-btn"
          className="w-full py-2.5 border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 text-[10px] font-heading uppercase tracking-widest disabled:opacity-40 transition-all flex items-center justify-center gap-2">
          {calculating ? <><Loader className="w-3 h-3 animate-spin" /> Calculating...</> : <><Hammer className="w-3 h-3" /> Calculate Materials</>}
        </button>
      </div>

      {/* Right: Material Breakdown */}
      <div className="space-y-4">
        <Panel title="Material Requirements" icon={<Package className="w-3.5 h-3.5 text-[#c4841d]" />}>
          {!calcResult ? (
            <EmptyHint text="Place modules and click Calculate to see total material requirements." />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-1">
                {/* Status */}
                <div className={`flex items-center gap-2 p-2 border ${calcResult.can_build ? 'border-[#6b7a3d] bg-[#6b7a3d]/10' : 'border-[#8b3a3a] bg-[#8b3a3a]/10'}`}>
                  {calcResult.can_build
                    ? <CheckCircle className="w-4 h-4 text-[#6b7a3d]" />
                    : <AlertTriangle className="w-4 h-4 text-[#8b3a3a]" />}
                  <span className={`text-[10px] font-heading uppercase tracking-widest ${calcResult.can_build ? 'text-[#6b7a3d]' : 'text-[#8b3a3a]'}`}>
                    {calcResult.can_build ? 'All materials available' : `Missing ${calcResult.shortfall.length} material(s)`}
                  </span>
                </div>

                {/* Recipes needed */}
                {calcResult.recipes?.length > 0 && (
                  <SubSection title="Recipes to Craft">
                    {calcResult.recipes.map((r, i) => (
                      <ItemRow key={i} name={r.name} value={`x${r.quantity}`} color="#c4841d" />
                    ))}
                  </SubSection>
                )}

                {/* Raw materials */}
                <SubSection title="Raw Materials">
                  {calcResult.breakdown?.map((mat, i) => {
                    const pct = mat.needed > 0 ? Math.min(100, Math.round((mat.have / mat.needed) * 100)) : 100;
                    const short = mat.short > 0;
                    return (
                      <div key={i} className={`border px-2 py-1.5 ${short ? 'border-[#8b3a3a]/40' : 'border-[#6b7a3d]/40'}`}>
                        <div className="flex justify-between text-[10px] font-mono mb-1">
                          <span className="text-[#d4cfc4]">{mat.item}</span>
                          <span className={short ? 'text-[#8b3a3a]' : 'text-[#6b7a3d]'}>{mat.have}/{mat.needed}</span>
                        </div>
                        <div className="h-1 bg-[#2a2520]">
                          <div className={`h-1 transition-all ${short ? 'bg-[#8b3a3a]' : 'bg-[#6b7a3d]'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </SubSection>

                {/* Shortfall */}
                {calcResult.shortfall?.length > 0 && (
                  <SubSection title="Shopping List (Missing)">
                    {calcResult.shortfall.map((s, i) => (
                      <ItemRow key={i} name={s.item} value={`-${s.quantity}`} color="#8b3a3a" />
                    ))}
                  </SubSection>
                )}
              </div>
            </ScrollArea>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ===========================================================================
// LOOT INTEL TAB
// ===========================================================================
function LootIntelTab() {
  const [itemIntel, setItemIntel] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/loot-intel/items');
        setItemIntel(data || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = search
    ? itemIntel.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()))
    : itemIntel;

  if (loading) return <LoadingState />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Item list */}
      <Panel title="Item Database" icon={<Search className="w-3.5 h-3.5 text-[#c4841d]" />}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
          data-testid="loot-intel-search"
          className="w-full bg-[#0a0a0a] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-3 py-2 font-mono mb-3 focus:outline-none focus:border-[#c4841d]" />
        <ScrollArea className="h-[500px]">
          <div className="space-y-1 pr-1">
            {filtered.map(item => (
              <button key={item.item_name}
                onClick={() => setExpanded(expanded === item.item_name ? null : item.item_name)}
                data-testid={`loot-item-${item.item_name.replace(/\s/g, '-')}`}
                className={`w-full text-left border p-2 transition-all ${
                  expanded === item.item_name
                    ? 'border-[#c4841d] bg-[#c4841d]/5'
                    : 'border-[#2a2520] hover:border-[#88837a]'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#d4cfc4]">{item.item_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-[#88837a]">{item.locations.length} spots</span>
                    {expanded === item.item_name
                      ? <ChevronDown className="w-3 h-3 text-[#88837a]" />
                      : <ChevronRight className="w-3 h-3 text-[#88837a]" />}
                  </div>
                </div>
                {expanded === item.item_name && (
                  <div className="mt-2 space-y-1">
                    {item.locations.map((loc, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-2 border-l-2" style={{ borderColor: PROB_COLORS[loc.probability] }}>
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" style={{ color: PROB_COLORS[loc.probability] }} />
                        <span className="text-[#d4cfc4] flex-1">{loc.name}</span>
                        <span className="uppercase text-[8px] px-1 py-0.5 border" style={{
                          color: PROB_COLORS[loc.probability],
                          borderColor: PROB_COLORS[loc.probability],
                        }}>{loc.probability}</span>
                        <span className="uppercase text-[8px] px-1 py-0.5 border" style={{
                          color: DANGER_COLORS[loc.info?.danger] || '#88837a',
                          borderColor: DANGER_COLORS[loc.info?.danger] || '#88837a',
                        }}>{loc.info?.danger || '?'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-[10px] font-mono text-[#88837a] text-center py-4 italic">No items match your search</p>
            )}
          </div>
        </ScrollArea>
      </Panel>

      {/* Location detail */}
      <Panel title="Location Guide" icon={<MapPin className="w-3.5 h-3.5 text-[#c4841d]" />}>
        <LocationGuide selectedItem={expanded} itemIntel={itemIntel} />
      </Panel>
    </div>
  );
}

function LocationGuide({ selectedItem, itemIntel }) {
  const item = itemIntel.find(i => i.item_name === selectedItem);

  if (!item) {
    return <EmptyHint text="Select an item from the list to see detailed location intelligence." />;
  }

  return (
    <ScrollArea className="h-[540px]">
      <div className="space-y-3 pr-1">
        <div className="border border-[#c4841d]/30 bg-[#c4841d]/5 p-3">
          <h4 className="font-heading text-sm text-[#c4841d] uppercase tracking-widest">{item.item_name}</h4>
          <p className="text-[10px] font-mono text-[#88837a] mt-1">
            Found at {item.locations.length} known location{item.locations.length !== 1 ? 's' : ''}
          </p>
        </div>

        {item.locations.map((loc, i) => (
          <div key={i} className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-3.5 h-3.5" style={{ color: PROB_COLORS[loc.probability] }} />
              <h5 className="text-[11px] font-heading uppercase tracking-widest text-[#d4cfc4]">{loc.name}</h5>
              <div className="flex-1" />
              <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 border" style={{
                color: PROB_COLORS[loc.probability], borderColor: PROB_COLORS[loc.probability],
              }}>
                {loc.probability} chance
              </span>
            </div>
            {loc.info?.description && (
              <p className="text-[10px] font-mono text-[#88837a] mb-2">{loc.info.description}</p>
            )}
            <div className="flex gap-3 text-[9px] font-mono">
              {loc.info?.type && (
                <span className="text-[#88837a]">Type: <span className="text-[#d4cfc4]">{loc.info.type}</span></span>
              )}
              {loc.info?.danger && (
                <span className="text-[#88837a]">Danger: <span style={{ color: DANGER_COLORS[loc.info.danger] }}>{loc.info.danger}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}


// ===========================================================================
// Shared UI components
// ===========================================================================

function Panel({ title, icon, actions, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2520] bg-[#111111]">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">{title}</span>
        </div>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#111]/50">
      <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] px-2 py-1.5 border-b border-[#2a2520]">{title}</p>
      <div className="p-2 space-y-1">{children}</div>
    </div>
  );
}

function ItemRow({ name, value, color }) {
  return (
    <div className="flex justify-between items-center text-[10px] font-mono px-2 py-1 border border-[#2a2520]">
      <span className="text-[#d4cfc4]">{name}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div className="text-center py-8">
      <Crosshair className="w-8 h-8 text-[#2a2520] mx-auto mb-2" />
      <p className="text-[10px] font-mono text-[#88837a]">{text}</p>
    </div>
  );
}

function LoadingState() {
  return <p className="text-[#88837a] text-xs font-mono text-center py-8">Loading...</p>;
}
