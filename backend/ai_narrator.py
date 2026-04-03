import os
import logging
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

NARRATOR_SYSTEM = """You are the AI Narrator of "Dead Signal" -- a post-apocalyptic military command terminal monitoring a zombie survival server. Your voice is gritty, atmospheric, and dramatic, like a war correspondent broadcasting from the end of the world.

Rules:
- Keep narrations SHORT (1-3 sentences max)
- Use present tense for immediacy
- Reference the wasteland, the dead, the signal, survival
- Never break character
- No emojis, no markdown formatting
- Vary your tone: sometimes clinical, sometimes poetic, sometimes sardonic"""

RADIO_SYSTEM = """You are the Radio Operator of "Dead Signal" -- intercepting and relaying intelligence from the wasteland. You compile field reports from scattered data into atmospheric radio-style broadcasts.

Rules:
- Write as fragmented radio transmissions
- Use military/radio communication style (callsigns, static references)
- Include speculation and rumor alongside facts
- Keep reports 3-5 sentences
- Reference frequencies, static, signal strength
- No emojis, no markdown"""


class AINarrator:
    def __init__(self):
        self.api_key = os.environ.get('EMERGENT_LLM_KEY', '')

    @property
    def configured(self):
        return bool(self.api_key)

    async def narrate_event(self, event: dict) -> str:
        if not self.configured:
            return f"[SIGNAL LOST] {event.get('raw', 'Unknown event')}"
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"narrator-{event.get('timestamp', 'x')}",
                system_message=NARRATOR_SYSTEM,
            ).with_model("gemini", "gemini-2.5-flash")

            prompt = (
                f"Narrate this survival server event in 1-2 dramatic sentences:\n"
                f"Event type: {event.get('type', 'unknown')}\n"
                f"Severity: {event.get('severity', 'low')}\n"
                f"Players: {', '.join(event.get('players', []))}\n"
                f"Raw: {event.get('raw', '')}\n"
                f"Details: {event.get('details', {})}"
            )
            response = await chat.send_message(UserMessage(text=prompt))
            return response
        except Exception as e:
            logger.error(f'Narration error: {e}')
            return f"[SIGNAL DEGRADED] {event.get('raw', 'Unknown event')}"

    async def radio_report(self, events: list) -> str:
        if not self.configured:
            return "[RADIO SILENCE] No signal detected. Transmitter offline."
        if not events:
            return "[RADIO SILENCE] No recent activity on monitored frequencies."
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id="radio-report",
                system_message=RADIO_SYSTEM,
            ).with_model("gemini", "gemini-2.5-flash")

            summary = "\n".join(
                f"- [{e.get('type', '?').upper()}] {e.get('raw', '')}"
                for e in events[-20:]
            )
            prompt = (
                f"Generate a radio intelligence report based on these recent server events:\n"
                f"{summary}\n\n"
                f"Write a 3-5 sentence atmospheric radio broadcast summarizing the current situation."
            )
            response = await chat.send_message(UserMessage(text=prompt))
            return response
        except Exception as e:
            logger.error(f'Radio report error: {e}')
            return "[STATIC] ...transmission failed... retrying on backup frequency..."

    async def ambient_dispatch(self, time_of_day: str, context: dict) -> str:
        if not self.configured:
            return f"[{time_of_day.upper()} DISPATCH] Signal too weak for transmission."
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"ambient-{time_of_day}",
                system_message=NARRATOR_SYSTEM,
            ).with_model("gemini", "gemini-2.5-flash")

            prompt = (
                f"Generate a {time_of_day} situational dispatch for a zombie survival server.\n"
                f"Context: {context}\n"
                f"Write 2-3 atmospheric sentences appropriate for {time_of_day}."
            )
            response = await chat.send_message(UserMessage(text=prompt))
            return response
        except Exception as e:
            logger.error(f'Ambient dispatch error: {e}')
            return f"[{time_of_day.upper()}] The signal persists. Stay alive."
