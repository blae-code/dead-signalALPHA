import { useState, useEffect, useCallback } from 'react';
import api, { formatError } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMetaOptions } from '@/hooks/useMetaOptions';
import {
  Target, Plus, Trash2, RefreshCw, ChevronRight, X, Edit3,
  CheckCircle, Circle, Flag, Users, Clock, Gift, AlertTriangle,
  ChevronDown, ChevronUp, Zap,
} from 'lucide-react';

const MISSION_TYPES = ['story', 'side_quest', 'faction', 'survival', 'bounty', 'supply_run', 'escort', 'defend', 'explore'];
const MISSION_STATUSES = ['draft', 'active', 'completed', 'failed', 'cancelled', 'paused'];
const OBJECTIVE_TYPES = ['kill', 'collect', 'reach_location', 'survive', 'trade', 'craft', 'defend', 'escort', 'talk_to_npc', 'custom'];
const REWARD_TYPES = ['item', 'faction_rep', 'narrative_unlock', 'access', 'custom'];
const DIFFICULTY_LEVELS = ['trivial', 'easy', 'medium', 'hard', 'extreme'];

const STATUS_STYLES = {
  draft:     'text-[#88837a] border-[#88837a]',
  active:    'text-[#6b7a3d] border-[#6b7a3d] bg-[#6b7a3d]/10',
  paused:    'text-[#c4841d] border-[#c4841d] bg-[#c4841d]/10',
  completed: 'text-[#3a6b8b] border-[#3a6b8b] bg-[#3a6b8b]/10',
  failed:    'text-[#8b3a3a] border-[#8b3a3a] bg-[#8b3a3a]/10',
  cancelled: 'text-[#3a3530] border-[#3a3530]',
};

const DIFF_COLORS = {
  trivial: '#88837a', easy: '#6b7a3d', medium: '#c4841d', hard: '#8b3a3a', extreme: '#7a3d6b',
};

const TYPE_COLORS = {
  story: '#c4841d', side_quest: '#6b7a3d', faction: '#7a3d6b', survival: '#8b3a3a',
  bounty: '#8b3a3a', supply_run: '#3a6b8b', escort: '#6b7a3d', defend: '#c4841d', explore: '#3a8b6b',
};

const EMPTY_MISSION = {
  title: '', summary: '', mission_type: 'side_quest', difficulty: 'medium',
  stages: [], rewards: [], assigned_players: [], assigned_faction: '',
  linked_npc_id: '', deadline_hours: 0, broadcast_on_activate: true, gm_notes: '',
};

