import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Swords, Shield, Users, Crown, UserPlus, ChevronRight, X, Check,
  Handshake, AlertTriangle, ArrowRightLeft, Flag, RefreshCw,
  MapPin, TrendingUp, TrendingDown, Minus, Home,
} from 'lucide-react';

const FACTION_COLORS = [
  '#c4841d', '#6b7a3d', '#8b3a3a', '#3a6b8b', '#7a3d6b',
  '#3d7a6b', '#8b6b3a', '#4a5c3a', '#5c3a4a', '#3a4a5c',
];

const TREATY_ICONS = {
  alliance: <Handshake className="w-3 h-3" />,
  trade: <ArrowRightLeft className="w-3 h-3" />,
  non_aggression: <Shield className="w-3 h-3" />,
  war: <Swords className="w-3 h-3" />,
};

const TREATY_COLORS = {
  alliance: 'text-[#6b7a3d] border-[#6b7a3d]',
  trade: 'text-[#c4841d] border-[#c4841d]',
  non_aggression: 'text-[#3a6b8b] border-[#3a6b8b]',
  war: 'text-[#8b3a3a] border-[#8b3a3a]',
};

const ROLE_ICONS = {
  leader: <Crown className="w-3 h-3 text-[#c4841d]" />,
  officer: <Shield className="w-3 h-3 text-[#6b7a3d]" />,
  member: <Users className="w-3 h-3 text-[#88837a]" />,
};

