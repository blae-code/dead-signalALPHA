import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Sun, Moon, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog,
  Thermometer, AlertTriangle, Clock, Leaf, Snowflake, Flower2, TreeDeciduous,
  ShieldAlert, Eye,
} from 'lucide-react';

const WEATHER_ICONS = {
  clear: <Sun className="w-6 h-6" />,
  cloudy: <Cloud className="w-6 h-6" />,
  overcast: <Cloud className="w-6 h-6" />,
  rain: <CloudRain className="w-6 h-6" />,
  storm: <CloudLightning className="w-6 h-6" />,
  fog: <CloudFog className="w-6 h-6" />,
  snow: <CloudSnow className="w-6 h-6" />,
  blizzard: <CloudSnow className="w-6 h-6" />,
};

const WEATHER_COLORS = {
  clear: '#c4841d', cloudy: '#88837a', overcast: '#6b7a3d',
  rain: '#3a6b8b', storm: '#8b3a3a', fog: '#7a3d6b',
  snow: '#b8c4d4', blizzard: '#8b3a3a',
};

const TIME_ICONS = {
  dawn: <Sun className="w-5 h-5 text-[#c4841d]" />,
  morning: <Sun className="w-5 h-5 text-[#c4841d]" />,
  noon: <Sun className="w-5 h-5 text-[#e8b84d]" />,
  afternoon: <Sun className="w-5 h-5 text-[#c4841d]" />,
  dusk: <Moon className="w-5 h-5 text-[#8b3a3a]" />,
  night: <Moon className="w-5 h-5 text-[#3a6b8b]" />,
  midnight: <Moon className="w-5 h-5 text-[#3a4a5c]" />,
};

const SEASON_ICONS = {
  spring: <Flower2 className="w-4 h-4 text-[#6b7a3d]" />,
  summer: <Sun className="w-4 h-4 text-[#c4841d]" />,
  autumn: <TreeDeciduous className="w-4 h-4 text-[#8b6b3a]" />,
  winter: <Snowflake className="w-4 h-4 text-[#b8c4d4]" />,
};

const DANGER_LABELS = ['SAFE', 'SAFE', 'LOW', 'LOW', 'MODERATE', 'MODERATE', 'HIGH', 'HIGH', 'EXTREME', 'EXTREME', 'LETHAL'];
const DANGER_COLORS = ['#6b7a3d', '#6b7a3d', '#6b7a3d', '#6b7a3d', '#c4841d', '#c4841d', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#ff0000'];

function Tooltip({ children, text }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 border border-[#c4841d]/40 bg-[#111111] text-[10px] font-mono text-[#d4cfc4] leading-relaxed shadow-[0_0_20px_rgba(196,132,29,0.15)] pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#c4841d]/40" />
          {text}
        </div>
      )}
    </div>
  );
}

