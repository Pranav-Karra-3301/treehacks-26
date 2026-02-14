from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict

import pytest
from fastapi.testclient import TestClient


# Ensure `backend` package import works regardless of current working directory.
ROOT = Path(__file__).resolve().parents[1]
BACKEND_PATH = ROOT
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from app.core.config import settings
from app.main import create_app
from tests.fakes.fake_clients import FakeLLMClient, FakeTwilioClient


@pytest.fixture()
def fake_llm() -> FakeLLMClient:
    return FakeLLMClient()


@pytest.fixture()
def fake_twilio() -> FakeTwilioClient:
    return FakeTwilioClient()


@pytest.fixture()
def app(fake_llm: FakeLLMClient, fake_twilio: FakeTwilioClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data_root = tmp_path / "data"
    sqlite_path = data_root / "calls.db"
    monkeypatch.setattr(settings, "DATA_ROOT", data_root)
    monkeypatch.setattr(settings, "SQLITE_PATH", sqlite_path)
    monkeypatch.setattr(settings, "DEEPGRAM_VOICE_AGENT_ENABLED", False)
    return create_app(
        data_root=data_root,
        sqlite_path=sqlite_path,
        llm_overrides={"llm_client": fake_llm, "twilio_client": fake_twilio},
    )


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


def build_payload(overrides: Dict[str, str] | None = None) -> Dict[str, str]:
    payload = {
        "task_type": "custom",
        "target_phone": "+15550001111",
        "objective": "Negotiate a better rate",
        "context": "Testing context",
        "target_outcome": "Improve terms",
        "walkaway_point": "No change",
        "agent_persona": "Collaborative agent",
        "opening_line": "Hi there, I'm calling about my plan.",
        "style": "collaborative",
    }
    if overrides:
        payload.update(overrides)
    return payload