const MISSION_PRESETS = [
  {
    label: 'Supply Run',
    data: { title: 'Emergency Supply Run', mission_type: 'supply_run', difficulty: 'medium', summary: 'A forward outpost is running critically low on supplies. Scavenge the nearby town and return before nightfall.',
      stages: [{ stage_id: 's_1', title: 'Reach the Town', description: 'Navigate to the designated scavenging zone.', objectives: [{ objective_id: 'o_1', description: 'Arrive at the town perimeter', objective_type: 'reach_location', target: '', quantity: 1, optional: false, completed: false }], completed: false, order: 0 },
        { stage_id: 's_2', title: 'Scavenge Supplies', description: 'Collect the required resources.', objectives: [{ objective_id: 'o_2', description: 'Collect Canned Food', objective_type: 'collect', target: 'Canned Food', quantity: 5, optional: false, completed: false }, { objective_id: 'o_3', description: 'Collect Water Bottles', objective_type: 'collect', target: 'Water Bottle', quantity: 3, optional: false, completed: false }, { objective_id: 'o_4', description: 'Find Antibiotics', objective_type: 'collect', target: 'Antibiotics', quantity: 1, optional: true, completed: false }], completed: false, order: 1 }],
      rewards: [{ reward_type: 'item', description: 'Backpack upgrade', quantity: 1, faction_name: '' }] },
  },
  {
    label: 'Bounty Hunt',
    data: { title: 'Hostile Elimination', mission_type: 'bounty', difficulty: 'hard', summary: 'A hostile survivor has been raiding faction supply routes. Locate and neutralize the threat.',
      stages: [{ stage_id: 's_1', title: 'Gather Intel', description: 'Find evidence of the raider\'s last known position.', objectives: [{ objective_id: 'o_1', description: 'Talk to the informant NPC', objective_type: 'talk_to_npc', target: '', quantity: 1, optional: false, completed: false }], completed: false, order: 0 },
        { stage_id: 's_2', title: 'Engage Target', description: 'Find and eliminate the hostile.', objectives: [{ objective_id: 'o_2', description: 'Eliminate the raider', objective_type: 'kill', target: 'Raider', quantity: 1, optional: false, completed: false }], completed: false, order: 1 }],
      rewards: [{ reward_type: 'faction_rep', description: '+50 Faction Standing', quantity: 1, faction_name: '' }] },
  },
  {
    label: 'Defense Mission',
    data: { title: 'Base Defense', mission_type: 'defend', difficulty: 'hard', summary: 'Intelligence suggests a horde is inbound. Fortify the base and survive the night.',
      stages: [{ stage_id: 's_1', title: 'Fortify', description: 'Prepare defenses before the assault.', objectives: [{ objective_id: 'o_1', description: 'Build 3 barricades', objective_type: 'craft', target: 'Wooden Barricade', quantity: 3, optional: false, completed: false }], completed: false, order: 0 },
        { stage_id: 's_2', title: 'Survive', description: 'Hold the line until dawn.', objectives: [{ objective_id: 'o_2', description: 'Survive the horde wave', objective_type: 'survive', target: '', quantity: 1, optional: false, completed: false }], completed: false, order: 1 }],
      rewards: [{ reward_type: 'narrative_unlock', description: 'Unlock "Fortress" story arc', quantity: 1, faction_name: '' }] },
  },
];

