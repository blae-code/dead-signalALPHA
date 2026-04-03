import { useState, useEffect, useCallback } from 'react';
import api, { formatError } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package, Archive, Home, Hammer, Plus, X, Edit3, Trash2, RefreshCw,
  MapPin, Eye, EyeOff, ChevronRight, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Shield, Boxes,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared resource list (mirrors backend constants)
// ---------------------------------------------------------------------------
const RESOURCE_NAMES = [
  'Canned Food','Fresh Meat','MRE','Water Bottle','Water Purifier',
  '9mm Ammo','5.56 Ammo','12ga Shells','Bandage','First Aid Kit',
  'Antibiotics','Painkillers','Wood Planks','Metal Sheets','Nails',
  'Concrete Mix','Pistol','Shotgun','Assault Rifle','Melee Weapon',
  'Battery','Fuel Can','Tire','Backpack','Toolbox',
  'Wooden Barricade','Metal Wall','Campfire','Rain Collector','Splint',
  'Improvised Suppressor','Storage Crate','Generator','Concrete Wall','Molotov Cocktail',
].sort();

const RECIPE_NAMES = [
  'Wooden Barricade','Metal Wall','Campfire','Rain Collector','Splint',
  'Improvised Suppressor','Storage Crate','Generator','Concrete Wall','Molotov Cocktail',
];

const CATEGORIES = {
  food:    ['Canned Food','Fresh Meat','MRE'],
  water:   ['Water Bottle','Water Purifier'],
  ammo:    ['9mm Ammo','5.56 Ammo','12ga Shells'],
  medical: ['Bandage','First Aid Kit','Antibiotics','Painkillers'],
  materials: ['Wood Planks','Metal Sheets','Nails','Concrete Mix'],
  weapons: ['Pistol','Shotgun','Assault Rifle','Melee Weapon'],
  electronics: ['Battery'],
  vehicle: ['Fuel Can','Tire'],
  gear:    ['Backpack','Toolbox'],
  crafted: ['Wooden Barricade','Metal Wall','Campfire','Rain Collector','Splint',
            'Improvised Suppressor','Storage Crate','Generator','Concrete Wall','Molotov Cocktail'],
};

const CAT_COLORS = {
  food:'#6b7a3d', water:'#3a6b8b', ammo:'#8b3a3a', medical:'#3a8b6b',
  materials:'#8b6b3a', weapons:'#8b3a3a', electronics:'#c4841d',
  vehicle:'#88837a', gear:'#7a3d6b', crafted:'#3a4a5c',
};

const STATUS_PILL = {
  active:    'border-[#6b7a3d] text-[#6b7a3d]',
  raided:    'border-[#8b3a3a] text-[#8b3a3a]',
  unknown:   'border-[#c4841d] text-[#c4841d]',
  emptied:   'border-[#88837a] text-[#88837a]',
  under_construction: 'border-[#c4841d] text-[#c4841d]',
  abandoned: 'border-[#88837a] text-[#88837a]',
  destroyed: 'border-[#8b3a3a] text-[#8b3a3a]',
};

