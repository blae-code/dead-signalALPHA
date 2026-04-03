import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, Crosshair, Package, Radio, RefreshCw, ShieldAlert, Users,
} from 'lucide-react';

const PRIORITY_STYLES = {
  critical: 'border-[#8b3a3a] text-[#f0b4b4]',
  priority: 'border-[#c4841d] text-[#f2d098]',
  routine: 'border-[#3a6b8b] text-[#9ec7dc]',
};

export default function IntelBoard({ liveIntel = [], liveWorldState, liveScarcity }) {
  const [intelFeed, setIntelFeed] = useState([]);
  const [context, setContext] = useState(null);
  const [missions, setMissions] = useState([]);
  const [supplyRequests, setSupplyRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const [intelRes, contextRes, missionsRes, supplyRes] = await Promise.all([
        api.get('/intel/feed?limit=30'),
        api.get('/intel/context'),
        api.get('/missions?status=active'),
        api.get('/economy/supply-requests'),
      ]);
      setIntelFeed(intelRes.data || []);
      setContext(contextRes.data || null);
      setMissions(missionsRes.data || []);
      setSupplyRequests(supplyRes.data || []);
    } catch {
      // graceful
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBoard();
    const timer = setInterval(fetchBoard, 60000);
    return () => clearInterval(timer);
  }, [fetchBoard]);

  const mergedIntel = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const intel of [...liveIntel, ...intelFeed]) {
      const key = intel?.intel_id || `${intel?.created_at}-${intel?.title}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(intel);
    }
    return merged
      .sort((a, b) => (b?.created_at || '').localeCompare(a?.created_at || ''))
      .slice(0, 30);
  }, [intelFeed, liveIntel]);

  const worldState = liveWorldState || context?.world_state || null;
  const scarcityHotspots = useMemo(() => {
    if (Array.isArray(liveScarcity) && liveScarcity.length) {
      return [...liveScarcity]
        .filter((item) => ['critical', 'scarce'].includes(item.supply_level))
        .sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))
        .slice(0, 5);
    }
    return context?.scarcity_hotspots || [];
  }, [context?.scarcity_hotspots, liveScarcity]);

  const hotEvents = context?.hot_events || [];
  const onlinePlayers = context?.online_players?.count ?? 0;

  return (
    <div className="space-y-4" data-testid="intel-board">
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Intel Board</h3>
          </div>
          <button
            data-testid="refresh-intel-board"
            onClick={fetchBoard}
            className="text-[#88837a] hover:text-[#c4841d] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4">
          <SignalCard
            icon={<ShieldAlert className="w-4 h-4" />}
            label="Danger Index"
            value={worldState ? `${worldState.danger_level || 0}/10` : '--'}
            subtext={worldState ? `${worldState.weather || 'clear'} / ${worldState.time_of_day || 'unknown'}` : 'Awaiting live world state'}
            color={worldState?.danger_level >= 8 ? '#8b3a3a' : worldState?.danger_level >= 6 ? '#c4841d' : '#6b7a3d'}
          />
          <SignalCard
            icon={<Users className="w-4 h-4" />}
            label="Operators Online"
            value={String(onlinePlayers)}
            subtext="Tracked via live server feed"
            color="#3a6b8b"
          />
          <SignalCard
            icon={<Crosshair className="w-4 h-4" />}
            label="Active Missions"
            value={String(missions.length)}
            subtext={missions[0]?.title || 'No active mission tasking'}
            color="#c4841d"
          />
          <SignalCard
            icon={<Package className="w-4 h-4" />}
            label="Open Requests"
            value={String(supplyRequests.length)}
            subtext={scarcityHotspots[0]?.name ? `${scarcityHotspots[0].name} under pressure` : 'Supply lanes stable'}
            color="#6b7a3d"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-3">
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Live Intel Feed</h3>
          </div>
          <ScrollArea className="h-[560px]">
            <div className="p-3 space-y-3">
              {mergedIntel.length === 0 ? (
                <p className="text-xs font-mono text-[#88837a]/60 text-center py-10">No intel briefs have been issued yet.</p>
              ) : mergedIntel.map((intel) => (
                <div
                  key={intel.intel_id || `${intel.created_at}-${intel.title}`}
                  className={`border-l-2 bg-[#111111]/60 p-3 ${PRIORITY_STYLES[intel.priority] || PRIORITY_STYLES.priority}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-heading text-sm uppercase tracking-widest">{intel.title}</p>
                      <div className="flex gap-3 mt-1 text-[10px] font-mono uppercase tracking-widest text-[#88837a]">
                        <span>{intel.priority || 'priority'}</span>
                        <span>{intel.category || 'operations'}</span>
                        <span>{new Date(intel.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    {intel.tags?.length > 0 && (
                      <div className="hidden md:flex flex-wrap justify-end gap-1 max-w-[40%]">
                        {intel.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="border border-[#2a2520] px-1.5 py-0.5 text-[10px] font-mono text-[#88837a] uppercase tracking-widest">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[#d4cfc4] mt-2 leading-relaxed">{intel.body}</p>
                  {intel.action_items?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {intel.action_items.map((item, index) => (
                        <div key={`${intel.intel_id}-action-${index}`} className="text-[10px] font-mono text-[#88837a]">
                          [{index + 1}] {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-4">
          <IntelSection title="Pressure Points" icon={<AlertTriangle className="w-4 h-4 text-[#c4841d]" />}>
            {scarcityHotspots.length === 0 ? (
              <EmptyCopy text="No acute shortages detected." />
            ) : scarcityHotspots.map((item) => (
              <div key={item.name} className="border border-[#2a2520] bg-[#111111]/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-[#d4cfc4]">{item.name}</p>
                  <span className={`text-[10px] font-mono uppercase ${item.supply_level === 'critical' ? 'text-[#8b3a3a]' : 'text-[#c4841d]'}`}>
                    {item.supply_level}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[10px] font-mono text-[#88837a]">
                  <span>{item.category}</span>
                  <span>{item.multiplier}x value</span>
                  <span>{item.trend}</span>
                </div>
              </div>
            ))}
          </IntelSection>

          <IntelSection title="Mission Traffic" icon={<Crosshair className="w-4 h-4 text-[#c4841d]" />}>
            {missions.length === 0 ? (
              <EmptyCopy text="No active missions have been published." />
            ) : missions.map((mission) => (
              <div key={mission.mission_id} className="border border-[#2a2520] bg-[#111111]/50 p-3">
                <p className="font-heading text-xs uppercase tracking-widest text-[#d4cfc4]">{mission.title}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-[#88837a] mt-1">
                  {mission.difficulty} {mission.assigned_faction ? `| ${mission.assigned_faction}` : ''}
                </p>
                <p className="text-xs font-mono text-[#88837a] mt-2 leading-relaxed">{mission.summary}</p>
              </div>
            ))}
          </IntelSection>

          <IntelSection title="Field Reports" icon={<Radio className="w-4 h-4 text-[#c4841d]" />}>
            {hotEvents.length === 0 ? (
              <EmptyCopy text="No high-priority events in the latest sweep." />
            ) : hotEvents.map((event) => (
              <div key={event.event_id || `${event.timestamp}-${event.type}`} className="border border-[#2a2520] bg-[#111111]/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-widest text-[#c4841d]">{event.type?.replaceAll('_', ' ')}</p>
                  <span className="text-[10px] font-mono text-[#88837a]">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs font-mono text-[#d4cfc4] mt-2">{event.summary || event.raw}</p>
              </div>
            ))}
          </IntelSection>

          <IntelSection title="Supply Requests" icon={<Package className="w-4 h-4 text-[#c4841d]" />}>
            {supplyRequests.length === 0 ? (
              <EmptyCopy text="No open requests on the board." />
            ) : supplyRequests.slice(0, 5).map((request) => (
              <div key={request.request_id} className="border border-[#2a2520] bg-[#111111]/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-[#d4cfc4]">{request.requester_callsign || 'Unknown requester'}</p>
                  <span className={`text-[10px] font-mono uppercase ${request.priority === 'urgent' ? 'text-[#8b3a3a]' : 'text-[#c4841d]'}`}>
                    {request.priority}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-[#88837a] mt-2">
                  {(request.items || []).map((item) => `${item.qty}x ${item.item}`).join(', ')}
                </p>
                {request.notes && <p className="text-[10px] font-mono text-[#88837a] mt-1">{request.notes}</p>}
              </div>
            ))}
          </IntelSection>
        </div>
      </div>
    </div>
  );
}

function SignalCard({ icon, label, value, subtext, color }) {
  return (
    <div className="border border-[#2a2520] bg-[#111111]/55 p-3">
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">{label}</span>
      </div>
      <p className="font-heading text-2xl" style={{ color }}>{value}</p>
      <p className="text-[10px] font-mono text-[#88837a] mt-1">{subtext}</p>
    </div>
  );
}

function IntelSection({ title, icon, children }) {
  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center gap-2">
        {icon}
        <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">{title}</h3>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function EmptyCopy({ text }) {
  return <p className="text-xs font-mono text-[#88837a]/60 text-center py-6">{text}</p>;
}
