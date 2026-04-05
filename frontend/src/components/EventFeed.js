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

const SEVERITY_COLOR = {
  critical: '#a94442',
  high: '#d4944a',
  medium: '#c4841d',
  info: '#6b7a3d',
  low: '#88837a',
};

export default function EventFeed({ events, onRefresh, serverOffline }) {
  const formatTime = (ts) => {
    if (!ts) return '--:--';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="ds-panel panel-inset noise-bg h-full" data-testid="event-feed-panel">
      <div className="ds-panel-header">
        <div className="w-2 h-2 rounded-full bg-[#c4841d] pulse-amber" />
        <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d] flex-1">Event Feed</h3>
        <span className="text-[9px] font-mono text-[#88837a]/40 mr-2">{events.length} events</span>
        <span className="text-[9px] font-mono text-[#88837a]/40 tracking-widest mr-2">INT.02</span>
        <button data-testid="refresh-events-button" onClick={onRefresh} className="text-[#88837a] hover:text-[#c4841d] transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <ScrollArea className="h-[350px]">
        <div className="p-1.5 space-y-px ds-grid-bg">
          {serverOffline && (
            <div className="border border-[#8b3a3a]/20 bg-[#8b3a3a]/5 px-2 py-1.5 mb-1 flex items-center gap-2 glow-red-soft">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b3a3a]" />
              <span className="text-[9px] font-mono text-[#a94442] uppercase tracking-widest">No live feed — server offline</span>
            </div>
          )}
          {events.length === 0 ? (
            <div className="text-center py-12 relative z-10">
              <Radio className="w-6 h-6 text-[#88837a] mx-auto mb-3 opacity-30" />
              <p className="text-[11px] font-mono text-[#88837a]">No events intercepted</p>
              <p className="text-[9px] font-mono text-[#88837a]/40 mt-1">
                {serverOffline ? 'Start server to receive events.' : 'Monitoring all frequencies...'}
              </p>
            </div>
          ) : (
            events.map((ev, i) => {
              const sevColor = SEVERITY_COLOR[ev.severity] || SEVERITY_COLOR.low;
              return (
                <div
                  key={ev.event_id || `${ev.timestamp}-${i}`}
                  data-testid={`event-item-${i}`}
                  className="event-enter flex items-start gap-2 px-2 py-1.5 bg-[#0d0d0d]/60 hover:bg-[#111111] transition-colors relative z-10"
                  style={{
                    animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
                    borderLeft: `2px solid ${sevColor}`,
                  }}
                >
                  <span className="opacity-50 mt-0.5" style={{ color: sevColor }}>
                    {EVENT_ICONS[ev.type] || <Radio className="w-3 h-3" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-[#88837a]/60 tabular-nums">{formatTime(ev.timestamp)}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: sevColor }}>
                        {ev.type?.replace(/_/g, ' ')}
                      </span>
                      {ev.players?.length > 0 && (
                        <span className="text-[9px] text-[#c4841d] ml-auto shrink-0">{ev.players.join(', ')}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#d4cfc4]/80 break-words leading-relaxed mt-0.5">{ev.raw}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