export default function FactionPanel({ user }) {
  const [view, setView] = useState('overview'); // overview, detail, create
  const [factions, setFactions] = useState([]);
  const [myFaction, setMyFaction] = useState(null);
  const [myMembership, setMyMembership] = useState(null);
  const [selectedFaction, setSelectedFaction] = useState(null);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [factionsRes, myRes, invitesRes] = await Promise.all([
        api.get('/factions'),
        api.get('/factions/my'),
        api.get('/factions/invites/pending'),
      ]);
      setFactions(factionsRes.data || []);
      setMyFaction(myRes.data?.faction || null);
      setMyMembership(myRes.data?.membership || null);
      setInvites(invitesRes.data || []);
    } catch { /* graceful */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectFaction = async (factionId) => {
    try {
      const { data } = await api.get(`/factions/${factionId}`);
      setSelectedFaction(data);
      setView('detail');
    } catch { /* graceful */ }
  };

  if (view === 'create') {
    return <CreateFactionForm onBack={() => setView('overview')} onCreated={() => { fetchAll(); setView('overview'); }} />;
  }

  if (view === 'detail' && selectedFaction) {
    return (
      <FactionDetail
        data={selectedFaction}
        user={user}
        myMembership={myMembership}
        onBack={() => { setView('overview'); setSelectedFaction(null); }}
        onRefresh={() => { selectFaction(selectedFaction.faction?.faction_id); fetchAll(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* My Faction / Invites */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Faction */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Your Faction</h3>
            </div>
            <button data-testid="refresh-factions-button" onClick={fetchAll} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="p-4">
            {myFaction ? (
              <div
                data-testid="my-faction-card"
                className="border border-[#2a2520] p-3 cursor-pointer hover:border-[#c4841d] transition-colors"
                onClick={() => selectFaction(myFaction.faction_id)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myFaction.color }} />
                  <span className="font-heading text-lg uppercase tracking-widest text-[#d4cfc4]">
                    [{myFaction.tag}] {myFaction.name}
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] font-mono text-[#88837a]">
                  <span>Role: <span className="text-[#c4841d]">{myMembership?.role?.toUpperCase()}</span></span>
                  <span>Members: {myFaction.member_count}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px] font-mono text-[#88837a]">
                  <ChevronRight className="w-3 h-3" /> View Details
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Swords className="w-8 h-8 text-[#88837a] mx-auto mb-3 opacity-40" />
                <p className="text-xs font-mono text-[#88837a] mb-4">No faction affiliation</p>
                <button
                  data-testid="create-faction-button"
                  onClick={() => setView('create')}
                  className="border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all"
                >
                  Found a Faction
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pending Invites */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Pending Invites</h3>
              {invites.length > 0 && (
                <span className="text-[10px] font-mono bg-[#c4841d] text-[#111111] px-1.5 py-0.5 font-bold">{invites.length}</span>
              )}
            </div>
          </div>
          <div className="p-3">
            {invites.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 text-center py-4">No pending invites</p>
            ) : (
              <div className="space-y-2">
                {invites.map((inv, i) => (
                  <InviteCard key={i} invite={inv} onRespond={fetchAll} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All Factions List */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Active Factions</h3>
            <span className="text-[10px] font-mono text-[#88837a]">({factions.length})</span>
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="p-3 space-y-2">
            {factions.length === 0 ? (
              <p className="text-xs font-mono text-[#88837a]/60 text-center py-8">
                No factions formed. Be the first to raise a banner.
              </p>
            ) : (
              factions.map((f, i) => (
                <div
                  key={i}
                  data-testid={`faction-card-${f.tag}`}
                  className="flex items-center justify-between p-3 border border-[#2a2520] bg-[#111111]/50 hover:border-[#c4841d]/50 cursor-pointer transition-colors"
                  onClick={() => selectFaction(f.faction_id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
                    <div>
                      <span className="text-sm font-heading uppercase tracking-widest text-[#d4cfc4]">
                        [{f.tag}] {f.name}
                      </span>
                      <div className="flex gap-3 text-[10px] font-mono text-[#88837a] mt-0.5">
                        <span>Leader: {f.leader_callsign}</span>
                        <span>Members: {f.member_count}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#88837a]" />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function InviteCard({ invite, onRespond }) {
  const [responding, setResponding] = useState(false);

  const respond = async (accept) => {
    setResponding(true);
    try {
      const endpoint = accept ? 'accept' : 'decline';
      await api.post(`/factions/invites/${invite.faction_id}/${endpoint}`);
      onRespond();
    } catch { /* graceful */ }
    setResponding(false);
  };

  return (
    <div className="flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111]/50">
      <div>
        <span className="text-xs font-mono text-[#d4cfc4]">
          [{invite.faction_tag}] {invite.faction_name}
        </span>
        <p className="text-[10px] font-mono text-[#88837a]">Invited by {invite.invited_by}</p>
      </div>
      <div className="flex gap-1">
        <button
          data-testid={`accept-invite-${invite.faction_id}`}
          onClick={() => respond(true)}
          disabled={responding}
          className="border border-[#6b7a3d] text-[#6b7a3d] p-1.5 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all disabled:opacity-30"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          data-testid={`decline-invite-${invite.faction_id}`}
          onClick={() => respond(false)}
          disabled={responding}
          className="border border-[#8b3a3a] text-[#8b3a3a] p-1.5 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all disabled:opacity-30"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function CreateFactionForm({ onBack, onCreated }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(FACTION_COLORS[0]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/factions', { name, tag, description, color });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create faction');
    }
    setSubmitting(false);
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg max-w-lg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
        <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Found a Faction</h3>
        <button onClick={onBack} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-[#88837a] block mb-1">Faction Name</label>
          <input
            data-testid="faction-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-sm p-2 focus:border-[#c4841d] focus:outline-none transition-colors"
            placeholder="e.g. Iron Wolves"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-[#88837a] block mb-1">Tag (2-5 chars)</label>
          <input
            data-testid="faction-tag-input"
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            maxLength={5}
            className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-sm p-2 focus:border-[#c4841d] focus:outline-none transition-colors"
            placeholder="e.g. IW"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-[#88837a] block mb-1">Description</label>
          <textarea
            data-testid="faction-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={3}
            className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-sm p-2 focus:border-[#c4841d] focus:outline-none transition-colors resize-none"
            placeholder="Your faction's creed..."
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-[#88837a] block mb-1">Banner Color</label>
          <div className="flex gap-2 flex-wrap">
            {FACTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 border-2 transition-all ${color === c ? 'border-[#d4cfc4] scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs font-mono text-[#a94442]">{error}</p>}
        <button
          data-testid="submit-create-faction"
          type="submit"
          disabled={submitting || !name.trim() || !tag.trim()}
          className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2.5 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? 'Establishing...' : 'Establish Faction'}
        </button>
      </form>
    </div>
  );
}

function FactionDetail({ data, user, myMembership, onBack, onRefresh }) {
  const { faction, members, treaties } = data;
  const [inviteCallsign, setInviteCallsign] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showDiplomacy, setShowDiplomacy] = useState(false);
  const [error, setError] = useState('');
  const [reputation, setReputation] = useState([]);
  const [territories, setTerritories] = useState([]);

  useEffect(() => {
    if (!faction?.faction_id) return;
    api.get(`/factions/${faction.faction_id}/reputation`).then(({ data: d }) => setReputation(d || [])).catch(() => {});
    api.get('/factions/territories').then(({ data: d }) => {
      setTerritories((d || []).filter(t => t.controlled_by === faction.faction_id || t.contested_by === faction.faction_id));
    }).catch(() => {});
  }, [faction?.faction_id]);

  if (!faction) return null;

  const isMyFaction = myMembership?.faction_id === faction.faction_id;
  const isLeaderOrOfficer = isMyFaction && ['leader', 'officer'].includes(myMembership?.role);
  const isLeader = isMyFaction && myMembership?.role === 'leader';

  const handleInvite = async () => {
    if (!inviteCallsign.trim()) return;
    setInviting(true);
    setError('');
    try {
      await api.post(`/factions/${faction.faction_id}/invite`, { callsign: inviteCallsign.trim() });
      setInviteCallsign('');
      onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to invite');
    }
    setInviting(false);
  };

  const handleKick = async (callsign) => {
    try {
      await api.post(`/factions/${faction.faction_id}/kick/${callsign}`);
      onRefresh();
    } catch { /* graceful */ }
  };

  const handlePromote = async (callsign) => {
    try {
      await api.post(`/factions/${faction.faction_id}/promote/${callsign}`);
      onRefresh();
    } catch { /* graceful */ }
  };

  const handleDemote = async (callsign) => {
    try {
      await api.post(`/factions/${faction.faction_id}/demote/${callsign}`);
      onRefresh();
    } catch { /* graceful */ }
  };

  const handleLeave = async () => {
    try {
      await api.post(`/factions/${faction.faction_id}/leave`);
      onRefresh();
      onBack();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to leave');
    }
  };

  const handleDisband = async () => {
    if (!window.confirm('Disband this faction? This cannot be undone.')) return;
    try {
      await api.delete(`/factions/${faction.faction_id}`);
      onBack();
    } catch { /* graceful */ }
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        data-testid="faction-detail-back"
        onClick={onBack}
        className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors flex items-center gap-1"
      >
        &lt; Back to Factions
      </button>

      {/* Faction Header */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: faction.color }} />
            <h2 className="font-heading text-2xl uppercase tracking-widest text-[#d4cfc4]" data-testid="faction-detail-name">
              [{faction.tag}] {faction.name}
            </h2>
          </div>
          {faction.description && (
            <p className="text-xs font-mono text-[#88837a] ml-7">{faction.description}</p>
          )}
          <div className="flex gap-4 ml-7 mt-2 text-[10px] font-mono text-[#88837a]">
            <span>Leader: <span className="text-[#c4841d]">{faction.leader_callsign}</span></span>
            <span>Members: {faction.member_count}</span>
            <span>Founded: {new Date(faction.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Members */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Roster</h3>
              <span className="text-[10px] font-mono text-[#88837a]">({members?.length || 0})</span>
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="p-3 space-y-1">
              {(members || []).map((m, i) => (
                <div key={i} className="flex items-center justify-between p-2 border border-transparent hover:border-[#2a2520] bg-[#111111]/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {ROLE_ICONS[m.role] || ROLE_ICONS.member}
                    <span className="text-xs font-mono text-[#d4cfc4]">{m.callsign}</span>
                    <span className="text-[10px] font-mono text-[#88837a] uppercase">{m.role}</span>
                  </div>
                  {isLeaderOrOfficer && m.callsign !== user?.callsign && m.role !== 'leader' && (
                    <div className="flex gap-1">
                      {isLeader && m.role === 'member' && (
                        <button onClick={() => handlePromote(m.callsign)} className="text-[10px] font-mono border border-[#6b7a3d] text-[#6b7a3d] px-1.5 py-0.5 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all">
                          UP
                        </button>
                      )}
                      {isLeader && m.role === 'officer' && (
                        <button onClick={() => handleDemote(m.callsign)} className="text-[10px] font-mono border border-[#c4841d] text-[#c4841d] px-1.5 py-0.5 hover:bg-[#c4841d] hover:text-[#111111] transition-all">
                          DOWN
                        </button>
                      )}
                      <button onClick={() => handleKick(m.callsign)} className="text-[10px] font-mono border border-[#8b3a3a] text-[#8b3a3a] px-1.5 py-0.5 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all">
                        KICK
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Invite */}
          {isLeaderOrOfficer && (
            <div className="border-t border-[#2a2520] p-3">
              <div className="flex gap-2">
                <input
                  data-testid="invite-callsign-input"
                  value={inviteCallsign}
                  onChange={(e) => setInviteCallsign(e.target.value)}
                  placeholder="Callsign to invite"
                  className="flex-1 bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none"
                />
                <button
                  data-testid="send-invite-button"
                  onClick={handleInvite}
                  disabled={inviting || !inviteCallsign.trim()}
                  className="border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest px-3 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30"
                >
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
              {error && <p className="text-[10px] font-mono text-[#a94442] mt-1">{error}</p>}
            </div>
          )}
        </div>

        {/* Diplomacy */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Handshake className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Diplomacy</h3>
            </div>
            {isLeaderOrOfficer && (
              <button
                data-testid="new-treaty-button"
                onClick={() => setShowDiplomacy(!showDiplomacy)}
                className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors"
              >
                [{showDiplomacy ? 'CLOSE' : 'NEW TREATY'}]
              </button>
            )}
          </div>

          {showDiplomacy && (
            <ProposeTreatyForm factionId={faction.faction_id} onDone={() => { setShowDiplomacy(false); onRefresh(); }} />
          )}

          <ScrollArea className="h-[250px]">
            <div className="p-3 space-y-2">
              {(treaties || []).length === 0 ? (
                <p className="text-xs font-mono text-[#88837a]/60 text-center py-4">No diplomatic relations</p>
              ) : (
                (treaties || []).map((t, i) => (
                  <TreatyCard
                    key={i}
                    treaty={t}
                    currentFactionId={faction.faction_id}
                    canRespond={isLeaderOrOfficer}
                    onRefresh={onRefresh}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Reputation */}
      {reputation.length > 0 && (
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Reputation</h3>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {reputation.map((r, i) => {
              const score = r.score;
              const color = score > 40 ? '#6b7a3d' : score > 0 ? '#c4841d' : score > -40 ? '#c4841d' : '#8b3a3a';
              const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Minus;
              const pct = Math.abs(score);
              const label = score >= 60 ? 'Allied' : score >= 20 ? 'Friendly' : score >= -20 ? 'Neutral' : score >= -60 ? 'Hostile' : 'Enemy';
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.other_faction_color }} />
                  <span className="text-[11px] font-mono text-[#d4cfc4] w-28 flex-shrink-0">
                    [{r.other_faction_tag}] {r.other_faction_name}
                  </span>
                  <div className="flex-1 h-1.5 bg-[#2a2520] relative">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[#3a3530]" />
                    <div
                      className="absolute top-0 h-1.5 transition-all"
                      style={{
                        backgroundColor: color,
                        left: score >= 0 ? '50%' : `${50 - pct / 2}%`,
                        width: `${pct / 2}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 w-24 justify-end">
                    <Icon className="w-3 h-3" style={{ color }} />
                    <span className="text-[10px] font-mono" style={{ color }}>{score > 0 ? '+' : ''}{score}</span>
                    <span className="text-[9px] font-mono text-[#88837a]">{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Territory */}
      {territories.length > 0 && (
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#c4841d]" />
              <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">
                Territory ({faction.territory_count || territories.length})
              </h3>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {territories.map((t, i) => {
              const contested = t.contested_by === faction.faction_id;
              const controlled = t.controlled_by === faction.faction_id;
              return (
                <div key={i} className={`border p-2 ${controlled ? 'border-[#6b7a3d]/60' : 'border-[#c4841d]/60'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-heading uppercase tracking-widest text-[#d4cfc4]">{t.name}</span>
                    <span className={`text-[9px] font-mono uppercase px-1 py-0.5 border ${
                      contested ? 'border-[#c4841d] text-[#c4841d]' : 'border-[#6b7a3d] text-[#6b7a3d]'
                    }`}>
                      {contested ? 'contesting' : 'controlled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#88837a]">
                    <span className="text-[#c4841d]">{t.territory_type?.replace('_', ' ')}</span>
                    {t.location_name && <><MapPin className="w-2.5 h-2.5" /><span>{t.location_name}</span></>}
                  </div>
                  {t.bonuses?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.bonuses.map((b, bi) => (
                        <span key={bi} className="text-[9px] font-mono border border-[#3a6b8b]/50 text-[#3a6b8b] px-1">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {isMyFaction && (
        <div className="flex gap-2">
          {!isLeader && (
            <button
              data-testid="leave-faction-button"
              onClick={handleLeave}
              className="border border-[#8b3a3a] text-[#8b3a3a] font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all"
            >
              Leave Faction
            </button>
          )}
          {isLeader && (
            <button
              data-testid="disband-faction-button"
              onClick={handleDisband}
              className="border border-[#8b3a3a] text-[#8b3a3a] font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all"
            >
              Disband Faction
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProposeTreatyForm({ factionId, onDone }) {
  const [factions, setFactions] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [type, setType] = useState('alliance');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/factions').then(({ data }) => {
      setFactions((data || []).filter((f) => f.faction_id !== factionId));
    }).catch(() => {});
  }, [factionId]);

  const handleSubmit = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      await api.post(`/factions/${factionId}/diplomacy`, { target_faction_id: targetId, treaty_type: type });
      onDone();
    } catch { /* graceful */ }
    setSubmitting(false);
  };

  return (
    <div className="border-b border-[#2a2520] p-3 space-y-3">
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Target Faction</label>
        <select
          data-testid="treaty-target-select"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full bg-[#111111] border border-[#2a2520] text-[#d4cfc4] font-mono text-xs p-2 focus:border-[#c4841d] focus:outline-none"
        >
          <option value="">Select faction...</option>
          {factions.map((f) => (
            <option key={f.faction_id} value={f.faction_id}>[{f.tag}] {f.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] block mb-1">Treaty Type</label>
        <div className="grid grid-cols-2 gap-2">
          {['alliance', 'trade', 'non_aggression', 'war'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`border p-2 text-[10px] font-mono uppercase tracking-widest transition-all ${
                type === t ? `${TREATY_COLORS[t]} bg-[#111111]` : 'border-[#2a2520] text-[#88837a]'
              }`}
            >
              <span className="flex items-center gap-1 justify-center">
                {TREATY_ICONS[t]} {t.replace('_', ' ')}
              </span>
            </button>
          ))}
        </div>
      </div>
      <button
        data-testid="submit-treaty-button"
        onClick={handleSubmit}
        disabled={submitting || !targetId}
        className="w-full border border-[#c4841d] text-[#c4841d] font-heading text-xs uppercase tracking-widest py-2 hover:bg-[#c4841d] hover:text-[#111111] transition-all disabled:opacity-30"
      >
        {submitting ? 'Sending...' : type === 'war' ? 'Declare War' : 'Propose Treaty'}
      </button>
    </div>
  );
}

function TreatyCard({ treaty, currentFactionId, canRespond, onRefresh }) {
  const [responding, setResponding] = useState(false);
  const isIncoming = treaty.to_faction_id === currentFactionId;
  const otherName = isIncoming ? `[${treaty.from_faction_tag}] ${treaty.from_faction_name}` : `[${treaty.to_faction_tag}] ${treaty.to_faction_name}`;

  const respond = async (accept) => {
    setResponding(true);
    try {
      await api.post(`/factions/diplomacy/${treaty.treaty_id}/respond`, { accept });
      onRefresh();
    } catch { /* graceful */ }
    setResponding(false);
  };

  const cancel = async () => {
    try {
      await api.post(`/factions/diplomacy/${treaty.treaty_id}/cancel`);
      onRefresh();
    } catch { /* graceful */ }
  };

  return (
    <div className={`border p-2 ${TREATY_COLORS[treaty.treaty_type] || 'border-[#2a2520] text-[#88837a]'} bg-[#111111]/50`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {TREATY_ICONS[treaty.treaty_type]}
          <span className="text-xs font-mono uppercase">{treaty.treaty_type.replace('_', ' ')}</span>
        </div>
        <span className={`text-[10px] font-mono uppercase ${
          treaty.status === 'active' ? 'text-[#6b7a3d]' :
          treaty.status === 'proposed' ? 'text-[#c4841d]' :
          'text-[#88837a]'
        }`}>{treaty.status}</span>
      </div>
      <p className="text-[10px] font-mono text-[#88837a] mt-1">
        {isIncoming ? 'From' : 'With'}: <span className="text-[#d4cfc4]">{otherName}</span>
      </p>
      {/* Respond to pending incoming treaties */}
      {treaty.status === 'proposed' && isIncoming && canRespond && (
        <div className="flex gap-1 mt-2">
          <button onClick={() => respond(true)} disabled={responding} className="text-[10px] font-mono border border-[#6b7a3d] text-[#6b7a3d] px-2 py-0.5 hover:bg-[#6b7a3d] hover:text-[#111111] transition-all disabled:opacity-30">
            Accept
          </button>
          <button onClick={() => respond(false)} disabled={responding} className="text-[10px] font-mono border border-[#8b3a3a] text-[#8b3a3a] px-2 py-0.5 hover:bg-[#8b3a3a] hover:text-[#111111] transition-all disabled:opacity-30">
            Reject
          </button>
        </div>
      )}
      {/* Cancel active treaties */}
      {(treaty.status === 'active' || (treaty.status === 'proposed' && !isIncoming)) && canRespond && (
        <button onClick={cancel} className="text-[10px] font-mono text-[#88837a] hover:text-[#a94442] mt-1 transition-colors">
          [Cancel]
        </button>
      )}
    </div>
  );
}