// ---------------------------------------------------------------------------
// Root component — tab switcher
// ---------------------------------------------------------------------------
export default function InventoryPanel() {
  const [tab, setTab] = useState('items');

  const tabs = [
    { id: 'items',   label: 'My Items',      icon: <Package className="w-3 h-3" /> },
    { id: 'caches',  label: 'Caches',        icon: <Archive className="w-3 h-3" /> },
    { id: 'bases',   label: 'Bases',         icon: <Home className="w-3 h-3" /> },
    { id: 'crafting',label: 'Crafting',      icon: <Hammer className="w-3 h-3" /> },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest whitespace-nowrap transition-all border ${
              tab === t.id
                ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10'
                : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4] hover:border-[#88837a]'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'items'    && <MyItemsPanel />}
      {tab === 'caches'   && <CachesPanel />}
      {tab === 'bases'    && <BasesPanel />}
      {tab === 'crafting' && <CraftingPanel />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MY ITEMS
// ---------------------------------------------------------------------------
function MyItemsPanel() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});  // { item_name: { quantity, notes } }
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/inventory/items');
      setInventory(data.items || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    const d = {};
    inventory.forEach(it => { d[it.item_name] = { quantity: it.quantity, notes: it.notes || '' }; });
    setDraft(d);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = Object.entries(draft)
        .filter(([, v]) => v.quantity > 0)
        .map(([item_name, v]) => ({ item_name, quantity: v.quantity, notes: v.notes }));
      await api.put('/inventory/items', { items });
      setMsg('Inventory saved');
      setEditing(false);
      await load();
    } catch (e) { setMsg(formatError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const setQty = (name, qty) => setDraft(d => ({ ...d, [name]: { ...d[name], quantity: Math.max(0, qty) } }));
  const setNote = (name, notes) => setDraft(d => ({ ...d, [name]: { ...d[name], notes } }));

  const displayed = filterCat
    ? inventory.filter(it => CATEGORIES[filterCat]?.includes(it.item_name))
    : inventory;

  const totalItems = inventory.reduce((a, it) => a + it.quantity, 0);
  const totalTypes = inventory.length;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Types tracked" value={totalTypes} color="#c4841d" />
        <Stat label="Total units" value={totalItems} color="#6b7a3d" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono">
          <option value="">All Categories</option>
          {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} className="text-[#88837a] hover:text-[#c4841d] p-1"><RefreshCw className="w-3.5 h-3.5" /></button>
        <div className="flex-1" />
        {!editing ? (
          <button onClick={startEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 transition-all">
            <Edit3 className="w-3 h-3" /> Edit Inventory
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#2a2520] text-[#88837a] hover:border-[#88837a]">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        )}
      </div>

      {msg && <p className="text-[#88837a] text-[10px] font-mono mb-2">{msg}</p>}

      {editing ? (
        <ScrollArea className="h-[420px]">
          <div className="space-y-4 pr-1">
            {Object.entries(CATEGORIES).map(([cat, names]) => (
              <div key={cat} className="border border-[#2a2520] bg-[#1a1a1a]/95">
                <div className="px-3 py-1.5 border-b border-[#2a2520]" style={{ borderLeftWidth: 3, borderLeftColor: CAT_COLORS[cat] }}>
                  <span className="text-[9px] font-heading uppercase tracking-widest" style={{ color: CAT_COLORS[cat] }}>{cat}</span>
                </div>
                <div className="p-2 grid grid-cols-1 gap-1.5">
                  {names.map(name => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[#d4cfc4] w-44 flex-shrink-0">{name}</span>
                      <input type="number" min="0" max="99999"
                        value={draft[name]?.quantity ?? 0}
                        onChange={e => setQty(name, parseInt(e.target.value) || 0)}
                        className="w-20 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
                      <input type="text" placeholder="location / note"
                        value={draft[name]?.notes ?? ''}
                        onChange={e => setNote(name, e.target.value)}
                        className="flex-1 bg-[#111] border border-[#2a2520] text-[#88837a] text-[10px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : loading ? (
        <p className="text-[#88837a] text-xs text-center py-8 font-mono">Loading...</p>
      ) : displayed.length === 0 ? (
        <EmptyState icon={<Package className="w-8 h-8" />} text="No items tracked. Click Edit Inventory to log your supplies." />
      ) : (
        <ScrollArea className="h-[420px]">
          <div className="space-y-1 pr-1">
            {displayed.map(it => (
              <div key={it.item_name} className="flex items-center justify-between border border-[#2a2520] px-3 py-2 bg-[#1a1a1a]/95">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-[#d4cfc4]">{it.item_name}</span>
                  {it.notes && <span className="text-[10px] font-mono text-[#88837a] italic">{it.notes}</span>}
                </div>
                <span className="text-sm font-heading font-bold text-[#c4841d]">×{it.quantity}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CACHES
// ---------------------------------------------------------------------------
const CACHE_STATUSES = ['active','raided','unknown','emptied'];
const VISIBILITIES = ['private','faction','public'];

function CachesPanel() {
  const [caches, setCaches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/inventory/caches'); setCaches(data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (showCreate) return <CacheForm onSave={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />;
  if (selected) return <CacheDetail cache={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#88837a]">
          <Archive className="w-3.5 h-3.5 text-[#c4841d]" />
          <span>{caches.length} cache{caches.length !== 1 ? 's' : ''} accessible</span>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-[#88837a] hover:text-[#c4841d] p-1"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10">
            <Plus className="w-3 h-3" /> New Cache
          </button>
        </div>
      </div>
      {loading ? <p className="text-[#88837a] text-xs text-center py-8 font-mono">Loading...</p>
        : caches.length === 0 ? <EmptyState icon={<Archive className="w-8 h-8" />} text="No caches. Create one to track hidden supply stashes." />
        : (
          <ScrollArea className="h-[430px]">
            <div className="space-y-1.5 pr-1">
              {caches.map(c => (
                <div key={c.cache_id} onClick={() => setSelected(c)}
                  className="flex items-center gap-3 p-3 border border-[#2a2520] bg-[#1a1a1a]/95 hover:border-[#88837a] cursor-pointer transition-all group">
                  <Archive className="w-4 h-4 text-[#c4841d] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-heading text-[#d4cfc4] truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[#88837a]">
                      {c.location_name && <><MapPin className="w-2.5 h-2.5" /><span className="truncate">{c.location_name}</span></>}
                      <span className="text-[#2a2520]">·</span>
                      <span>{c.contents?.length || 0} item types</span>
                      <span className="text-[#2a2520]">·</span>
                      <span>{c.visibility}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_PILL[c.status] || ''}`}>{c.status}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#2a2520] group-hover:text-[#88837a]" />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
    </div>
  );
}

function CacheDetail({ cache, onBack }) {
  const [data, setData] = useState(cache);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    try { const { data: d } = await api.get(`/inventory/caches/${cache.cache_id}`); setData(d); } catch {}
  };

  const del = async () => {
    if (!window.confirm(`Delete cache "${data.name}"?`)) return;
    try { await api.delete(`/inventory/caches/${data.cache_id}`); onBack(); }
    catch (e) { setMsg(formatError(e.response?.data?.detail)); }
  };

  const markStatus = async (status) => {
    try {
      await api.patch(`/inventory/caches/${data.cache_id}`, { status });
      await refresh();
    } catch (e) { setMsg(formatError(e.response?.data?.detail)); }
  };

  if (editing) return <CacheForm existing={data} onSave={() => { setEditing(false); refresh(); }} onCancel={() => setEditing(false)} />;

  const totalUnits = data.contents?.reduce((a, it) => a + it.quantity, 0) ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-[#88837a] hover:text-[#c4841d]"><X className="w-4 h-4" /></button>
        <Archive className="w-5 h-5 text-[#c4841d]" />
        <div className="flex-1">
          <h3 className="font-heading text-sm text-[#d4cfc4] uppercase tracking-widest">{data.name}</h3>
          <p className="text-[10px] font-mono text-[#88837a]">{data.visibility} · {data.location_name || 'no location'}</p>
        </div>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_PILL[data.status] || ''}`}>{data.status}</span>
        <button onClick={() => setEditing(true)} className="text-[#88837a] hover:text-[#c4841d] p-1"><Edit3 className="w-3.5 h-3.5" /></button>
        <button onClick={del} className="text-[#88837a] hover:text-[#8b3a3a] p-1"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {msg && <p className="text-[10px] font-mono text-[#88837a] mb-2">{msg}</p>}
      <ScrollArea className="h-[440px]">
        <div className="space-y-3 pr-1">
          {(data.grid_x != null || data.location_name) && (
            <InfoSection title="Location">
              <div className="text-[11px] font-mono text-[#88837a] space-y-0.5">
                {data.location_name && <p><MapPin className="w-3 h-3 inline mr-1" />{data.location_name}</p>}
                {data.grid_x != null && <p>Grid: {data.grid_x}, {data.grid_y}</p>}
              </div>
            </InfoSection>
          )}

          <InfoSection title={`Contents (${data.contents?.length || 0} types · ${totalUnits} units)`}>
            {!data.contents?.length ? (
              <p className="text-[10px] font-mono text-[#88837a] italic">Cache is empty</p>
            ) : (
              <div className="space-y-1">
                {data.contents.map((it, i) => (
                  <div key={i} className="flex justify-between items-center border border-[#2a2520] px-2 py-1 text-[11px] font-mono">
                    <span className="text-[#d4cfc4]">{it.item_name}</span>
                    <span className="text-[#c4841d] font-bold">×{it.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </InfoSection>

          <InfoSection title="Status Control">
            <div className="flex flex-wrap gap-1.5">
              {CACHE_STATUSES.map(s => (
                <button key={s} onClick={() => markStatus(s)}
                  className={`px-2 py-1 text-[9px] font-heading uppercase tracking-widest border transition-all ${
                    data.status === s ? (STATUS_PILL[s] || '') : 'border-[#2a2520] text-[#88837a] hover:border-[#88837a]'
                  }`}>{s}</button>
              ))}
            </div>
          </InfoSection>

          {data.notes && <InfoSection title="Notes"><p className="text-[11px] font-mono text-[#88837a]">{data.notes}</p></InfoSection>}
        </div>
      </ScrollArea>
    </div>
  );
}

function CacheForm({ existing, onSave, onCancel }) {
  const [form, setForm] = useState(existing ? {
    name: existing.name, location_name: existing.location_name || '',
    grid_x: existing.grid_x ?? '', grid_y: existing.grid_y ?? '',
    visibility: existing.visibility, status: existing.status,
    contents: existing.contents || [], notes: existing.notes || '',
  } : { name: '', location_name: '', grid_x: '', grid_y: '', visibility: 'private', status: 'active', contents: [], notes: '' });
  const [newItem, setNewItem] = useState({ item_name: '', quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => {
    if (!newItem.item_name.trim()) return;
    setForm(f => {
      const existing_idx = f.contents.findIndex(c => c.item_name === newItem.item_name);
      if (existing_idx >= 0) {
        const contents = [...f.contents];
        contents[existing_idx] = { ...contents[existing_idx], quantity: contents[existing_idx].quantity + newItem.quantity };
        return { ...f, contents };
      }
      return { ...f, contents: [...f.contents, { item_name: newItem.item_name.trim(), quantity: newItem.quantity }] };
    });
    setNewItem({ item_name: '', quantity: 1 });
  };

  const removeItem = (i) => setForm(f => ({ ...f, contents: f.contents.filter((_, idx) => idx !== i) }));
  const updateQty = (i, qty) => setForm(f => {
    const c = [...f.contents]; c[i] = { ...c[i], quantity: Math.max(0, qty) };
    return { ...f, contents: c.filter(x => x.quantity > 0) };
  });

  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = { ...form, grid_x: form.grid_x === '' ? null : Number(form.grid_x), grid_y: form.grid_y === '' ? null : Number(form.grid_y) };
      if (existing) await api.patch(`/inventory/caches/${existing.cache_id}`, payload);
      else await api.post('/inventory/caches', payload);
      onSave();
    } catch (e) { setError(formatError(e.response?.data?.detail)); }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onCancel} className="text-[#88837a] hover:text-[#c4841d]"><X className="w-4 h-4" /></button>
        <h3 className="font-heading text-sm text-[#c4841d] uppercase tracking-widest">{existing ? 'Edit Cache' : 'New Cache'}</h3>
      </div>
      <ScrollArea className="h-[460px]">
        <div className="space-y-3 pr-1">
          <InfoSection title="Identity">
            <div className="space-y-2">
              <FormRow label="Name *"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} /></FormRow>
              <div className="grid grid-cols-2 gap-2">
                <FormRow label="Visibility">
                  <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))} className={INPUT}>
                    {VISIBILITIES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={INPUT}>
                    {CACHE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FormRow>
              </div>
            </div>
          </InfoSection>
          <InfoSection title="Location">
            <div className="grid grid-cols-3 gap-2">
              <FormRow label="Location Name" className="col-span-1"><input value={form.location_name} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} className={INPUT} placeholder="e.g. Riverside Mall" /></FormRow>
              <FormRow label="Grid X"><input type="number" value={form.grid_x} onChange={e => setForm(f => ({ ...f, grid_x: e.target.value }))} className={INPUT} /></FormRow>
              <FormRow label="Grid Y"><input type="number" value={form.grid_y} onChange={e => setForm(f => ({ ...f, grid_y: e.target.value }))} className={INPUT} /></FormRow>
            </div>
          </InfoSection>
          <InfoSection title="Contents">
            <div className="space-y-1 mb-2">
              {form.contents.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-[11px] font-mono text-[#d4cfc4]">{it.item_name}</span>
                  <input type="number" min="1" value={it.quantity}
                    onChange={e => updateQty(i, parseInt(e.target.value) || 1)}
                    className="w-20 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono" />
                  <button onClick={() => removeItem(i)} className="text-[#88837a] hover:text-[#8b3a3a]"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input list="cache-items" placeholder="Item name" value={newItem.item_name}
                onChange={e => setNewItem(v => ({ ...v, item_name: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
              <datalist id="cache-items">{RESOURCE_NAMES.map(n => <option key={n} value={n} />)}</datalist>
              <input type="number" min="1" value={newItem.quantity}
                onChange={e => setNewItem(v => ({ ...v, quantity: parseInt(e.target.value) || 1 }))}
                className="w-20 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono" />
              <button onClick={addItem} className="px-2 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]"><Plus className="w-3 h-3" /></button>
            </div>
          </InfoSection>
          <InfoSection title="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-[#c4841d]" />
          </InfoSection>
        </div>
      </ScrollArea>
      {error && <p className="text-[#8b3a3a] text-xs font-mono mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="flex-1 py-2 text-[10px] font-heading uppercase border border-[#2a2520] text-[#88837a] hover:border-[#88837a]">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 text-[10px] font-heading uppercase border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 disabled:opacity-50">
          {saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Cache'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BASES
// ---------------------------------------------------------------------------
const BASE_TYPES = ['personal','faction','outpost','safe_house'];
const BASE_STATUSES = ['active','under_construction','abandoned','destroyed'];

function BasesPanel() {
  const [bases, setBases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/inventory/bases'); setBases(data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (showCreate) return <BaseForm onSave={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />;
  if (selected) return <BaseDetail base={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono text-[#88837a]">{bases.length} base{bases.length !== 1 ? 's' : ''} accessible</span>
        <div className="flex gap-2">
          <button onClick={load} className="text-[#88837a] hover:text-[#c4841d] p-1"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#3a6b8b] text-[#3a6b8b] hover:bg-[#3a6b8b]/10">
            <Plus className="w-3 h-3" /> New Base
          </button>
        </div>
      </div>
      {loading ? <p className="text-[#88837a] text-xs text-center py-8 font-mono">Loading...</p>
        : bases.length === 0 ? <EmptyState icon={<Home className="w-8 h-8" />} text="No bases established. Create one to manage your home territory." />
        : (
          <ScrollArea className="h-[430px]">
            <div className="space-y-1.5 pr-1">
              {bases.map(b => (
                <div key={b.base_id} onClick={() => setSelected(b)}
                  className="flex items-center gap-3 p-3 border border-[#2a2520] bg-[#1a1a1a]/95 hover:border-[#88837a] cursor-pointer transition-all group">
                  <Home className="w-4 h-4 text-[#3a6b8b] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-heading text-[#d4cfc4] truncate">{b.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[#88837a]">
                      <span className="text-[#3a6b8b]">{b.base_type}</span>
                      <span className="text-[#2a2520]">·</span>
                      {b.location_name && <><MapPin className="w-2.5 h-2.5" /><span className="truncate">{b.location_name}</span><span className="text-[#2a2520]">·</span></>}
                      <span>{b.rooms?.length || 0} rooms</span>
                      <span className="text-[#2a2520]">·</span>
                      <span>{b.storage?.length || 0} storage types</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_PILL[b.status] || ''}`}>{b.status}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#2a2520] group-hover:text-[#88837a]" />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
    </div>
  );
}

function BaseDetail({ base, onBack }) {
  const [data, setData] = useState(base);
  const [editing, setEditing] = useState(false);
  const [expandRooms, setExpandRooms] = useState(true);
  const [expandStorage, setExpandStorage] = useState(true);

  const refresh = async () => {
    try { const { d } = await api.get(`/inventory/bases/${base.base_id}`); if (d) setData(d); } catch {}
  };

  const del = async () => {
    if (!window.confirm(`Delete base "${data.name}"?`)) return;
    try { await api.delete(`/inventory/bases/${data.base_id}`); onBack(); } catch {}
  };

  if (editing) return <BaseForm existing={data} onSave={() => { setEditing(false); refresh(); }} onCancel={() => setEditing(false)} />;

  const totalStorage = data.storage?.reduce((a, it) => a + it.quantity, 0) ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-[#88837a] hover:text-[#c4841d]"><X className="w-4 h-4" /></button>
        <Home className="w-5 h-5 text-[#3a6b8b]" />
        <div className="flex-1">
          <h3 className="font-heading text-sm text-[#d4cfc4] uppercase tracking-widest">{data.name}</h3>
          <p className="text-[10px] font-mono text-[#88837a]">{data.base_type} · {data.visibility} · {data.location_name || 'no location'}</p>
        </div>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_PILL[data.status] || ''}`}>{data.status}</span>
        <button onClick={() => setEditing(true)} className="text-[#88837a] hover:text-[#c4841d] p-1"><Edit3 className="w-3.5 h-3.5" /></button>
        <button onClick={del} className="text-[#88837a] hover:text-[#8b3a3a] p-1"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <ScrollArea className="h-[440px]">
        <div className="space-y-3 pr-1">
          {/* Rooms */}
          <Collapsible title={`Rooms (${data.rooms?.length || 0})`} open={expandRooms} onToggle={() => setExpandRooms(v => !v)}>
            {!data.rooms?.length ? <p className="text-[10px] font-mono text-[#88837a] italic">No rooms defined</p>
              : data.rooms.map((r, i) => (
                <div key={i} className="border border-[#2a2520] px-3 py-2 mb-1">
                  <p className="text-[11px] font-heading uppercase tracking-widest text-[#d4cfc4]">{r.name}</p>
                  {r.description && <p className="text-[10px] font-mono text-[#88837a] mt-0.5">{r.description}</p>}
                </div>
              ))}
          </Collapsible>
          {/* Defenses */}
          {data.defenses?.length > 0 && (
            <InfoSection title={`Defenses (${data.defenses.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {data.defenses.map((d, i) => (
                  <span key={i} className="border border-[#8b3a3a] text-[#8b3a3a] text-[10px] font-mono px-2 py-0.5">{d}</span>
                ))}
              </div>
            </InfoSection>
          )}
          {/* Storage */}
          <Collapsible title={`Storage (${data.storage?.length || 0} types · ${totalStorage} units)`} open={expandStorage} onToggle={() => setExpandStorage(v => !v)}>
            {!data.storage?.length ? <p className="text-[10px] font-mono text-[#88837a] italic">Storage empty</p>
              : data.storage.map((it, i) => (
                <div key={i} className="flex justify-between items-center border border-[#2a2520] px-2 py-1 text-[11px] font-mono mb-1">
                  <span className="text-[#d4cfc4]">{it.item_name}</span>
                  <span className="text-[#c4841d] font-bold">×{it.quantity}</span>
                </div>
              ))}
          </Collapsible>
          {data.notes && <InfoSection title="Notes"><p className="text-[11px] font-mono text-[#88837a]">{data.notes}</p></InfoSection>}
        </div>
      </ScrollArea>
    </div>
  );
}

function BaseForm({ existing, onSave, onCancel }) {
  const empty = { name: '', base_type: 'personal', visibility: 'private', location_name: '', grid_x: '', grid_y: '', rooms: [], storage: [], defenses: [], status: 'active', notes: '' };
  const [form, setForm] = useState(existing ? {
    name: existing.name, base_type: existing.base_type, visibility: existing.visibility,
    location_name: existing.location_name || '', grid_x: existing.grid_x ?? '', grid_y: existing.grid_y ?? '',
    rooms: existing.rooms || [], storage: existing.storage || [],
    defenses: existing.defenses || [], status: existing.status, notes: existing.notes || '',
  } : empty);

  const [newRoom, setNewRoom] = useState({ name: '', description: '' });
  const [newDef, setNewDef] = useState('');
  const [newStorage, setNewStorage] = useState({ item_name: '', quantity: 1 });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');

  const addRoom = () => {
    if (!newRoom.name.trim()) return;
    setForm(f => ({ ...f, rooms: [...f.rooms, { ...newRoom }] }));
    setNewRoom({ name: '', description: '' });
  };
  const addDef = () => {
    if (!newDef.trim()) return;
    setForm(f => ({ ...f, defenses: [...f.defenses, newDef.trim()] }));
    setNewDef('');
  };
  const addStorage = () => {
    if (!newStorage.item_name.trim()) return;
    setForm(f => {
      const idx = f.storage.findIndex(s => s.item_name === newStorage.item_name);
      if (idx >= 0) { const s = [...f.storage]; s[idx] = { ...s[idx], quantity: s[idx].quantity + newStorage.quantity }; return { ...f, storage: s }; }
      return { ...f, storage: [...f.storage, { ...newStorage }] };
    });
    setNewStorage({ item_name: '', quantity: 1 });
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = { ...form, grid_x: form.grid_x === '' ? null : Number(form.grid_x), grid_y: form.grid_y === '' ? null : Number(form.grid_y) };
      if (existing) await api.patch(`/inventory/bases/${existing.base_id}`, payload);
      else await api.post('/inventory/bases', payload);
      onSave();
    } catch (e) { setError(formatError(e.response?.data?.detail)); }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onCancel} className="text-[#88837a] hover:text-[#c4841d]"><X className="w-4 h-4" /></button>
        <h3 className="font-heading text-sm text-[#c4841d] uppercase tracking-widest">{existing ? 'Edit Base' : 'Establish Base'}</h3>
      </div>
      <ScrollArea className="h-[460px]">
        <div className="space-y-3 pr-1">
          <InfoSection title="Identity">
            <div className="space-y-2">
              <FormRow label="Name *"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} /></FormRow>
              <div className="grid grid-cols-3 gap-2">
                <FormRow label="Type"><select value={form.base_type} onChange={e => setForm(f => ({ ...f, base_type: e.target.value }))} className={INPUT}>{BASE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></FormRow>
                <FormRow label="Visibility"><select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))} className={INPUT}>{VISIBILITIES.map(v => <option key={v} value={v}>{v}</option>)}</select></FormRow>
                <FormRow label="Status"><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={INPUT}>{BASE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></FormRow>
              </div>
            </div>
          </InfoSection>
          <InfoSection title="Location">
            <div className="grid grid-cols-3 gap-2">
              <FormRow label="Location Name"><input value={form.location_name} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} className={INPUT} placeholder="e.g. North Warehouse" /></FormRow>
              <FormRow label="Grid X"><input type="number" value={form.grid_x} onChange={e => setForm(f => ({ ...f, grid_x: e.target.value }))} className={INPUT} /></FormRow>
              <FormRow label="Grid Y"><input type="number" value={form.grid_y} onChange={e => setForm(f => ({ ...f, grid_y: e.target.value }))} className={INPUT} /></FormRow>
            </div>
          </InfoSection>
          <InfoSection title="Rooms">
            <div className="space-y-1 mb-2">{form.rooms.map((r, i) => (
              <div key={i} className="flex items-center gap-2 border border-[#2a2520] px-2 py-1">
                <span className="flex-1 text-[11px] font-mono text-[#d4cfc4]">{r.name}</span>
                {r.description && <span className="text-[10px] text-[#88837a] font-mono truncate flex-1">{r.description}</span>}
                <button onClick={() => setForm(f => ({ ...f, rooms: f.rooms.filter((_, idx) => idx !== i) }))} className="text-[#88837a] hover:text-[#8b3a3a]"><X className="w-3 h-3" /></button>
              </div>
            ))}</div>
            <div className="flex gap-2">
              <input placeholder="Room name" value={newRoom.name} onChange={e => setNewRoom(v => ({ ...v, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addRoom()}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
              <input placeholder="Description" value={newRoom.description} onChange={e => setNewRoom(v => ({ ...v, description: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#88837a] text-[10px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
              <button onClick={addRoom} className="px-2 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]"><Plus className="w-3 h-3" /></button>
            </div>
          </InfoSection>
          <InfoSection title="Defenses">
            <div className="flex flex-wrap gap-1.5 mb-2">{form.defenses.map((d, i) => (
              <span key={i} className="flex items-center gap-1 border border-[#8b3a3a] text-[#8b3a3a] text-[10px] font-mono px-1.5 py-0.5">
                {d}<button onClick={() => setForm(f => ({ ...f, defenses: f.defenses.filter((_, idx) => idx !== i) }))}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}</div>
            <div className="flex gap-2">
              <input placeholder="e.g. Metal wall north side" value={newDef} onChange={e => setNewDef(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDef()}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
              <button onClick={addDef} className="px-2 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]"><Plus className="w-3 h-3" /></button>
            </div>
          </InfoSection>
          <InfoSection title="Storage">
            <div className="space-y-1 mb-2">{form.storage.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-[11px] font-mono text-[#d4cfc4]">{it.item_name}</span>
                <input type="number" min="1" value={it.quantity}
                  onChange={e => { const s = [...form.storage]; s[i] = { ...s[i], quantity: parseInt(e.target.value) || 1 }; setForm(f => ({ ...f, storage: s })); }}
                  className="w-20 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono" />
                <button onClick={() => setForm(f => ({ ...f, storage: f.storage.filter((_, idx) => idx !== i) }))} className="text-[#88837a] hover:text-[#8b3a3a]"><X className="w-3 h-3" /></button>
              </div>
            ))}</div>
            <div className="flex gap-2">
              <input list="base-items" placeholder="Item name" value={newStorage.item_name}
                onChange={e => setNewStorage(v => ({ ...v, item_name: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
              <datalist id="base-items">{RESOURCE_NAMES.map(n => <option key={n} value={n} />)}</datalist>
              <input type="number" min="1" value={newStorage.quantity}
                onChange={e => setNewStorage(v => ({ ...v, quantity: parseInt(e.target.value) || 1 }))}
                className="w-20 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono" />
              <button onClick={addStorage} className="px-2 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]"><Plus className="w-3 h-3" /></button>
            </div>
          </InfoSection>
          <InfoSection title="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-[#c4841d]" />
          </InfoSection>
        </div>
      </ScrollArea>
      {error && <p className="text-[#8b3a3a] text-xs font-mono mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="flex-1 py-2 text-[10px] font-heading uppercase border border-[#2a2520] text-[#88837a] hover:border-[#88837a]">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 text-[10px] font-heading uppercase border border-[#3a6b8b] text-[#3a6b8b] hover:bg-[#3a6b8b]/10 disabled:opacity-50">
          {saving ? 'Saving...' : existing ? 'Save Changes' : 'Establish Base'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CRAFTING QUEUE + CALCULATOR
// ---------------------------------------------------------------------------
function CraftingPanel() {
  const [queue, setQueue] = useState([]);
  const [calc, setCalc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ recipe_name: RECIPE_NAMES[0], quantity: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/inventory/crafting-queue'); setQueue(data.items || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveQueue = async (items) => {
    setSaving(true);
    try { await api.put('/inventory/crafting-queue', { items }); setQueue(items); } catch {}
    setSaving(false);
  };

  const addToQueue = () => {
    if (!newRecipe.recipe_name) return;
    const updated = [...queue];
    const existing = updated.findIndex(q => q.recipe_name === newRecipe.recipe_name);
    if (existing >= 0) updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + newRecipe.quantity };
    else updated.push({ recipe_name: newRecipe.recipe_name, quantity: newRecipe.quantity });
    setShowAddRecipe(false);
    saveQueue(updated);
  };

  const removeFromQueue = (i) => saveQueue(queue.filter((_, idx) => idx !== i));
  const updateQueueQty = (i, qty) => {
    if (qty < 1) return removeFromQueue(i);
    const u = [...queue]; u[i] = { ...u[i], quantity: qty };
    saveQueue(u);
  };

  const calculate = async () => {
    setCalculating(true);
    try { const { data } = await api.post('/inventory/crafting-queue/calculate'); setCalc(data); } catch {}
    setCalculating(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Queue */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-heading uppercase tracking-widest text-[#c4841d]">Crafting Queue</p>
          <div className="flex gap-2">
            <button onClick={() => setShowAddRecipe(v => !v)} className="flex items-center gap-1 text-[10px] font-mono text-[#88837a] hover:text-[#c4841d] transition-colors">
              <Plus className="w-3 h-3" /> Add
            </button>
            <button onClick={load} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {showAddRecipe && (
          <div className="border border-[#2a2520] p-2 mb-3 flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[9px] uppercase tracking-widest text-[#88837a] block mb-1">Recipe</label>
              <select value={newRecipe.recipe_name} onChange={e => setNewRecipe(v => ({ ...v, recipe_name: e.target.value }))} className={INPUT}>
                {RECIPE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="w-16">
              <label className="text-[9px] uppercase tracking-widest text-[#88837a] block mb-1">Qty</label>
              <input type="number" min="1" max="999" value={newRecipe.quantity}
                onChange={e => setNewRecipe(v => ({ ...v, quantity: parseInt(e.target.value) || 1 }))}
                className={INPUT} />
            </div>
            <button onClick={addToQueue} className="px-2 py-1.5 border border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10 text-[10px] font-heading uppercase">Add</button>
          </div>
        )}

        {loading ? <p className="text-[#88837a] text-xs font-mono text-center py-4">Loading...</p>
          : queue.length === 0 ? <p className="text-[#88837a] text-[10px] font-mono text-center py-6 italic">Queue is empty. Add recipes to plan your crafting.</p>
          : (
            <div className="space-y-1 mb-3">
              {queue.map((q, i) => (
                <div key={i} className="flex items-center gap-2 border border-[#2a2520] px-2 py-1.5">
                  <Hammer className="w-3 h-3 text-[#c4841d] flex-shrink-0" />
                  <span className="flex-1 text-[11px] font-mono text-[#d4cfc4]">{q.recipe_name}</span>
                  <input type="number" min="1" max="999" value={q.quantity}
                    onChange={e => updateQueueQty(i, parseInt(e.target.value) || 0)}
                    className="w-16 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-1.5 py-0.5 font-mono" />
                  <button onClick={() => removeFromQueue(i)} className="text-[#88837a] hover:text-[#8b3a3a]"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

        <button onClick={calculate} disabled={calculating || queue.length === 0}
          className="w-full py-2 text-[10px] font-heading uppercase tracking-widest border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 disabled:opacity-40 transition-all">
          {calculating ? 'Calculating...' : 'Calculate Requirements'}
        </button>
      </div>

      {/* Results */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
        <p className="text-[9px] font-heading uppercase tracking-widest text-[#c4841d] mb-3">Analysis</p>
        {!calc ? (
          <div className="text-center py-8">
            <Boxes className="w-8 h-8 text-[#2a2520] mx-auto mb-2" />
            <p className="text-[10px] font-mono text-[#88837a]">Build your queue and click Calculate to see what ingredients you need vs what you have.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-1">
              {/* Overall status */}
              <div className={`flex items-center gap-2 p-2 border ${calc.can_complete_queue ? 'border-[#6b7a3d] bg-[#6b7a3d]/10' : 'border-[#8b3a3a] bg-[#8b3a3a]/10'}`}>
                {calc.can_complete_queue
                  ? <CheckCircle className="w-4 h-4 text-[#6b7a3d]" />
                  : <AlertTriangle className="w-4 h-4 text-[#8b3a3a]" />}
                <span className={`text-[11px] font-heading uppercase tracking-widest ${calc.can_complete_queue ? 'text-[#6b7a3d]' : 'text-[#8b3a3a]'}`}>
                  {calc.can_complete_queue ? 'All ingredients available' : `Missing ${calc.shortfall.length} ingredient type${calc.shortfall.length !== 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Shortfall */}
              {calc.shortfall.length > 0 && (
                <InfoSection title="Still Need">
                  <div className="space-y-1">
                    {calc.shortfall.map((it, i) => (
                      <div key={i} className="flex justify-between items-center border border-[#8b3a3a]/40 bg-[#8b3a3a]/10 px-2 py-1 text-[11px] font-mono">
                        <span className="text-[#d4cfc4]">{it.item}</span>
                        <span className="text-[#8b3a3a] font-bold">-{it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </InfoSection>
              )}

              {/* Full breakdown */}
              <InfoSection title="Full Ingredient Breakdown">
                <div className="space-y-1">
                  {calc.total_needed.map((it, i) => {
                    const haveEntry = calc.total_have.find(h => h.item === it.item);
                    const have = haveEntry?.quantity ?? 0;
                    const pct = it.quantity > 0 ? Math.min(100, Math.round((have / it.quantity) * 100)) : 100;
                    const short = have < it.quantity;
                    return (
                      <div key={i} className={`border px-2 py-1.5 ${short ? 'border-[#8b3a3a]/40' : 'border-[#6b7a3d]/40'}`}>
                        <div className="flex justify-between text-[10px] font-mono mb-1">
                          <span className="text-[#d4cfc4]">{it.item}</span>
                          <span className={short ? 'text-[#8b3a3a]' : 'text-[#6b7a3d]'}>{have}/{it.quantity}</span>
                        </div>
                        <div className="h-1 bg-[#2a2520]">
                          <div className={`h-1 transition-all ${short ? 'bg-[#8b3a3a]' : 'bg-[#6b7a3d]'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </InfoSection>

              {/* Can craft now */}
              {calc.craftable_now.length > 0 && (
                <InfoSection title="Can Craft Right Now">
                  <div className="space-y-1">
                    {calc.craftable_now.slice(0, 8).map((it, i) => (
                      <div key={i} className="flex justify-between items-center border border-[#6b7a3d]/40 px-2 py-1 text-[11px] font-mono">
                        <span className="text-[#d4cfc4]">{it.recipe_name}</span>
                        <span className="text-[#6b7a3d]">×{it.max_quantity}</span>
                      </div>
                    ))}
                  </div>
                </InfoSection>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared micro-components
// ---------------------------------------------------------------------------
const INPUT = 'w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono focus:outline-none focus:border-[#c4841d]';

function InfoSection({ title, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
      {title && <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] mb-2 border-b border-[#2a2520] pb-1.5">{title}</p>}
      {children}
    </div>
  );
}

function Collapsible({ title, open, onToggle, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#1e1e1e] transition-colors">
        <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a]">{title}</p>
        {open ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div>
      {label && <label className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] block mb-1">{label}</label>}
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 p-3">
      <p className="font-heading text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[9px] font-mono uppercase tracking-widest text-[#88837a] mt-0.5">{label}</p>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="border border-dashed border-[#2a2520] p-8 text-center">
      <div className="text-[#2a2520] mx-auto mb-2 flex justify-center">{icon}</div>
      <p className="text-[#88837a] text-xs font-mono">{text}</p>
    </div>
  );
}
