from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.schemas import CallOutcome, TranscriptTurn
from app.services.llm_client import LLMClient
from app.services.prompt_builder import build_negotiation_prompt
from app.core.config import settings
from app.core.telemetry import log_event, timed_step


ANALYSIS_SYSTEM_PROMPT = """\
You are an expert negotiation analyst. Given a phone call transcript and optional task context, produce a structured JSON analysis.

Return ONLY valid JSON with these fields:
{
  "summary": "2-3 sentence summary of what happened on the call",
  "outcome": "success | partial | failed | walkaway | unknown",
  "outcome_reasoning": "1-2 sentences explaining why you chose this outcome",
  "concessions": [
    {"party": "agent|caller", "description": "what was conceded", "significance": "low|medium|high"}
  ],
  "tactics_used": [
    {"tactic": "name of tactic", "by": "agent|caller", "effectiveness": "low|medium|high", "example": "brief quote or paraphrase"}
  ],
  "score": 0-100,
  "score_reasoning": "1 sentence explaining the score",
  "rapport_quality": "poor|fair|good|excellent",
  "key_moments": ["moment 1", "moment 2"],
  "improvement_suggestions": ["suggestion 1", "suggestion 2"]
}

Scoring guide:
- 0-20: No progress, hostile or immediate hang-up
- 21-40: Some conversation but no movement toward objective
- 41-60: Partial progress, some concessions or information gathered
- 61-80: Good progress, meaningful concessions or agreement on key points
- 81-100: Objective achieved or exceeded

Be specific and reference actual transcript content. Do not invent details not present in the transcript.\
"""


