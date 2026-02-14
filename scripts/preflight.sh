#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

warn() { printf '\033[1;33mwarning\033[0m: %s\n' "$*" >&2; }
info() { printf '\033[1;34minfo\033[0m: %s\n' "$*" >&2; }
error() { printf '\033[1;31merror\033[0m: %s\n' "$*" >&2; }

STRICT_MODE="${1:-1}"
MASK_MODE="${2:-1}"

get_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "${file}" ]; then
    return 1
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "${file}" | tail -n 1 || true)"
  if [ -z "${line}" ]; then
    return 1
  fi

  local value="${line#*=}"
  value="${value%%#*}"
  value="$(printf '%s' "${value}" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "${value}"
}

resolve_setting() {
  local name="$1"
  local value=""

  value="${!name-}"
  if [ -z "${value}" ]; then
    value="$(get_env_value "backend/.env" "${name}" || true)"
  fi

  value="$(printf '%s' "${value}" | sed -E 's/[[:space:]]+$//')"
  printf '%s' "${value}"
}

mask_secret() {
  local value="$1"
  if [ -z "${value}" ]; then
    printf '<missing>'
    return 0
  fi
  if [ "${MASK_MODE}" = "0" ]; then
    printf 'set'
    return 0
  fi
  if [ "${#value}" -le 8 ]; then
    printf '***'
    return 0
  fi
  printf '%s***%s' "${value:0:4}" "${value: -4}"
}

is_truthy() {
  case "${1,,}" in
    1 | true | yes | on | y)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

missing_required=()
warn_only=()

LLM_PROVIDER="$(resolve_setting "LLM_PROVIDER")"
[ -z "${LLM_PROVIDER}" ] && LLM_PROVIDER="openai"

THINK_PROVIDER="$(resolve_setting "DEEPGRAM_VOICE_AGENT_THINK_PROVIDER")"
DEEPGRAM_ENABLED="$(resolve_setting "DEEPGRAM_VOICE_AGENT_ENABLED")"
DEEPGRAM_ENABLED="$(printf '%s' "${DEEPGRAM_ENABLED:-false}")"
[ -z "${THINK_PROVIDER}" ] && THINK_PROVIDER="${LLM_PROVIDER}"
OPENAI_KEY="$(resolve_setting "OPENAI_API_KEY")"
ANTHROPIC_KEY="$(resolve_setting "ANTHROPIC_API_KEY")"
DEEPGRAM_KEY="$(resolve_setting "DEEPGRAM_API_KEY")"
TWILIO_ACCOUNT="$(resolve_setting "TWILIO_ACCOUNT_SID")"
TWILIO_TOKEN="$(resolve_setting "TWILIO_AUTH_TOKEN")"
TWILIO_FROM="$(resolve_setting "TWILIO_PHONE_NUMBER")"
TWILIO_WEBHOOK_HOST="$(resolve_setting "TWILIO_WEBHOOK_HOST")"

if is_truthy "${DEEPGRAM_ENABLED}"; then
  if [ -z "${DEEPGRAM_KEY}" ]; then
    missing_required+=("DEEPGRAM_API_KEY")
  fi

  if [ "${THINK_PROVIDER}" = "openai" ] && [ -z "${OPENAI_KEY}" ]; then
    missing_required+=("OPENAI_API_KEY")
  elif [ "${THINK_PROVIDER}" = "anthropic" ] && [ -z "${ANTHROPIC_KEY}" ]; then
    missing_required+=("ANTHROPIC_API_KEY")
  fi

  if [ -z "${TWILIO_ACCOUNT}" ]; then
    missing_required+=("TWILIO_ACCOUNT_SID")
  fi
  if [ -z "${TWILIO_TOKEN}" ]; then
    missing_required+=("TWILIO_AUTH_TOKEN")
  fi
  if [ -z "${TWILIO_FROM}" ]; then
    missing_required+=("TWILIO_PHONE_NUMBER")
  fi
  if [ -z "${TWILIO_WEBHOOK_HOST}" ]; then
    missing_required+=("TWILIO_WEBHOOK_HOST")
  else
    if [ "${TWILIO_WEBHOOK_HOST}" = "https://your-public-url" ] || [ "${TWILIO_WEBHOOK_HOST}" = "https://your-public-ngrok-url" ]; then
      missing_required+=("TWILIO_WEBHOOK_HOST (replace placeholder URL)")
    elif [[ "${TWILIO_WEBHOOK_HOST}" != https://* ]]; then
      warn_only+=("TWILIO_WEBHOOK_HOST should be HTTPS for Twilio (current: ${TWILIO_WEBHOOK_HOST})")
    elif [[ "${TWILIO_WEBHOOK_HOST}" == *localhost* || "${TWILIO_WEBHOOK_HOST}" == *127.0.0.1* ]]; then
      missing_required+=("TWILIO_WEBHOOK_HOST (must be public and not localhost)")
    fi
  fi
else
  info "Deepgram voice pipeline is disabled, so call-specific keys were not validated."
fi

info "Preflight config check"
info "  DEEPGRAM_ENABLED=$(printf '%s' "${DEEPGRAM_ENABLED}")"
info "  DEEPGRAM_VOICE_AGENT_THINK_PROVIDER=$(printf '%s' "${THINK_PROVIDER}")"
info "  LLM_PROVIDER=$(printf '%s' "${LLM_PROVIDER}")"
info "  OPENAI_API_KEY=$(mask_secret "${OPENAI_KEY}")"
info "  ANTHROPIC_API_KEY=$(mask_secret "${ANTHROPIC_KEY}")"
info "  DEEPGRAM_API_KEY=$(mask_secret "${DEEPGRAM_KEY}")"
info "  TWILIO_ACCOUNT_SID=$(mask_secret "${TWILIO_ACCOUNT}")"
info "  TWILIO_AUTH_TOKEN=$(mask_secret "${TWILIO_TOKEN}")"
info "  TWILIO_PHONE_NUMBER=$(mask_secret "${TWILIO_FROM}")"
info "  TWILIO_WEBHOOK_HOST=${TWILIO_WEBHOOK_HOST:-<missing>}"

for warning in "${warn_only[@]}"; do
  warn "${warning}"
done

if [ "${#missing_required[@]}" -gt 0 ]; then
  error "Missing or invalid required keys:"
  for key in "${missing_required[@]}"; do
    error "  - ${key}"
  done
  error ""
  error "Update backend/.env then rerun: required example in backend/.env.example"
  error "You can continue anyway with PRECHECK_STRICT=0 (debug mode only)."
  if [ "${STRICT_MODE}" = "0" ]; then
    info "Preflight found issues but is running in non-strict mode (PRECHECK_STRICT=0)."
    exit 0
  fi
  exit 1
fi

info "Preflight passed."
exit 0
