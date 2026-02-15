from __future__ import annotations

from app.services.prompt_builder import build_negotiation_prompt


def test_prompt_includes_human_tone_and_reasoning_guards() -> None:
    task = {
        "objective": "lower my monthly bill",
        "style": "collaborative",
        "walkaway_point": "No hard walkaway configured",
    }

    prompt = build_negotiation_prompt(task, turn_count=0, include_phase=False)

    assert "Do not repeat information in a new sentence unless it moves the conversation forward." in prompt
    assert "Do not answer like a QA bot." in prompt
    assert "No internal thoughts, reasoning, chain-of-thought, or metacommentary." in prompt
    assert "Everything you output will be converted to speech on a phone call." in prompt
