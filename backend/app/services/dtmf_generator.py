"""Generate mulaw-encoded DTMF audio tones for sending through Twilio media streams.

DTMF (Dual-Tone Multi-Frequency) tones are pairs of sinusoidal frequencies
used by telephone systems to represent keypad digits.  Each key maps to one
"row" frequency and one "column" frequency per ITU-T Q.23.

This module produces raw 8 kHz mulaw audio bytes suitable for injecting
directly into a Twilio bidirectional media stream as ``media`` messages.
"""

from __future__ import annotations

import math

# ── ITU-T frequency map ──────────────────────────────────────────────────────

_ROW_FREQS = [697, 770, 852, 941]
_COL_FREQS = [1209, 1336, 1477, 1633]

_DTMF_FREQS: dict[str, tuple[int, int]] = {
    "1": (697, 1209), "2": (697, 1336), "3": (697, 1477), "A": (697, 1633),
    "4": (770, 1209), "5": (770, 1336), "6": (770, 1477), "B": (770, 1633),
    "7": (852, 1209), "8": (852, 1336), "9": (852, 1477), "C": (852, 1633),
    "*": (941, 1209), "0": (941, 1336), "#": (941, 1477), "D": (941, 1633),
}

# ── Mulaw encoding (ITU G.711) ───────────────────────────────────────────────

_MULAW_BIAS = 132
_MULAW_CLIP = 32635
_MULAW_SILENCE = 0xFF  # mulaw byte for ~0 PCM


def _encode_mulaw_sample(sample: int) -> int:
    sign = 0
    if sample < 0:
        sign = 0x80
        sample = -sample
    sample = min(sample, _MULAW_CLIP)
    sample += _MULAW_BIAS
    exponent = 7
    exp_mask = 0x4000
    while exponent > 0 and not (sample & exp_mask):
        exponent -= 1
        exp_mask >>= 1
    mantissa = (sample >> (exponent + 3)) & 0x0F
    return ~(sign | (exponent << 4) | mantissa) & 0xFF


# ── Tone generation ──────────────────────────────────────────────────────────


def _generate_tone(freq1: int, freq2: int, duration_ms: int, sample_rate: int = 8000) -> bytes:
    """Generate a dual-tone sine wave encoded as mulaw bytes."""
    num_samples = int(sample_rate * duration_ms / 1000)
    two_pi = 2.0 * math.pi
    buf = bytearray(num_samples)
    for i in range(num_samples):
        t = i / sample_rate
        # Each tone at half amplitude so combined stays within 16-bit range
        pcm = int(16000 * (math.sin(two_pi * freq1 * t) + math.sin(two_pi * freq2 * t)))
        pcm = max(-32768, min(32767, pcm))
        buf[i] = _encode_mulaw_sample(pcm)
    return bytes(buf)


def _generate_silence(duration_ms: int, sample_rate: int = 8000) -> bytes:
    """Generate mulaw silence bytes."""
    num_samples = int(sample_rate * duration_ms / 1000)
    return bytes([_MULAW_SILENCE] * num_samples)


def generate_dtmf_audio(digits: str, sample_rate: int = 8000) -> bytes:
    """Generate mulaw-encoded DTMF audio for the given digit string.

    Parameters
    ----------
    digits:
        String of DTMF characters: 0-9, A-D, *, #, w/W (500ms pause),
        comma (250ms pause).
    sample_rate:
        Audio sample rate in Hz (default 8000 for telephony).

    Returns
    -------
    bytes
        Raw mulaw audio bytes ready to be chunked and sent through
        a Twilio media stream.
    """
    if not digits:
        return b""

    parts: list[bytes] = []

    for ch in digits.upper():
        if ch in _DTMF_FREQS:
            freq1, freq2 = _DTMF_FREQS[ch]
            # 100ms tone followed by 50ms inter-digit silence
            parts.append(_generate_tone(freq1, freq2, 100, sample_rate))
            parts.append(_generate_silence(50, sample_rate))
        elif ch == "W":
            # W = 500ms pause
            parts.append(_generate_silence(500, sample_rate))
        elif ch == ",":
            # comma = 250ms pause
            parts.append(_generate_silence(250, sample_rate))
        # Skip unrecognized characters silently

    return b"".join(parts)
