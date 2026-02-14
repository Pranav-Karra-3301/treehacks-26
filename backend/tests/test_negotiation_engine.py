from __future__ import annotations

import asyncio

from app.services.negotiation_engine import NegotiationEngine


class FakeLLM:
    def __init__(self):
        self.calls = []

    async def stream_completion(self, messages, max_tokens=128):  # type: ignore[override]
        self.calls.append((messages, max_tokens))
        for token in ["Thank", " you", " for", " calling."]:
            yield token


def test_negotiation_engine_response_uses_system_prompt_and_messages() -> None:
    fake_llm = FakeLLM()
    engine = NegotiationEngine(fake_llm)

    task = {
        "style": "collaborative",
        "objective": "lower my bill",
        "context": "Loyal customer",
        "walkaway_point": "Under $80",
        "agent_persona": "Friendly analyst",
        "opening_line": "Hi, let's review your account",
    }
    session = {
        "conversation": [
            {"role": "system", "content": "already there"},
            {"role": "user", "content": "I need a better deal"},
        ]
    }

    response, system_prompt = asyncio.run(engine.respond(session, task, "Can you reduce my rate?"))

    assert response == "Thank you for calling."
    assert "Collaborative" in system_prompt
    assert "lower my bill" in system_prompt
    assert fake_llm.calls
    assert fake_llm.calls[0][0][0]["role"] == "system"
    assert fake_llm.calls[0][0][-1]["content"] == "Can you reduce my rate?"
