import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, Send, Loader2, Plus, Trash2, Clock, AlertTriangle } from 'lucide-react';

const TEMPLATES = [
  { type: 'horde', label: 'Horde Attack', icon: '!!', rcon: 'horde spawn', narrative: 'An unnatural silence fell over the settlement. Then, the moaning began. A horde approaches from the {direction}.' },
  { type: 'airdrop', label: 'Supply Drop', icon: '>>',  rcon: 'airdrop', narrative: 'The distant thrum of rotors cut through the wind. A supply plane banks low — cargo inbound at grid {location}.' },
  { type: 'npc', label: 'NPC Encounter', icon: '?!', rcon: '', narrative: 'A lone figure emerged from the treeline, arms raised. A survivor — or something worse.' },
  { type: 'weather', label: 'Weather Shift', icon: '~~', rcon: '', narrative: 'The sky darkened without warning. A {weather} front rolled in, swallowing the horizon.' },
  { type: 'custom', label: 'Custom Event', icon: '**', rcon: '', narrative: '' },
];

export default function WorldEventComposer() {
  const [events, setEvents] = useState([]);
  const [template, setTemplate] = useState('custom');
  const [narrative, setNarrative] = useState('');
  const [rcon, setRcon] = useState('');
  const [location, setLocation] = useState('');
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/world-events?limit=10').then(({ data }) => setEvents(data || [])).catch(() => {});
  }, []);

  const selectTemplate = (type) => {
    const t = TEMPLATES.find((tp) => tp.type === type);
    setTemplate(type);
    if (t) {
      setNarrative(t.narrative);
      setRcon(t.rcon);
    }
  };

  const fireEvent = async () => {
    if (!narrative.trim()) return;
    setFiring(true);
    setResult(null);
    try {
      const { data } = await api.post('/world-events', {
        event_type: template,
        narrative: narrative.trim(),
        rcon_command: rcon.trim() || null,
        location: location.trim() || null,
        broadcast: true,
      });
      setResult({ ok: true, msg: data.message || 'Event fired' });
      setEvents((prev) => [data.event || { type: template, narrative, created_at: new Date().toISOString() }, ...prev].slice(0, 20));
      setNarrative('');
      setRcon('');
      setLocation('');
    } catch (err) {
      setResult({ ok: false, msg: err?.response?.data?.detail || 'Failed' });
    }
    setFiring(false);
  };

  return (
    <div className="space-y-4" data-testid="world-event-composer">
      {/* Composer Card */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">World Event Composer</h3>
        </div>
        <div className="p-4 space-y-3">
          {/* Template Selector */}
          <div>
            <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1.5">Event Type</label>
            <div className="flex gap-1 flex-wrap">
              {TEMPLATES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => selectTemplate(t.type)}
                  data-testid={`template-${t.type}`}
                  className={`text-[10px] font-mono uppercase border px-3 py-1.5 transition-all flex items-center gap-1 ${template === t.type ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}
                >
                  <span className="font-bold">{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1.5">Location (optional)</label>
            <input
              data-testid="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Grid reference or area name"
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
            />
          </div>

          {/* Narrative */}
          <div>
            <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1.5">Narrative Broadcast</label>
            <textarea
              data-testid="event-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Write the dispatch that will be broadcast to all connected operators..."
              rows={3}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all resize-none"
            />
          </div>

          {/* RCON Command */}
          <div>
            <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1.5">RCON Command (optional)</label>
            <input
              data-testid="event-rcon"
              value={rcon}
              onChange={(e) => setRcon(e.target.value)}
              placeholder="Server command to execute alongside the event"
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-2 p-2 border text-xs font-mono ${result.ok ? 'border-[#6b7a3d] text-[#6b7a3d]' : 'border-[#8b3a3a] text-[#8b3a3a]'}`}>
              {result.ok ? <Zap className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {result.msg}
            </div>
          )}

          {/* Fire Button */}
          <button
            onClick={fireEvent}
            disabled={!narrative.trim() || firing}
            data-testid="fire-event-button"
            className="w-full py-2.5 bg-[#8b3a3a] hover:bg-[#a04444] text-[#d4cfc4] font-heading text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {firing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {firing ? 'Firing...' : 'Fire World Event'}
          </button>
        </div>
      </div>

      {/* Recent Events Log */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#88837a]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#88837a]">Recent World Events</h3>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-3 space-y-1">
            {events.length === 0 && <p className="text-xs font-mono text-[#88837a] text-center py-4">No world events fired yet</p>}
            {events.map((e, i) => (
              <div key={i} className="event-enter p-2 border border-[#2a2520] bg-[#111111]/50 text-xs font-mono" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#c4841d] uppercase font-bold">{e.event_type || e.type || 'event'}</span>
                  <span className="text-[#88837a]/60">{e.created_at ? new Date(e.created_at).toLocaleTimeString() : ''}</span>
                </div>
                <p className="text-[#d4cfc4]/80 leading-relaxed">{e.narrative || e.dispatch_text || ''}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
