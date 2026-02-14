from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Tuple

from app.models.schemas import CallOutcome, TranscriptTurn
from app.services.llm_client import LLMClient
from app.core.telemetry import timed_step


SYSTEM_PROMPT = """
You are a negotiation AI on a live phone call.
- Speak naturally with short 1-3 sentence turns.
- Use contractions where it sounds natural.
- Never reveal you're an AI unless directly asked.
- Do not concede below the walkaway point.
- Be concise and practical.
""".strip()


class NegotiationEngine:
    def __init__(self, llm_client: LLMClient) -> None:
        self._llm = llm_client

    def build_system_prompt(self, task: Dict[str, Any], turn_count: int) -> str:
        style = task.get("style", "collaborative")
        objective = task.get("objective", "")
        context = task.get("context", "")
        walkaway = task.get("walkaway_point") or "No hard walkaway configured"
        persona = task.get("agent_persona") or "Polite but firm negotiation agent"
        opening = task.get("opening_line") or "Hi, thanks for taking my call."

        phase = "opening" if turn_count < 2 else "midgame" if turn_count < 8 else "endgame"

        return (
            f"{SYSTEM_PROMPT}\n\n"
            f"Task style: {style}.\n"
            f"Persona: {persona}.\n"
            f"Primary objective: {objective}.\n"
            f"Context: {context}.\n"
            f"Walkaway point: {walkaway}.\n"
            f"Opening line: {opening}.\n"
            f"Current phase: {phase}.\n"
            f"Use the conversation history below as context."
        )

    async def respond(
        self,
        session: Dict[str, Any],
        task: Dict[str, Any],
        user_utterance: str,
    ) -> Tuple[str, str]:
        with timed_step(
            "negotiation",
            "respond",
            task_id=task.get("id"),
            details={"utterance_chars": len(user_utterance)},
        ):
            conversation = session.get("conversation", [])
            turn_count = len([m for m in conversation if m.get("role") == "assistant"])
            system_prompt = self.build_system_prompt(task, turn_count)

            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(conversation)
            messages.append({"role": "user", "content": user_utterance})

            generated = []
            async for token in self._llm.stream_completion(messages):
                generated.append(token)

            response = "".join(generated).strip()
            return response, system_prompt

    async def summarize_turn(self, transcript: List[TranscriptTurn]) -> Dict[str, Any]:
        """Compute lightweight post-call summary from the transcript."""
        with timed_step("negotiation", "summarize_turn", details={"transcript_lines": len(transcript)}):
            speaker_turns = [turn for turn in transcript]
            caller_turns = [turn for turn in speaker_turns if turn.speaker == "caller"]
            agent_turns = [turn for turn in speaker_turns if turn.speaker == "agent"]
            transcript_text = " ".join((turn.content or "").strip() for turn in speaker_turns).lower()
            total_chars = sum(len((turn.content or "")) for turn in speaker_turns)

            concessions: List[Dict[str, Any]] = []
            tactics: List[str] = []
            score = 0
            outcome: CallOutcome = "unknown"

            if "good faith" in transcript_text or "compromise" in transcript_text:
                concessions.append({"type": "intent", "detail": "Negotiation language used"})
                tactics.append("empathize_then_reframe")
                score += 2
            if "can't" in transcript_text or "cannot" in transcript_text:
                tactics.append("firm_constraints")
            if "offer" in transcript_text:
                concessions.append({"type": "offer", "detail": "Offer-related terms discussed"})
                score += 1
            if "thank you" in transcript_text or "thanks" in transcript_text:
                tactics.append("rapport_building")

            if len(agent_turns) > len(caller_turns):
                outcome = "partial"
            if score >= 3 and len(caller_turns) <= len(agent_turns):
                outcome = "success"

            summary = (
                f"Transcript contained {len(speaker_turns)} turns, "
                f"{len(caller_turns)} from caller and {len(agent_turns)} from agent."
            )

            return {
                "turn_count": len(speaker_turns),
                "generated_at": datetime.utcnow().isoformat(),
                "summary": summary,
                "outcome": outcome,
                "concessions": concessions,
                "tactics": tactics,
                "score": max(0, min(score, 100)),
                "details": {
                    "total_chars": total_chars,
                    "contains_offer": "offer" in transcript_text,
                    "contains_constraints": ("can't" in transcript_text) or ("cannot" in transcript_text),
                    "length_seconds_estimate": round(total_chars / 4.0, 2),
                },
            }
