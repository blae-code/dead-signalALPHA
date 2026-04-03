import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Radio, Wifi, Sun, Moon, CloudSun, Loader2 } from 'lucide-react';

function TypewriterText({ text, speed = 25 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="typewriter-cursor" />}
    </span>
  );
}

export default function NarrativePanel({ events, liveNarrations = [] }) {
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState('');
  const [latestNarration, setLatestNarration] = useState('');

  // Show latest live auto-narration
  useEffect(() => {
    if (liveNarrations.length > 0 && liveNarrations[0]?.narration) {
      setLatestNarration(liveNarrations[0].narration);
    }
  }, [liveNarrations]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/narrative/history?limit=10');
      setDispatches(data);
    } catch { /* graceful */ }
  };

  const generateRadioReport = async () => {
    setLoading('radio');
    try {
      const { data } = await api.post('/narrative/radio-report');
      setLatestNarration(data.report || '');
      loadHistory();
    } catch { /* graceful */ }
    setLoading('');
  };

  const generateAmbient = async (tod) => {
    setLoading(tod);
    try {
      const { data } = await api.post(`/narrative/ambient?time_of_day=${tod}`);
      setLatestNarration(data.dispatch || '');
      loadHistory();
    } catch { /* graceful */ }
    setLoading('');
  };

  const narrateSingleEvent = async (event) => {
    setLoading('narrate');
    try {
      const { data } = await api.post('/narrative/narrate', { event });
      setLatestNarration(data.narration || '');
      loadHistory();
    } catch { /* graceful */ }
    setLoading('');
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="narrative-panel">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#c4841d] glow-amber" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">AI Narrative Dispatch</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#88837a]">
          <Wifi className="w-3 h-3" />
          <span>GEMINI 2.5 FLASH</span>
        </div>
      </div>

      <div className="p-4">
        {/* Latest Narration with Typewriter */}
        {latestNarration && (
          <div className="mb-4 p-3 border border-[#2a2520] bg-[#111111]" data-testid="latest-narration">
            <p className="text-xs font-mono text-[#88837a] mb-2 uppercase tracking-widest">
              // INCOMING TRANSMISSION
            </p>
            <p className="text-sm font-mono text-[#d4cfc4] leading-relaxed italic">
              <TypewriterText text={latestNarration} />
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <ActionBtn
            data-testid="radio-report-button"
            icon={<Radio className="w-3 h-3" />}
            label="Radio Report"
            loading={loading === 'radio'}
            onClick={generateRadioReport}
          />
          <ActionBtn
            data-testid="dawn-dispatch-button"
            icon={<Sun className="w-3 h-3" />}
            label="Dawn Sitrep"
            loading={loading === 'dawn'}
            onClick={() => generateAmbient('dawn')}
          />
          <ActionBtn
            data-testid="dusk-dispatch-button"
            icon={<Moon className="w-3 h-3" />}
            label="Nightfall Warning"
            loading={loading === 'dusk'}
            onClick={() => generateAmbient('dusk')}
          />
          <ActionBtn
            data-testid="noon-dispatch-button"
            icon={<CloudSun className="w-3 h-3" />}
            label="Noon Report"
            loading={loading === 'noon'}
            onClick={() => generateAmbient('noon')}
          />
          {events?.[0] && (
            <ActionBtn
              data-testid="narrate-latest-button"
              icon={<Wifi className="w-3 h-3" />}
              label="Narrate Latest"
              loading={loading === 'narrate'}
              onClick={() => narrateSingleEvent(events[0])}
            />
          )}
        </div>

        {/* Dispatch History */}
        <div>
          <p className="text-xs font-mono text-[#88837a] uppercase tracking-widest mb-2">// DISPATCH ARCHIVE</p>
          <div className="space-y-2 max-h-[250px] overflow-auto">
            {dispatches.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 italic">No dispatches in archive. Generate one above.</p>
            ) : (
              dispatches.map((d, i) => (
                <div key={i} className="p-2 border-l-2 border-[#2a2520] hover:border-[#c4841d] bg-[#111111]/50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[#88837a]">
                      {new Date(d.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[10px] font-mono text-[#c4841d] uppercase">{d.type?.replace('_', ' ') || 'dispatch'}</span>
                  </div>
                  <p className="text-xs font-mono text-[#d4cfc4]/80 leading-relaxed">{d.narration}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, loading, onClick, ...props }) {
  return (
    <button
      {...props}
      onClick={onClick}
      disabled={loading}
      className="border border-[#c4841d] bg-[#c4841d]/5 text-[#c4841d] font-heading text-xs uppercase tracking-widest font-bold px-3 py-2 flex items-center gap-1.5 hover:bg-[#c4841d]/15 hover:shadow-[0_0_10px_rgba(196,132,29,0.2)] transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
