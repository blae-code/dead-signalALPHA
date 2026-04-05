import {
  Sun, Moon, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog,
  Thermometer, ShieldAlert, Flower2, Snowflake, TreeDeciduous, Radio,
} from 'lucide-react';

const WEATHER_ICONS = {
  clear: <Sun className="w-3 h-3" />,
  cloudy: <Cloud className="w-3 h-3" />,
  overcast: <Cloud className="w-3 h-3" />,
  rain: <CloudRain className="w-3 h-3" />,
  storm: <CloudLightning className="w-3 h-3" />,
  fog: <CloudFog className="w-3 h-3" />,
  snow: <CloudSnow className="w-3 h-3" />,
  blizzard: <CloudSnow className="w-3 h-3" />,
};

const TIME_ICONS = {
  dawn: <Sun className="w-3 h-3" />,
  morning: <Sun className="w-3 h-3" />,
  noon: <Sun className="w-3 h-3" />,
  afternoon: <Sun className="w-3 h-3" />,
  dusk: <Moon className="w-3 h-3" />,
  night: <Moon className="w-3 h-3" />,
  midnight: <Moon className="w-3 h-3" />,
};

const SEASON_ICONS = {
  spring: <Flower2 className="w-3 h-3" />,
  summer: <Sun className="w-3 h-3" />,
  autumn: <TreeDeciduous className="w-3 h-3" />,
  winter: <Snowflake className="w-3 h-3" />,
};

const DANGER_COLORS = ['#6b7a3d', '#6b7a3d', '#6b7a3d', '#6b7a3d', '#c4841d', '#c4841d', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#ff0000'];
const DANGER_LABELS = ['SAFE', 'SAFE', 'LOW', 'LOW', 'MODERATE', 'MODERATE', 'HIGH', 'HIGH', 'EXTREME', 'EXTREME', 'LETHAL'];

export default function LiveStatusBar({ worldState }) {
  if (!worldState) return null;

  const dangerColor = DANGER_COLORS[worldState.danger_level] || '#88837a';
  const dangerLabel = DANGER_LABELS[worldState.danger_level] || 'UNKNOWN';

  return (
    <div
      className="border-b border-[#1e1a17] bg-[#0a0a0a] px-4 py-1.5 flex items-center gap-0 overflow-x-auto text-[10px] font-mono relative"
      data-testid="live-status-bar"
    >
      {/* Subtle bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{
        background: `linear-gradient(90deg, transparent, ${dangerColor}33, transparent)`,
      }} />

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 text-[#6b7a3d] shrink-0 pr-3">
        <Radio className="w-3 h-3 animate-pulse" />
        <span className="uppercase tracking-[0.2em] text-[9px]">Live</span>
      </div>

      <Sep />

      {/* Time */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0 px-3">
        <span className="text-[#c4841d]">{TIME_ICONS[worldState.time_of_day]}</span>
        <span className="tabular-nums">{worldState.hour_display}</span>
        <span className="text-[#88837a]/60 uppercase text-[9px]">{worldState.time_of_day}</span>
      </div>

      <Sep />

      {/* Weather */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0 px-3">
        <span className="text-[#c4841d]">{WEATHER_ICONS[worldState.weather]}</span>
        <span className="uppercase">{worldState.weather}</span>
        <span className="text-[#88837a]/60 flex items-center gap-0.5">
          <Thermometer className="w-2.5 h-2.5" />
          <span className="tabular-nums">{worldState.temperature}°C</span>
        </span>
      </div>

      <Sep />

      {/* Season + Day */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0 px-3">
        <span className="text-[#c4841d]">{SEASON_ICONS[worldState.season]}</span>
        <span className="uppercase">{worldState.season}</span>
        <span className="text-[#88837a]/60">D{worldState.day}</span>
      </div>

      <Sep />

      {/* Danger */}
      <div className="flex items-center gap-2 shrink-0 px-3">
        <ShieldAlert className="w-3 h-3" style={{ color: dangerColor }} />
        <span className="uppercase tracking-widest font-bold text-[9px]" style={{ color: dangerColor, textShadow: `0 0 8px ${dangerColor}40` }}>
          {dangerLabel}
        </span>
        <div className="flex gap-[2px]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-[3px] h-[8px] transition-all duration-700"
              style={{
                backgroundColor: i < worldState.danger_level ? dangerColor : '#1e1a17',
                boxShadow: i < worldState.danger_level ? `0 0 3px ${dangerColor}60` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Custom alert */}
      {worldState.custom_alert && (
        <>
          <Sep />
          <span className="text-[#8b3a3a] uppercase tracking-wider truncate max-w-[200px] shrink-0 px-3 animate-pulse">
            {worldState.custom_alert}
          </span>
        </>
      )}

      {/* System identifier — right-aligned */}
      <div className="ml-auto shrink-0 pl-4">
        <span className="text-[8px] tracking-[0.3em] text-[#88837a]/20 uppercase">DEAD.SIGNAL//V1</span>
      </div>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-3 bg-[#2a2520] shrink-0 mx-0" />;
}
