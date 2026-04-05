import { useState } from 'react';
import api from '@/lib/api';
import {
  Cpu, HardDrive, MemoryStick, Power, RotateCcw, Square, Zap, WifiOff, Users,
} from 'lucide-react';

export default function ServerStatus({ data, liveStats, liveState, onRefresh, isAdmin, onlineCount, onlinePlayers = [], onlineIdentities = {} }) {
  const [powerLoading, setPowerLoading] = useState('');

  const res = data?.resources?.attributes;
  const det = data?.details?.attributes;
  const hasError = data?.resources?.error || data?.details?.error;
  const noData = !data && !liveStats;

  const cpu = liveStats?.cpu_absolute ?? res?.resources?.cpu_absolute ?? 0;
  const memBytes = liveStats?.memory_bytes ?? res?.resources?.memory_bytes ?? 0;
  const diskBytes = liveStats?.disk_bytes ?? res?.resources?.disk_bytes ?? 0;
  const memLimit = liveStats?.memory_limit_bytes ?? (det?.limits?.memory ? det.limits.memory * 1048576 : 0);
  const currentState = liveState || liveStats?.state || res?.current_state || 'unknown';
  const isRunning = currentState === 'running';
  const isOffline = currentState === 'offline' || currentState === 'stopped';
  const isStarting = currentState === 'starting';

  const sendPower = async (signal) => {
    setPowerLoading(signal);
    try {
      await api.post('/server/power', { signal });
      setTimeout(onRefresh, 3000);
    } catch {}
    setPowerLoading('');
  };

  const formatBytes = (bytes) => {
    if (bytes == null || bytes === 0) return '0';
    if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="ds-panel panel-inset noise-bg h-full" data-testid="server-status-panel">
      <div className="ds-panel-header">
        <div className={`w-2 h-2 rounded-full ${
          isRunning ? 'bg-[#6b7a3d] pulse-green'
            : isStarting ? 'bg-[#c4841d] pulse-amber'
            : isOffline ? 'bg-[#8b3a3a]'
            : hasError ? 'bg-[#8b3a3a]'
            : 'bg-[#88837a]'
        }`} />
        <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d] flex-1">Server Status</h3>
        <span className="text-[9px] font-mono text-[#88837a]/40 tracking-widest">SYS.01</span>
      </div>

      <div className="ds-panel-body ds-grid-bg">
        {hasError && !liveStats ? (
          <div className="text-xs font-mono space-y-2 relative z-10">
            <div className="flex items-center gap-2 text-[#a94442]">
              <WifiOff className="w-4 h-4" />
              <span className="font-heading text-sm uppercase tracking-widest">[SIGNAL LOST]</span>
            </div>
            <p className="text-[#88837a]">Unable to reach server panel.</p>
            <p className="text-[#88837a] text-[10px] break-all">{data?.resources?.error || data?.details?.error || 'Connection failed'}</p>
          </div>
        ) : noData ? (
          <div className="text-xs font-mono text-[#88837a] text-center py-4 relative z-10">
            <p className="animate-pulse">Acquiring signal...</p>
          </div>
        ) : (
          <div className="space-y-4 relative z-10">
            {/* State + Server */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">State</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-heading uppercase tracking-wider font-bold ${
                  isRunning ? 'text-[#6b7a3d] glow-amber-text' : isStarting ? 'text-[#c4841d]' : 'text-[#a94442]'
                }`}>
                  {currentState}
                </span>
              </div>
            </div>
            {det?.name && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Server</span>
                <span className="text-[11px] font-mono text-[#d4cfc4] truncate ml-2">{det.name}</span>
              </div>
            )}

            {/* Player count */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Players</span>
              <span className={`text-sm font-heading uppercase tracking-wider font-bold ${
                (onlineCount || 0) > 0 ? 'text-[#6b7a3d]' : 'text-[#88837a]'
              }`}>
                {onlineCount ?? 0} / 12
              </span>
            </div>

            {/* Roster */}
            {onlinePlayers.length > 0 && (
              <div className="border border-[#2a2520] bg-[#0a0a0a] p-2" data-testid="online-roster">
                <div className="flex items-center gap-1.5 mb-1.5 text-[9px] font-heading uppercase tracking-widest text-[#88837a]">
                  <Users className="w-3 h-3" /> Active Roster
                </div>
                <div className="space-y-0.5">
                  {onlinePlayers.map((name) => {
                    const identity = onlineIdentities[name] || {};
                    const displayName = identity.steam_name || name;
                    return (
                      <div key={name} className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6b7a3d] animate-pulse shrink-0" />
                        <span className="text-[#d4cfc4] truncate">{displayName}</span>
                        {identity.level != null && <span className="text-[#88837a]/50 text-[10px]">Lv:{identity.level}</span>}
                        {identity.clan && <span className="text-[#88837a]/50 text-[10px]">[{identity.clan}]</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Offline/Starting banners */}
            {isOffline && (
              <div className="border border-[#8b3a3a]/30 bg-[#8b3a3a]/5 p-2.5 glow-red-soft">
                <p className="text-[10px] font-mono text-[#a94442] text-center">Server offline. No live telemetry.</p>
                {isAdmin && <p className="text-[9px] font-mono text-[#88837a] mt-1 text-center">Use START to bring online.</p>}
              </div>
            )}
            {isStarting && (
              <div className="border border-[#c4841d]/30 bg-[#c4841d]/5 p-2.5 glow-amber-soft">
                <p className="text-[10px] font-mono text-[#c4841d] animate-pulse text-center">Server starting up...</p>
              </div>
            )}

            {/* GAUGES — SVG arc gauges */}
            <div className={`grid grid-cols-3 gap-3 pt-2 border-t border-[#1e1a17] ${isOffline ? 'opacity-30' : ''}`}>
              <ArcGauge icon={<Cpu className="w-3 h-3" />} label="CPU" value={cpu} max={100} unit="%" color="#c4841d" />
              <ArcGauge icon={<MemoryStick className="w-3 h-3" />} label="RAM" value={memBytes} max={memLimit || 1} unit="" formatted={formatBytes(memBytes)} color="#6b7a3d" />
              <ArcGauge icon={<HardDrive className="w-3 h-3" />} label="DISK" value={diskBytes} max={det?.limits?.disk ? det.limits.disk * 1048576 : diskBytes * 2} unit="" formatted={formatBytes(diskBytes)} color="#3a6b8b" />
            </div>

            {/* Power Controls */}
            {isAdmin && (
              <div className="pt-3 border-t border-[#1e1a17]">
                <p className="text-[9px] font-heading uppercase tracking-widest text-[#88837a] mb-2">Power Controls</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <PowerBtn icon={<Power className="w-3 h-3" />} label="Start" signal="start" color="green" loading={powerLoading} onClick={sendPower} highlight={isOffline} />
                  <PowerBtn icon={<Square className="w-3 h-3" />} label="Stop" signal="stop" color="amber" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
                  <PowerBtn icon={<RotateCcw className="w-3 h-3" />} label="Restart" signal="restart" color="amber" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
                  <PowerBtn icon={<Zap className="w-3 h-3" />} label="Kill" signal="kill" color="red" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function ArcGauge({ icon, label, value, max, unit, formatted, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (pct / 100) * circumference * 0.75; // 270-degree arc
  const displayVal = formatted || `${pct.toFixed(1)}${unit}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[72px] h-[72px]">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Track */}
          <circle
            cx="50" cy="50" r="40"
            className="gauge-track"
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeDashoffset="0"
            transform="rotate(135 50 50)"
          />
          {/* Value */}
          <circle
            cx="50" cy="50" r="40"
            className="gauge-ring gauge-value"
            stroke={color}
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeDashoffset={dashOffset}
            transform="rotate(135 50 50)"
            style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-mono font-bold" style={{ color }}>{displayVal}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5 text-[#88837a]">
        {icon}
        <span className="text-[9px] font-heading uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
}


function PowerBtn({ icon, label, signal, color, loading, onClick, highlight, disabled, ...props }) {
  const colors = {
    green: 'border-[#4a5c3a] text-[#4a5c3a] hover:bg-[#4a5c3a] hover:text-[#0d0d0d]',
    amber: 'border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d] hover:text-[#0d0d0d]',
    red: 'border-[#8b3a3a] text-[#8b3a3a] hover:bg-[#8b3a3a] hover:text-[#0d0d0d]',
  };
  const highlightClass = highlight ? 'bg-[#4a5c3a]/10 glow-green-soft border-2' : '';
  return (
    <button
      {...props}
      onClick={() => onClick(signal)}
      disabled={loading === signal || disabled}
      className={`border ${colors[color]} ${highlightClass} font-heading text-[10px] uppercase tracking-widest font-bold py-2 flex items-center justify-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {icon} {loading === signal ? '...' : label}
    </button>
  );
}
