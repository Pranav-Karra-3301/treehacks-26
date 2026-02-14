"""Unified prompt builder for NegotiateAI.

Single source of truth for all system prompts -- used by both the text
negotiation engine and the Deepgram voice-agent path.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any, Dict, Tuple

_SOUL_PATH = Path(__file__).resolve().parents[2] / "SOUL.md"

# ---------------------------------------------------------------------------
# Phase configuration
# ---------------------------------------------------------------------------

PHASE_CONFIGS: Dict[str, Dict[str, Any]] = {
    "opening": {
        "turn_range": (0, 2),
        "instruction": (
            "You are in the OPENING phase. Focus on rapport and tone-setting. "
            "Mirror their greeting style. State your purpose casually. "
            "Do NOT make proposals yet -- gather information first."
        ),
    },
    "discovery": {
        "turn_range": (2, 5),
        "instruction": (
            "You are in the DISCOVERY phase. Ask open-ended questions. "
            "Listen more than you talk -- aim for 40/60 ratio. "
            "Identify their constraints, priorities, and pain points. "
            "Acknowledge what they say before redirecting."
        ),
    },
    "proposal": {
        "turn_range": (5, 10),
        "instruction": (
            "You are in the PROPOSAL phase. Lead with justification, then state your ask. "
            "Anchor ambitiously but defensibly. After proposing, STOP TALKING. "
            "If they counter, pause before responding. Trade concessions -- never give them away."
        ),
    },
    "closing": {
        "turn_range": (10, None),
        "instruction": (
            "You are in the CLOSING phase. Confirm specifics and get verbal commitment. "
            "Summarize what was agreed. If no deal is possible, exit graciously. "
            "Keep it tight -- don't reopen settled points."
        ),
    },
}

# ---------------------------------------------------------------------------
# Style instructions
# ---------------------------------------------------------------------------

STYLE_INSTRUCTIONS: Dict[str, str] = {
    "collaborative": (
        "STYLE -- Collaborative: Use warm, inclusive language. Say 'we' more than 'I'. "
        "Frame everything as joint problem-solving. Look for creative solutions that "
        "expand the pie. Concede gracefully when it builds goodwill, but always get "
        "something back."
    ),
    "assertive": (
        "STYLE -- Assertive: Be direct and fact-driven. State positions clearly and "
        "concisely. Use strategic silence after key points. You're comfortable saying "
        "'That doesn't work for me.' Don't over-explain. Use deadlines and alternatives "
        "as leverage when appropriate."
    ),
    "empathetic": (
        "STYLE -- Empathetic: Lead with warmth throughout. Acknowledge their constraints "
        "before making asks. Use personal storytelling when relevant. Never pressure -- "
        "suggest and invite. Build the relationship even if this deal doesn't close."
    ),
}

# ---------------------------------------------------------------------------
# SOUL.md loader (cached)
# ---------------------------------------------------------------------------


@functools.lru_cache(maxsize=1)
def load_soul() -> str:
    """Read and cache SOUL.md content."""
    if _SOUL_PATH.exists():
        return _SOUL_PATH.read_text(encoding="utf-8").strip()
    return ""


# ---------------------------------------------------------------------------
# Phase resolver
# ---------------------------------------------------------------------------


def get_phase(turn_count: int) -> Tuple[str, str]:
    """Return (phase_name, phase_instruction) for the given turn count."""
    for name, cfg in PHASE_CONFIGS.items():
        low, high = cfg["turn_range"]
        if high is None:
            if turn_count >= low:
                return name, cfg["instruction"]
        elif low <= turn_count < high:
            return name, cfg["instruction"]
    # Fallback to closing if somehow out of range
    return "closing", PHASE_CONFIGS["closing"]["instruction"]


# ---------------------------------------------------------------------------
# Main prompt builder
# ---------------------------------------------------------------------------


def build_negotiation_prompt(
    task: Dict[str, Any],
    turn_count: int = 0,
    include_phase: bool = True,
) -> str:
    """Assemble the full system prompt for a negotiation turn.

    Combines: SOUL.md + assignment details + style instruction +
    phase instruction + critical rules.
    """
    soul = load_soul()
    style = task.get("style", "collaborative")
    objective = task.get("objective", "")
    context = task.get("context", "")
    walkaway = task.get("walkaway_point") or "No hard walkaway configured"
    persona = task.get("agent_persona") or "Confident, warm negotiation agent"
    opening = task.get("opening_line") or "Hi, thanks for taking my call."

    style_instruction = STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["collaborative"])
    phase_name, phase_instruction = get_phase(turn_count)

    parts = []

    # 1. Soul / personality foundation
    if soul:
        parts.append(soul)

    # 2. Assignment
    parts.append(
        "--- YOUR ASSIGNMENT ---\n"
        f"Persona: {persona}\n"
        f"Primary objective: {objective}\n"
        f"Context: {context}\n"
        f"Task style: {style}\n"
        f"Walkaway point: {walkaway}\n"
        f"Opening line (first turn only): {opening}"
    )

    # 3. Style
    parts.append(style_instruction)

    # 4. Phase
    if include_phase:
        parts.append(
            f"--- CURRENT PHASE: {phase_name.upper()} (turn {turn_count}) ---\n"
            f"{phase_instruction}"
        )

    # 5. Critical rules
    parts.append(
        "--- CRITICAL RULES ---\n"
        "1. Keep every response to 1-3 sentences MAX. You are on a phone call.\n"
        "2. Never break character. You are a real person on a real call.\n"
        "3. Never concede below the walkaway point.\n"
        "4. After making a proposal, STOP. Let them respond.\n"
        "5. Use the conversation history below as context."
    )

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Greeting builder (for Deepgram voice agent)
# ---------------------------------------------------------------------------


def build_greeting(task: Dict[str, Any]) -> str:
    """Build a short, context-aware opening line for the voice agent greeting.

    This should be a single natural sentence -- NOT the full system prompt.
    """
    opening = task.get("opening_line")
    if opening:
        return opening.strip()

    objective = task.get("objective", "")
    if objective:
        return (
            f"Hi, thanks for taking my call. "
            f"I'm reaching out about {objective.lower().rstrip('.')}."
        )

    return "Hi, thanks for taking my call."
