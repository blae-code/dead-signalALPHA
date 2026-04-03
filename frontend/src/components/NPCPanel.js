import { useState, useEffect, useCallback } from 'react';
import api, { formatError } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, Plus, Trash2, RefreshCw, ChevronRight, X, Edit3,
  Package, MessageSquare, MapPin, Zap, AlertCircle, CheckCircle,
  Shield, Activity,
} from 'lucide-react';

const NPC_ROLES = ['trader', 'quest_giver', 'ally', 'neutral', 'enemy', 'survivor', 'medic', 'mechanic', 'informant'];
const NPC_FACTIONS = ['independent', 'military', 'bandit', 'survivor', 'trader_guild', 'unknown'];
const NPC_STATUSES = ['active', 'inactive', 'dead', 'missing'];
const SPAWN_TYPES = ['fixed', 'roaming', 'event'];
const DIALOGUE_TRIGGERS = ['greeting', 'trade', 'quest', 'warn', 'idle', 'combat', 'death'];

const STATUS_STYLES = {
  active:   'text-[#6b7a3d] border-[#6b7a3d] bg-[#6b7a3d]/10',
  inactive: 'text-[#88837a] border-[#88837a] bg-transparent',
  dead:     'text-[#8b3a3a] border-[#8b3a3a] bg-[#8b3a3a]/10',
  missing:  'text-[#c4841d] border-[#c4841d] bg-[#c4841d]/10',
};

const ROLE_COLORS = {
  trader:     '#c4841d',
  quest_giver:'#6b7a3d',
  ally:       '#3a6b8b',
  neutral:    '#88837a',
  enemy:      '#8b3a3a',
  survivor:   '#6b7a3d',
  medic:      '#3a8b6b',
  mechanic:   '#c4841d',
  informant:  '#7a3d6b',
};

const EMPTY_NPC = {
  name: '', role: 'neutral', faction: 'independent', description: '',
  location_name: '', grid_x: '', grid_y: '', spawn_type: 'fixed',
  inventory: [], dialogue: [], notes: '', hostile: false, health: 100,
};

