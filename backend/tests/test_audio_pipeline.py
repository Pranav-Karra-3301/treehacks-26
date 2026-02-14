from __future__ import annotations

from app.services.audio_pipeline import SentenceBuffer


def test_sentence_buffer_collects_until_boundary() -> None:
    buffer = SentenceBuffer()

    assert buffer.add_text("Hello") == ""
    assert buffer.add_text(", this is") == ""
    assert buffer.add_text(" a sentence.") == "Hello, this is a sentence."

    assert buffer.flush() == ""


def test_sentence_buffer_handles_multiple_boundaries() -> None:
    buffer = SentenceBuffer()
    assert buffer.add_text("First one. Second") == "First one."
    assert buffer.flush() == "Second"
