import { useMemo } from 'react';

function RainOverlay() {
  const drops = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      height: `${15 + Math.random() * 25}px`,
      animationDuration: `${0.4 + Math.random() * 0.4}s`,
      animationDelay: `${Math.random() * 2}s`,
      opacity: 0.3 + Math.random() * 0.4,
    })), []);

  return (
    <div className="weather-overlay weather-rain">
      {drops.map((s, i) => (
        <div key={i} className="rain-drop" style={s} />
      ))}
    </div>
  );
}

function SnowOverlay() {
  const flakes = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      width: `${2 + Math.random() * 3}px`,
      height: `${2 + Math.random() * 3}px`,
      animationDuration: `${4 + Math.random() * 6}s`,
      animationDelay: `${Math.random() * 5}s`,
      opacity: 0.3 + Math.random() * 0.5,
    })), []);

  return (
    <div className="weather-overlay weather-snow">
      {flakes.map((s, i) => (
        <div key={i} className="snow-flake" style={s} />
      ))}
    </div>
  );
}

function StormOverlay() {
  const drops = useMemo(() =>
    Array.from({ length: 80 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      height: `${20 + Math.random() * 35}px`,
      animationDuration: `${0.25 + Math.random() * 0.3}s`,
      animationDelay: `${Math.random() * 1.5}s`,
      opacity: 0.2 + Math.random() * 0.3,
    })), []);

  return (
    <div className="weather-overlay weather-storm weather-rain">
      <div className="storm-flash" />
      {drops.map((s, i) => (
        <div key={i} className="rain-drop" style={s} />
      ))}
    </div>
  );
}

function FogOverlay() {
  return <div className="weather-overlay weather-fog" />;
}

function DustOverlay() {
  const motes = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDuration: `${6 + Math.random() * 8}s`,
      animationDelay: `${Math.random() * 6}s`,
      opacity: 0.15 + Math.random() * 0.2,
    })), []);

  return (
    <div className="weather-overlay weather-clear">
      {motes.map((s, i) => (
        <div key={i} className="dust-mote" style={s} />
      ))}
    </div>
  );
}

function BlizzardOverlay() {
  const flakes = useMemo(() =>
    Array.from({ length: 70 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      width: `${2 + Math.random() * 4}px`,
      height: `${2 + Math.random() * 4}px`,
      animationDuration: `${2 + Math.random() * 3}s`,
      animationDelay: `${Math.random() * 3}s`,
      opacity: 0.4 + Math.random() * 0.4,
    })), []);

  return (
    <div className="weather-overlay weather-snow">
      <div className="storm-flash" />
      {flakes.map((s, i) => (
        <div key={i} className="snow-flake" style={s} />
      ))}
    </div>
  );
}

const OVERLAY_MAP = {
  rain: RainOverlay,
  storm: StormOverlay,
  snow: SnowOverlay,
  blizzard: BlizzardOverlay,
  fog: FogOverlay,
  clear: DustOverlay,
  cloudy: DustOverlay,
  overcast: FogOverlay,
};

export default function WeatherOverlay({ weather }) {
  const Overlay = OVERLAY_MAP[weather];
  if (!Overlay) return null;
  return <Overlay />;
}
