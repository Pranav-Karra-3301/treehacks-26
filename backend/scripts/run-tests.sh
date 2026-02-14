#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"
source .venv/bin/activate

echo "==> Backend test suite (all)"
pytest -q

echo "==> Unit tests"
pytest -q tests/test_audio_pipeline.py tests/test_negotiation_engine.py tests/test_routes.py tests/test_tasks_analysis.py

echo "==> Integration tests"
pytest -q -m integration tests/test_integration_tasks.py

echo "==> Websocket tests"
pytest -q -m ws tests/test_ws_routes.py

echo "==> Benchmark checks"
pytest -q -m benchmark tests/test_benchmark.py
