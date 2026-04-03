import { useState, useEffect, useCallback } from 'react';
import api, { formatError } from '@/lib/api';
import { Key, Plus, RefreshCw, Copy, Check, Ban, ShieldCheck, Trash2, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const ROLE_COLORS = {
  system_admin: 'text-[#c4841d]',
  server_admin: 'text-[#6b7a3d]',
  player: 'text-[#d4cfc4]',
};

const STATUS_COLORS = {
  active: 'text-[#6b7a3d] border-[#6b7a3d]',
  suspended: 'text-[#c4841d] border-[#c4841d]',
  revoked: 'text-[#8b3a3a] border-[#8b3a3a]',
};

export default function KeyManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [newCallsign, setNewCallsign] = useState('');
  const [newRole, setNewRole] = useState('player');
  const [generatedKey, setGeneratedKey] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/keys');
      setUsers(data);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const generateKey = async (e) => {
    e.preventDefault();
    setError('');
    setActionLoading('generate');
    try {
      const { data } = await api.post('/admin/keys', { callsign: newCallsign.trim(), role: newRole });
      setGeneratedKey(data);
      setNewCallsign('');
      fetchUsers();
    } catch (err) {
      setError(formatError(err.response?.data?.detail));
    }
    setActionLoading('');
  };

  const reissueKey = async (userId) => {
    setActionLoading(`reissue-${userId}`);
    try {
      const { data } = await api.post(`/admin/keys/${userId}/reissue`);
      setGeneratedKey(data);
      fetchUsers();
    } catch { /* graceful */ }
    setActionLoading('');
  };

  const performAction = async (userId, action) => {
    setActionLoading(`${action}-${userId}`);
    try {
      if (action === 'delete') {
        await api.delete(`/admin/keys/${userId}`);
      } else {
        await api.post(`/admin/keys/${userId}/${action}`);
      }
      fetchUsers();
    } catch { /* graceful */ }
    setActionLoading('');
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 3000);
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="key-management-panel">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Auth Key Management</h3>
          <span className="text-[10px] font-mono text-[#88837a]">({users.length})</span>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="generate-key-toggle"
            onClick={() => { setShowGenerate(!showGenerate); setGeneratedKey(null); setError(''); }}
            className="text-xs font-mono border border-[#4a5c3a] text-[#4a5c3a] px-2 py-1 hover:bg-[#4a5c3a] hover:text-[#111111] transition-all flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> ISSUE KEY
          </button>
          <button
            data-testid="refresh-keys-button"
            onClick={fetchUsers}
            className="text-[#88837a] hover:text-[#c4841d] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* Generate Key Form */}
        {showGenerate && (
          <div className="mb-4 border border-[#2a2520] bg-[#111111] p-4">
            {generatedKey ? (
              <div className="space-y-3">
                <p className="text-xs font-mono text-[#6b7a3d] uppercase tracking-widest">Key Generated for {generatedKey.callsign}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#0d0d0d] border border-[#c4841d] p-2 font-mono text-sm text-[#c4841d] tracking-[0.1em] select-all" data-testid="new-key-display">
                    {generatedKey.auth_key}
                  </div>
                  <button
                    onClick={() => copyToClipboard(generatedKey.auth_key, 'new')}
                    className="border border-[#c4841d] text-[#c4841d] p-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all"
                  >
                    {copied === 'new' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-[#a94442]">Share this key securely. It cannot be recovered.</p>
                <button onClick={() => { setGeneratedKey(null); setShowGenerate(false); }} className="text-xs font-mono text-[#88837a] hover:text-[#d4cfc4]">[CLOSE]</button>
              </div>
            ) : (
              <form onSubmit={generateKey} className="space-y-3">
                {error && (
                  <p className="text-xs font-mono text-[#a94442]">[ERROR] {error}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#88837a] mb-1">Callsign</label>
                    <input
                      data-testid="new-callsign-input"
                      type="text"
                      value={newCallsign}
                      onChange={(e) => setNewCallsign(e.target.value)}
                      required
                      minLength={2}
                      placeholder="Player callsign..."
                      className="w-full bg-[#0d0d0d] border border-[#2a2520] p-2 text-xs font-mono text-[#d4cfc4] placeholder-[#88837a]/40 focus:border-[#c4841d] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#88837a] mb-1">Role</label>
                    <select
                      data-testid="new-role-select"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full bg-[#0d0d0d] border border-[#2a2520] p-2 text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none"
                    >
                      <option value="player">Player</option>
                      <option value="server_admin">Server Admin</option>
                      <option value="system_admin">System Admin</option>
                    </select>
                  </div>
                </div>
                <button
                  data-testid="confirm-generate-button"
                  type="submit"
                  disabled={actionLoading === 'generate'}
                  className="border border-[#4a5c3a] text-[#4a5c3a] font-heading text-xs uppercase tracking-widest px-3 py-2 hover:bg-[#4a5c3a] hover:text-[#111111] transition-all disabled:opacity-50"
                >
                  {actionLoading === 'generate' ? 'Generating...' : 'Generate Auth Key'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* User List */}
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1">
            {users.map((u) => (
              <div key={u._id} className="flex items-center justify-between p-2 border border-transparent hover:border-[#2a2520] bg-[#111111]/50 hover:bg-[#111111] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${u.status === 'active' ? 'bg-[#6b7a3d]' : u.status === 'suspended' ? 'bg-[#c4841d]' : 'bg-[#8b3a3a]'}`} />
                  <span className="text-xs font-mono text-[#d4cfc4] font-bold">{u.callsign}</span>
                  <span className={`text-[10px] font-mono uppercase ${ROLE_COLORS[u.role] || 'text-[#88837a]'}`}>{u.role?.replace('_', ' ')}</span>
                  <span className={`text-[10px] font-mono uppercase border px-1 ${STATUS_COLORS[u.status] || 'text-[#88837a] border-[#88837a]'}`}>{u.status}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-mono text-[#88837a] mr-2">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </span>
                  <ActionBtn
                    data-testid={`reissue-${u._id}`}
                    icon={<RotateCcw className="w-3 h-3" />}
                    title="Reissue Key"
                    loading={actionLoading === `reissue-${u._id}`}
                    onClick={() => reissueKey(u._id)}
                    color="amber"
                  />
                  {u.status === 'active' ? (
                    <ActionBtn
                      data-testid={`suspend-${u._id}`}
                      icon={<Ban className="w-3 h-3" />}
                      title="Suspend"
                      loading={actionLoading === `suspend-${u._id}`}
                      onClick={() => performAction(u._id, 'suspend')}
                      color="amber"
                    />
                  ) : u.status === 'suspended' ? (
                    <ActionBtn
                      data-testid={`activate-${u._id}`}
                      icon={<ShieldCheck className="w-3 h-3" />}
                      title="Activate"
                      loading={actionLoading === `activate-${u._id}`}
                      onClick={() => performAction(u._id, 'activate')}
                      color="green"
                    />
                  ) : null}
                  <ActionBtn
                    data-testid={`delete-${u._id}`}
                    icon={<Trash2 className="w-3 h-3" />}
                    title="Delete"
                    loading={actionLoading === `delete-${u._id}`}
                    onClick={() => { if (window.confirm(`Delete ${u.callsign}?`)) performAction(u._id, 'delete'); }}
                    color="red"
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function ActionBtn({ icon, title, loading, onClick, color, ...props }) {
  const colors = {
    amber: 'border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d] hover:text-[#111111]',
    green: 'border-[#4a5c3a] text-[#4a5c3a] hover:bg-[#4a5c3a] hover:text-[#111111]',
    red: 'border-[#8b3a3a] text-[#8b3a3a] hover:bg-[#8b3a3a] hover:text-[#111111]',
  };
  return (
    <button
      {...props}
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`border ${colors[color]} p-1 transition-all disabled:opacity-50`}
    >
      {icon}
    </button>
  );
}
