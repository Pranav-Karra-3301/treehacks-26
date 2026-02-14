from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Tuple

from app.models.schemas import TranscriptTurn
from app.services.llm_client import LLMClient


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
        """Post-call analysis placeholder. Keep in-session summary lightweight."""
        return {
            "turn_count": len(transcript),
            "generated_at": datetime.utcnow().isoformat(),
            "summary": "Post-call analysis not yet fully implemented in MVP.",
            "outcome": "unknown",
        }
