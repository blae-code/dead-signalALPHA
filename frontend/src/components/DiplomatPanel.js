import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Loader2, RefreshCw, Brain, Handshake } from 'lucide-react';

function SentimentBadge({ sentiment }) {
  const styles = {
    allied: 'border-[#6b7a3d] text-[#6b7a3d] bg-[#6b7a3d]/10',
    friendly: 'border-[#4a5c3a] text-[#4a5c3a] bg-[#4a5c3a]/10',
    neutral: 'border-[#88837a] text-[#88837a] bg-[#88837a]/10',
    hostile: 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10',
    at_war: 'border-[#8b3a3a] text-[#8b3a3a] bg-[#8b3a3a]/10',
  };
  return (
    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${styles[sentiment] || styles.neutral}`}>
      {sentiment?.replace('_', ' ') || 'unknown'}
    </span>
  );
}

export default function DiplomatPanel() {
  const [analysis, setAnalysis] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState({ analysis: false, matrix: false, recommend: false });
  const [factions, setFactions] = useState([]);
  const [factionA, setFactionA] = useState('');
  const [factionB, setFactionB] = useState('');

  const fetchMatrix = useCallback(async () => {
    setLoading((p) => ({ ...p, matrix: true }));
    try {
      const { data } = await api.get('/diplomat/reputation-matrix');
      setMatrix(data);
      if (data.factions) setFactions(data.factions);
    } catch { /* graceful */ }
    setLoading((p) => ({ ...p, matrix: false }));
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const fetchAnalysis = async () => {
    setLoading((p) => ({ ...p, analysis: true }));
    try {
      const { data } = await api.get('/diplomat/analysis');
      setAnalysis(data);
    } catch { /* graceful */ }
    setLoading((p) => ({ ...p, analysis: false }));
  };

  const fetchRecommendation = async () => {
    if (!factionA || !factionB || factionA === factionB) return;
    setLoading((p) => ({ ...p, recommend: true }));
    try {
      const { data } = await api.post('/diplomat/recommend', {
        faction_a_id: factionA,
        faction_b_id: factionB,
      });
      setRecommendation(data);
    } catch { /* graceful */ }
    setLoading((p) => ({ ...p, recommend: false }));
  };

  return (
    <div className="space-y-4" data-testid="diplomat-panel">
      {/* Reputation Matrix */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Reputation Matrix</h3>
          </div>
          <button onClick={fetchMatrix} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="refresh-matrix">
            <RefreshCw className={`w-3.5 h-3.5 ${loading.matrix ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="p-4">
          {!matrix?.matrix?.length ? (
            <p className="text-xs font-mono text-[#88837a] text-center py-4">
              {factions.length < 2 ? 'Need at least 2 factions for reputation tracking' : 'No reputation data yet'}
            </p>
          ) : (
            <div className="space-y-2">
              {matrix.matrix.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111]/50 panel-hover">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-[#d4cfc4]">{m.faction_a}</span>
                    <Handshake className="w-3 h-3 text-[#88837a]" />
                    <span className="text-[#d4cfc4]">{m.faction_b}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${m.score >= 0 ? 'text-[#6b7a3d]' : 'text-[#8b3a3a]'}`}>
                      {m.score > 0 ? '+' : ''}{m.score}
                    </span>
                    <SentimentBadge sentiment={m.sentiment} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Strategic Analysis */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#c4841d]" />
            <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">AI Strategic Assessment</h3>
          </div>
          <button
            onClick={fetchAnalysis}
            disabled={loading.analysis}
            data-testid="run-analysis-btn"
            className="flex items-center gap-1 text-[10px] font-mono uppercase border border-[#c4841d] text-[#c4841d] px-2 py-0.5 hover:bg-[#c4841d]/10 transition-all disabled:opacity-40"
          >
            {loading.analysis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
            {loading.analysis ? 'Analysing...' : 'Run Analysis'}
          </button>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-4">
            {analysis ? (
              <div className="text-xs font-mono text-[#d4cfc4] leading-relaxed whitespace-pre-wrap" data-testid="analysis-content">
                {analysis.analysis}
                <p className="text-[10px] text-[#88837a] mt-3 pt-2 border-t border-[#2a2520]">
                  Generated: {new Date(analysis.timestamp).toLocaleString()} | Factions: {analysis.faction_count} | Treaties: {analysis.treaty_count}
                </p>
              </div>
            ) : (
              <p className="text-xs font-mono text-[#88837a] text-center py-6">
                Click "Run Analysis" for Gemini-powered diplomatic intelligence
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Treaty Advisor */}
      <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
        <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center gap-2">
          <Handshake className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Treaty Advisor</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-mono text-[#88837a]">
            Select two factions to get an AI-generated treaty recommendation.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Faction A</label>
              <select
                value={factionA}
                onChange={(e) => setFactionA(e.target.value)}
                data-testid="diplomat-faction-a"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none"
              >
                <option value="">Select...</option>
                {factions.map((f) => (
                  <option key={f.faction_id} value={f.faction_id}>{f.name} [{f.tag}]</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-1">Faction B</label>
              <select
                value={factionB}
                onChange={(e) => setFactionB(e.target.value)}
                data-testid="diplomat-faction-b"
                className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2520] text-xs font-mono text-[#d4cfc4] focus:border-[#c4841d] focus:outline-none"
              >
                <option value="">Select...</option>
                {factions.filter((f) => f.faction_id !== factionA).map((f) => (
                  <option key={f.faction_id} value={f.faction_id}>{f.name} [{f.tag}]</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={fetchRecommendation}
            disabled={!factionA || !factionB || factionA === factionB || loading.recommend}
            data-testid="get-recommendation-btn"
            className="w-full py-2 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading.recommend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Handshake className="w-3.5 h-3.5" />}
            {loading.recommend ? 'Consulting Diplomat AI...' : 'Get Treaty Recommendation'}
          </button>

          {recommendation && (
            <div className="border border-[#2a2520] bg-[#0a0a0a] p-3 space-y-2" data-testid="recommendation-result">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#88837a]">
                <span>{recommendation.faction_a} vs {recommendation.faction_b}</span>
                <span>Power: {recommendation.context?.power_ratio}</span>
              </div>
              <p className="text-xs font-mono text-[#d4cfc4] leading-relaxed whitespace-pre-wrap">
                {recommendation.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