export default function MissionPanel() {
  const [missions, setMissions] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.mission_type = filterType;
      const [list, sum] = await Promise.all([
        api.get('/missions', { params }),
        api.get('/missions/summary'),
      ]);
      setMissions(list.data);
      setSummary(sum.data);
    } catch (e) {
      setError(formatError(e.response?.data?.detail));
    }
    setLoading(false);
  }, [filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (mission) => {
    try {
      const { data } = await api.get(`/missions/${mission.mission_id}`);
      setSelected(data);
    } catch { setSelected(mission); }
  };

  if (selected) {
    return <MissionDetail mission={selected} onBack={() => { setSelected(null); load(); }} />;
  }
  if (showCreate) {
    return <MissionForm initial={EMPTY_MISSION} onSave={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />;
  }

  const statusOrder = ['active', 'paused', 'draft', 'completed', 'failed', 'cancelled'];

  return (
    <div data-testid="mission-panel">
      {/* Summary bar */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {statusOrder.map(s => (
          <button
            key={s}
            data-testid={`mission-filter-${s}`}
            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={`flex-shrink-0 border px-3 py-2 text-center transition-all ${
              filterStatus === s ? STATUS_STYLES[s] : 'border-[#2a2520] text-[#88837a] hover:border-[#88837a]'
            }`}
          >
            <p className="font-heading text-lg font-bold">{summary.by_status?.[s] ?? 0}</p>
            <p className="text-[9px] uppercase tracking-widest">{s}</p>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          data-testid="mission-type-filter"
          className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono"
        >
          <option value="">All Types</option>
          {MISSION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <button onClick={load} className="text-[#88837a] hover:text-[#c4841d] p-1 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(true)}
          data-testid="create-mission-button"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 transition-all"
        >
          <Plus className="w-3 h-3" /> New Mission
        </button>
      </div>

      {error && <p className="text-[#8b3a3a] text-xs mb-3 font-mono">{error}</p>}

      {loading ? (
        <p className="text-[#88837a] text-xs font-mono text-center py-8">Loading...</p>
      ) : missions.length === 0 ? (
        <div className="border border-dashed border-[#2a2520] p-8 text-center" data-testid="missions-empty-state">
          <Target className="w-8 h-8 text-[#2a2520] mx-auto mb-3" />
          <p className="text-[#88837a] text-xs font-mono mb-4">No missions found. Give your players purpose.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 transition-all">
              <Plus className="w-3 h-3" /> Create from Scratch
            </button>
            {MISSION_PRESETS.map((p, i) => (
              <PresetButton key={i} label={p.label} onClick={() => setShowCreate(true)} />
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-1.5">
            {missions.map(m => (
              <MissionRow key={m.mission_id} mission={m} onClick={() => openDetail(m)} onStatusChange={load} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function PresetButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="text-[10px] font-mono border border-dashed border-[#88837a]/40 text-[#88837a] px-2 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
      {label}
    </button>
  );
}


function MissionRow({ mission, onClick }) {
  const typeColor = TYPE_COLORS[mission.mission_type] || '#88837a';
  const diffColor = DIFF_COLORS[mission.difficulty] || '#88837a';
  const totalObjectives = (mission.stages || []).reduce((acc, s) => acc + (s.objectives?.length || 0), 0);
  const doneObjectives = (mission.stages || []).reduce(
    (acc, s) => acc + (s.objectives?.filter(o => o.completed).length || 0), 0
  );

  return (
    <div
      onClick={onClick}
      data-testid={`mission-row-${mission.mission_id}`}
      className="flex items-center gap-3 p-3 border border-[#2a2520] bg-[#1a1a1a]/95 hover:border-[#88837a] cursor-pointer transition-all group"
    >
      <div className="w-8 h-8 border flex items-center justify-center flex-shrink-0" style={{ borderColor: typeColor }}>
        <Target className="w-4 h-4" style={{ color: typeColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#d4cfc4] text-sm font-heading truncate">{mission.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: typeColor }}>
            {mission.mission_type.replace(/_/g, ' ')}
          </span>
          <span className="text-[#2a2520]">·</span>
          <span className="text-[10px] font-mono" style={{ color: diffColor }}>{mission.difficulty}</span>
          {totalObjectives > 0 && (
            <>
              <span className="text-[#2a2520]">·</span>
              <span className="text-[10px] font-mono text-[#88837a]">
                {doneObjectives}/{totalObjectives} objectives
              </span>
            </>
          )}
          {mission.assigned_faction && (
            <>
              <span className="text-[#2a2520]">·</span>
              <span className="text-[10px] font-mono text-[#7a3d6b]">{mission.assigned_faction}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_STYLES[mission.status] || ''}`}>
          {mission.status}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-[#2a2520] group-hover:text-[#88837a] transition-colors" />
      </div>
    </div>
  );
}


function MissionDetail({ mission, onBack }) {
  const [data, setData] = useState(mission);
  const [editing, setEditing] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [expandedStages, setExpandedStages] = useState({});

  const refresh = async () => {
    try {
      const { data: fresh } = await api.get(`/missions/${mission.mission_id}`);
      setData(fresh);
    } catch {}
  };

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.post(`/missions/${mission.mission_id}/status`, {
        status,
        broadcast_message: broadcastMsg,
      });
      setMsg(`Mission set to ${status}`);
      setBroadcastMsg('');
      await refresh();
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const toggleObjective = async (stageId, objectiveId, currentState) => {
    try {
      const { data: updated } = await api.post(`/missions/${mission.mission_id}/objectives`, {
        stage_id: stageId,
        objective_id: objectiveId,
        completed: !currentState,
      });
      setData(d => ({ ...d, stages: updated.stages }));
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
  };

  const deleteMission = async () => {
    if (!window.confirm(`Delete mission "${data.title}"?`)) return;
    try {
      await api.delete(`/missions/${data.mission_id}`);
      onBack();
    } catch (e) {
      setMsg(formatError(e.response?.data?.detail));
    }
  };

  const toggleStage = (sid) => setExpandedStages(s => ({ ...s, [sid]: !s[sid] }));

  if (editing) {
    return (
      <MissionForm
        initial={data}
        missionId={data.mission_id}
        onSave={() => { setEditing(false); refresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const typeColor = TYPE_COLORS[data.mission_type] || '#88837a';
  const diffColor = DIFF_COLORS[data.difficulty] || '#88837a';
  const canDelete = ['draft', 'cancelled'].includes(data.status);

  return (
    <div data-testid="mission-detail">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={onBack} data-testid="mission-detail-back" className="text-[#88837a] hover:text-[#c4841d] transition-colors mt-0.5">
          <X className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 border flex items-center justify-center flex-shrink-0 mt-0.5" style={{ borderColor: typeColor }}>
          <Target className="w-4 h-4" style={{ color: typeColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-sm text-[#d4cfc4] uppercase tracking-widest leading-tight">{data.title}</h3>
          <p className="text-[10px] font-mono text-[#88837a] mt-0.5">
            <span style={{ color: typeColor }}>{data.mission_type.replace(/_/g, ' ')}</span>
            {' · '}
            <span style={{ color: diffColor }}>{data.difficulty}</span>
          </p>
        </div>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border flex-shrink-0 ${STATUS_STYLES[data.status] || ''}`}>
          {data.status}
        </span>
        <button onClick={() => setEditing(true)} data-testid="mission-edit-btn" className="text-[#88837a] hover:text-[#c4841d] p-1 transition-colors">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        {canDelete && (
          <button onClick={deleteMission} data-testid="mission-delete-btn" className="text-[#88837a] hover:text-[#8b3a3a] p-1 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {msg && (
        <div className="border border-[#2a2520] px-3 py-2 mb-3 text-[10px] font-mono text-[#88837a]">{msg}</div>
      )}

      <ScrollArea className="h-[440px]">
        <div className="space-y-3 pr-1">
          {/* Summary */}
          <Section title="Mission Briefing">
            <p className="text-[11px] font-mono text-[#88837a] leading-relaxed">{data.summary || <span className="italic text-[#3a3530]">No briefing provided.</span>}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-[10px] font-mono">
              {data.assigned_faction && (
                <span className="text-[#7a3d6b]">Faction: {data.assigned_faction}</span>
              )}
              {data.assigned_players?.length > 0 && (
                <span className="text-[#3a6b8b]">Players: {data.assigned_players.join(', ')}</span>
              )}
              {data.deadline_hours > 0 && (
                <span className="text-[#c4841d]">Deadline: {data.deadline_hours}h</span>
              )}
              {data.linked_npc_id && (
                <span className="text-[#6b7a3d]">NPC: {data.linked_npc_id}</span>
              )}
            </div>
          </Section>

          {/* Status Control */}
          <Section title="Mission Control">
            <input
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Optional broadcast message on status change..."
              className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono mb-2 placeholder-[#3a3530] focus:outline-none focus:border-[#c4841d]"
            />
            <div className="flex flex-wrap gap-1.5">
              {MISSION_STATUSES.map(s => (
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

          {/* Stages & Objectives */}
          {data.stages?.length > 0 && (
            <Section title={`Stages (${data.stages.length})`}>
              <div className="space-y-2">
                {data.stages.map((stage, si) => {
                  const expanded = expandedStages[stage.stage_id] !== false;
                  const reqDone = stage.objectives.filter(o => !o.optional && o.completed).length;
                  const reqTotal = stage.objectives.filter(o => !o.optional).length;
                  return (
                    <div key={stage.stage_id} className="border border-[#2a2520]">
                      <button
                        onClick={() => toggleStage(stage.stage_id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                          stage.completed ? 'bg-[#6b7a3d]/10' : 'hover:bg-[#1e1e1e]'
                        }`}
                      >
                        {stage.completed
                          ? <CheckCircle className="w-3.5 h-3.5 text-[#6b7a3d] flex-shrink-0" />
                          : <Circle className="w-3.5 h-3.5 text-[#88837a] flex-shrink-0" />
                        }
                        <span className="flex-1 text-[11px] font-heading uppercase tracking-widest text-[#d4cfc4]">
                          Stage {si + 1}: {stage.title}
                        </span>
                        <span className="text-[10px] font-mono text-[#88837a]">{reqDone}/{reqTotal}</span>
                        {expanded ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
                      </button>
                      {expanded && (
                        <div className="px-3 pb-2 space-y-1">
                          <p className="text-[10px] font-mono text-[#88837a] mb-2 leading-relaxed">{stage.description}</p>
                          {stage.objectives.map((obj) => (
                            <button
                              key={obj.objective_id}
                              onClick={() => toggleObjective(stage.stage_id, obj.objective_id, obj.completed)}
                              className="w-full flex items-start gap-2 text-left hover:bg-[#1e1e1e] px-1 py-0.5 transition-colors"
                            >
                              {obj.completed
                                ? <CheckCircle className="w-3 h-3 text-[#6b7a3d] flex-shrink-0 mt-0.5" />
                                : <Circle className="w-3 h-3 text-[#88837a] flex-shrink-0 mt-0.5" />
                              }
                              <span className={`text-[10px] font-mono leading-relaxed ${obj.completed ? 'line-through text-[#88837a]' : 'text-[#d4cfc4]'}`}>
                                {obj.description}
                                {obj.target && <span className="text-[#c4841d]"> — {obj.target}</span>}
                                {obj.quantity > 1 && <span className="text-[#88837a]"> x{obj.quantity}</span>}
                              </span>
                              {obj.optional && (
                                <span className="ml-auto text-[9px] font-mono text-[#88837a] flex-shrink-0">optional</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Rewards */}
          {data.rewards?.length > 0 && (
            <Section title="Rewards">
              <div className="space-y-1">
                {data.rewards.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 border border-[#2a2520] px-2 py-1.5 text-[11px] font-mono">
                    <Gift className="w-3 h-3 text-[#c4841d] flex-shrink-0" />
                    <span className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] w-20 flex-shrink-0">
                      {r.reward_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[#d4cfc4] flex-1">{r.description}</span>
                    {r.quantity > 1 && <span className="text-[#88837a]">x{r.quantity}</span>}
                    {r.faction_name && <span className="text-[#7a3d6b]">[{r.faction_name}]</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* GM Notes */}
          {data.gm_notes && (
            <Section title="GM Notes (internal)">
              <p className="text-[11px] font-mono text-[#88837a] leading-relaxed">{data.gm_notes}</p>
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


function MissionForm({ initial, missionId, onSave, onCancel }) {
  const { options } = useMetaOptions();
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeStageIdx, setActiveStageIdx] = useState(null);

  const factions = options?.factions || [];
  const npcs = options?.npcs || [];
  const callsigns = options?.callsigns || [];

  // ---- Stage helpers ----
  const addStage = () => {
    const newStage = {
      stage_id: `s_${Date.now()}`,
      title: `Stage ${form.stages.length + 1}`,
      description: '',
      objectives: [],
      completed: false,
      order: form.stages.length,
    };
    setForm(f => ({ ...f, stages: [...f.stages, newStage] }));
    setActiveStageIdx(form.stages.length);
  };

  const removeStage = (i) => {
    setForm(f => ({ ...f, stages: f.stages.filter((_, idx) => idx !== i) }));
    if (activeStageIdx === i) setActiveStageIdx(null);
  };

  const updateStage = (i, key, val) => {
    setForm(f => {
      const stages = [...f.stages];
      stages[i] = { ...stages[i], [key]: val };
      return { ...f, stages };
    });
  };

  // ---- Objective helpers ----
  const addObjective = (stageIdx) => {
    const obj = {
      objective_id: `o_${Date.now()}`,
      description: '',
      objective_type: 'custom',
      target: '',
      quantity: 1,
      optional: false,
      completed: false,
    };
    setForm(f => {
      const stages = [...f.stages];
      stages[stageIdx] = { ...stages[stageIdx], objectives: [...(stages[stageIdx].objectives || []), obj] };
      return { ...f, stages };
    });
  };

  const removeObjective = (si, oi) => {
    setForm(f => {
      const stages = [...f.stages];
      stages[si] = { ...stages[si], objectives: stages[si].objectives.filter((_, i) => i !== oi) };
      return { ...f, stages };
    });
  };

  const updateObjective = (si, oi, key, val) => {
    setForm(f => {
      const stages = [...f.stages];
      const objs = [...stages[si].objectives];
      objs[oi] = { ...objs[oi], [key]: val };
      stages[si] = { ...stages[si], objectives: objs };
      return { ...f, stages };
    });
  };

  // ---- Reward helpers ----
  const [newReward, setNewReward] = useState({ reward_type: 'item', description: '', quantity: 1, faction_name: '' });
  const addReward = () => {
    if (!newReward.description.trim()) return;
    setForm(f => ({ ...f, rewards: [...f.rewards, { ...newReward }] }));
    setNewReward({ reward_type: 'item', description: '', quantity: 1, faction_name: '' });
  };
  const removeReward = (i) => setForm(f => ({ ...f, rewards: f.rewards.filter((_, idx) => idx !== i) }));

  // ---- Players (dropdown-based) ----
  const [playerInput, setPlayerInput] = useState('');
  const addPlayer = (val) => {
    const p = (val || playerInput).trim();
    if (!p || form.assigned_players.includes(p)) return;
    setForm(f => ({ ...f, assigned_players: [...f.assigned_players, p] }));
    setPlayerInput('');
  };

  // ---- Presets ----
  const applyPreset = (preset) => {
    setForm(f => ({ ...f, ...preset.data, assigned_players: f.assigned_players, assigned_faction: f.assigned_faction }));
  };

  const save = async () => {
    if (!form.title.trim()) { setError('Mission title is required'); return; }
    if (!form.summary.trim()) { setError('Mission briefing is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        deadline_hours: Number(form.deadline_hours) || 0,
      };
      if (missionId) {
        await api.patch(`/missions/${missionId}`, payload);
      } else {
        await api.post('/missions', payload);
      }
      onSave();
    } catch (e) {
      setError(formatError(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div data-testid="mission-form">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onCancel} data-testid="mission-form-cancel" className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-heading text-sm text-[#c4841d] uppercase tracking-widest">
          {missionId ? 'Edit Mission' : 'Create Mission'}
        </h3>
      </div>

      {/* Presets (only on create) */}
      {!missionId && (
        <div className="mb-4">
          <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] mb-1.5">Quick Start Templates</p>
          <div className="flex gap-2 flex-wrap">
            {MISSION_PRESETS.map((p, i) => (
              <button key={i} onClick={() => applyPreset(p)}
                data-testid={`mission-preset-${i}`}
                className="text-[10px] font-mono border border-dashed border-[#88837a]/40 text-[#88837a] px-2.5 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ScrollArea className="h-[420px]">
        <div className="space-y-4 pr-1">
          {/* Core */}
          <Section title="Mission Identity">
            <div className="space-y-2">
              <FormField label="Title *">
                <input value={form.title} onChange={e => setField('title', e.target.value)}
                  data-testid="mission-title-input"
                  placeholder="e.g. Operation Nightfall"
                  className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono focus:outline-none focus:border-[#c4841d] placeholder-[#3a3530]" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Type">
                  <select value={form.mission_type} onChange={e => setField('mission_type', e.target.value)}
                    data-testid="mission-type-select"
                    className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono">
                    {MISSION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Difficulty">
                  <select value={form.difficulty} onChange={e => setField('difficulty', e.target.value)}
                    data-testid="mission-difficulty-select"
                    className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono">
                    {DIFFICULTY_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Summary / Briefing *">
                <textarea value={form.summary} onChange={e => setField('summary', e.target.value)} rows={3}
                  data-testid="mission-summary-input"
                  placeholder="Describe the mission objective and context..."
                  className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-[#c4841d] placeholder-[#3a3530]" />
              </FormField>
            </div>
          </Section>

          {/* Assignment — GUIDED CONTROLS */}
          <Section title="Assignment">
            <div className="space-y-2">
              <FormField label="Assigned Faction">
                <select value={form.assigned_faction} onChange={e => setField('assigned_faction', e.target.value)}
                  data-testid="mission-faction-select"
                  className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono">
                  <option value="">No faction (open to all)</option>
                  {factions.map(f => (
                    <option key={f.faction_id} value={f.name}>[{f.tag}] {f.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Assigned Players">
                <div className="flex gap-2 mb-1">
                  <select value={playerInput} onChange={e => { setPlayerInput(e.target.value); if (e.target.value) addPlayer(e.target.value); }}
                    data-testid="mission-player-select"
                    className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono">
                    <option value="">Add player...</option>
                    {callsigns.filter(c => !form.assigned_players.includes(c)).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.assigned_players.map(p => (
                    <span key={p} className="flex items-center gap-1 border border-[#3a6b8b] text-[#3a6b8b] text-[10px] font-mono px-1.5 py-0.5">
                      {p}
                      <button onClick={() => setForm(f => ({ ...f, assigned_players: f.assigned_players.filter(x => x !== p) }))}>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Deadline (hours, 0=none)">
                  <input type="number" min="0" max="8760" value={form.deadline_hours}
                    onChange={e => setField('deadline_hours', e.target.value)}
                    data-testid="mission-deadline-input"
                    className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono" />
                </FormField>
                <FormField label="Linked NPC (quest-giver)">
                  <select value={form.linked_npc_id} onChange={e => setField('linked_npc_id', e.target.value)}
                    data-testid="mission-npc-select"
                    className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono">
                    <option value="">None</option>
                    {npcs.map(n => (
                      <option key={n.npc_id} value={n.npc_id}>{n.name} ({n.role.replace(/_/g, ' ')})</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setField('broadcast_on_activate', !form.broadcast_on_activate)}
                  className={`w-10 h-5 border relative transition-all flex-shrink-0 ${
                    form.broadcast_on_activate ? 'border-[#6b7a3d] bg-[#6b7a3d]/20' : 'border-[#2a2520]'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 transition-all ${
                    form.broadcast_on_activate ? 'left-5 bg-[#6b7a3d]' : 'left-0.5 bg-[#88837a]'
                  }`} />
                </button>
                <span className="text-[10px] font-mono text-[#88837a]">Broadcast in-game when activated</span>
              </div>
            </div>
          </Section>

          {/* Stages */}
          <Section title="Stages & Objectives">
            {form.stages.length === 0 && (
              <p className="text-[10px] font-mono text-[#88837a]/60 mb-2">No stages yet. Add a stage to define mission objectives.</p>
            )}
            <div className="space-y-2 mb-2">
              {form.stages.map((stage, si) => (
                <div key={stage.stage_id} className="border border-[#2a2520]">
                  <button
                    onClick={() => setActiveStageIdx(activeStageIdx === si ? null : si)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1e1e1e] transition-colors"
                  >
                    <span className="text-[10px] font-heading uppercase tracking-widest text-[#d4cfc4] flex-1">
                      Stage {si + 1}: {stage.title || 'Untitled'}
                    </span>
                    <span className="text-[10px] font-mono text-[#88837a]">{stage.objectives?.length || 0} obj</span>
                    <button onClick={e => { e.stopPropagation(); removeStage(si); }} className="text-[#88837a] hover:text-[#8b3a3a] p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                    {activeStageIdx === si ? <ChevronUp className="w-3 h-3 text-[#88837a]" /> : <ChevronDown className="w-3 h-3 text-[#88837a]" />}
                  </button>
                  {activeStageIdx === si && (
                    <div className="px-3 pb-3 space-y-2">
                      <input value={stage.title} onChange={e => updateStage(si, 'title', e.target.value)}
                        placeholder="Stage title"
                        className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
                      <textarea value={stage.description} onChange={e => updateStage(si, 'description', e.target.value)}
                        placeholder="Stage description / briefing text" rows={2}
                        className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono resize-none focus:outline-none focus:border-[#c4841d]" />
                      <div className="space-y-1">
                        {stage.objectives?.map((obj, oi) => (
                          <div key={obj.objective_id} className="grid grid-cols-[1fr_100px_60px_50px_auto] gap-1 items-center">
                            <input value={obj.description} onChange={e => updateObjective(si, oi, 'description', e.target.value)}
                              placeholder="Objective description"
                              className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[10px] px-1.5 py-1 font-mono focus:outline-none focus:border-[#c4841d]" />
                            <select value={obj.objective_type} onChange={e => updateObjective(si, oi, 'objective_type', e.target.value)}
                              className="bg-[#111] border border-[#2a2520] text-[#88837a] text-[10px] px-1 py-1 font-mono">
                              {OBJECTIVE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                            </select>
                            <input type="number" min="1" value={obj.quantity}
                              onChange={e => updateObjective(si, oi, 'quantity', parseInt(e.target.value) || 1)}
                              className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[10px] px-1.5 py-1 font-mono" />
                            <button onClick={() => updateObjective(si, oi, 'optional', !obj.optional)}
                              className={`text-[9px] border px-1 py-1 transition-all ${obj.optional ? 'border-[#c4841d] text-[#c4841d]' : 'border-[#2a2520] text-[#88837a]'}`}>
                              {obj.optional ? 'opt' : 'req'}
                            </button>
                            <button onClick={() => removeObjective(si, oi)} className="text-[#88837a] hover:text-[#8b3a3a]">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => addObjective(si)}
                        className="flex items-center gap-1.5 text-[10px] font-mono text-[#88837a] hover:text-[#c4841d] transition-colors">
                        <Plus className="w-3 h-3" /> Add Objective
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addStage}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading uppercase tracking-widest border border-dashed border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d] w-full justify-center transition-all">
              <Plus className="w-3 h-3" /> Add Stage
            </button>
          </Section>

          {/* Rewards */}
          <Section title="Rewards">
            {form.rewards.length === 0 && (
              <p className="text-[10px] font-mono text-[#88837a]/60 mb-2">No rewards yet. Add rewards to incentivize completion.</p>
            )}
            <div className="space-y-1 mb-2">
              {form.rewards.map((r, i) => (
                <div key={i} className="flex items-center gap-2 border border-[#2a2520] px-2 py-1 text-[11px] font-mono">
                  <span className="text-[9px] text-[#88837a] uppercase w-16 flex-shrink-0">{r.reward_type}</span>
                  <span className="flex-1 text-[#d4cfc4]">{r.description}</span>
                  <button onClick={() => removeReward(i)} className="text-[#88837a] hover:text-[#8b3a3a]">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <select value={newReward.reward_type} onChange={e => setNewReward(v => ({ ...v, reward_type: e.target.value }))}
                className="bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono">
                {REWARD_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <input placeholder="Reward description" value={newReward.description}
                onChange={e => setNewReward(v => ({ ...v, description: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addReward()}
                className="flex-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono focus:outline-none focus:border-[#c4841d] placeholder-[#3a3530]" />
              <button onClick={addReward} className="px-2 border border-[#2a2520] text-[#88837a] hover:border-[#c4841d] hover:text-[#c4841d]">
                <Plus className="w-3 h-3" />
              </button>
            </div>
            {newReward.reward_type === 'faction_rep' && factions.length > 0 && (
              <select value={newReward.faction_name} onChange={e => setNewReward(v => ({ ...v, faction_name: e.target.value }))}
                className="mt-1 bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1 font-mono w-full">
                <option value="">Select faction for rep reward...</option>
                {factions.map(f => <option key={f.faction_id} value={f.name}>{f.name}</option>)}
              </select>
            )}
          </Section>

          {/* GM Notes */}
          <Section title="GM Notes (internal, hidden from players)">
            <textarea value={form.gm_notes} onChange={e => setField('gm_notes', e.target.value)} rows={3}
              placeholder="Internal notes about this mission..."
              className="w-full bg-[#111] border border-[#2a2520] text-[#d4cfc4] text-[11px] px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-[#c4841d] placeholder-[#3a3530]" />
          </Section>
        </div>
      </ScrollArea>

      {error && <p className="text-[#8b3a3a] text-xs font-mono mt-2" data-testid="mission-form-error">{error}</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="flex-1 py-2 text-[10px] font-heading uppercase tracking-widest border border-[#2a2520] text-[#88837a] hover:border-[#88837a] transition-all">
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          data-testid="mission-form-submit"
          className="flex-1 py-2 text-[10px] font-heading uppercase tracking-widest border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 transition-all disabled:opacity-50">
          {saving ? 'Saving...' : missionId ? 'Save Changes' : 'Create Mission (Draft)'}
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

function FormField({ label, children }) {
  return (
    <div>
      {label && <label className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] block mb-1">{label}</label>}
      {children}
    </div>
  );
}
