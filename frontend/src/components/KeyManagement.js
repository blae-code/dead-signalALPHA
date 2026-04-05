import { useState, useEffect, useCallback } from 'react';
import { Users, Shield, UserX, UserCheck, Trash2, RefreshCw, ChevronDown, KeyRound, Copy, Check } from 'lucide-react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';

const STATUS_COLORS = {
  active: 'text-[#6b7a3d] border-[#6b7a3d]',
  suspended: 'text-[#c4841d] border-[#c4841d]',
  revoked: 'text-[#8b3a3a] border-[#8b3a3a]',
};

const ROLE_COLORS = {
  system_admin: 'text-[#c4841d]',
  player: 'text-[#88837a]',
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMenu, setActionMenu] = useState(null);
  const [resetInfo, setResetInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const doAction = async (userId, action) => {
    setActionMenu(null);
    try {
      if (action === 'delete') {
        await api.delete(`/admin/users/${userId}`);
      } else if (action === 'suspend') {
        await api.post(`/admin/users/${userId}/suspend`);
      } else if (action === 'activate') {
        await api.post(`/admin/users/${userId}/activate`);
      } else if (action === 'promote') {
        await api.post(`/admin/users/${userId}/role`, { role: 'system_admin' });
      } else if (action === 'demote') {
        await api.post(`/admin/users/${userId}/role`, { role: 'player' });
      } else if (action === 'reset-link') {
        const { data } = await api.post(`/admin/users/${userId}/reset-link`);
        setResetInfo(data);
        setCopied(false);
      }
      await fetchUsers();
    } catch { /* graceful */ }
  };

  return (
    <div className="ds-panel panel-inset noise-bg" data-testid="user-management">
      <div className="ds-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">User Management</h3>
          <span className="text-[10px] font-mono text-[#88837a]">({users.length})</span>
        </div>
        <button onClick={fetchUsers} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="refresh-users">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="p-3 space-y-2">
          {users.map((u) => (
            <div key={u._id} className="border border-[#2a2520] bg-[#111111] p-3 hover:border-[#c4841d]/20 transition-colors" data-testid={`user-row-${u._id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-[#d4cfc4]">{u.callsign}</span>
                      <span className={`text-[9px] font-heading uppercase tracking-widest ${ROLE_COLORS[u.role] || 'text-[#88837a]'}`}>
                        {u.role === 'system_admin' ? 'ADMIN' : 'PLAYER'}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-[#88837a]">{u.email || 'No email'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${STATUS_COLORS[u.status] || 'text-[#88837a] border-[#88837a]'}`}>
                    {u.status}
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setActionMenu(actionMenu === u._id ? null : u._id)}
                      className="text-[#88837a] hover:text-[#c4841d] transition-colors p-1"
                      data-testid={`user-actions-${u._id}`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {actionMenu === u._id && (
                      <div className="absolute right-0 top-full mt-1 z-50 border border-[#2a2520] bg-[#111111] min-w-[160px] shadow-lg" data-testid={`user-menu-${u._id}`}>
                        {u.status === 'active' && (
                          <button onClick={() => doAction(u._id, 'suspend')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#c4841d] hover:bg-[#c4841d]/10 flex items-center gap-2">
                            <UserX className="w-3 h-3" /> Suspend
                          </button>
                        )}
                        {u.status === 'suspended' && (
                          <button onClick={() => doAction(u._id, 'activate')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#6b7a3d] hover:bg-[#6b7a3d]/10 flex items-center gap-2">
                            <UserCheck className="w-3 h-3" /> Activate
                          </button>
                        )}
                        {u.role === 'player' && (
                          <button onClick={() => doAction(u._id, 'promote')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#c4841d] hover:bg-[#c4841d]/10 flex items-center gap-2">
                            <Shield className="w-3 h-3" /> Promote to Admin
                          </button>
                        )}
                        {u.role === 'system_admin' && (
                          <button onClick={() => doAction(u._id, 'demote')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#88837a] hover:bg-[#88837a]/10 flex items-center gap-2">
                            <Shield className="w-3 h-3" /> Demote to Player
                          </button>
                        )}
                        <button onClick={() => doAction(u._id, 'delete')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#8b3a3a] hover:bg-[#8b3a3a]/10 flex items-center gap-2">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                        <button onClick={() => doAction(u._id, 'reset-link')} className="w-full text-left px-3 py-2 text-xs font-mono text-[#88837a] hover:bg-[#88837a]/10 flex items-center gap-2">
                          <KeyRound className="w-3 h-3" /> Reset Password Link
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {u.last_login && (
                <p className="text-[9px] font-mono text-[#88837a]/60 mt-1">
                  Last login: {new Date(u.last_login).toLocaleString()}
                </p>
              )}
            </div>
          ))}
          {!loading && users.length === 0 && (
            <p className="text-xs font-mono text-[#88837a] text-center py-8">No users registered yet</p>
          )}
        </div>
      </ScrollArea>

      {/* Reset link display */}
      {resetInfo && (
        <div className="border-t border-[#2a2520] p-3" data-testid="reset-link-display">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-heading uppercase tracking-widest text-[#c4841d]">Reset Link for {resetInfo.callsign}</span>
            <button onClick={() => setResetInfo(null)} className="text-[#88837a] hover:text-[#d4cfc4] text-xs">Close</button>
          </div>
          <div className="bg-[#0a0a0a] border border-[#2a2520] p-2 flex items-center gap-2">
            <code className="text-[10px] font-mono text-[#c4841d] break-all flex-1">{resetInfo.reset_url}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(resetInfo.reset_url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-[#88837a] hover:text-[#c4841d] transition-colors shrink-0"
              data-testid="copy-reset-url"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#6b7a3d]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[9px] font-mono text-[#88837a] mt-1">Expires in {resetInfo.expires}. Share securely.</p>
        </div>
      )}
    </div>
  );
}
