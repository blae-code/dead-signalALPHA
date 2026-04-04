import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BookOpen, Plus, Play, Pause, Square, Trash2, ChevronDown, ChevronUp, Send, Loader2,
} from 'lucide-react';

const ACTION_TYPES = [
  { value: 'broadcast', label: 'RCON Say' },
  { value: 'rcon_command', label: 'RCON Command' },
  { value: 'narrative_dispatch', label: 'AI Narrative' },
  { value: 'gm_broadcast', label: 'Dashboard Broadcast' },
  { value: 'world_override', label: 'World Override' },
];

function StepEditor({ step, index, onChange, onRemove }) {
  return (
    <div className="border border-[#2a2520] bg-[#0a0a0a] p-2 space-y-2" data-testid={`arc-step-${index}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">Step {index + 1}</span>
        <button onClick={onRemove} className="text-[#8b3a3a] hover:text-[#a04444] transition-colors"><Trash2 className="w-3 h-3" /></button>
      </div>
      <input
        placeholder="Step label (e.g., 'Day 7 warning')"
        value={step.label || ''}
        onChange={(e) => onChange({ ...step, label: e.target.value })}
        className="w-full px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
      />
      <div className="flex gap-2">
        <select
          value={step.action_type || 'broadcast'}
          onChange={(e) => onChange({ ...step, action_type: e.target.value })}
          className="px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none transition-all"
        >
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <input
          placeholder="Delay (min)"
          type="number"
          min={0}
          value={step.delay_minutes ?? ''}
          onChange={(e) => onChange({ ...step, delay_minutes: parseFloat(e.target.value) || 0 })}
          className="w-24 px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
        />
      </div>
      <input
        placeholder={step.action_type === 'rcon_command' ? 'RCON command' : step.action_type === 'world_override' ? 'weather=storm,danger_level=8' : 'Message / prompt text'}
        value={step.message || ''}
        onChange={(e) => onChange({ ...step, message: e.target.value })}
        className="w-full px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
      />
    </div>
  );
}

export default function StoryArcScheduler() {
  const [arcs, setArcs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [name, setName] = useState('');
  const [timingMode, setTimingMode] = useState('sequential');
  const [steps, setSteps] = useState([{ label: '', action_type: 'broadcast', message: '', delay_minutes: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchArcs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/gm/story-arcs/');
      setArcs(data || []);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchArcs(); }, [fetchArcs]);

  const addStep = () => setSteps((prev) => [...prev, { label: '', action_type: 'broadcast', message: '', delay_minutes: 5 }]);
  const updateStep = (i, val) => setSteps((prev) => prev.map((s, j) => j === i ? val : s));
  const removeStep = (i) => setSteps((prev) => prev.filter((_, j) => j !== i));

  const saveArc = async () => {
    if (!name.trim() || !steps.some((s) => s.message.trim() || s.label.trim())) return;
    setSaving(true);
    try {
      const formattedSteps = steps
        .filter((s) => s.message.trim() || s.label.trim())
        .map((s, i) => {
          const params = {};
          if (s.action_type === 'broadcast' || s.action_type === 'gm_broadcast') {
            params.message = s.message;
          } else if (s.action_type === 'rcon_command') {
            params.command = s.message;
          } else if (s.action_type === 'narrative_dispatch') {
            params.prompt = s.message;
          } else if (s.action_type === 'world_override') {
            s.message.split(',').forEach((pair) => {
              const [k, v] = pair.split('=').map((x) => x.trim());
              if (k && v) params[k] = isNaN(Number(v)) ? v : Number(v);
            });
          }
          return {
            order: i,
            delay_minutes: s.delay_minutes || 0,
            action_type: s.action_type || 'broadcast',
            params,
            label: s.label || `Step ${i + 1}`,
          };
        });

      await api.post('/gm/story-arcs/', {
        name: name.trim(),
        timing_mode: timingMode,
        steps: formattedSteps,
      });
      setCreating(false);
      setName('');
      setTimingMode('sequential');
      setSteps([{ label: '', action_type: 'broadcast', message: '', delay_minutes: 0 }]);
      await fetchArcs();
    } catch { /* graceful */ }
    setSaving(false);
  };

  const toggleArc = async (arcId, action) => {
    try {
      await api.post(`/gm/story-arcs/${arcId}/${action}`);
      await fetchArcs();
    } catch { /* graceful */ }
  };

  const deleteArc = async (arcId) => {
    try {
      await api.delete(`/gm/story-arcs/${arcId}`);
      await fetchArcs();
    } catch { /* graceful */ }
  };

  const getStatusColor = (status) => {
    if (status === 'active') return 'text-[#6b7a3d]';
    if (status === 'paused') return 'text-[#c4841d]';
    if (status === 'complete') return 'text-[#88837a]';
    if (status === 'aborted') return 'text-[#8b3a3a]';
    return 'text-[#88837a]';
  };

  const getStepMessage = (step) => {
    const p = step.params || {};
    return p.message || p.command || p.prompt || Object.entries(p).map(([k, v]) => `${k}=${v}`).join(', ') || '';
  };

  return (
    <div className="space-y-4" data-testid="story-arc-scheduler">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Story Arc Scheduler</h3>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          data-testid="create-arc-button"
          className="flex items-center gap-1 text-[10px] font-mono uppercase border border-[#c4841d] text-[#c4841d] px-3 py-1 hover:bg-[#c4841d]/10 transition-all"
        >
          <Plus className="w-3 h-3" /> New Arc
        </button>
      </div>

      {/* Creator */}
      {creating && (
        <div className="border border-[#c4841d]/30 bg-[#1a1a1a]/95 panel-inset noise-bg p-4 space-y-3" data-testid="arc-creator">
          <input
            data-testid="arc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Arc name (e.g., 'Day 7 Horde Warning Sequence')"
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
          />
          <div className="flex gap-2">
            <label className="text-[10px] font-heading uppercase tracking-widest text-[#88837a] self-center">Timing:</label>
            {['sequential', 'from_start'].map((m) => (
              <button
                key={m}
                onClick={() => setTimingMode(m)}
                className={`text-[10px] font-mono uppercase border px-2 py-0.5 transition-all ${timingMode === m ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10' : 'border-[#2a2520] text-[#88837a] hover:text-[#d4cfc4]'}`}
              >
                {m === 'sequential' ? 'Sequential' : 'From Start'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <StepEditor key={i} step={s} index={i} onChange={(v) => updateStep(i, v)} onRemove={() => removeStep(i)} />
            ))}
          </div>
          <button onClick={addStep} className="text-[10px] font-mono text-[#88837a] hover:text-[#c4841d] transition-colors uppercase tracking-widest flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Step
          </button>
          <div className="flex gap-2">
            <button
              onClick={saveArc}
              disabled={saving || !name.trim()}
              data-testid="save-arc"
              className="flex-1 py-2 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Arc'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 border border-[#2a2520] text-xs font-mono text-[#88837a] hover:text-[#d4cfc4] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Arc List */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <ScrollArea className="h-[400px]">
          <div className="p-3 space-y-2">
            {arcs.length === 0 && !loading && (
              <p className="text-xs font-mono text-[#88837a] text-center py-8">No story arcs created yet</p>
            )}
            {arcs.map((arc) => {
              const id = arc.arc_id;
              const isExpanded = expanded === id;
              return (
                <div key={id} className="border border-[#2a2520] bg-[#111111] panel-hover" data-testid={`arc-${id}`}>
                  <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : id)}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${arc.status === 'active' ? 'bg-[#6b7a3d] animate-pulse' : arc.status === 'paused' ? 'bg-[#c4841d]' : 'bg-[#88837a]'}`} />
                      <span className="text-xs font-mono text-[#d4cfc4]">{arc.name}</span>
                      <span className="text-[10px] font-mono text-[#88837a]">({arc.steps?.length || 0} steps)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase ${getStatusColor(arc.status)}`}>
                        {arc.status || 'draft'}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-[#2a2520] p-3 space-y-2">
                      {arc.description && <p className="text-[10px] font-mono text-[#88837a] mb-2">{arc.description}</p>}
                      <div className="text-[10px] font-mono text-[#88837a] mb-2">
                        Timing: <span className="text-[#d4cfc4]">{arc.timing_mode || 'sequential'}</span>
                        {arc.created_by && <> | Created by: <span className="text-[#d4cfc4]">{arc.created_by}</span></>}
                      </div>
                      {arc.steps?.map((s, j) => (
                        <div key={s.step_id || j} className="flex items-start gap-2 text-[10px] font-mono">
                          <span className="text-[#c4841d] shrink-0 mt-0.5">{j + 1}.</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[#d4cfc4]">{s.label || `Step ${j + 1}`}</span>
                              <span className={`px-1 border text-[8px] uppercase ${s.status === 'fired' ? 'border-[#6b7a3d] text-[#6b7a3d]' : s.status === 'skipped' ? 'border-[#8b3a3a] text-[#8b3a3a]' : 'border-[#2a2520] text-[#88837a]'}`}>
                                {s.status || 'pending'}
                              </span>
                            </div>
                            <p className="text-[#88837a] mt-0.5">{getStepMessage(s)}</p>
                            <div className="flex gap-2 mt-0.5 text-[#88837a]/60">
                              <span>{s.action_type}</span>
                              <span>delay: {s.delay_minutes}min</span>
                              {s.fired_at && <span>fired: {new Date(s.fired_at).toLocaleTimeString()}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2 border-t border-[#2a2520]">
                        {(arc.status === 'draft' || arc.status === 'paused') && (
                          <button onClick={() => toggleArc(id, 'start')} data-testid={`arc-start-${id}`} className="flex items-center gap-1 text-[10px] font-mono text-[#6b7a3d] hover:bg-[#6b7a3d]/10 border border-[#6b7a3d]/30 px-2 py-1 transition-all">
                            <Play className="w-3 h-3" /> Start
                          </button>
                        )}
                        {arc.status === 'active' && (
                          <button onClick={() => toggleArc(id, 'pause')} data-testid={`arc-pause-${id}`} className="flex items-center gap-1 text-[10px] font-mono text-[#c4841d] hover:bg-[#c4841d]/10 border border-[#c4841d]/30 px-2 py-1 transition-all">
                            <Pause className="w-3 h-3" /> Pause
                          </button>
                        )}
                        {arc.status === 'active' && (
                          <button onClick={() => toggleArc(id, 'abort')} data-testid={`arc-abort-${id}`} className="flex items-center gap-1 text-[10px] font-mono text-[#8b3a3a] hover:bg-[#8b3a3a]/10 border border-[#8b3a3a]/30 px-2 py-1 transition-all">
                            <Square className="w-3 h-3" /> Abort
                          </button>
                        )}
                        {(arc.status === 'draft' || arc.status === 'complete' || arc.status === 'aborted') && (
                          <button onClick={() => deleteArc(id)} data-testid={`arc-delete-${id}`} className="flex items-center gap-1 text-[10px] font-mono text-[#8b3a3a] hover:bg-[#8b3a3a]/10 border border-[#8b3a3a]/30 px-2 py-1 transition-all">
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
