import { RefreshCw, AlertTriangle, UserPlus, UserMinus, Skull, Crosshair, Radio, Package } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const EVENT_ICONS = {
  player_connect: <UserPlus className="w-3 h-3" />,
  player_disconnect: <UserMinus className="w-3 h-3" />,
  player_death: <Skull className="w-3 h-3" />,
  player_kill: <Crosshair className="w-3 h-3" />,
  horde_event: <AlertTriangle className="w-3 h-3" />,
  airdrop: <Package className="w-3 h-3" />,
  chat: <Radio className="w-3 h-3" />,
  server: <Radio className="w-3 h-3" />,
};

const SEVERITY_CLASSES = {
  critical: 'text-[#a94442] border-l-[#a94442]',
  high: 'text-[#d4944a] border-l-[#d4944a]',
  medium: 'text-[#c4841d] border-l-[#c4841d]',
  info: 'text-[#6b7a3d] border-l-[#6b7a3d]',
  low: 'text-[#88837a] border-l-[#88837a]',
};

export default function EventFeed({ events, onRefresh, serverOffline }) {
  const formatTime = (ts) => {
    if (!ts) return '--:--';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg h-full" data-testid="event-feed-panel">
      {/* Header */}
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#c4841d] pulse-amber" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Event Feed</h3>
          <span className="text-[10px] font-mono text-[#88837a]">({events.length})</span>
        </div>
        <button
          data-testid="refresh-events-button"
          onClick={onRefresh}
          className="text-[#88837a] hover:text-[#c4841d] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <ScrollArea className="h-[350px]">
        <div className="p-2 space-y-1">
          {serverOffline && (
            <div className="border border-[#8b3a3a]/30 bg-[#8b3a3a]/5 p-2 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#8b3a3a]" />
              <span className="text-[10px] font-mono text-[#a94442] uppercase tracking-widest">Server offline — no live events</span>
            </div>
          )}
          {events.length === 0 ? (
            <div className="text-center py-12">
              <Radio className="w-6 h-6 text-[#88837a] mx-auto mb-3 opacity-40" />
              <p className="text-xs font-mono text-[#88837a]">No events intercepted</p>
              <p className="text-[10px] font-mono text-[#88837a]/60 mt-1">
                {serverOffline ? 'Server is offline. Start the server to receive events.' : 'Monitoring all frequencies...'}
              </p>
            </div>
          ) : (
            events.map((ev, i) => (
              <div
                key={ev.event_id || `${ev.timestamp}-${i}`}
                data-testid={`event-item-${i}`}
                className={`event-enter flex items-start gap-2 p-2 border-l-2 ${SEVERITY_CLASSES[ev.severity] || SEVERITY_CLASSES.low} bg-[#111111]/50 hover:bg-[#111111] transition-colors text-xs font-mono`}
                style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
              >
                <span className="opacity-60 mt-0.5">
                  {EVENT_ICONS[ev.type] || <Radio className="w-3 h-3" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[#88837a] text-[10px]">{formatTime(ev.timestamp)}</span>
                    <span className={`uppercase tracking-wider text-[10px] font-bold ${SEVERITY_CLASSES[ev.severity]?.split(' ')[0] || 'text-[#88837a]'}`}>
                      {ev.type?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[#d4cfc4] break-words leading-relaxed">{ev.raw}</p>
                  {ev.players?.length > 0 && (
                    <span className="text-[10px] text-[#c4841d]">
                      [{ev.players.join(', ')}]
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