class NegotiationEngine:
    def __init__(self, llm_client: LLMClient) -> None:
        self._llm = llm_client

    def build_system_prompt(self, task: Dict[str, Any], turn_count: int) -> str:
        return build_negotiation_prompt(task, turn_count=turn_count, include_phase=True)

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

            # Trim conversation to last N turns for low-latency voice responses
            max_turns = settings.LLM_VOICE_CONTEXT_TURNS
            if max_turns and len(conversation) > max_turns * 2:
                conversation = conversation[-(max_turns * 2):]

            turn_count = len([m for m in conversation if m.get("role") == "assistant"])
            system_prompt = self.build_system_prompt(task, turn_count)

            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(conversation)
            messages.append({"role": "user", "content": user_utterance})

            # === CALL DEBUG LOGGING ===
            print(f"\n{'='*60}")
            print(f"[NEGOTIATE] Task: {task.get('id')} | Turn: {turn_count}")
            print(f"[NEGOTIATE] Objective: {task.get('objective', 'N/A')}")
            print(f"[NEGOTIATE] Caller said: {user_utterance}")
            print(f"[NEGOTIATE] System prompt ({len(system_prompt)} chars):")
            print(f"  {system_prompt[:500]}{'...' if len(system_prompt) > 500 else ''}")
            print(f"[NEGOTIATE] Conversation history: {len(conversation)} messages")
            for msg in conversation[-4:]:
                print(f"  [{msg.get('role')}]: {str(msg.get('content', ''))[:120]}")
            print(f"{'='*60}")

            generated = []
            async for token in self._llm.stream_completion(messages, max_tokens=settings.LLM_MAX_TOKENS_VOICE):
                generated.append(token)

            response = "".join(generated).strip()

            print(f"[NEGOTIATE] Agent response: {response}")
            print(f"{'='*60}\n")

            return response, system_prompt

    async def summarize_turn(
        self,
        transcript: List[TranscriptTurn],
        task: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """LLM-powered post-call analysis with keyword fallback."""
        with timed_step("negotiation", "summarize_turn", details={"transcript_lines": len(transcript)}):
            # If transcript is empty or too short, the call never connected
            real_turns = [t for t in transcript if (t.content or "").strip()]
            if len(real_turns) < 2:
                return {
                    "turn_count": len(transcript),
                    "generated_at": datetime.utcnow().isoformat(),
                    "summary": "The call failed to connect or ended before any meaningful conversation took place.",
                    "outcome": "failed",
                    "outcome_reasoning": "No substantive dialogue occurred — the call either did not connect or was dropped immediately.",
                    "concessions": [],
                    "tactics_used": [],
                    "tactics": [],
                    "score": 0,
                    "score_reasoning": "No negotiation took place.",
                    "rapport_quality": "poor",
                    "key_moments": [],
                    "improvement_suggestions": ["Verify the phone number and try again."],
                    "details": {"failed_to_connect": True},
                }

            # Try LLM-powered analysis first
            try:
                return await self._llm_analysis(transcript, task)
            except Exception as exc:
                log_event(
                    "negotiation",
                    "llm_analysis_fallback",
                    status="warning",
                    details={
                        "error": f"{type(exc).__name__}: {exc}",
                        "transcript_lines": len(transcript),
                    },
                )
                return self._keyword_fallback_analysis(transcript)

    async def _llm_analysis(
        self,
        transcript: List[TranscriptTurn],
        task: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Use the LLM to produce structured analysis."""
        transcript_lines = []
        for turn in transcript:
            label = "AGENT" if turn.speaker == "agent" else "CALLER"
            transcript_lines.append(f"{label}: {(turn.content or '').strip()}")
        transcript_text = "\n".join(transcript_lines)

        user_content = f"TRANSCRIPT:\n{transcript_text}"
        if task:
            objective = task.get("objective", "")
            walkaway = task.get("walkaway_point", "")
            style = task.get("style", "")
            if objective:
                user_content += f"\n\nTASK OBJECTIVE: {objective}"
            if walkaway:
                user_content += f"\nWALKAWAY POINT: {walkaway}"
            if style:
                user_content += f"\nNEGOTIATION STYLE: {style}"

        # === ANALYSIS DEBUG LOGGING ===
        print(f"\n{'='*60}")
        print(f"[ANALYSIS] Analyzing transcript ({len(transcript)} turns)")
        print(f"[ANALYSIS] Transcript:\n{transcript_text[:800]}")
        print(f"{'='*60}")

        messages = [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        generated = []
        async for token in self._llm.stream_completion(
            messages, max_tokens=settings.LLM_MAX_TOKENS_ANALYSIS
        ):
            generated.append(token)

        raw = "".join(generated).strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            # Remove first line (```json or ```) and last line (```)
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines).strip()

        analysis = json.loads(raw)

        # Normalize outcome
        valid_outcomes = {"unknown", "success", "partial", "failed", "walkaway"}
        outcome = analysis.get("outcome", "unknown")
        if outcome not in valid_outcomes:
            outcome = "unknown"

        # Normalize score
        score = analysis.get("score", 0)
        score = max(0, min(int(score), 100))

        return {
            "turn_count": len(transcript),
            "generated_at": datetime.utcnow().isoformat(),
            "summary": analysis.get("summary", ""),
            "outcome": outcome,
            "outcome_reasoning": analysis.get("outcome_reasoning", ""),
            "concessions": analysis.get("concessions", []),
            "tactics_used": [
                {
                    "name": t.get("tactic") or t.get("name", ""),
                    "description": t.get("example") or t.get("description", ""),
                    "effectiveness": t.get("effectiveness", ""),
                }
                for t in analysis.get("tactics_used", [])
                if (t.get("tactic") or t.get("name", "")).strip()
            ],
            "tactics": [t.get("tactic") or t.get("name", "") for t in analysis.get("tactics_used", [])],
            "score": score,
            "score_reasoning": analysis.get("score_reasoning", ""),
            "rapport_quality": analysis.get("rapport_quality", ""),
            "key_moments": analysis.get("key_moments", []),
            "improvement_suggestions": analysis.get("improvement_suggestions", []),
            "details": analysis,
        }

    def _keyword_fallback_analysis(self, transcript: List[TranscriptTurn]) -> Dict[str, Any]:
        """Legacy keyword-matching analysis used when LLM is unavailable."""
        speaker_turns = list(transcript)
        caller_turns = [t for t in speaker_turns if t.speaker == "caller"]
        agent_turns = [t for t in speaker_turns if t.speaker == "agent"]
        transcript_text = " ".join((t.content or "").strip() for t in speaker_turns).lower()
        total_chars = sum(len(t.content or "") for t in speaker_turns)

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
            "outcome_reasoning": "",
            "concessions": concessions,
            "tactics_used": [],
            "tactics": tactics,
            "score": max(0, min(score, 100)),
            "score_reasoning": "",
            "rapport_quality": "",
            "key_moments": [],
            "improvement_suggestions": [],
            "details": {
                "total_chars": total_chars,
                "contains_offer": "offer" in transcript_text,
                "contains_constraints": ("can't" in transcript_text) or ("cannot" in transcript_text),
                "length_seconds_estimate": round(total_chars / 4.0, 2),
            },
        }
