import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package, ArrowRightLeft, Hammer, AlertCircle, Check, X, Plus,
  RefreshCw, ChevronDown, ChevronRight, Search, Send, Clock, Boxes,
} from 'lucide-react';
import InventoryPanel from '@/components/InventoryPanel';

const RARITY_COLORS = {
  common: 'text-[#88837a] border-[#88837a]',
  uncommon: 'text-[#6b7a3d] border-[#6b7a3d]',
  rare: 'text-[#c4841d] border-[#c4841d]',
};

const SUPPLY_COLORS = {
  surplus: 'text-[#6b7a3d]', normal: 'text-[#88837a]', scarce: 'text-[#c4841d]', critical: 'text-[#8b3a3a]',
};

const PRIORITY_COLORS = {
  low: 'border-[#88837a] text-[#88837a]',
  normal: 'border-[#c4841d] text-[#c4841d]',
  urgent: 'border-[#8b3a3a] text-[#8b3a3a]',
};

const DIFFICULTY_COLORS = {
  easy: 'text-[#6b7a3d]', medium: 'text-[#c4841d]', hard: 'text-[#8b3a3a]',
};

const CATEGORY_LABELS = {
  weapons: 'Weapons', ammo: 'Ammunition', food: 'Food', water: 'Water',
  medical: 'Medical', materials: 'Building', tools: 'Tools',
  clothing: 'Gear', electronics: 'Electronics', vehicle_parts: 'Vehicle',
};

