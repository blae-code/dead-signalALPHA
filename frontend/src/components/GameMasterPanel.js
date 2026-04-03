import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap, Clock, MessageSquare, Shield, Users, Terminal, AlertTriangle,
  Play, Pause, Trash2, RefreshCw, Plus, Send, Eye, X, ChevronRight,
  Radio, FileText, Ban, UserCheck, Settings, RotateCcw, HardDrive,
} from 'lucide-react';

const ACTION_ICONS = {
  restart: <RotateCcw className="w-3 h-3" />,
  broadcast: <MessageSquare className="w-3 h-3" />,
  command: <Terminal className="w-3 h-3" />,
  backup: <HardDrive className="w-3 h-3" />,
};

const NOTE_COLORS = {
  info: 'text-[#6b7a3d] border-[#6b7a3d]',
  warning: 'text-[#c4841d] border-[#c4841d]',
  ban_reason: 'text-[#8b3a3a] border-[#8b3a3a]',
  watchlist: 'text-[#7a3d6b] border-[#7a3d6b]',
};

export default function GameMasterPanel() {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState({});

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/gm/stats');
      setStats(data);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const tabs = [
    { id: 'overview', label: 'GM Overview', icon: <Settings className="w-3 h-3" /> },
    { id: 'scheduler', label: 'Scheduler', icon: <Clock className="w-3 h-3" /> },
    { id: 'broadcast', label: 'Broadcasts', icon: <MessageSquare className="w-3 h-3" /> },
    { id: 'players', label: 'Player Admin', icon: <Users className="w-3 h-3" /> },
    { id: 'triggers', label: 'Triggers', icon: <Zap className="w-3 h-3" /> },
    { id: 'commands', label: 'Quick Cmds', icon: <Terminal className="w-3 h-3" /> },
    { id: 'log', label: 'Action Log', icon: <FileText className="w-3 h-3" /> },
  ];

  return (
    <div data-testid="gm-panel">
      {/* GM Sub-tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            data-testid={`gm-tab-${t.id}`}
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

      {tab === 'overview' && <GMOverview stats={stats} onRefresh={fetchStats} />}
      {tab === 'scheduler' && <SchedulerPanel />}
      {tab === 'broadcast' && <BroadcastPanel />}
      {tab === 'players' && <PlayerAdminPanel />}
      {tab === 'triggers' && <TriggersPanel />}
      {tab === 'commands' && <QuickCommandsPanel />}
      {tab === 'log' && <ActionLogPanel />}
    </div>
  );
}

// ==================== GM OVERVIEW ====================
function GMOverview({ stats, onRefresh }) {
  const cards = [
    { label: 'Active Tasks', value: stats.active_tasks ?? 0, icon: <Clock className="w-5 h-5" />, color: '#c4841d' },
    { label: 'Tracked Players', value: stats.tracked_players ?? 0, icon: <Users className="w-5 h-5" />, color: '#6b7a3d' },
    { label: 'Banned', value: stats.banned_players ?? 0, icon: <Ban className="w-5 h-5" />, color: '#8b3a3a' },
    { label: 'Active Triggers', value: stats.active_triggers ?? 0, icon: <Zap className="w-5 h-5" />, color: '#3a6b8b' },
    { label: 'Broadcasts (24h)', value: stats.broadcasts_24h ?? 0, icon: <MessageSquare className="w-5 h-5" />, color: '#7a3d6b' },
    { label: 'Actions (24h)', value: stats.actions_24h ?? 0, icon: <FileText className="w-5 h-5" />, color: '#88837a' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Game Master Dashboard</h3>
        <button onClick={onRefresh} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="border border-[#2a2520] bg-[#1a1a1a]/95 p-4 panel-inset noise-bg">
            <div className="flex items-center gap-2 mb-2" style={{ color: c.color }}>
              {c.icon}
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">{c.label}</span>
            </div>
            <p className="font-heading text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== SCHEDULER ====================
function SchedulerPanel() {
  const [tasks, setTasks] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/gm/tasks'); setTasks(data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggle = async (taskId, enabled) => {
    await api.patch(`/gm/tasks/${taskId}`, { enabled: !enabled });
    fetch();
  };

  const remove = async (taskId) => {
    await api.delete(`/gm/tasks/${taskId}`);
    fetch();
  };

  const runNow = async (taskId) => {
    await api.post(`/gm/tasks/${taskId}/run-now`);
    fetch();
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Scheduled Tasks</h3>
        </div>
        <div className="flex gap-2">
          <button data-testid="create-task-button" onClick={() => setShowCreate(!showCreate)} className="text-xs font-mono border border-[#c4841d] text-[#c4841d] px-2 py-1 hover:bg-[#c4841d] hover:text-[#111111] transition-all">
            <Plus className="w-3 h-3 inline mr-1" />{showCreate ? 'Cancel' : 'New Task'}
          </button>
          <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {showCreate && <CreateTaskForm onDone={() => { setShowCreate(false); fetch(); }} />}

      <ScrollArea className="h-[400px]">
        <div className="p-3 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">No scheduled tasks. Create one to automate server management.</p>
          ) : tasks.map((t, i) => (
            <div key={i} className={`border p-3 bg-[#111111]/50 transition-colors ${t.enabled ? 'border-[#2a2520]' : 'border-[#2a2520]/50 opacity-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {ACTION_ICONS[t.action]}
                  <span className="text-xs font-mono text-[#d4cfc4]">{t.name}</span>
                  <span className="text-[10px] font-mono text-[#88837a] uppercase">{t.action}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => runNow(t.task_id)} title="Run now" className="text-[#6b7a3d] hover:text-[#d4cfc4] p-1"><Play className="w-3 h-3" /></button>
                  <button onClick={() => toggle(t.task_id, t.enabled)} title={t.enabled ? 'Disable' : 'Enable'} className="text-[#c4841d] hover:text-[#d4cfc4] p-1">
                    {t.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button onClick={() => remove(t.task_id)} title="Delete" className="text-[#8b3a3a] hover:text-[#d4cfc4] p-1"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="flex gap-4 mt-1 text-[10px] font-mono text-[#88837a]">
                <span>Interval: {t.interval_minutes > 0 ? `${t.interval_minutes}m` : 'One-shot'}</span>
                <span>Runs: {t.run_count || 0}</span>
                {t.last_run && <span>Last: {new Date(t.last_run).toLocaleTimeString()}</span>}
                {t.last_error && <span className="text-[#8b3a3a]">Error: {t.last_error}</span>}
              </div>
              {t.params && Object.keys(t.params).length > 0 && (
                <div className="mt-1 text-[10px] font-mono text-[#88837a]">
                  {Object.entries(t.params).map(([k, v]) => <span key={k} className="mr-3">{k}: <span className="text-[#d4cfc4]">{String(v)}</span></span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CreateTaskForm({ onDone }) {
  const [name, setName] = useState('');
  const [action, setAction] = useState('restart');
  const [interval, setInterval] = useState(360);
  const [message, setMessage] = useState('');
  const [command, setCommand] = useState('');
  const [warnMin, setWarnMin] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const presets = [
    { name: '6-Hour Restart', action: 'restart', interval: 360, params: { warn_minutes: 5 } },
    { name: 'Hourly Broadcast', action: 'broadcast', interval: 60, params: { message: 'Server rules: No griefing, be respectful.' } },
    { name: 'Daily Backup', action: 'backup', interval: 1440, params: {} },
  ];

  const handleSubmit = async () => {
    setSubmitting(true);
    const params = {};
    if (action === 'broadcast') params.message = message;
    if (action === 'command') params.command = command;
    if (action === 'restart') params.warn_minutes = warnMin;
    try {
      await api.post('/gm/tasks', { name, action, interval_minutes: interval, params });
      onDone();
    } catch {}
    setSubmitting(false);
  };

  const applyPreset = (p) => {
    setName(p.name);
    setAction(p.action);
    setInterval(p.interval);
    if (p.params.message) setMessage(p.params.message);
    if (p.params.warn_minutes) setWarnMin(p.params.warn_minutes);
  };

  return (
    <div className="border-b border-[#2a2520] p-4 space-y-3">
      <p className="text-[10px] font-mono text-[#88837a] uppercase tracking-widest mb-2">Presets</p>
      <div className="flex gap-2 flex-wrap">
        {presets.map((p, i) => (
          <button key={i} onClick={() => applyPreset(p)} className="text-[10px] font-mono border border-[#2a2520] text-[#88837a] px-2 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Task Name</label>
          <input data-testid="task-name-input" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" placeholder="e.g. Morning Restart" />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Action</label>
          <select data-testid="task-action-select" value={action} onChange={(e) => setAction(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none">
            <option value="restart">Restart Server</option>
            <option value="broadcast">Broadcast Message</option>
            <option value="command">Run Command</option>
            <option value="backup">Create Backup</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Repeat Interval (minutes, 0 = one-shot)</label>
        <input data-testid="task-interval-input" type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
      </div>
      {action === 'broadcast' && (
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Message</label>
          <input value={message} onChange={(e) => setMessage(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" placeholder="Message to broadcast" />
        </div>
      )}
      {action === 'command' && (
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Command</label>
          <input value={command} onChange={(e) => setCommand(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" placeholder="Server command to execute" />
        </div>
      )}
      {action === 'restart' && (
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Warning before restart (minutes)</label>
          <input type="number" value={warnMin} onChange={(e) => setWarnMin(Number(e.target.value))} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
        </div>
      )}
      <button data-testid="submit-task-button" onClick={handleSubmit} disabled={submitting || !name.trim()} className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30">
        {submitting ? 'Creating...' : 'Create Task'}
      </button>
    </div>
  );
}

// ==================== BROADCASTS ====================
function BroadcastPanel() {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);

  const fetchHistory = useCallback(async () => {
    try { const { data } = await api.get('/gm/broadcasts?limit=30'); setHistory(data); } catch {}
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post('/gm/broadcast', { message: message.trim() });
      setMessage('');
      fetchHistory();
    } catch {}
    setSending(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Send Broadcast</h3>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-mono text-[#88837a]">Send an in-game message to all connected players via RCON.</p>
          <textarea
            data-testid="broadcast-message-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-3 focus:border-[#c4841d] focus:outline-none resize-none"
            placeholder="Type your broadcast message..."
          />
          <div className="flex gap-2 flex-wrap">
            {['Server restart in 5 minutes', 'Rules: No griefing. Be respectful.', 'Event starting soon!', 'Welcome to Lonely Island'].map((q, i) => (
              <button key={i} onClick={() => setMessage(q)} className="text-[10px] font-mono border border-[#2a2520] text-[#88837a] px-2 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
                {q}
              </button>
            ))}
          </div>
          <button
            data-testid="send-broadcast-button"
            onClick={send}
            disabled={sending || !message.trim()}
            className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2.5 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <Send className="w-3 h-3" /> {sending ? 'Sending...' : 'Transmit Broadcast'}
          </button>
        </div>
      </div>

      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Broadcast History</h3>
          <button onClick={fetchHistory} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        <ScrollArea className="h-[350px]">
          <div className="p-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">No broadcasts sent yet</p>
            ) : history.map((b, i) => (
              <div key={i} className="border-l-2 border-[#c4841d] bg-[#111111]/50 p-2">
                <p className="text-xs font-mono text-[#d4cfc4]">{b.message}</p>
                <div className="flex gap-3 mt-1 text-[10px] font-mono text-[#88837a]">
                  <span>{new Date(b.timestamp).toLocaleString()}</span>
                  <span>by {b.sent_by}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ==================== PLAYER ADMIN ====================
function PlayerAdminPanel() {
  const [players, setPlayers] = useState([]);
  const [banned, setBanned] = useState([]);
  const [selected, setSelected] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [actionName, setActionName] = useState('');
  const [actionType, setActionType] = useState('kick');
  const [actionReason, setActionReason] = useState('');
  const [noteName, setNoteName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('info');

  const fetchAll = useCallback(async () => {
    try {
      const [playersRes, bannedRes] = await Promise.all([
        api.get('/gm/players'),
        api.get('/gm/players/banned'),
      ]);
      setPlayers(playersRes.data || []);
      setBanned(bannedRes.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectPlayer = async (name) => {
    try {
      const { data } = await api.get(`/gm/players/${encodeURIComponent(name)}`);
      setPlayerDetail(data);
      setSelected(name);
    } catch {}
  };

  const executeAction = async () => {
    if (!actionName.trim()) return;
    try {
      await api.post('/gm/players/action', {
        player_name: actionName.trim(),
        action: actionType,
        reason: actionReason,
      });
      setActionName('');
      setActionReason('');
      fetchAll();
      if (selected === actionName.trim()) selectPlayer(actionName.trim());
    } catch {}
  };

  const addNote = async () => {
    if (!noteName.trim() || !noteText.trim()) return;
    try {
      await api.post('/gm/players/note', {
        player_name: noteName.trim(),
        note: noteText.trim(),
        note_type: noteType,
      });
      setNoteName('');
      setNoteText('');
      fetchAll();
      if (selected === noteName.trim()) selectPlayer(noteName.trim());
    } catch {}
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Actions + Notes Column */}
      <div className="space-y-4">
        {/* Quick Action */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Player Action</h3>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <input data-testid="action-player-input" value={actionName} onChange={(e) => setActionName(e.target.value)} placeholder="Player name" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
            <select data-testid="action-type-select" value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none">
              <option value="kick">Kick</option>
              <option value="ban">Ban</option>
              <option value="unban">Unban</option>
              <option value="warn">Warn</option>
              <option value="whitelist">Whitelist</option>
            </select>
            <input value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Reason (optional)" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
            <button data-testid="execute-action-button" onClick={executeAction} disabled={!actionName.trim()} className="w-full border border-[#8b3a3a] text-[#8b3a3a] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all disabled:opacity-30">
              Execute
            </button>
          </div>
        </div>

        {/* Add Note */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Add Note</h3>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <input value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Player name" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
            <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="watchlist">Watchlist</option>
              <option value="ban_reason">Ban Reason</option>
            </select>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Note content..." className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none resize-none" />
            <button onClick={addNote} disabled={!noteName.trim() || !noteText.trim()} className="w-full border border-[#6b7a3d] text-[#6b7a3d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all disabled:opacity-30">
              Save Note
            </button>
          </div>
        </div>
      </div>

      {/* Player Lists */}
      <div className="space-y-4">
        {/* Tracked Players */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Tracked Players</h3>
            <button onClick={fetchAll} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <ScrollArea className="h-[250px]">
            <div className="p-2 space-y-1">
              {players.length === 0 ? (
                <p className="text-xs font-mono text-[#88837a]/60 text-center py-4">No tracked players yet</p>
              ) : players.map((p, i) => (
                <div key={i} onClick={() => selectPlayer(p.player_name)} className={`flex items-center justify-between p-2 border cursor-pointer transition-colors ${selected === p.player_name ? 'border-[#c4841d] bg-[#c4841d]/5' : 'border-transparent hover:border-[#2a2520]'}`}>
                  <span className="text-xs font-mono text-[#d4cfc4]">{p.player_name}</span>
                  <span className={`text-[10px] font-mono uppercase ${p.status === 'banned' ? 'text-[#8b3a3a]' : p.status === 'whitelisted' ? 'text-[#6b7a3d]' : 'text-[#88837a]'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Banned */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-[#8b3a3a]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#8b3a3a]">Ban List</h3>
              <span className="text-[10px] font-mono text-[#88837a]">({banned.length})</span>
            </div>
          </div>
          <ScrollArea className="h-[150px]">
            <div className="p-2 space-y-1">
              {banned.length === 0 ? (
                <p className="text-xs font-mono text-[#88837a]/60 text-center py-4">No banned players</p>
              ) : banned.map((p, i) => (
                <div key={i} onClick={() => selectPlayer(p.player_name)} className="flex items-center justify-between p-2 hover:border-[#2a2520] border border-transparent cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-[#a94442]">{p.player_name}</span>
                  <span className="text-[10px] font-mono text-[#88837a]">{p.ban_reason || 'No reason'}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Player Detail */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3">
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">
            {selected ? `Player: ${selected}` : 'Select a Player'}
          </h3>
        </div>
        <ScrollArea className="h-[460px]">
          {!playerDetail ? (
            <div className="p-4 text-center">
              <Eye className="w-8 h-8 text-[#88837a] mx-auto mb-3 opacity-30" />
              <p className="text-xs font-mono text-[#88837a]/60">Select a player or enter a name to view their profile</p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-widest text-[#88837a]">Status</span>
                <span className={`text-xs font-mono uppercase ${playerDetail.profile?.status === 'banned' ? 'text-[#8b3a3a]' : 'text-[#6b7a3d]'}`}>
                  {playerDetail.profile?.status || 'Unknown'}
                </span>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] font-mono text-[#88837a] uppercase tracking-widest mb-1">Notes ({playerDetail.notes?.length || 0})</p>
                {(playerDetail.notes || []).map((n, i) => (
                  <div key={i} className={`border-l-2 p-2 mb-1 bg-[#111111]/50 ${NOTE_COLORS[n.note_type] || NOTE_COLORS.info}`}>
                    <p className="text-xs font-mono text-[#d4cfc4]">{n.note}</p>
                    <div className="flex gap-2 mt-0.5 text-[10px] font-mono text-[#88837a]">
                      <span className="uppercase">{n.note_type}</span>
                      <span>by {n.author}</span>
                      <span>{new Date(n.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action History */}
              <div>
                <p className="text-[10px] font-mono text-[#88837a] uppercase tracking-widest mb-1">Action History ({playerDetail.actions?.length || 0})</p>
                {(playerDetail.actions || []).map((a, i) => (
                  <div key={i} className="text-[10px] font-mono p-1 border-b border-[#2a2520]/50">
                    <span className="text-[#c4841d]">{a.action}</span>
                    <span className="text-[#88837a] ml-2">{a.actor} - {new Date(a.timestamp).toLocaleString()}</span>
                    {a.details?.reason && <span className="text-[#d4cfc4] block ml-2">{a.details.reason}</span>}
                  </div>
                ))}
              </div>

              {/* Sessions */}
              <div>
                <p className="text-[10px] font-mono text-[#88837a] uppercase tracking-widest mb-1">Sessions ({playerDetail.sessions?.length || 0})</p>
                {(playerDetail.sessions || []).map((s, i) => (
                  <div key={i} className="text-[10px] font-mono p-1 border-b border-[#2a2520]/50 text-[#88837a]">
                    {s.joined_at && <span>In: {new Date(s.joined_at).toLocaleString()}</span>}
                    {s.left_at && <span className="ml-2">Out: {new Date(s.left_at).toLocaleString()}</span>}
                    <span className={`ml-2 ${s.active ? 'text-[#6b7a3d]' : ''}`}>{s.active ? 'ACTIVE' : 'ENDED'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ==================== EVENT TRIGGERS ====================
function TriggersPanel() {
  const [triggers, setTriggers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/gm/triggers'); setTriggers(data); } catch {}
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggle = async (id, enabled) => {
    await api.patch(`/gm/triggers/${id}`, { enabled: !enabled });
    fetch();
  };

  const remove = async (id) => {
    await api.delete(`/gm/triggers/${id}`);
    fetch();
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Event Triggers</h3>
        </div>
        <button data-testid="create-trigger-button" onClick={() => setShowCreate(!showCreate)} className="text-xs font-mono border border-[#c4841d] text-[#c4841d] px-2 py-1 hover:bg-[#c4841d] hover:text-[#111111] transition-all">
          <Plus className="w-3 h-3 inline mr-1" />{showCreate ? 'Cancel' : 'New Trigger'}
        </button>
      </div>

      {showCreate && <CreateTriggerForm onDone={() => { setShowCreate(false); fetch(); }} />}

      <ScrollArea className="h-[400px]">
        <div className="p-3 space-y-2">
          <p className="text-[10px] font-mono text-[#88837a] mb-2">Triggers auto-execute when specific game events occur. Use {'{player}'} in messages to insert the player name.</p>
          {triggers.length === 0 ? (
            <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">No event triggers configured</p>
          ) : triggers.map((t, i) => (
            <div key={i} className={`border p-3 bg-[#111111]/50 ${t.enabled ? 'border-[#2a2520]' : 'border-[#2a2520]/50 opacity-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[#c4841d]" />
                  <span className="text-xs font-mono text-[#d4cfc4]">{t.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggle(t.trigger_id, t.enabled)} className="text-[#c4841d] hover:text-[#d4cfc4] p-1">
                    {t.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button onClick={() => remove(t.trigger_id)} className="text-[#8b3a3a] hover:text-[#d4cfc4] p-1"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] font-mono text-[#88837a]">
                <span>On: <span className="text-[#c4841d]">{t.trigger_event}</span></span>
                <span>Do: <span className="text-[#6b7a3d]">{t.action}</span></span>
                <span>Fired: {t.fire_count || 0}x</span>
                {t.cooldown_seconds > 0 && <span>CD: {t.cooldown_seconds}s</span>}
              </div>
              {t.params && Object.keys(t.params).length > 0 && (
                <div className="mt-1 text-[10px] font-mono text-[#88837a]">
                  {Object.entries(t.params).map(([k, v]) => <span key={k} className="mr-3">{k}: <span className="text-[#d4cfc4]">{String(v)}</span></span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CreateTriggerForm({ onDone }) {
  const [name, setName] = useState('');
  const [event, setEvent] = useState('player_connect');
  const [action, setAction] = useState('broadcast');
  const [message, setMessage] = useState('');
  const [command, setCommand] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const presets = [
    { name: 'Welcome Message', event: 'player_connect', action: 'broadcast', params: { message: 'Welcome {player} to Lonely Island!' }, cooldown: 5 },
    { name: 'Goodbye Message', event: 'player_disconnect', action: 'broadcast', params: { message: '{player} has gone dark. Signal lost.' }, cooldown: 5 },
    { name: 'Horde Alert', event: 'horde_event', action: 'broadcast', params: { message: 'HORDE INCOMING! All survivors take defensive positions!' }, cooldown: 60 },
    { name: 'Death Report', event: 'player_death', action: 'broadcast', params: { message: 'Another soul lost in the wasteland. {player} has fallen.' }, cooldown: 10 },
  ];

  const applyPreset = (p) => {
    setName(p.name);
    setEvent(p.event);
    setAction(p.action);
    if (p.params.message) setMessage(p.params.message);
    if (p.params.command) setCommand(p.params.command);
    setCooldown(p.cooldown || 0);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const params = {};
    if (action === 'broadcast') params.message = message;
    if (action === 'command') params.command = command;
    try {
      await api.post('/gm/triggers', { name, trigger_event: event, action, params, cooldown_seconds: cooldown });
      onDone();
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="border-b border-[#2a2520] p-4 space-y-3">
      <p className="text-[10px] font-mono text-[#88837a] uppercase tracking-widest mb-1">Presets</p>
      <div className="flex gap-2 flex-wrap">
        {presets.map((p, i) => (
          <button key={i} onClick={() => applyPreset(p)} className="text-[10px] font-mono border border-[#2a2520] text-[#88837a] px-2 py-1 hover:border-[#c4841d] hover:text-[#c4841d] transition-all">
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Trigger Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Event</label>
          <select value={event} onChange={(e) => setEvent(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none">
            <option value="player_connect">Player Connect</option>
            <option value="player_disconnect">Player Disconnect</option>
            <option value="player_death">Player Death</option>
            <option value="player_kill">Player Kill</option>
            <option value="horde_event">Horde Event</option>
            <option value="airdrop">Airdrop</option>
            <option value="season_change">Season Change</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none">
            <option value="broadcast">Broadcast</option>
            <option value="command">Command</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Cooldown (seconds)</label>
          <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
        </div>
      </div>
      {action === 'broadcast' && (
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Message (use {'{player}'} for name)</label>
          <input value={message} onChange={(e) => setMessage(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
        </div>
      )}
      {action === 'command' && (
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Command</label>
          <input value={command} onChange={(e) => setCommand(e.target.value)} className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
        </div>
      )}
      <button onClick={handleSubmit} disabled={submitting || !name.trim()} className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30">
        {submitting ? 'Creating...' : 'Create Trigger'}
      </button>
    </div>
  );
}

// ==================== QUICK COMMANDS ====================
function QuickCommandsPanel() {
  const [commands, setCommands] = useState([]);
  const [cmd, setCmd] = useState('');
  const [desc, setDesc] = useState('');

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/gm/quick-commands'); setCommands(data); } catch {}
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async () => {
    if (!cmd.trim()) return;
    await api.post('/gm/quick-commands', { command: cmd, description: desc });
    setCmd('');
    setDesc('');
    fetch();
  };

  const execute = async (cmdId) => {
    await api.post(`/gm/quick-commands/${cmdId}/execute`);
  };

  const remove = async (cmdId) => {
    await api.delete(`/gm/quick-commands/${cmdId}`);
    fetch();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Save Quick Command</h3>
          </div>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[10px] font-mono text-[#88837a]">Save frequently used RCON commands for one-click execution.</p>
          <input data-testid="quick-cmd-input" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Command (e.g., save)" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none" />
          <button data-testid="save-quick-cmd-button" onClick={create} disabled={!cmd.trim()} className="w-full border border-[#6b7a3d] text-[#6b7a3d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all disabled:opacity-30">
            Save Command
          </button>
        </div>
      </div>

      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Saved Commands</h3>
          <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-3 space-y-2">
            {commands.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">No saved commands</p>
            ) : commands.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111]/50">
                <div>
                  <code className="text-xs font-mono text-[#c4841d]">{c.command}</code>
                  {c.description && <p className="text-[10px] font-mono text-[#88837a] mt-0.5">{c.description}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => execute(c.cmd_id)} className="border border-[#6b7a3d] text-[#6b7a3d] p-1.5 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all" title="Execute">
                    <Play className="w-3 h-3" />
                  </button>
                  <button onClick={() => remove(c.cmd_id)} className="border border-[#8b3a3a] text-[#8b3a3a] p-1.5 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all" title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ==================== ACTION LOG ====================
function ActionLogPanel() {
  const [log, setLog] = useState([]);

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/gm/log?limit=100'); setLog(data); } catch {}
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const actorColor = (actor) => {
    if (actor === 'SCHEDULER') return 'text-[#3a6b8b]';
    if (actor === 'TRIGGER') return 'text-[#7a3d6b]';
    return 'text-[#c4841d]';
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Action Log</h3>
          <span className="text-[10px] font-mono text-[#88837a]">({log.length})</span>
        </div>
        <button onClick={fetch} className="text-[#88837a] hover:text-[#c4841d]"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <ScrollArea className="h-[500px]">
        <div className="p-2 space-y-1">
          {log.length === 0 ? (
            <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">No actions logged</p>
          ) : log.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 p-2 border-l-2 border-[#2a2520] bg-[#111111]/50 text-[10px] font-mono hover:bg-[#111111] transition-colors">
              <span className="text-[#88837a] whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</span>
              <span className={`uppercase font-bold whitespace-nowrap ${actorColor(entry.actor)}`}>{entry.actor}</span>
              <span className="text-[#d4cfc4]">{entry.action}</span>
              {entry.details && (
                <span className="text-[#88837a] truncate">{JSON.stringify(entry.details).slice(0, 80)}</span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
