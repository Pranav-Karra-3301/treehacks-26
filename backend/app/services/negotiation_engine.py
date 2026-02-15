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
  "summary": "6-10 sentence detailed summary of what happened on the call with concrete facts",
  "outcome": "success | partial | failed | walkaway | unknown",
  "outcome_reasoning": "2-4 sentences explaining why you chose this outcome and decision implications",
  "concessions": [
    {"party": "agent|caller", "description": "what was conceded", "significance": "low|medium|high"}
  ],
  "tactics_used": [
    {"tactic": "name of tactic", "by": "agent|caller", "effectiveness": "low|medium|high", "example": "brief quote or paraphrase"}
  ],
  "decision_data": {
    "vendor_name": "best effort business name or null",
    "quoted_prices": ["every explicit numeric quote, rate, or amount mentioned"],
    "discounts": ["discounts, promos, bundles, credits"],
    "fees": ["fees, taxes, surcharges, penalties"],
    "terms": ["minimums, commitments, refund policy, timing, constraints"],
    "risks": ["ambiguities or contradictions"],
    "important_numbers": ["phone numbers, quantities, dates, totals, percentages"]
  },
  "score": 0-100,
  "score_reasoning": "1 sentence explaining the score",
  "rapport_quality": "poor|fair|good|excellent",
  "key_moments": ["moment 1", "moment 2", "include concrete numbers where available"],
  "improvement_suggestions": ["suggestion 1", "suggestion 2", "include missing data to ask for next time"]
}

Scoring guide:
- 0-20: No progress, hostile or immediate hang-up
- 21-40: Some conversation but no movement toward objective
- 41-60: Partial progress, some concessions or information gathered
- 61-80: Good progress, meaningful concessions or agreement on key points
- 81-100: Objective achieved or exceeded

Be specific and reference actual transcript content. Do not invent details not present in the transcript.
If numbers (prices, fees, discounts, quantities, dates) are present, include all of them in decision_data.\
"""

MULTI_CALL_SUMMARY_SYSTEM_PROMPT = """\
You are a decision analyst comparing multiple phone calls for one customer objective.
Produce a single comprehensive recommendation with concrete details, especially prices and terms.

Return ONLY valid JSON in this shape:
{
  "overall_summary": "2-4 detailed paragraphs comparing all calls with concrete facts",
  "recommended_call_task_id": "task id of best option or null",
  "recommended_phone": "phone number of best option or null",
  "recommended_option": "clear recommendation sentence",
  "decision_rationale": "detailed explanation of why this is best including tradeoffs",
      "price_comparison": [
        {
          "task_id": "task id",
          "phone": "phone number",
          "vendor": "vendor/business name if known",
          "location": "vendor location or service area if known",
          "quoted_prices": ["all explicit numeric prices/rates/amounts from this call"],
          "discounts": ["discounts/promotions/bundles"],
          "fees": ["fees/taxes/surcharges/penalties"],
          "constraints": ["availability, minimums, contract terms, policies, caveats"],
          "key_takeaways": ["most important facts from this call"],
      "confidence": "high|medium|low"
    }
  ],
  "important_facts": ["cross-call facts customer should know before deciding"],
  "missing_information": ["gaps that still need confirmation"],
  "next_best_actions": ["specific next actions the customer should take now"]
}

