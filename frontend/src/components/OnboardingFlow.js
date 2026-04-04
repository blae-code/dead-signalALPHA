import { useState } from 'react';
import { Radio, Monitor, Shield, Users, Package, Cpu, ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import api from '@/lib/api';

const STEPS = [
  {
    icon: <Radio className="w-10 h-10 text-[#c4841d]" />,
    title: 'Welcome to Dead Signal',
    body: 'Your AI-narrated command center for HumanitZ. Dead Signal transforms your solo survival experience into a connected, living world — tracking events, managing factions, and narrating your journey in real time.',
    highlight: 'The signal is live. Your story begins now.',
  },
  {
    icon: <Monitor className="w-10 h-10 text-[#c4841d]" />,
    title: 'Live Server Dashboard',
    body: 'Monitor your game server in real time. CPU, RAM, player count, and console output stream directly to your dashboard. World conditions — weather, time of day, season — update live as the game progresses.',
    highlight: 'Everything you see reflects what is happening right now.',
  },
  {
    icon: <Cpu className="w-10 h-10 text-[#c4841d]" />,
    title: 'AI Narrative Engine',
    body: 'Powered by Gemini AI, Dead Signal watches your server console and generates atmospheric dispatches — turning raw log lines into immersive war correspondent reports. Deaths, hordes, airdrops, and world events are all narrated.',
    highlight: 'Your survival story, written in real time by AI.',
  },
  {
    icon: <Users className="w-10 h-10 text-[#c4841d]" />,
    title: 'Factions & Diplomacy',
    body: 'Create or join factions. Claim territory, forge alliances, or declare war. The faction system tracks membership, leadership, and political relationships across your server community.',
    highlight: 'Every alliance. Every betrayal. Tracked.',
  },
  {
    icon: <Package className="w-10 h-10 text-[#c4841d]" />,
    title: 'Scarcity Economy',
    body: 'A dynamic economy where resource values shift based on live world conditions. Winter drives food prices up. Storms spike medical supplies. Trade with other players, request supplies, and plan your crafting around real-time scarcity.',
    highlight: 'Adapt or starve. The market responds to the world.',
  },
  {
    icon: <Shield className="w-10 h-10 text-[#c4841d]" />,
    title: 'Game Master Suite',
    body: 'Admins get a full Game Master control panel — schedule server restarts, trigger in-game events, manage players, broadcast AI narratives directly into the game, and set world condition overrides.',
    highlight: 'Full control. Shape the world as you see fit.',
    adminOnly: true,
  },
];

export default function OnboardingFlow({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const isAdmin = user?.role === 'system_admin';
  const visibleSteps = isAdmin ? STEPS : STEPS.filter((s) => !s.adminOnly);
  const current = visibleSteps[step];
  const isLast = step === visibleSteps.length - 1;

  const handleFinish = async () => {
    setCompleting(true);
    try {
      await api.post('/auth/onboard');
      onComplete();
    } catch {
      onComplete(); // fail gracefully
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 noise-bg">
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      <div className="w-full max-w-lg" data-testid="onboarding-flow">
        {/* Step counter */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a]">
            Briefing {step + 1} / {visibleSteps.length}
          </span>
          <div className="flex gap-1">
            {visibleSteps.map((_, i) => (
              <div
                key={i}
                className="h-1 transition-all duration-300"
                style={{
                  width: i === step ? '24px' : '8px',
                  backgroundColor: i <= step ? '#c4841d' : '#2a2520',
                }}
              />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="border border-[#2a2520] bg-[#111111]/95 panel-inset" data-testid={`onboarding-step-${step}`}>
          <div className="p-8 text-center">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-20 h-20 border border-[#c4841d]/30 bg-[#c4841d]/5 mb-6">
              {current.icon}
            </div>

            {/* Title */}
            <h2 className="font-heading text-xl sm:text-2xl uppercase tracking-[0.2em] text-[#c4841d] mb-4">
              {current.title}
            </h2>

            {/* Body */}
            <p className="text-sm font-mono text-[#d4cfc4] leading-relaxed mb-4 max-w-md mx-auto">
              {current.body}
            </p>

            {/* Highlight */}
            <div className="inline-block px-4 py-2 border border-[#c4841d]/20 bg-[#c4841d]/5">
              <p className="text-xs font-mono text-[#c4841d] italic">
                {current.highlight}
              </p>
            </div>

            {current.adminOnly && (
              <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-[#88837a]">
                Admin Feature
              </p>
            )}
          </div>

          {/* Navigation */}
          <div className="border-t border-[#2a2520] p-4 flex items-center justify-between">
            <button
              data-testid="onboarding-prev"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-heading uppercase tracking-widest text-[#88837a] hover:text-[#d4cfc4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            {isLast ? (
              <button
                data-testid="onboarding-finish"
                onClick={handleFinish}
                disabled={completing}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-[0.2em] transition-all disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                {completing ? 'Entering...' : 'Enter the Signal'}
              </button>
            ) : (
              <button
                data-testid="onboarding-next"
                onClick={() => setStep((s) => Math.min(visibleSteps.length - 1, s + 1))}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 font-heading text-xs uppercase tracking-widest transition-all"
              >
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Skip */}
        {!isLast && (
          <div className="mt-4 text-center">
            <button
              data-testid="onboarding-skip"
              onClick={handleFinish}
              className="text-[10px] font-mono uppercase tracking-widest text-[#88837a]/50 hover:text-[#88837a] transition-colors"
            >
              Skip briefing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
