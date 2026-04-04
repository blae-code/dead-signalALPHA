"""
Diplomat AI Agent
=================
Gemini-powered diplomatic intelligence. Analyzes faction relationships,
generates treaty recommendations, and maintains a dynamic reputation matrix.
"""
import os
import logging
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

DIPLOMAT_SYSTEM = """You are the Chief Diplomat AI of "Dead Signal", a post-apocalyptic military command terminal. You analyse faction intelligence and produce sharp, in-world diplomatic briefings.

Rules:
- Write in a terse military-intelligence style — short paragraphs, decisive language
- Use faction names and tags when available
- Reference power dynamics: member counts, territory, resources, combat history
- Treaties and alliances should feel consequential: warn of betrayal risks, highlight leverage
- Never break character. No emojis, no markdown formatting
- Keep analysis to 3-6 sentences unless asked for more
- When recommending actions, give clear rationale grounded in the data provided"""


class DiplomatAI:
    def __init__(self):
        self.api_key = os.environ.get('EMERGENT_LLM_KEY', '')

    @property
    def configured(self):
        return bool(self.api_key)

    async def analyse_factions(self, factions: list, treaties: list, recent_events: list) -> str:
        """Generate a strategic overview of all factions and their relationships."""
        if not self.configured:
            return self._fallback_analysis(factions, treaties)
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"diplomat-analysis-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
                system_message=DIPLOMAT_SYSTEM,
            ).with_model("gemini", "gemini-2.5-flash")

            faction_summary = "\n".join(
                f"- {f.get('name','')} [{f.get('tag','')}]: {f.get('member_count',0)} members, "
                f"rep={f.get('reputation',0)}, territories={f.get('territory_count',0)}, "
                f"leader={f.get('leader','Unknown')}"
                for f in factions
            )
            treaty_summary = "\n".join(
                f"- {t.get('from_name','?')} <-> {t.get('to_name','?')}: {t.get('treaty_type','')} ({t.get('status','')})"
                for t in treaties[:20]
            )
            event_summary = "\n".join(
                f"- [{e.get('type','?')}] {e.get('summary','')}"
                for e in recent_events[:15]
            )

            prompt = (
                "Produce a strategic diplomatic assessment of the current faction landscape.\n\n"
                f"FACTIONS:\n{faction_summary or 'No factions formed yet.'}\n\n"
                f"ACTIVE TREATIES:\n{treaty_summary or 'No treaties in effect.'}\n\n"
                f"RECENT EVENTS:\n{event_summary or 'No significant events.'}\n\n"
                "Assess: power balance, alliance stability, emerging threats, and recommended diplomatic posture."
            )
            return await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            logger.error(f'Diplomat analysis error: {e}')
            return self._fallback_analysis(factions, treaties)

    async def recommend_treaty(self, faction_a: dict, faction_b: dict, context: dict) -> str:
        """AI-generated treaty recommendation between two factions."""
        if not self.configured:
            return (
                f"[SIGNAL DEGRADED] Treaty analysis unavailable. "
                f"{faction_a.get('name','?')} and {faction_b.get('name','?')} — assess manually."
            )
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"diplomat-treaty-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}",
                system_message=DIPLOMAT_SYSTEM,
            ).with_model("gemini", "gemini-2.5-flash")

            prompt = (
                "Recommend a diplomatic course of action between these two factions.\n\n"
                f"FACTION A: {faction_a.get('name','')} [{faction_a.get('tag','')}] — "
                f"{faction_a.get('member_count',0)} members, rep={faction_a.get('reputation',0)}, "
                f"territories={faction_a.get('territory_count',0)}\n"
                f"FACTION B: {faction_b.get('name','')} [{faction_b.get('tag','')}] — "
                f"{faction_b.get('member_count',0)} members, rep={faction_b.get('reputation',0)}, "
                f"territories={faction_b.get('territory_count',0)}\n\n"
                f"EXISTING RELATIONS: {context.get('existing_treaty','none')}\n"
                f"RECENT CONFLICT: {context.get('recent_conflicts','none')}\n"
                f"POWER RATIO: {context.get('power_ratio','unknown')}\n\n"
                "Recommend: alliance, trade pact, non-aggression, war declaration, or maintain status quo. "
                "Explain your reasoning in 3-5 sentences."
            )
            return await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            logger.error(f'Treaty recommendation error: {e}')
            return "[SIGNAL LOST] Diplomatic analysis channel unavailable."

    async def compute_reputation_matrix(self, factions: list, treaties: list, combat_events: list) -> list:
        """Compute a numeric reputation score between all faction pairs."""
        matrix = []
        faction_map = {f.get('faction_id'): f for f in factions}

        for i, fa in enumerate(factions):
            for fb in factions[i + 1:]:
                fa_id = fa.get('faction_id', '')
                fb_id = fb.get('faction_id', '')
                score = 0

                # Treaties affect reputation
                for t in treaties:
                    pair = {t.get('from_faction_id'), t.get('to_faction_id')}
                    if fa_id in pair and fb_id in pair:
                        if t.get('status') == 'active':
                            if t.get('treaty_type') == 'alliance':
                                score += 30
                            elif t.get('treaty_type') == 'trade':
                                score += 15
                            elif t.get('treaty_type') == 'non_aggression':
                                score += 10
                            elif t.get('treaty_type') == 'war':
                                score -= 40

                # Combat between faction members affects reputation
                fa_members = set(fa.get('member_names', []))
                fb_members = set(fb.get('member_names', []))
                for ev in combat_events:
                    players = ev.get('players', [])
                    details = ev.get('details', {})
                    killer = details.get('killer', '')
                    victim = details.get('victim', '')
                    if killer in fa_members and victim in fb_members:
                        score -= 5
                    elif killer in fb_members and victim in fa_members:
                        score -= 5

                score = max(-100, min(100, score))

                matrix.append({
                    'faction_a': fa.get('name', ''),
                    'faction_a_tag': fa.get('tag', ''),
                    'faction_a_id': fa_id,
                    'faction_b': fb.get('name', ''),
                    'faction_b_tag': fb.get('tag', ''),
                    'faction_b_id': fb_id,
                    'score': score,
                    'sentiment': (
                        'allied' if score >= 25 else
                        'friendly' if score >= 10 else
                        'neutral' if score > -10 else
                        'hostile' if score > -25 else
                        'at_war'
                    ),
                })
        return matrix

    def _fallback_analysis(self, factions, treaties):
        if not factions:
            return "[DIPLOMAT OFFLINE] No factions registered. The wasteland remains unclaimed."
        lines = ["[DIPLOMAT — MANUAL MODE] Strategic assessment:"]
        for f in factions[:5]:
            lines.append(
                f"  {f.get('name','?')} [{f.get('tag','?')}] — "
                f"{f.get('member_count',0)} operators, "
                f"{f.get('territory_count',0)} territories"
            )
        active = [t for t in treaties if t.get('status') == 'active']
        if active:
            lines.append(f"  {len(active)} active treaties in effect.")
        else:
            lines.append("  No formal treaties. All factions operate independently.")
        return "\n".join(lines)