export default function NPCPanel() {
  const [npcs, setNpcs] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);  // full NPC detail view
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterRole) params.role = filterRole;
      const [list, sum] = await Promise.all([
        api.get('/npcs', { params }),
        api.get('/npcs/summary'),
      ]);
      setNpcs(list.data);
      setSummary(sum.data);
    } catch (e) {
      setError(formatError(e.response?.data?.detail));
    }
    setLoading(false);
  }, [filterStatus, filterRole]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (npc) => {
    try {
      const { data } = await api.get(`/npcs/${npc.npc_id}`);
      setSelected(data);
    } catch { setSelected(npc); }
  };

  if (selected) {
    return <NPCDetail npc={selected} onBack={() => { setSelected(null); load(); }} />;
  }
  if (showCreate) {
    return <NPCForm initial={EMPTY_NPC} onSave={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />;
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {['active','inactive','dead','missing'].map(s => (
          <div key={s} className={`border p-3 text-center cursor-pointer transition-all ${
            filterStatus === s ? STATUS_STYLES[s] : 'border-[#2a2520] text-[#88837a] hover:border-[#88837a]'
          }`} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}>
            <p className="font-heading text-xl font-bold">{summary.by_status?.[s] ?? 0}</p>
            <p className="text-[10px] uppercase tracking-widest mt-0.5">{s}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono"
        >
          <option value="">All Roles</option>
          {NPC_ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
        <button onClick={load} className="text-[#88837a] hover:text-[#c4841d] p-1 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 transition-all"
        >
          <Plus className="w-3 h-3" /> New NPC
        </button>
      </div>

      {error && <p className="text-[#8b3a3a] text-xs mb-3 font-mono">{error}</p>}

      {loading ? (
        <p className="text-[#88837a] text-xs font-mono text-center py-8">Loading...</p>
      ) : npcs.length === 0 ? (
        <div className="border border-dashed border-[#2a2520] p-8 text-center">
          <User className="w-8 h-8 text-[#2a2520] mx-auto mb-2" />
          <p className="text-[#88837a] text-xs font-mono">No NPCs found. Create your first NPC to populate the world.</p>
        </div>
      ) : (
        <ScrollArea className="h-[420px]">
          <div className="space-y-1.5">
            {npcs.map(npc => (
              <NPCRow key={npc.npc_id} npc={npc} onClick={() => openDetail(npc)} onStatusChange={load} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}


function NPCRow({ npc, onClick, onStatusChange }) {
  const [changing, setChanging] = useState(false);

  const quickStatus = async (e, status) => {
    e.stopPropagation();
    setChanging(true);
    try {
      await api.post(`/npcs/${npc.npc_id}/status`, { status });
      onStatusChange();
    } catch {}
    setChanging(false);
  };

  const roleColor = ROLE_COLORS[npc.role] || '#88837a';

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 border border-[#2a2520] bg-[#1a1a1a]/95 hover:border-[#88837a] cursor-pointer transition-all group"
    >
      <div className="w-8 h-8 border flex items-center justify-center flex-shrink-0" style={{ borderColor: roleColor }}>
        <User className="w-4 h-4" style={{ color: roleColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[#d4cfc4] text-sm font-heading truncate">{npc.name}</span>
          {npc.hostile && <AlertCircle className="w-3 h-3 text-[#8b3a3a] flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: roleColor }}>
            {npc.role.replace('_', ' ')}
          </span>
          <span className="text-[#2a2520]">·</span>
          <span className="text-[10px] font-mono text-[#88837a]">{npc.faction}</span>
          {npc.location_name && (
            <>
              <span className="text-[#2a2520]">·</span>
              <MapPin className="w-2.5 h-2.5 text-[#88837a]" />
              <span className="text-[10px] font-mono text-[#88837a] truncate">{npc.location_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_STYLES[npc.status] || ''}`}>
          {npc.status}
        </span>
        {npc.status !== 'dead' && (
          <button
            onClick={e => quickStatus(e, npc.status === 'active' ? 'inactive' : 'active')}
            disabled={changing}
            className="opacity-0 group-hover:opacity-100 text-[#88837a] hover:text-[#c4841d] transition-all p-0.5"
            title={npc.status === 'active' ? 'Deactivate' : 'Activate'}
          >
            <Activity className="w-3 h-3" />
          </button>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-[#2a2520] group-hover:text-[#88837a] transition-colors" />
      </div>
    </div>
  );
}


function NPCDetail({ npc, onBack }) {
  const [data, setData] = useState(npc);
  const [editing, setEditing] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    try {
      const { data: fresh } = await api.get(`/npcs/${npc.npc_id}`);
      setData(fresh);
    } catch {}
  };

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.post(`/npcs/${npc.npc_id}/status`, { status, notes: statusNote });
      setMsg(`Status set to ${status}`);
      setStatusNote('');
      await refresh();
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const spawn = async () => {
    setSpawning(true);
    try {
      await api.post(`/npcs/${npc.npc_id}/spawn`);
      setMsg('Spawn broadcast sent');
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
    setSpawning(false);
  };

  const deleteNpc = async () => {
    if (!window.confirm(`Delete NPC "${data.name}" permanently?`)) return;
    try {
      await api.delete(`/npcs/${data.npc_id}`);
      onBack();
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
  };

  if (editing) {
    return (
      <NPCForm
        initial={data}
        npcId={data.npc_id}
        onSave={() => { setEditing(false); refresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const roleColor = ROLE_COLORS[data.role] || '#88837a';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 border flex items-center justify-center flex-shrink-0" style={{ borderColor: roleColor }}>
          <User className="w-4 h-4" style={{ color: roleColor }} />
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-sm text-[#d4cfc4] uppercase tracking-widest">{data.name}</h3>
          <p className="text-[10px] font-mono text-[#88837a]">
            {data.role.replace('_', ' ')} · {data.faction} · {data.spawn_type}
          </p>
        </div>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_STYLES[data.status] || ''}`}>
          {data.status}
        </span>
        <button onClick={() => setEditing(true)} className="text-[#88837a] hover:text-[#c4841d] p-1 transition-colors">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={deleteNpc} className="text-[#88837a] hover:text-[#8b3a3a] p-1 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {msg && (
        <div className="border border-[#2a2520] px-3 py-2 mb-3 text-[10px] font-mono text-[#88837a]">{msg}</div>
      )}

      <ScrollArea className="h-[440px]">
        <div className="space-y-3 pr-1">
          {/* Info */}
          <Section title="Info">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] font-mono">
              <Field label="HP" value={data.health} />
              <Field label="Hostile" value={data.hostile ? 'YES' : 'no'} valueColor={data.hostile ? '#8b3a3a' : '#88837a'} />
              {data.location_name && <Field label="Location" value={data.location_name} />}
              {(data.grid_x != null && data.grid_y != null) && (
                <Field label="Grid" value={`${data.grid_x}, ${data.grid_y}`} />
              )}
            </div>
            {data.description && (
              <p className="text-[11px] font-mono text-[#88837a] mt-2 leading-relaxed">{data.description}</p>
            )}
          </Section>

          {/* Status controls */}
          <Section title="Status Control">
            <input
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
              placeholder="Optional note (reason, context)..."
              className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono mb-2 placeholder-[#3a3530]"
            />
            <div className="flex flex-wrap gap-1.5">
              {NPC_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={saving || data.status === s}
                  className={`px-2 py-1 text-[9px] font-heading uppercase tracking-widest border transition-all disabled:opacity-40 ${
                    data.status === s ? STATUS_STYLES[s] : 'border-[#2a2520] text-[#88837a] hover:border-[#88837a]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>

          {/* Spawn */}
          {data.status === 'active' && (
            <Section title="Spawn">
              <button
                onClick={spawn}
                disabled={spawning}
                className="flex items-center gap-2 px-3 py-2 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 transition-all disabled:opacity-50"
              >
                <Zap className="w-3 h-3" /> {spawning ? 'Spawning...' : 'Broadcast Spawn Announcement'}
              </button>
              <p className="text-[9px] text-[#88837a] font-mono mt-1">
                Sends a [NPC] announcement in-game via RCON
              </p>
            </Section>
          )}

          {/* Inventory */}
          {data.inventory?.length > 0 && (
            <Section title={`Inventory (${data.inventory.length})`}>
              <div className="space-y-1">
                {data.inventory.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-mono border border-[#2a2520] px-2 py-1">
                    <span className="text-[#d4cfc4]">{item.item_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#88837a]">×{item.quantity}</span>
                      <span className={item.tradeable ? 'text-[#6b7a3d]' : 'text-[#88837a]'}>
                        {item.tradeable ? 'tradeable' : 'no trade'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Dialogue */}
          {data.dialogue?.length > 0 && (
            <Section title={`Dialogue (${data.dialogue.length})`}>
              <div className="space-y-2">
                {data.dialogue.map((d, i) => (
                  <div key={i} className="border border-[#2a2520] px-3 py-2">
                    <span className="text-[9px] font-heading uppercase tracking-widest text-[#c4841d]">{d.trigger}</span>
                    <p className="text-[11px] font-mono text-[#d4cfc4] mt-1 italic">"{d.line}"</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* GM Notes */}
          {data.notes && (
            <Section title="GM Notes">
              <p className="text-[11px] font-mono text-[#88837a] leading-relaxed">{data.notes}</p>
            </Section>
          )}

          {/* Event History */}
          {data.history?.length > 0 && (
            <Section title="Event History">
              <div className="space-y-1">
                {data.history.map((ev, i) => (
                  <div key={i} className="flex items-center gap-3 text-[10px] font-mono border-b border-[#2a2520] pb-1">
                    <span className="text-[#88837a] flex-shrink-0">{ev.timestamp?.slice(0, 16).replace('T', ' ')}</span>
                    <span className="text-[#c4841d] uppercase flex-shrink-0">{ev.event_type?.replace('_', ' ')}</span>
                    {ev.notes && <span className="text-[#88837a] truncate">{ev.notes}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


function NPCForm({ initial, npcId, onSave, onCancel }) {
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Inventory editing
  const [newItem, setNewItem] = useState({ item_name: '', quantity: 1, tradeable: true });
  const addItem = () => {
    if (!newItem.item_name.trim()) return;
    setForm(f => ({ ...f, inventory: [...f.inventory, { ...newItem }] }));
    setNewItem({ item_name: '', quantity: 1, tradeable: true });
  };
  const removeItem = (i) => setForm(f => ({ ...f, inventory: f.inventory.filter((_, idx) => idx !== i) }));

  // Dialogue editing
  const [newLine, setNewLine] = useState({ trigger: 'greeting', line: '' });
  const addLine = () => {
    if (!newLine.line.trim()) return;
    setForm(f => ({ ...f, dialogue: [...f.dialogue, { ...newLine }] }));
    setNewLine({ trigger: 'greeting', line: '' });
  };
  const removeLine = (i) => setForm(f => ({ ...f, dialogue: f.dialogue.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        grid_x: form.grid_x === '' ? null : Number(form.grid_x),
        grid_y: form.grid_y === '' ? null : Number(form.grid_y),
        health: Number(form.health),
      };
      if (npcId) {
        await api.patch(`/npcs/${npcId}`, payload);
      } else {
        await api.post('/npcs', payload);
      }
      onSave();
    } catch (e) {
      setError(formatError(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const field = (key, label, type = 'text', opts = {}) => (
    <div>
      <label className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] block mb-1">{label}</label>
      {opts.as === 'textarea' ? (
        <textarea
          value={form[key] || ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={opts.rows || 3}
          className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-[#c4841d]"
        />
      ) : opts.as === 'select' ? (
        <select
          value={form[key] || ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono"
        >
          {opts.options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key] ?? ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono focus:outline-none focus:border-[#c4841d]"
          {...(opts.min != null ? { min: opts.min } : {})}
          {...(opts.max != null ? { max: opts.max } : {})}
        />
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onCancel} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-heading text-sm text-[#c4841d] uppercase tracking-widest">
          {npcId ? 'Edit NPC' : 'Create NPC'}
        </h3>
      </div>

      <ScrollArea className="h-[460px]">
        <div className="space-y-4 pr-1">
          {/* Core */}
          <Section title="Identity">
            <div className="grid grid-cols-2 gap-3">
              {field('name', 'Name *')}
              {field('role', 'Role', 'text', { as: 'select', options: NPC_ROLES })}
              {field('faction', 'Faction', 'text', { as: 'select', options: NPC_FACTIONS })}
              {field('spawn_type', 'Spawn Type', 'text', { as: 'select', options: SPAWN_TYPES })}
              {field('health', 'Health', 'number', { min: 1, max: 10000 })}
              <div>
                <label className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] block mb-1">Hostile</label>
                <button
                  onClick={() => setForm(f => ({ ...f, hostile: !f.hostile }))}
                  className={`w-full px-2 py-1.5 text-[11px] font-mono border transition-all text-left ${
                    form.hostile ? 'border-[#8b3a3a] text-[#8b3a3a] bg-[#8b3a3a]/10' : 'border-[#2a2520] text-[#88837a]'
                  }`}
                >
                  {form.hostile ? 'YES — Hostile' : 'No — Passive'}
                </button>
              </div>
            </div>
            {field('description', 'Description', 'text', { as: 'textarea', rows: 2 })}
          </Section>

          {/* Location */}
          <Section title="Location">
            <div className="grid grid-cols-3 gap-3">
              {field('location_name', 'Location Name')}
              {field('grid_x', 'Grid X', 'number')}
              {field('grid_y', 'Grid Y', 'number')}
            </div>
          </Section>

          {/* Inventory */}
          <Section title="Inventory">
            <div className="space-y-1 mb-2">
              {form.inventory.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] font-mono border border-[#2a2520] px-2 py-1">
                  <span className="flex-1 text-[#d4cfc4]">{item.item_name}</span>
                  <span className="text-[#88837a]">×{item.quantity}</span>
                  <span className={item.tradeable ? 'text-[#6b7a3d]' : 'text-[#88837a]'}>
                    {item.tradeable ? 'trade' : 'no trade'}
                  </span>
                  <button onClick={() => removeItem(i)} className="text-[#88837a] hover:text-[#8b3a3a]">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <input
                  placeholder="Item name"
                  value={newItem.item_name}
                  onChange={e => setNewItem(v => ({ ...v, item_name: e.target.value }))}
                  className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]"
                />
              </div>
              <input
                type="number" min="0" max="9999"
                value={newItem.quantity}
                onChange={e => setNewItem(v => ({ ...v, quantity: parseInt(e.target.value) || 1 }))}
                className="w-16 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono"
              />
              <button
                onClick={() => setNewItem(v => ({ ...v, tradeable: !v.tradeable }))}
                className={`px-2 py-1 text-[10px] border transition-all ${
                  newItem.tradeable ? 'border-[#6b7a3d] text-[#6b7a3d]' : 'border-[#2a2520] text-[#88837a]'
                }`}
              >
                {newItem.tradeable ? 'Trade' : 'No'}
              </button>
              <button onClick={addItem} className="px-2 py-1 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </Section>

          {/* Dialogue */}
          <Section title="Dialogue">
            <div className="space-y-1 mb-2">
              {form.dialogue.map((d, i) => (
                <div key={i} className="flex items-start gap-2 border border-[#2a2520] px-2 py-1.5">
                  <span className="text-[9px] font-heading uppercase tracking-widest text-[#c4841d] flex-shrink-0 mt-0.5 w-14">{d.trigger}</span>
                  <span className="text-[11px] font-mono text-[#d4cfc4] italic flex-1">"{d.line}"</span>
                  <button onClick={() => removeLine(i)} className="text-[#88837a] hover:text-[#8b3a3a] flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                value={newLine.trigger}
                onChange={e => setNewLine(v => ({ ...v, trigger: e.target.value }))}
                className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono"
              >
                {DIALOGUE_TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                placeholder="Dialogue line..."
                value={newLine.line}
                onChange={e => setNewLine(v => ({ ...v, line: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addLine()}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]"
              />
              <button onClick={addLine} className="px-2 py-1 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </Section>

          {/* GM Notes */}
          <Section title="GM Notes (internal)">
            {field('notes', '', 'text', { as: 'textarea', rows: 3 })}
          </Section>
        </div>
      </ScrollArea>

      {error && <p className="text-[#8b3a3a] text-xs font-mono mt-2">{error}</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="flex-1 py-2 text-[10px] font-heading uppercase tracking-widest border border-[#2a2520] text-[#88837a] hover:border-[#88837a] transition-all">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : npcId ? 'Save Changes' : 'Create NPC'}
        </button>
      </div>
    </div>
  );
}


// ==================== SHARED UI ====================
function Section({ title, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
      {title && (
        <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] mb-2 border-b border-[#2a2520] pb-1.5">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function Field({ label, value, valueColor }) {
  return (
    <div>
      <span className="text-[9px] uppercase tracking-widest text-[#88837a]">{label}: </span>
      <span style={valueColor ? { color: valueColor } : {}} className="text-[#d4cfc4]">{value}</span>
    </div>
  );
}