function Tooltip({ children, text }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 border border-[#c4841d]/40 bg-[#111111] text-[10px] font-mono text-[#d4cfc4] leading-relaxed shadow-[0_0_20px_rgba(196,132,29,0.15)] pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
}

export default function ResourceHub({ user, liveScarcity, liveWorldState }) {
  const [tab, setTab] = useState('trade');

  const tabs = [
    { id: 'trade',     label: 'Trade Board',     icon: <ArrowRightLeft className="w-3 h-3" /> },
    { id: 'supply',    label: 'Supply Requests', icon: <Send className="w-3 h-3" /> },
    { id: 'logistics', label: 'Logistics',       icon: <Boxes className="w-3 h-3" /> },
    { id: 'crafting',  label: 'Crafting Planner',icon: <Hammer className="w-3 h-3" /> },
    { id: 'resources', label: 'Scarcity Index',  icon: <Package className="w-3 h-3" /> },
  ];

  return (
    <div data-testid="resource-hub">
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            data-testid={`econ-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest whitespace-nowrap transition-all border ${
              tab === t.id
                ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10'
                : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4] hover:border-[#88837a]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'trade'     && <TradeBoard user={user} />}
      {tab === 'supply'    && <SupplyBoard user={user} />}
      {tab === 'logistics' && <InventoryPanel />}
      {tab === 'crafting'  && <CraftingPlanner />}
      {tab === 'resources' && <ScarcityIndex liveScarcity={liveScarcity} liveWorldState={liveWorldState} />}
    </div>
  );
}


// ==================== TRADE BOARD ====================
function TradeBoard({ user }) {
  const [trades, setTrades] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/economy/trades'); setTrades(data); } catch {}
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const respond = async (tradeId, action) => {
    try { await api.post(`/economy/trades/${tradeId}/respond`, { action }); fetch(); } catch {}
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Trade List */}
      <div className="lg:col-span-2 border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Active Trades</h3>
            <span className="text-[10px] font-mono text-[#88837a]">({trades.length})</span>
          </div>
          <div className="flex gap-2">
            <button data-testid="create-trade-button" onClick={() => setShowCreate(!showCreate)} className="text-xs font-mono border border-[#c4841d] text-[#c4841d] px-2 py-1 hover:bg-[#c4841d] hover:text-[#111111] transition-all">
              <Plus className="w-3 h-3 inline mr-1" />{showCreate ? 'Cancel' : 'Post Trade'}
            </button>
            <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {showCreate && <CreateTradeForm onDone={() => { setShowCreate(false); fetch(); }} />}

        <ScrollArea className="h-[450px]">
          <div className="p-3 space-y-2">
            {trades.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-[#2a2520] mx-1" data-testid="trades-empty-state">
                <ArrowRightLeft className="w-8 h-8 text-[#2a2520] mx-auto mb-3" />
                <p className="text-xs font-mono text-[#88837a]/60 mb-3">No active trades on the board.</p>
                <button onClick={() => setShowCreate(true)}
                  className="text-[10px] font-mono border border-dashed border-[#88837a]/40 text-[#88837a] px-3 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
                  <Plus className="w-3 h-3 inline mr-1" /> Post the First Trade
                </button>
              </div>
            ) : trades.map((t, i) => (
              <div key={i} data-testid={`trade-card-${i}`} className="border border-[#2a2520] bg-[#111111]/50 p-3 hover:border-[#c4841d]/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#c4841d]">{t.poster_callsign}</span>
                    {t.poster_faction_tag && (
                      <span className="text-[10px] font-mono text-[#88837a]">[{t.poster_faction_tag}]</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-mono uppercase ${t.status === 'open' ? 'text-[#6b7a3d]' : 'text-[#c4841d]'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-[#6b7a3d] uppercase tracking-widest mb-1">Offering</p>
                    {(t.offering || []).map((o, j) => (
                      <p key={j} className="text-xs font-mono text-[#d4cfc4]">{o.qty}x {o.item}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-[#8b3a3a] uppercase tracking-widest mb-1">Wants</p>
                    {(t.requesting || []).map((r, j) => (
                      <p key={j} className="text-xs font-mono text-[#d4cfc4]">{r.qty}x {r.item}</p>
                    ))}
                  </div>
                </div>
                {t.notes && <p className="text-[10px] font-mono text-[#88837a] mt-2 italic">{t.notes}</p>}
                <div className="flex gap-2 mt-2">
                  {t.status === 'open' && t.poster_callsign !== user?.callsign && (
                    <button onClick={() => respond(t.trade_id, 'claim')} className="text-[10px] font-mono border border-[#6b7a3d] text-[#6b7a3d] px-2 py-1 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all">
                      Claim Trade
                    </button>
                  )}
                  {t.status === 'claimed' && (t.poster_callsign === user?.callsign || t.claimed_by === user?.callsign) && (
                    <button onClick={() => respond(t.trade_id, 'complete')} className="text-[10px] font-mono border border-[#6b7a3d] text-[#6b7a3d] px-2 py-1 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all">
                      Mark Complete
                    </button>
                  )}
                  {t.poster_callsign === user?.callsign && t.status === 'open' && (
                    <button onClick={() => respond(t.trade_id, 'cancel')} className="text-[10px] font-mono border border-[#8b3a3a] text-[#8b3a3a] px-2 py-1 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all">
                      Cancel
                    </button>
                  )}
                  {t.claimed_by && <span className="text-[10px] font-mono text-[#88837a]">Claimed by: {t.claimed_by}</span>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Quick Trade Guide */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3">
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Trade Protocol</h3>
        </div>
        <div className="p-3 space-y-3 text-[10px] font-mono text-[#88837a]">
          <div className="border-l-2 border-[#c4841d] pl-2">
            <p className="text-[#d4cfc4] mb-1">1. POST YOUR OFFER</p>
            <p>List what you have and what you need. Be specific with quantities.</p>
          </div>
          <div className="border-l-2 border-[#6b7a3d] pl-2">
            <p className="text-[#d4cfc4] mb-1">2. CLAIM A TRADE</p>
            <p>Found what you need? Claim it to lock the deal. Coordinate in-game for the exchange.</p>
          </div>
          <div className="border-l-2 border-[#3a6b8b] pl-2">
            <p className="text-[#d4cfc4] mb-1">3. COMPLETE IN-GAME</p>
            <p>Meet at a safe location. Exchange goods. Mark as complete when done.</p>
          </div>
          <div className="border-l-2 border-[#8b3a3a] pl-2">
            <p className="text-[#d4cfc4] mb-1">WARNING</p>
            <p>Trades are honor-based. Scammers will be noted by the Game Master.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateTradeForm({ onDone }) {
  const [offering, setOffering] = useState([{ item: '', qty: 1 }]);
  const [requesting, setRequesting] = useState([{ item: '', qty: 1 }]);
  const [notes, setNotes] = useState('');
  const [resources, setResources] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/economy/resources').then(({ data }) => setResources(data)).catch(() => {});
  }, []);

  const updateItem = (list, setList, idx, field, value) => {
    const n = [...list];
    n[idx] = { ...n[idx], [field]: value };
    setList(n);
  };

  const addRow = (list, setList) => setList([...list, { item: '', qty: 1 }]);
  const removeRow = (list, setList, idx) => setList(list.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setSubmitting(true);
    const o = offering.filter((r) => r.item);
    const r = requesting.filter((r) => r.item);
    try {
      await api.post('/economy/trades', { offering: o, requesting: r, notes });
      onDone();
    } catch {}
    setSubmitting(false);
  };

  const ItemRow = ({ item, idx, list, setList, label }) => (
    <div className="flex gap-2 items-center">
      <select
        value={item.item}
        onChange={(e) => updateItem(list, setList, idx, 'item', e.target.value)}
        className="flex-1 bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-1.5 focus:border-[#c4841d] focus:outline-none"
      >
        <option value="">Select {label}...</option>
        {resources.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
      </select>
      <input
        type="number" min="1" value={item.qty}
        onChange={(e) => updateItem(list, setList, idx, 'qty', Number(e.target.value))}
        className="w-16 bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-1.5 focus:border-[#c4841d] focus:outline-none text-center"
      />
      {list.length > 1 && (
        <button onClick={() => removeRow(list, setList, idx)} className="text-[#8b3a3a] hover:text-[#d4cfc4]">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="border-b border-[#2a2520] p-3 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono text-[#6b7a3d] uppercase tracking-widest mb-1">I'm Offering</p>
          <div className="space-y-1">
            {offering.map((o, i) => <ItemRow key={i} item={o} idx={i} list={offering} setList={setOffering} label="item" />)}
            <button onClick={() => addRow(offering, setOffering)} className="text-[10px] font-mono text-[#88837a] hover:text-[#c4841d]">+ Add item</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-mono text-[#8b3a3a] uppercase tracking-widest mb-1">I Need</p>
          <div className="space-y-1">
            {requesting.map((r, i) => <ItemRow key={i} item={r} idx={i} list={requesting} setList={setRequesting} label="item" />)}
            <button onClick={() => addRow(requesting, setRequesting)} className="text-[10px] font-mono text-[#88837a] hover:text-[#c4841d]">+ Add item</button>
          </div>
        </div>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (location, time, etc.)" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
      <button data-testid="submit-trade-button" onClick={handleSubmit} disabled={submitting} className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30">
        {submitting ? 'Posting...' : 'Post Trade'}
      </button>
    </div>
  );
}


// ==================== SUPPLY REQUESTS ====================
function SupplyBoard({ user }) {
  const [requests, setRequests] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/economy/supply-requests'); setRequests(data); } catch {}
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const fulfill = async (reqId) => {
    try { await api.post(`/economy/supply-requests/${reqId}/fulfill`); fetch(); } catch {}
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Supply Requests</h3>
        </div>
        <button data-testid="create-supply-request-button" onClick={() => setShowCreate(!showCreate)} className="text-xs font-mono border border-[#c4841d] text-[#c4841d] px-2 py-1 hover:bg-[#c4841d] hover:text-[#111111] transition-all">
          <Plus className="w-3 h-3 inline mr-1" />{showCreate ? 'Cancel' : 'Request Supplies'}
        </button>
      </div>

      {showCreate && <CreateSupplyRequestForm onDone={() => { setShowCreate(false); fetch(); }} />}

      <ScrollArea className="h-[400px]">
        <div className="p-3 space-y-2">
          {requests.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-[#2a2520] mx-1">
              <Send className="w-8 h-8 text-[#2a2520] mx-auto mb-3" />
              <p className="text-xs font-mono text-[#88837a]/60 mb-3">No open supply requests.</p>
              <p className="text-[10px] font-mono text-[#88837a]/40 max-w-xs mx-auto mb-3">Request resources your settlement needs, and other players can volunteer to help.</p>
              <button onClick={() => setShowCreate(true)}
                className="text-[10px] font-mono border border-dashed border-[#88837a]/40 text-[#88837a] px-3 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
                <Plus className="w-3 h-3 inline mr-1" /> Request Supplies
              </button>
            </div>
          ) : requests.map((r, i) => (
            <div key={i} className={`border p-3 bg-[#111111]/50 ${PRIORITY_COLORS[r.priority] || 'border-[#2a2520]'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#d4cfc4]">{r.requester_callsign}</span>
                  <span className={`text-[10px] font-mono uppercase ${PRIORITY_COLORS[r.priority]?.split(' ')[0] ? '' : 'text-[#88837a]'}`}>{r.priority}</span>
                </div>
                <span className="text-[10px] font-mono text-[#88837a]">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-1">
                {(r.items || []).map((item, j) => (
                  <span key={j} className="text-xs font-mono text-[#c4841d] border border-[#2a2520] px-1.5 py-0.5 bg-[#111111]">
                    {item.qty}x {item.item}
                  </span>
                ))}
              </div>
              {r.notes && <p className="text-[10px] font-mono text-[#88837a] italic">{r.notes}</p>}
              {r.requester_callsign !== user?.callsign && (
                <button onClick={() => fulfill(r.request_id)} className="mt-2 text-[10px] font-mono border border-[#6b7a3d] text-[#6b7a3d] px-2 py-1 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all">
                  I Can Help
                </button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CreateSupplyRequestForm({ onDone }) {
  const [items, setItems] = useState([{ item: '', qty: 1 }]);
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [resources, setResources] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/economy/resources').then(({ data }) => setResources(data)).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    const validItems = items.filter((i) => i.item);
    try {
      await api.post('/economy/supply-requests', { items: validItems, priority, notes });
      onDone();
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="border-b border-[#2a2520] p-3 space-y-3">
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select value={item.item} onChange={(e) => { const n = [...items]; n[i].item = e.target.value; setItems(n); }} className="flex-1 bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-1.5 focus:border-[#c4841d] focus:outline-none">
              <option value="">Select item...</option>
              {resources.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
            <input type="number" min="1" value={item.qty} onChange={(e) => { const n = [...items]; n[i].qty = Number(e.target.value); setItems(n); }} className="w-16 bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-1.5 text-center focus:border-[#c4841d] focus:outline-none" />
          </div>
        ))}
        <button onClick={() => setItems([...items, { item: '', qty: 1 }])} className="text-[10px] font-mono text-[#88837a] hover:text-[#c4841d]">+ Add item</button>
      </div>
      <div className="flex gap-2">
        {['low', 'normal', 'urgent'].map((p) => (
          <button key={p} onClick={() => setPriority(p)} className={`text-[10px] font-mono uppercase border px-2 py-1 transition-all ${priority === p ? PRIORITY_COLORS[p] + ' bg-[#111111]' : 'border-[#2a2520] text-[#88837a]'}`}>{p}</button>
        ))}
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details..." className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
      <button onClick={handleSubmit} disabled={submitting} className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30">
        {submitting ? 'Submitting...' : 'Request Supplies'}
      </button>
    </div>
  );
}


// ==================== CRAFTING PLANNER ====================
function CraftingPlanner() {
  const [recipes, setRecipes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/economy/recipes').then(({ data }) => setRecipes(data)).catch(() => {});
  }, []);

  const categories = ['all', ...new Set(recipes.map((r) => r.category))];
  const filtered = filter === 'all' ? recipes : recipes.filter((r) => r.category === filter);

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Hammer className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Crafting Planner</h3>
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${filter === c ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="h-[450px]">
        <div className="p-3 space-y-2">
          {filtered.map((r, i) => (
            <div key={i} data-testid={`recipe-${i}`} className="border border-[#2a2520] bg-[#111111]/50 hover:border-[#c4841d]/30 transition-colors">
              <button onClick={() => setExpanded(expanded === i ? null : i)} className="w-full p-3 flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                  <Hammer className="w-3 h-3 text-[#c4841d]" />
                  <span className="text-xs font-mono text-[#d4cfc4]">{r.name}</span>
                  <span className={`text-[10px] font-mono uppercase ${DIFFICULTY_COLORS[r.difficulty]}`}>{r.difficulty}</span>
                </div>
                {expanded === i ? <ChevronDown className="w-3 h-3 text-[#88837a]" /> : <ChevronRight className="w-3 h-3 text-[#88837a]" />}
              </button>
              {expanded === i && (
                <div className="px-3 pb-3 space-y-2 border-t border-[#2a2520] pt-2">
                  <p className="text-[10px] font-mono text-[#88837a] italic">{r.desc}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-mono text-[#8b3a3a] uppercase tracking-widest mb-1">Requires</p>
                      {r.ingredients.map((ing, j) => (
                        <p key={j} className="text-xs font-mono text-[#d4cfc4]">{ing.qty}x {ing.item}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-[#6b7a3d] uppercase tracking-widest mb-1">Produces</p>
                      <p className="text-xs font-mono text-[#d4cfc4]">{r.result_qty}x {r.result}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


// ==================== SCARCITY INDEX ====================
const TREND_ICONS = {
  rising: { symbol: '\u25B2', color: 'text-[#8b3a3a]' },    // up arrow = prices rising = bad for buyers
  falling: { symbol: '\u25BC', color: 'text-[#6b7a3d]' },   // down arrow = prices falling = good
  stable: { symbol: '\u25C6', color: 'text-[#88837a]' },     // diamond = stable
};

function ScarcityIndex({ liveScarcity, liveWorldState }) {
  const [apiResources, setApiResources] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/economy/resources').then(({ data }) => setApiResources(data)).catch(() => {});
  }, []);

  // Merge live scarcity data over API data
  const resources = liveScarcity
    ? apiResources.map((r) => {
        const live = liveScarcity.find((s) => s.name === r.name);
        return live ? { ...r, ...live } : r;
      })
    : apiResources;

  const isLive = !!liveScarcity;
  const categories = ['all', ...new Set(resources.map((r) => r.category))];
  const filtered = filter === 'all' ? resources : resources.filter((r) => r.category === filter);

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Scarcity Index</h3>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#6b7a3d]" data-testid="scarcity-live-indicator">
              <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
              LIVE
            </span>
          )}
          {liveWorldState && (
            <span className="text-[10px] font-mono text-[#88837a] ml-auto" data-testid="scarcity-conditions">
              {liveWorldState.weather} / {liveWorldState.season} / {liveWorldState.time_of_day}
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${filter === c ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}>
              {CATEGORY_LABELS[c] || c}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="h-[450px]">
        <div className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filtered.map((r, i) => {
              const trend = TREND_ICONS[r.trend] || TREND_ICONS.stable;
              const multiplier = r.multiplier || 1.0;
              const isElevated = multiplier > 1.15;
              const isDepressed = multiplier < 0.9;
              return (
                <Tooltip key={i} text={r.desc}>
                  <div
                    data-testid={`scarcity-item-${r.name?.replace(/\s+/g, '-').toLowerCase()}`}
                    className={`border p-2 bg-[#111111]/50 cursor-help hover:border-[#c4841d]/30 ${RARITY_COLORS[r.rarity]?.split(' ')[1] || 'border-[#2a2520]'}`}
                    style={{
                      transition: 'all 0.6s ease',
                      borderLeftWidth: isElevated ? '3px' : '1px',
                      borderLeftColor: isElevated ? '#8b3a3a' : isDepressed ? '#6b7a3d' : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-[#d4cfc4]">{r.name}</span>
                      <span className={`text-[10px] font-mono uppercase ${RARITY_COLORS[r.rarity]?.split(' ')[0] || 'text-[#88837a]'}`}>{r.rarity}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] font-mono text-[#88837a]">{CATEGORY_LABELS[r.category] || r.category}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono ${SUPPLY_COLORS[r.supply_level] || 'text-[#88837a]'}`} style={{ transition: 'color 0.6s ease' }}>
                          {r.supply_level}
                        </span>
                        <span className={`text-[10px] font-mono ${trend.color}`} data-testid={`trend-${r.name?.replace(/\s+/g, '-').toLowerCase()}`}>
                          {trend.symbol}
                        </span>
                        <span className="text-xs font-mono text-[#c4841d] font-bold" style={{ transition: 'color 0.3s ease' }}>
                          {r.current_value}v
                        </span>
                        {multiplier !== 1.0 && (
                          <span className={`text-[10px] font-mono ${isElevated ? 'text-[#8b3a3a]' : 'text-[#6b7a3d]'}`}>
                            x{multiplier}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
