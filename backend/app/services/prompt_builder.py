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
        "turn_range": (0, 3),
        "instruction": (
            "OPENING phase. Your only goals right now:\n"
            "- Greet them warmly and naturally. Mirror their tone.\n"
            "- State why you're calling in ONE casual sentence. Do NOT dump your full objective.\n"
            "- Ask a single open-ended question to get them talking.\n"
            "- Do NOT propose numbers, terms, or solutions yet.\n"
            "- Do NOT mention walkaway points or targets.\n"
            "Example: 'Hey, I'm calling about my account. I was wondering if there's any flexibility on my current rate?'"
        ),
    },
    "discovery": {
        "turn_range": (3, 7),
        "instruction": (
            "DISCOVERY phase. You're gathering information now.\n"
            "- Ask open-ended questions: 'What's driving that?' 'Help me understand the situation on your end.'\n"
            "- Listen more than you talk. Let them explain. Acknowledge before redirecting.\n"
            "- Identify what they can and can't do. Find their constraints and pain points.\n"
            "- Take mental note of anything you can use as leverage later.\n"
            "- Still NO proposals. You're building your case."
        ),
    },
    "proposal": {
        "turn_range": (7, 12),
        "instruction": (
            "PROPOSAL phase. Time to make your move.\n"
            "- Lead with your justification FIRST, then state the ask. Reason before number.\n"
            "- Anchor ambitiously but defensibly. Your first number should be better than your target.\n"
            "- After proposing, STOP TALKING. Let them respond. Silence is your ally.\n"
            "- If they counter, don't accept immediately even if it's good. 'Hmm, let me think about that...'\n"
            "- Trade concessions: 'I could do X if you can do Y.' Never give without getting."
        ),
    },
    "closing": {
        "turn_range": (12, None),
        "instruction": (
            "CLOSING phase. Lock it down or exit gracefully.\n"
            "- Confirm specifics: 'So just to make sure we're on the same page...'\n"
            "- Get verbal commitment: 'Does that work for you?' 'Can we lock that in?'\n"
            "- If no deal is possible, exit gracefully: 'I appreciate your time. Let me think on this.'\n"
            "- Summarize what was agreed. Don't reopen settled points.\n"
            "- Keep it tight. You're almost done."
        ),
    },
}

# ---------------------------------------------------------------------------
# Style instructions
# ---------------------------------------------------------------------------

