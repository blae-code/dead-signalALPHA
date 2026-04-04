import { useState } from 'react';
import api from '@/lib/api';
import {
  Cpu, HardDrive, MemoryStick, Power, RotateCcw, Square, Zap, RefreshCw, WifiOff, Users,
} from 'lucide-react';

export default function ServerStatus({ data, liveStats, liveState, onRefresh, isAdmin, onlineCount, onlinePlayers = [] }) {
  const [powerLoading, setPowerLoading] = useState('');

  const res = data?.resources?.attributes;
  const det = data?.details?.attributes;
  const hasError = data?.resources?.error || data?.details?.error;
  const noData = !data && !liveStats;

  // Prefer live stats from WebSocket, fallback to polled data
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
    } catch { /* graceful */ }
    setPowerLoading('');
  };

  const formatBytes = (bytes) => {
    if (bytes == null || bytes === 0) return '0 MB';
    if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg h-full" data-testid="server-status-panel">
      {/* Header */}
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isRunning ? 'bg-[#6b7a3d] pulse-green'
              : isStarting ? 'bg-[#c4841d] pulse-amber'
              : isOffline ? 'bg-[#8b3a3a]'
              : hasError ? 'bg-[#8b3a3a]'
              : 'bg-[#88837a]'
          }`} />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Server Status</h3>
        </div>
        <button
          data-testid="refresh-status-button"
          onClick={onRefresh}
          className="text-[#88837a] hover:text-[#c4841d] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Connection error state */}
        {hasError && !liveStats ? (
          <div className="text-xs font-mono space-y-2">
            <div className="flex items-center gap-2 text-[#a94442]">
              <WifiOff className="w-4 h-4" />
              <span className="font-heading text-sm uppercase tracking-widest">[SIGNAL LOST]</span>
            </div>
            <p className="text-[#88837a]">Unable to reach server panel.</p>
            <p className="text-[#88837a] text-[10px] break-all">
              {data?.resources?.error || data?.details?.error || 'Connection failed'}
            </p>
            {data?.resources?.detail && (
              <p className="text-[#88837a] text-[10px] break-all mt-1">{data.resources.detail}</p>
            )}
          </div>
        ) : noData ? (
          <div className="text-xs font-mono text-[#88837a] text-center py-4">
            <p>Acquiring signal...</p>
          </div>
        ) : (
          <>
            {/* State */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-[#88837a]">State</span>
              <span className={`text-sm font-heading uppercase tracking-wider font-bold ${
                isRunning ? 'text-[#6b7a3d]'
                  : isStarting ? 'text-[#c4841d]'
                  : 'text-[#a94442]'
              }`}>
                {currentState}
              </span>
            </div>

            {/* Server name */}
            {det?.name && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-widest text-[#88837a]">Server</span>
                <span className="text-xs font-mono text-[#d4cfc4] truncate ml-2">{det.name}</span>
              </div>
            )}

            {/* Player count */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-[#88837a]">Players</span>
              <span className={`text-sm font-heading uppercase tracking-wider font-bold ${
                (onlineCount || 0) > 0 ? 'text-[#6b7a3d]' : 'text-[#88837a]'
              }`}>
                {onlineCount ?? 0} / 12
              </span>
            </div>

            {/* Online Player Roster */}
            {onlinePlayers.length > 0 && (
              <div className="border border-[#2a2520] bg-[#0a0a0a] p-2" data-testid="online-roster">
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-heading uppercase tracking-widest text-[#88837a]">
                  <Users className="w-3 h-3" /> Active Roster
                </div>
                <div className="space-y-0.5">
                  {onlinePlayers.map((name) => (
                    <div key={name} className="flex items-center gap-1.5 text-xs font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6b7a3d] animate-pulse shrink-0" />
                      <span className="text-[#d4cfc4] truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Offline banner */}
            {isOffline && (
              <div className="border border-[#8b3a3a]/50 bg-[#8b3a3a]/5 p-3 text-center">
                <p className="text-xs font-mono text-[#a94442]">Server is offline. No live telemetry available.</p>
                {isAdmin && (
                  <p className="text-[10px] font-mono text-[#88837a] mt-1">Use START below to bring the server online.</p>
                )}
              </div>
            )}

            {/* Starting banner */}
            {isStarting && (
              <div className="border border-[#c4841d]/50 bg-[#c4841d]/5 p-3 text-center">
                <p className="text-xs font-mono text-[#c4841d] animate-pulse">Server is starting up...</p>
              </div>
            )}

            {/* Stats — show even when offline, with muted style */}
            <div className={`space-y-3 pt-2 border-t border-[#2a2520] ${isOffline ? 'opacity-40' : ''}`}>
              <StatBar icon={<Cpu className="w-3.5 h-3.5" />} label="CPU" value={`${cpu.toFixed(1)}%`} pct={cpu} color="amber" />
              <StatBar icon={<MemoryStick className="w-3.5 h-3.5" />} label="RAM" value={formatBytes(memBytes)} pct={memLimit ? (memBytes / memLimit) * 100 : 0} color="amber" />
              <StatBar icon={<HardDrive className="w-3.5 h-3.5" />} label="Disk" value={formatBytes(diskBytes)} pct={det?.limits?.disk ? (diskBytes / (det.limits.disk * 1048576)) * 100 : 0} color="green" />
            </div>
          </>
        )}

        {/* Power Controls */}
        {isAdmin && (
          <div className="pt-3 border-t border-[#2a2520]">
            <p className="text-xs font-mono uppercase tracking-widest text-[#88837a] mb-3">Power Controls</p>
            <div className="grid grid-cols-2 gap-2">
              <PowerBtn
                data-testid="power-start-button"
                icon={<Power className="w-3 h-3" />}
                label="Start"
                signal="start"
                color="green"
                loading={powerLoading}
                onClick={sendPower}
                highlight={isOffline}
              />
              <PowerBtn data-testid="power-stop-button" icon={<Square className="w-3 h-3" />} label="Stop" signal="stop" color="amber" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
              <PowerBtn data-testid="power-restart-button" icon={<RotateCcw className="w-3 h-3" />} label="Restart" signal="restart" color="amber" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
              <PowerBtn data-testid="power-kill-button" icon={<Zap className="w-3 h-3" />} label="Kill" signal="kill" color="red" loading={powerLoading} onClick={sendPower} disabled={isOffline} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBar({ icon, label, value, pct, color }) {
  const barColor = color === 'green' ? 'bg-[#4a5c3a]' : 'bg-[#c4841d]';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-[#88837a]">
          {icon}
          <span className="text-xs font-mono uppercase tracking-widest">{label}</span>
        </div>
        <span className="text-xs font-mono text-[#d4cfc4]">{value}</span>
      </div>
      <div className="h-1.5 bg-[#111111] border border-[#2a2520]">
        <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function PowerBtn({ icon, label, signal, color, loading, onClick, highlight, disabled, ...props }) {
  const colors = {
    green: 'border-[#4a5c3a] text-[#4a5c3a] hover:bg-[#4a5c3a] hover:text-[#111111]',
    amber: 'border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d] hover:text-[#111111]',
    red: 'border-[#8b3a3a] text-[#8b3a3a] hover:bg-[#8b3a3a] hover:text-[#111111]',
  };
  const highlightClass = highlight
    ? 'bg-[#4a5c3a]/20 shadow-[0_0_10px_rgba(74,92,58,0.3)] border-2'
    : '';
  return (
    <button
      {...props}
      onClick={() => onClick(signal)}
      disabled={loading === signal || disabled}
      className={`border ${colors[color]} ${highlightClass} font-heading text-xs uppercase tracking-widest font-bold p-2 flex items-center justify-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {icon} {loading === signal ? '...' : label}
    </button>
  );
}