export default function WorldConditions() {
  const [world, setWorld] = useState(null);

  const fetchWorld = useCallback(async () => {
    try {
      const { data } = await api.get('/world/state');
      setWorld(data);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => {
    fetchWorld();
    const i = setInterval(fetchWorld, 30000);
    return () => clearInterval(i);
  }, [fetchWorld]);

  if (!world) {
    return (
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg p-4">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#88837a] animate-pulse" />
          <span className="text-xs font-mono text-[#88837a]">Scanning world conditions...</span>
        </div>
      </div>
    );
  }

  const dangerColor = DANGER_COLORS[world.danger_level] || DANGER_COLORS[0];
  const dangerLabel = DANGER_LABELS[world.danger_level] || 'UNKNOWN';
  const weatherColor = WEATHER_COLORS[world.weather] || '#88837a';

  // Day progress bar (24h)
  const dayProgress = (world.hour / 24) * 100;
  // Night zone: 20-5
  const isNightHour = world.hour >= 20 || world.hour < 5;

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="world-conditions">
      {/* Header */}
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">World Conditions</h3>
        </div>
        <Tooltip text={`Threat Level: ${dangerLabel}. Combined assessment of time, weather, and season hazards.`}>
          <div className="flex items-center gap-1.5 cursor-help" data-testid="danger-level">
            <ShieldAlert className="w-3.5 h-3.5" style={{ color: dangerColor }} />
            <span className="text-[10px] font-heading uppercase tracking-widest font-bold" style={{ color: dangerColor }}>
              {dangerLabel}
            </span>
            <div className="flex gap-0.5 ml-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-3 transition-all"
                  style={{
                    backgroundColor: i < Math.ceil(world.danger_level / 2)
                      ? dangerColor
                      : '#2a2520',
                  }}
                />
              ))}
            </div>
          </div>
        </Tooltip>
      </div>

      <div className="p-4">
        {/* Custom Alert */}
        {world.custom_alert && (
          <div className="mb-3 flex items-start gap-2 p-2 border border-[#8b3a3a] bg-[#8b3a3a]/10" data-testid="world-alert">
            <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0 mt-0.5" />
            <p className="text-xs font-mono text-[#d4cfc4]">{world.custom_alert}</p>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Time of Day */}
          <Tooltip text={world.time_tooltip}>
            <div className="border border-[#2a2520] bg-[#111111] p-3 cursor-help hover:border-[#c4841d]/30 transition-colors" data-testid="world-time">
              <div className="flex items-center gap-2 mb-1">
                {TIME_ICONS[world.time_of_day]}
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Time</span>
              </div>
              <p className="font-heading text-xl uppercase tracking-wider text-[#d4cfc4]">{world.hour_display}</p>
              <p className="text-[10px] font-mono uppercase text-[#c4841d] mt-0.5">{world.time_of_day}</p>
            </div>
          </Tooltip>

          {/* Weather */}
          <Tooltip text={world.weather_tooltip}>
            <div className="border border-[#2a2520] bg-[#111111] p-3 cursor-help hover:border-[#c4841d]/30 transition-colors" data-testid="world-weather">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: weatherColor }}>{WEATHER_ICONS[world.weather]}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Weather</span>
              </div>
              <p className="font-heading text-xl uppercase tracking-wider text-[#d4cfc4]">{world.weather}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Thermometer className="w-3 h-3 text-[#88837a]" />
                <span className={`text-[10px] font-mono ${world.temperature < 0 ? 'text-[#3a6b8b]' : world.temperature > 30 ? 'text-[#8b3a3a]' : 'text-[#88837a]'}`}>
                  {world.temperature}°C
                </span>
              </div>
            </div>
          </Tooltip>

          {/* Season */}
          <Tooltip text={world.season_tooltip}>
            <div className="border border-[#2a2520] bg-[#111111] p-3 cursor-help hover:border-[#c4841d]/30 transition-colors" data-testid="world-season">
              <div className="flex items-center gap-2 mb-1">
                {SEASON_ICONS[world.season]}
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Season</span>
              </div>
              <p className="font-heading text-xl uppercase tracking-wider text-[#d4cfc4]">{world.season}</p>
              <p className="text-[10px] font-mono text-[#88837a] mt-0.5">Day {world.day} / 120</p>
            </div>
          </Tooltip>

          {/* Day Cycle Bar */}
          <div className="border border-[#2a2520] bg-[#111111] p-3" data-testid="world-cycle">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-[#88837a]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]">Day Cycle</span>
            </div>
            <div className="relative w-full h-4 bg-[#0a0a0a] border border-[#2a2520] overflow-hidden">
              {/* Night zone background */}
              <div className="absolute top-0 bottom-0 bg-[#1a1a3a]/40" style={{ left: '83.3%', right: 0 }} />
              <div className="absolute top-0 bottom-0 bg-[#1a1a3a]/40" style={{ left: 0, width: '20.8%' }} />
              {/* Day zone */}
              <div className="absolute top-0 bottom-0 bg-[#c4841d]/10" style={{ left: '20.8%', right: '16.7%' }} />
              {/* Current position */}
              <div
                className="absolute top-0 bottom-0 w-0.5 transition-all"
                style={{
                  left: `${dayProgress}%`,
                  backgroundColor: isNightHour ? '#3a6b8b' : '#c4841d',
                  boxShadow: `0 0 6px ${isNightHour ? '#3a6b8b' : '#c4841d'}`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[8px] font-mono text-[#88837a]">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
