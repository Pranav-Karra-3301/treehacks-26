from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SentenceBuffer:
    buffer: str = ""

    def add_text(self, text: str) -> str:
        """Collect text until sentence boundary is reached.

        Returns completed sentence if ready, otherwise empty string.
        """
        if not text:
            return ""

        self.buffer += text
        boundaries = [". ", "! ", "? ", ".\n", "!\n", "?\n"]

        for boundary in boundaries:
            if boundary in self.buffer:
                idx = self.buffer.rfind(boundary)
                sentence = self.buffer[: idx + 1].strip()
                self.buffer = self.buffer[idx + 1 :]
                return sentence
        return ""

    def flush(self) -> str:
        chunk = self.buffer.strip()
        self.buffer = ""
        return chunk
