/**
 * LootTracker
 * -----------
 * Shared map markers for airdrops, loot caches, resources, POIs, and danger zones.
 * Backend: /api/loot/  (loot_tracker.py)
 *
 * TODO:
 *  - WebSocket: listen for "loot_marker_new", "loot_marker_update", "loot_marker_delete"
 *    and update markers without a full refetch.
 *  - Map overlay: replace the list view with a canvas/SVG grid overlay that plots
 *    markers at (grid_x, grid_y).  GridMap.js can be extended to accept a markers
 *    prop and render them as icons on the tactical grid.
 *  - Visibility filter: the backend's list_markers currently returns all markers.
 *    Once the compound visibility query is implemented (see loot_tracker.py TODO),
 *    the frontend will automatically see only public + faction + own markers.
 *  - Expiry: add a scheduled frontend effect that checks expires_at and calls
 *    PATCH /{id} to set status="expired" when the time has passed.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package, Archive, Boxes, MapPin, AlertTriangle, Plus, RefreshCw,
  Check, Trash2, Eye, EyeOff, Clock,
} from 'lucide-react';

const TYPE_META = {
  airdrop:  { label: 'Airdrop',   icon: <Package className="w-3 h-3" />,       color: 'text-[#c4841d] border-[#c4841d]' },
  cache:    { label: 'Cache',     icon: <Archive className="w-3 h-3" />,        color: 'text-[#6b7a3d] border-[#6b7a3d]' },
  resource: { label: 'Resource',  icon: <Boxes className="w-3 h-3" />,          color: 'text-[#3a6b8b] border-[#3a6b8b]' },
  poi:      { label: 'POI',       icon: <MapPin className="w-3 h-3" />,         color: 'text-[#7a3d6b] border-[#7a3d6b]' },
  danger:   { label: 'Danger',    icon: <AlertTriangle className="w-3 h-3" />,  color: 'text-[#8b3a3a] border-[#8b3a3a]' },
};

const VIS_ICONS = {
  public:  <Eye className="w-3 h-3" />,
  faction: <Eye className="w-3 h-3" />,
  private: <EyeOff className="w-3 h-3" />,
};

function MarkerRow({ marker, onLoot, onDelete, currentUser }) {
  const meta    = TYPE_META[marker.type] || TYPE_META.poi;
  const isOwner = marker.owner_id === currentUser?._id;
  const looted  = marker.status === 'looted';

  return (
    <div className={`border rounded p-2 flex items-start justify-between gap-2 ${looted ? 'opacity-50' : 'border-[#3a3832]'}`}>
      <div className="flex items-start gap-2">
        <span className={`text-[10px] border rounded px-1 py-0.5 flex items-center gap-1 mt-0.5 ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
        <div>
          <div className="text-xs text-[#c9b89a] font-medium">
            {marker.label}
            {marker.grid_x != null && (
              <span className="text-[10px] text-[#4a4540] ml-1">({marker.grid_x},{marker.grid_y})</span>
            )}
          </div>
          {marker.description && (
            <div className="text-[10px] text-[#88837a] mt-0.5">{marker.description}</div>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-[#4a4540]">
            <span>{marker.reported_by}</span>
            {marker.location_name && <><span>·</span><span>{marker.location_name}</span></>}
            {marker.expires_at && (
              <><span>·</span><span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> expires {new Date(marker.expires_at).toLocaleString()}</span></>
            )}
            <span>·</span>
            <span className="flex items-center gap-0.5">{VIS_ICONS[marker.visibility]} {marker.visibility}</span>
          </div>
          {looted && (
            <div className="text-[10px] text-[#88837a] mt-0.5">
              Looted by {marker.looted_by} · {marker.looted_at ? new Date(marker.looted_at).toLocaleString() : ''}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {!looted && (
          <button
            onClick={() => onLoot(marker.marker_id)}
            title="Mark as looted"
            className="text-[#88837a] hover:text-[#6b7a3d] transition-colors"
          >
            <Check className="w-3 h-3" />
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => onDelete(marker.marker_id)}
            title="Delete"
            className="text-[#88837a] hover:text-[#8b3a3a] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function CreateMarkerForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    type: 'airdrop', label: '', description: '',
    grid_x: '', grid_y: '', location_name: '',
    visibility: 'faction',
  });
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.label.trim()) { setError('Label is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        grid_x: form.grid_x !== '' ? parseInt(form.grid_x) : null,
        grid_y: form.grid_y !== '' ? parseInt(form.grid_y) : null,
      };
      const { data } = await api.post('/loot/markers', payload);
      onCreated(data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create marker');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-[#0d0c0a] border border-[#3a3832] rounded px-2 py-1 text-xs text-[#c9b89a] placeholder-[#4a4540] focus:outline-none focus:border-[#c4841d]';

  return (
    <div className="border border-[#3a3832] rounded p-3 space-y-2 bg-[#1a1916]">
      <div className="text-xs text-[#c9b89a] font-medium">Report New Marker</div>

      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
          {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inputCls} value={form.visibility} onChange={e => set('visibility', e.target.value)}>
          <option value="public">Public</option>
          <option value="faction">Faction</option>
          <option value="private">Private</option>
        </select>
      </div>

      <input className={inputCls} placeholder="Label (e.g. Airdrop C7)" value={form.label} onChange={e => set('label', e.target.value)} maxLength={60} />
      <input className={inputCls} placeholder="Location name (optional)" value={form.location_name} onChange={e => set('location_name', e.target.value)} maxLength={80} />

      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Grid X" type="number" value={form.grid_x} onChange={e => set('grid_x', e.target.value)} />
        <input className={inputCls} placeholder="Grid Y" type="number" value={form.grid_y} onChange={e => set('grid_y', e.target.value)} />
      </div>

      <textarea className={`${inputCls} resize-none`} placeholder="Notes (optional)" rows={2} value={form.description} onChange={e => set('description', e.target.value)} maxLength={300} />

      {error && <p className="text-[#8b3a3a] text-xs">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-[#88837a] hover:text-[#c9b89a] px-2 py-1">Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1 text-xs bg-[#c4841d]/20 border border-[#c4841d]/40 text-[#c4841d] hover:bg-[#c4841d]/30 px-3 py-1 rounded transition-colors disabled:opacity-50"
        >
          <MapPin className="w-3 h-3" />
          {saving ? 'Saving…' : 'Add Marker'}
        </button>
      </div>
    </div>
  );
}

export default function LootTracker({ user }) {
  const [markers, setMarkers]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [showLooted, setShowLooted] = useState(false);
  const [error, setError]           = useState('');

  const fetchMarkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: showLooted ? undefined : 'active', limit: 100 };
      if (filterType !== 'all') params.type = filterType;
      const { data } = await api.get('/loot/markers', { params });
      setMarkers(data);
    } catch { setError('Failed to load markers'); }
    finally { setLoading(false); }
  }, [filterType, showLooted]);

  useEffect(() => { fetchMarkers(); }, [fetchMarkers]);

  const handleLoot = async (markerId) => {
    try {
      await api.post(`/loot/markers/${markerId}/loot`);
      setMarkers(ms => ms.map(m => m.marker_id === markerId ? { ...m, status: 'looted', looted_by: user?.callsign, looted_at: new Date().toISOString() } : m));
    } catch { /* silent */ }
  };

  const handleDelete = async (markerId) => {
    try {
      await api.delete(`/loot/markers/${markerId}`);
      setMarkers(ms => ms.filter(m => m.marker_id !== markerId));
    } catch { /* silent */ }
  };

  const visible = markers.filter(m => showLooted || m.status !== 'looted');

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#c4841d] tracking-wider uppercase">Loot Tracker</span>
        <div className="flex items-center gap-2">
          <button onClick={fetchMarkers} className="text-[#88837a] hover:text-[#c9b89a]">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1 text-xs border border-[#c4841d]/40 text-[#c4841d] hover:bg-[#c4841d]/10 px-2 py-1 rounded transition-colors"
          >
            <Plus className="w-3 h-3" /> Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', ...Object.keys(TYPE_META)].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filterType === t
                ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10'
                : 'border-[#3a3832] text-[#88837a] hover:border-[#4a4540]'
            }`}
          >
            {t === 'all' ? 'All' : (TYPE_META[t]?.label || t)}
          </button>
        ))}
        <button
          onClick={() => setShowLooted(s => !s)}
          className={`text-[10px] px-2 py-0.5 rounded border ml-auto transition-colors ${
            showLooted ? 'border-[#4a4540] text-[#88837a]' : 'border-[#3a3832] text-[#4a4540]'
          }`}
        >
          {showLooted ? 'Hide looted' : 'Show looted'}
        </button>
      </div>

      {showCreate && (
        <CreateMarkerForm
          onCreated={m => { setMarkers(ms => [m, ...ms]); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && <p className="text-[#8b3a3a] text-xs">{error}</p>}

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {visible.map(m => (
            <MarkerRow
              key={m.marker_id}
              marker={m}
              currentUser={user}
              onLoot={handleLoot}
              onDelete={handleDelete}
            />
          ))}
          {visible.length === 0 && !loading && (
            <p className="text-[#4a4540] text-xs text-center py-8">
              No {filterType !== 'all' ? filterType : ''} markers. Use "Report" to add one.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
