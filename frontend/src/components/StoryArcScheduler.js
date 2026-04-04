import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BookOpen, Plus, Play, Pause, Trash2, ChevronDown, ChevronUp, Clock, Zap, Send, Loader2,
} from 'lucide-react';

function StepEditor({ step, index, onChange, onRemove }) {
  return (
    <div className="border border-[#2a2520] bg-[#0a0a0a] p-2 space-y-2" data-testid={`arc-step-${index}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">Step {index + 1}</span>
        <button onClick={onRemove} className="text-[#8b3a3a] hover:text-[#a04444] transition-colors"><Trash2 className="w-3 h-3" /></button>
      </div>
      <input
        placeholder="Narrative text..."
        value={step.narrative || ''}
        onChange={(e) => onChange({ ...step, narrative: e.target.value })}
        className="w-full px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
      />
      <div className="flex gap-2">
        <input
          placeholder="RCON (optional)"
          value={step.rcon_command || ''}
          onChange={(e) => onChange({ ...step, rcon_command: e.target.value })}
          className="flex-1 px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
        />
        <input
          placeholder="Delay (min)"
          type="number"
          min={0}
          value={step.delay_minutes ?? ''}
          onChange={(e) => onChange({ ...step, delay_minutes: parseInt(e.target.value) || 0 })}
          className="w-24 px-2 py-1.5 bg-[#111111] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none transition-all"
        />
      </div>
    </div>
  );
}

export default function StoryArcScheduler() {
  const [arcs, setArcs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([{ narrative: '', rcon_command: '', delay_minutes: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchArcs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/story-arcs');
      setArcs(data || []);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchArcs(); }, [fetchArcs]);

  const addStep = () => setSteps((prev) => [...prev, { narrative: '', rcon_command: '', delay_minutes: 5 }]);
  const updateStep = (i, val) => setSteps((prev) => prev.map((s, j) => j === i ? val : s));
  const removeStep = (i) => setSteps((prev) => prev.filter((_, j) => j !== i));

  const saveArc = async () => {
    if (!name.trim() || !steps.some((s) => s.narrative.trim())) return;
    setSaving(true);
    try {
      await api.post('/story-arcs', {
        name: name.trim(),
        steps: steps.filter((s) => s.narrative.trim()),
      });
      setCreating(false);
      setName('');
      setSteps([{ narrative: '', rcon_command: '', delay_minutes: 0 }]);
      await fetchArcs();
    } catch { /* graceful */ }
    setSaving(false);
  };

  const toggleArc = async (arcId, action) => {
    try {
      await api.post(`/story-arcs/${arcId}/${action}`);
      await fetchArcs();
    } catch { /* graceful */ }
  };

  const deleteArc = async (arcId) => {
    try {
      await api.delete(`/story-arcs/${arcId}`);
      await fetchArcs();
    } catch { /* graceful */ }
  };

  return (
    <div className="space-y-4" data-testid="story-arc-scheduler">
      {/* Create Button */}
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
            {arcs.map((arc) => (
              <div key={arc._id || arc.arc_id} className="border border-[#2a2520] bg-[#111111] panel-hover" data-testid={`arc-${arc._id || arc.arc_id}`}>
                <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === arc._id ? null : arc._id)}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${arc.status === 'running' ? 'bg-[#6b7a3d] animate-pulse' : arc.status === 'paused' ? 'bg-[#c4841d]' : 'bg-[#88837a]'}`} />
                    <span className="text-xs font-mono text-[#d4cfc4]">{arc.name}</span>
                    <span className="text-[10px] font-mono text-[#88837a]">({arc.steps?.length || 0} steps)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono uppercase ${arc.status === 'running' ? 'text-[#6b7a3d]' : arc.status === 'paused' ? 'text-[#c4841d]' : 'text-[#88837a]'}`}>
                      {arc.status || 'draft'}
                    </span>
                    {expanded === arc._id ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
                  </div>
                </div>
                {expanded === arc._id && (
                  <div className="border-t border-[#2a2520] p-3 space-y-2">
                    {arc.steps?.map((s, j) => (
                      <div key={j} className="flex items-start gap-2 text-[10px] font-mono">
                        <span className="text-[#c4841d] shrink-0 mt-0.5">{j + 1}.</span>
                        <div>
                          <p className="text-[#d4cfc4]/80">{s.narrative}</p>
                          <div className="flex gap-2 mt-0.5">
                            {s.rcon_command && <span className="text-[#88837a]">RCON: {s.rcon_command}</span>}
                            <span className="text-[#88837a]">Delay: {s.delay_minutes}min</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2 border-t border-[#2a2520]">
                      {arc.status !== 'running' && (
                        <button onClick={() => toggleArc(arc._id || arc.arc_id, 'start')} className="flex items-center gap-1 text-[10px] font-mono text-[#6b7a3d] hover:bg-[#6b7a3d]/10 border border-[#6b7a3d]/30 px-2 py-1 transition-all">
                          <Play className="w-3 h-3" /> Start
                        </button>
                      )}
                      {arc.status === 'running' && (
                        <button onClick={() => toggleArc(arc._id || arc.arc_id, 'pause')} className="flex items-center gap-1 text-[10px] font-mono text-[#c4841d] hover:bg-[#c4841d]/10 border border-[#c4841d]/30 px-2 py-1 transition-all">
                          <Pause className="w-3 h-3" /> Pause
                        </button>
                      )}
                      <button onClick={() => deleteArc(arc._id || arc.arc_id)} className="flex items-center gap-1 text-[10px] font-mono text-[#8b3a3a] hover:bg-[#8b3a3a]/10 border border-[#8b3a3a]/30 px-2 py-1 transition-all">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