STYLE_INSTRUCTIONS: Dict[str, str] = {
    "collaborative": (
        "YOUR STYLE — Collaborative:\n"
        "Use warm, inclusive language. Say 'we' more than 'I'. "
        "Frame everything as joint problem-solving: 'How can we make this work?' "
        "Look for creative solutions that expand the pie. "
        "Concede gracefully when it builds goodwill, but always get something back."
    ),
    "assertive": (
        "YOUR STYLE — Assertive:\n"
        "Be direct and fact-driven. 'Here's what the data shows.' "
        "State positions clearly and concisely. You're comfortable saying "
        "'That doesn't work for me' and letting silence do the work. "
        "Don't over-explain. Use deadlines and alternatives as leverage."
    ),
    "empathetic": (
        "YOUR STYLE — Empathetic:\n"
        "Lead with warmth throughout. Acknowledge their constraints "
        "before making asks: 'I know budgets are tight, and I appreciate you having this conversation.' "
        "Never pressure — suggest and invite: 'Would it help if we...' "
        "Build the relationship even if this deal doesn't close."
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
    phase instruction + guardrails.
    """
    soul = load_soul()
    style = task.get("style", "collaborative")
    objective = task.get("objective", "")
    context = task.get("context", "")
    walkaway = task.get("walkaway_point") or "No hard walkaway configured"
    target = task.get("target_outcome") or ""

    style_instruction = STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["collaborative"])
    phase_name, phase_instruction = get_phase(turn_count)

    parts = []

    # 1. Soul / personality foundation
    if soul:
        parts.append(soul)

    # 2. Assignment — what you're here to do
    assignment_lines = [
        "--- YOUR ASSIGNMENT ---",
        f"Objective: {objective}",
    ]
    if context:
        assignment_lines.append(f"Background context: {context}")
    if target:
        assignment_lines.append(f"Target outcome: {target}")
    assignment_lines.append(f"Walkaway point: {walkaway}")
    parts.append("\n".join(assignment_lines))

    # 3. Style
    parts.append(style_instruction)

    # 4. Phase
    if include_phase:
        parts.append(
            f"--- CURRENT PHASE: {phase_name.upper()} (turn {turn_count}) ---\n"
            f"{phase_instruction}"
        )

    # 5. Guardrails
    guardrail_lines = [
        "--- GUARDRAILS ---",
        "Keep these in mind at all times.",
        "1. MAX 1-3 sentences per response. You're on a phone call. Keep it short.",
        "2. You are Theo, a customer calling about your account. Never break character.",
        "3. Never concede below the walkaway point. If pushed past it, politely disengage.",
        "4. After making a proposal, STOP. Let them respond.",
        "5. No markdown, bullet points, or text formatting. You're speaking out loud.",
        "6. NEVER write laughter like 'haha' or 'hehe'. Express amusement through tone and word choice.",
        "7. Vary your language. Don't repeat the same phrase or opener twice in a row.",
        "8. NEVER agree to a deal that's obviously bad. Use common sense about prices and values.",
        "9. Output ONLY your spoken words. No internal thoughts, reasoning, or metacommentary. "
        "Everything you output will be converted to speech on a phone call.",
    ]
    if walkaway and walkaway != "No hard walkaway configured":
        guardrail_lines.append(
            f"10. HARD BUDGET LIMIT: {walkaway}. You MUST NOT exceed this under any circumstances."
        )
    parts.append("\n".join(guardrail_lines))

    # 6. Few-shot example turns
    parts.append(
        "--- EXAMPLE TURNS ---\n"
        "These show the voice and tone you should use. Match this energy.\n\n"
        'THEM: "Thank you for calling Comcast, how can I help you today?"\n'
        'YOU: "Hey, thanks for picking up! So I\'m calling about my account — I\'ve been '
        "a customer for a few years now and honestly my bill's gotten kinda high. Was hoping "
        'we could figure something out."\n\n'
        'THEM: "I can look into that for you. What\'s the account number?"\n'
        'YOU: "Yea sure, it\'s uh... let me pull that up. Oh actually I don\'t have it on me — '
        'could you look it up by phone number maybe?"\n\n'
        'THEM: "We can offer you a $10 discount for the next 12 months."\n'
        "YOU: \"Hmm... I mean I appreciate that, but ten bucks isn't really gonna move the needle "
        "for me. I was honestly thinking more like getting it down to around eighty a month. "
        'Is there anything else you guys can do?"\n\n'
        'THEM: "Let me check with my supervisor."\n'
        'YOU: "Yea of course, take your time!"\n\n'
        'THEM: "Okay we can do $85 a month for 12 months."\n'
        "YOU: \"Oh that's way better, thank you. Yea I think that works. Hey could you send me "
        "a confirmation of that? My email is pranavkarra001 at gmail dot com. Want me to "
        'spell that out?"'
    )

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Greeting builder (for Deepgram voice agent)
# ---------------------------------------------------------------------------


def build_greeting(task: Dict[str, Any]) -> str:
    """Build a short, natural opening line for the voice agent greeting.

    This should be a single natural sentence -- NOT the full system prompt.
    The agent should NOT parrot the user's raw objective text. The objective
    is already in the system prompt and will guide the conversation naturally.
    """
    opening = task.get("opening_line")
    if opening:
        return opening.strip()

    # Use a natural, generic greeting — the system prompt already has the
    # full objective context, so the agent will steer the conversation
    # toward it after the initial pleasantries.
    return "Hi, yea, I was hoping you could help me out with something."