Rules:
- Include every relevant numeric value mentioned (prices, totals, percentages, quantities, dates, fees).
- Include business identity and location context whenever available.
- Do not invent details.
- If a call failed or had no data, explicitly mark it with empty pricing and low confidence.
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

            log_event(
                "negotiation",
                "respond_start",
                task_id=task.get("id"),
                details={
                    "turn": turn_count,
                    "objective": task.get("objective", "N/A"),
                    "utterance": user_utterance[:200],
                    "system_prompt_chars": len(system_prompt),
                    "conversation_messages": len(conversation),
                },
            )

            generated = []
            async for token in self._llm.stream_completion(messages, max_tokens=settings.LLM_MAX_TOKENS_VOICE):
                generated.append(token)

            response = "".join(generated).strip()

            log_event(
                "negotiation",
                "respond_complete",
                task_id=task.get("id"),
                details={"response_chars": len(response)},
            )

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

        log_event(
            "negotiation",
            "llm_analysis_start",
            details={
                "transcript_turns": len(transcript),
                "transcript_chars": len(transcript_text),
            },
        )

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

    async def summarize_multi_calls(
        self,
        calls: List[Dict[str, Any]],
        objective: str = "",
    ) -> Dict[str, Any]:
        if not calls:
            return {
                "overall_summary": "No call data was provided.",
                "recommended_call_task_id": None,
                "recommended_phone": None,
                "recommended_option": "No recommendation available.",
                "decision_rationale": "There are no completed calls to compare.",
                "price_comparison": [],
                "important_facts": [],
                "missing_information": ["No calls were available for analysis."],
                "next_best_actions": ["Run at least one call before requesting a comparison."],
                "generated_at": datetime.utcnow().isoformat(),
            }

        normalized_calls: List[Dict[str, Any]] = []
        for call in calls:
            analysis = call.get("analysis") or {}
            normalized_calls.append(
                {
                    "task_id": call.get("task_id"),
                    "target_phone": call.get("target_phone"),
                    "target_name": call.get("target_name"),
                    "target_url": call.get("target_url"),
                    "target_source": call.get("target_source"),
                    "target_snippet": call.get("target_snippet"),
                    "location": call.get("location"),
                    "status": call.get("status"),
                    "outcome": call.get("outcome", analysis.get("outcome", "unknown")),
                    "duration_seconds": call.get("duration_seconds", 0),
                    "summary": analysis.get("summary", ""),
                    "score": analysis.get("score", 0),
                    "key_moments": analysis.get("key_moments", []),
                    "decision_data": analysis.get("decision_data", {}),
                    "transcript_excerpt": call.get("transcript_excerpt", []),
                }
            )

        payload = {
            "objective": objective,
            "calls": normalized_calls,
        }
        user_content = json.dumps(payload, ensure_ascii=True)
        messages = [
            {"role": "system", "content": MULTI_CALL_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        try:
            generated: List[str] = []
            async for token in self._llm.stream_completion(
                messages,
                max_tokens=max(settings.LLM_MAX_TOKENS_ANALYSIS, 1400),
            ):
                generated.append(token)
            raw = "".join(generated).strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                raw = "\n".join(lines).strip()
            parsed = json.loads(raw)
        except Exception as exc:
            log_event(
                "negotiation",
                "multi_call_summary_fallback",
                status="warning",
                details={"error": f"{type(exc).__name__}: {exc}", "call_count": len(calls)},
            )
            parsed = {}

        best = max(normalized_calls, key=lambda c: int(c.get("score") or 0)) if normalized_calls else None
        result = {
            "overall_summary": parsed.get("overall_summary")
            or "Completed calls were compared, but detailed synthesis was unavailable.",
            "recommended_call_task_id": parsed.get("recommended_call_task_id")
            or (best.get("task_id") if best else None),
            "recommended_phone": parsed.get("recommended_phone")
            or (best.get("target_phone") if best else None),
            "recommended_option": parsed.get("recommended_option")
            or "Choose the option with the strongest confirmed terms and best net value.",
            "decision_rationale": parsed.get("decision_rationale")
            or "Recommendation is based on available scores and extracted call details.",
            "price_comparison": parsed.get("price_comparison") or [],
            "important_facts": parsed.get("important_facts") or [],
            "missing_information": parsed.get("missing_information") or [],
            "next_best_actions": parsed.get("next_best_actions") or [],
            "generated_at": datetime.utcnow().isoformat(),
        }
        return result

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
