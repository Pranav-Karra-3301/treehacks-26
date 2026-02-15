#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

AUTO_FIX_PORTS="${AUTO_FIX_PORTS:-1}"
USE_NGROK="${USE_NGROK:-${NGROK_ENABLED:-0}}"
COMPOSE_UP_ARGS=()
TWILIO_WEBHOOK_HOST_CHANGED=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ngrok)
      USE_NGROK=1
      shift
      ;;
    --no-ngrok)
      USE_NGROK=0
      shift
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        COMPOSE_UP_ARGS+=("$1")
        shift
      done
      ;;
    *)
      COMPOSE_UP_ARGS+=("$1")
      shift
      ;;
  esac
done

NGROK_ENABLED="${USE_NGROK}"
case "$(printf '%s' "${NGROK_ENABLED}" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on|y)
    NGROK_ENABLED=1
    ;;
  *)
    NGROK_ENABLED=0
    ;;
esac
NGROK_API_PORT="${NGROK_API_PORT:-4040}"

warn() { printf '\033[1;33mwarning\033[0m: %s\n' "$*" >&2; }
info() { printf '\033[1;34minfo\033[0m: %s\n' "$*" >&2; }
error() { printf '\033[1;31merror\033[0m: %s\n' "$*" >&2; }

_sed_in_place() {
  local expr="$1"
  local file="$2"
  if [ "$(uname -s)" = "Darwin" ]; then
    sed -i '' "${expr}" "${file}"
  else
    sed -i "${expr}" "${file}"
  fi
}

normalize_webhook_host() {
  local raw="$1"
  local normalized
  normalized="$(printf '%s' "${raw}" | tr -d '\r' | sed -E 's/[[:space:]]+$//')"
  normalized="${normalized%/}"
  printf '%s' "${normalized}"
}

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

get_port_listeners() {
  local port="$1"
  local listeners

  if command -v ss >/dev/null 2>&1; then
    listeners="$(ss -ltn "sport = :${port}" 2>/dev/null | sed -n '2,$p')"
    if [ -n "${listeners}" ]; then
      echo "${listeners}"
      return 0
    fi
    return 1
  fi

  if command -v lsof >/dev/null 2>&1; then
    listeners="$(lsof -iTCP:"${port}" -sTCP:LISTEN -P -n 2>/dev/null)"
    if [ -n "${listeners}" ]; then
      echo "${listeners}"
      return 0
    fi
    return 1
  fi

  return 2
}

find_free_port() {
  local start_port="$1"
  local candidate
  local listeners
  local status

  for ((candidate = start_port + 1; candidate <= 65535; candidate++)); do
    listeners="$(get_port_listeners "${candidate}")"
    status=$?
    if [ "${status}" -eq 1 ]; then
      echo "${candidate}"
      return 0
    fi
    if [ "${status}" -gt 1 ]; then
      return 1
    fi
  done

  return 1
}

resolve_host_port() {
  local var_name="$1"
  local default_value="$2"
  local candidate=""

  if [ -n "${!var_name-}" ]; then
    candidate="${!var_name}"
  fi

  if [ -z "${candidate}" ]; then
    candidate="$(get_env_value ".env" "${var_name}" 2>/dev/null || true)"
  fi

  if [ -z "${candidate}" ]; then
    if [ "${var_name}" = "BACKEND_HOST_PORT" ]; then
      candidate="$(get_env_value "backend/.env" "${var_name}" 2>/dev/null || true)"
    else
      candidate="$(get_env_value "frontend/.env.local" "${var_name}" 2>/dev/null || true)"
    fi
  fi

  if [ -z "${candidate}" ]; then
    candidate="${default_value}"
  fi

  if ! [[ "${candidate}" =~ ^[0-9]+$ ]] || [ "${candidate}" -lt 1 ] || [ "${candidate}" -gt 65535 ]; then
    warn "Invalid ${var_name} value '${candidate}'. Falling back to ${default_value}."
    candidate="${default_value}"
  fi

  printf '%s' "${candidate}"
}

resolve_or_reassign_port() {
  local service_name="$1"
  local request_port="$2"
  local listeners=""
  local status=0

  listeners="$(get_port_listeners "${request_port}")"
  status=$?

  if [ "${status}" -eq 1 ]; then
    printf '%s' "${request_port}"
    return 0
  fi

  if [ "${status}" -gt 1 ]; then
    warn "Could not inspect ${service_name} port ${request_port} with ss/lsof on this host. Continuing."
    printf '%s' "${request_port}"
    return 0
  fi

  if [ "${AUTO_FIX_PORTS}" = "1" ]; then
    local new_port
    if new_port="$(find_free_port "${request_port}")"; then
      if ! [[ "${new_port}" =~ ^[0-9]+$ ]]; then
        warn "Could not parse auto-assigned port '${new_port}' for ${service_name}; using ${request_port}."
        printf '%s' "${request_port}"
        return 0
      fi
      warn "${service_name} port ${request_port} is in use; auto-assigned ${new_port}."
      info "Active listener(s) for ${request_port}:"
      printf '%s\n' "${listeners}" >&2
      printf '%s' "${new_port}"
      return 0
    fi
  fi

  error "Host port ${request_port} needed by ${service_name} is already in use."
  printf '%s\n' "Active listener(s):" >&2
  printf '%s\n' "${listeners}" >&2
  printf '\n' >&2
  info "Fix by running one of the following:"
  info "  - Stop the conflicting process and retry."
  info "  - Set explicit ports: BACKEND_HOST_PORT=3001 FRONTEND_HOST_PORT=3000 ${COMPOSE_CMD[*]} up --build"
  info "  - Find a free port quickly: lsof -i -P -n | grep LISTEN"
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  error "docker CLI not found. Install Docker Desktop or Docker Engine and retry."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  error "Docker compose not found. Install docker compose plugin or legacy docker-compose."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
  warn "Docker daemon is not available for your user (permission denied or service issue)."
  error "Start Docker and re-run this script."
  case "${OS_NAME}" in
    Darwin)
      echo "  - Open Docker Desktop and wait until it shows 'Engine running'"
      echo "  - Or run: open -a Docker"
      ;;
    Linux)
      echo "  - sudo systemctl start docker"
      echo "  - sudo systemctl restart docker"
      echo "  - Add user to docker group: sudo usermod -aG docker \$(whoami); newgrp docker"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "  - Start Docker Desktop"
      echo "  - If using WSL, ensure Docker Desktop integration is enabled for your distro"
      ;;
    *)
      echo "  - Ensure the Docker daemon/service is running for your OS"
      ;;
  esac
  exit 1
fi

for pair in "backend/.env backend/.env.example" "frontend/.env.local frontend/.env.example"; do
  IFS=' ' read -r target source <<<"${pair}"
  if [ ! -f "${target}" ]; then
    if [ -f "${source}" ]; then
      cp "${source}" "${target}"
      warn "Created ${target} from ${source}."
    else
      if [ "${target}" = "frontend/.env.local" ]; then
        {
          printf 'NEXT_PUBLIC_BACKEND_URL=http://localhost:3001\n'
          printf 'NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:3001\n'
        } > "${target}"
        warn "Missing both ${target} and ${source}; created ${target} with default local values."
      else
        warn "Missing both ${target} and ${source}; create ${target} manually."
      fi
    fi
  fi
done

if [ "${AUTO_FIX_PORTS}" = "1" ]; then
  info "AUTO_FIX_PORTS is enabled. If default host ports are in use, free alternatives are selected automatically."
fi

BACKEND_HOST_PORT="$(resolve_host_port "BACKEND_HOST_PORT" "3001")"
FRONTEND_HOST_PORT="$(resolve_host_port "FRONTEND_HOST_PORT" "3000")"

BACKEND_HOST_PORT="$(resolve_or_reassign_port "backend" "${BACKEND_HOST_PORT}")"
FRONTEND_HOST_PORT="$(resolve_or_reassign_port "frontend" "${FRONTEND_HOST_PORT}")"

export BACKEND_HOST_PORT FRONTEND_HOST_PORT

_set_local_webhook_host() {
  if [ ! -f "backend/.env" ]; then
    return 0
  fi

  local local_webhook_host="http://localhost:${BACKEND_HOST_PORT}"
  _set_webhook_host "${local_webhook_host}" "ngrok disabled"
}

_set_webhook_host() {
  local webhook_host="$1"
  local reason="$2"
  if [ ! -f "backend/.env" ]; then
    return 0
  fi
  local normalized_webhook_host
  normalized_webhook_host="$(normalize_webhook_host "${webhook_host}")"
  if [ -z "${normalized_webhook_host}" ]; then
    warn "${reason}: skipped empty TWILIO_WEBHOOK_HOST update."
    return 0
  fi

  local previous_webhook_host
  previous_webhook_host="$(get_env_value "backend/.env" "TWILIO_WEBHOOK_HOST" 2>/dev/null || true)"
  previous_webhook_host="$(normalize_webhook_host "${previous_webhook_host}")"

  local tmp_file
  tmp_file="$(mktemp)"
  awk -v value="${normalized_webhook_host}" '
    BEGIN { replaced = 0 }
    /^[[:space:]]*TWILIO_WEBHOOK_HOST[[:space:]]*=/ {
      if (!replaced) {
        print "TWILIO_WEBHOOK_HOST=" value
        replaced = 1
      }
      next
    }
    { print }
    END {
      if (!replaced) {
        print "TWILIO_WEBHOOK_HOST=" value
      }
    }
  ' "backend/.env" > "${tmp_file}"
  mv "${tmp_file}" "backend/.env"

  if [ "${previous_webhook_host}" != "${normalized_webhook_host}" ]; then
    TWILIO_WEBHOOK_HOST_CHANGED=1
    info "${reason}: TWILIO_WEBHOOK_HOST updated to ${normalized_webhook_host}"
  else
    info "${reason}: TWILIO_WEBHOOK_HOST unchanged (${normalized_webhook_host})"
  fi
}

if [ "${NGROK_ENABLED}" = "1" ]; then
  info "Tunnel mode: ngrok enabled (use --no-ngrok to disable)."
else
  info "Tunnel mode: local only (use --ngrok to enable public callbacks)."
  _set_local_webhook_host
fi

if [ "${SKIP_PREFLIGHT:-0}" != "1" ]; then
  if ! "${PROJECT_ROOT}/scripts/preflight.sh" "${PRECHECK_STRICT-1}" ; then
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# ngrok tunnel management
# ---------------------------------------------------------------------------
NGROK_PID=""

_cleanup_ngrok() {
  if [ -n "${NGROK_PID}" ] && kill -0 "${NGROK_PID}" 2>/dev/null; then
    info "Stopping ngrok (pid ${NGROK_PID})…"
    kill "${NGROK_PID}" 2>/dev/null || true
    wait "${NGROK_PID}" 2>/dev/null || true
  fi
}

trap '_cleanup_ngrok' EXIT INT TERM

_extract_ngrok_url_from_log() {
  local ngrok_log_file="$1"
  if [ ! -f "${ngrok_log_file}" ]; then
    return 1
  fi

  local url
  url="$(grep -Eo 'https://[^[:space:]"]*ngrok[^[:space:]"]*' "${ngrok_log_file}" | tail -n 1 || true)"
  url="${url%,}"
  url="${url%\"}"
  if [ -n "${url}" ]; then
    printf '%s' "${url}"
    return 0
  fi
  return 1
}

_launch_ngrok_process() {
  local ngrok_log_file="$1"
  shift

  : > "${ngrok_log_file}"
  ngrok "$@" --log stdout --log-format logfmt >"${ngrok_log_file}" 2>&1 &
  NGROK_PID=$!

  # Wait for either a discovered tunnel URL in logs or an early process failure.
  local waited=0
  while [ "${waited}" -lt 10 ]; do
    if ! kill -0 "${NGROK_PID}" 2>/dev/null; then
      error "ngrok exited during startup."
      error "ngrok logs (${ngrok_log_file}):"
      tail -n 40 "${ngrok_log_file}" >&2 || true
      return 1
    fi

    local detected_url
    detected_url="$(_extract_ngrok_url_from_log "${ngrok_log_file}" || true)"
    if [ -n "${detected_url}" ]; then
      printf '%s' "${detected_url}"
      return 0
    fi

    sleep 1
    waited=$((waited + 1))
  done

  # Process is still running but URL not yet observed; caller may use fallback
  # detection (API query, static domain, or additional log parsing).
  return 0
}

_start_ngrok() {
  local ngrok_api_url="http://127.0.0.1:${NGROK_API_PORT}/api/tunnels"
  local ngrok_log_file="${PROJECT_ROOT}/backend/data/ngrok.log"

  if [ "${NGROK_ENABLED}" != "1" ]; then
    info "ngrok: skipped (NGROK_ENABLED=0)"
    return 0
  fi

  if ! command -v ngrok >/dev/null 2>&1; then
    error "ngrok requested but binary not found in PATH."
    error "Install ngrok: https://ngrok.com/download"
    return 1
  fi

  mkdir -p "${PROJECT_ROOT}/backend/data"

  # Reuse if ngrok is already running (API on configured port)
  if curl -sf "${ngrok_api_url}" >/dev/null 2>&1; then
    local existing_url
    existing_url="$(curl -sf "${ngrok_api_url}" | python3 -c \
      "import sys,json; ts=json.load(sys.stdin)['tunnels']; print(ts[0]['public_url'] if ts else '')" 2>/dev/null || true)"
    if [ -n "${existing_url}" ]; then
      info "ngrok: reusing running tunnel → ${existing_url}"
      _set_webhook_host "${existing_url}" "ngrok reuse"
      return 0
    fi
  fi

  # Read TWILIO_WEBHOOK_HOST from backend/.env
  local webhook_host
  webhook_host="$(get_env_value "backend/.env" "TWILIO_WEBHOOK_HOST" 2>/dev/null || true)"

  local ngrok_args=("http" "${BACKEND_HOST_PORT}")
  local used_static_domain=0
  local domain=""
  local launch_url=""

  # If the configured host is a static ngrok domain, pin to it
  if [[ "${webhook_host}" == *".ngrok"* ]]; then
    domain="${webhook_host#https://}"
    domain="${domain#http://}"
    domain="${domain%%/*}"
    ngrok_args+=("--url" "${domain}")
    used_static_domain=1
    info "ngrok: starting with static domain ${domain}…"
  else
    info "ngrok: starting with dynamic URL…"
  fi

  if ! launch_url="$(_launch_ngrok_process "${ngrok_log_file}" "${ngrok_args[@]}")"; then
    if [ "${used_static_domain}" = "1" ]; then
      warn "ngrok static domain failed; retrying with dynamic URL."
      _cleanup_ngrok
      ngrok_args=("http" "${BACKEND_HOST_PORT}")
      used_static_domain=0
      domain=""
      if ! launch_url="$(_launch_ngrok_process "${ngrok_log_file}" "${ngrok_args[@]}")"; then
        return 1
      fi
    else
      return 1
    fi
  fi

  # Fetch the tunnel URL
  local tunnel_url="${launch_url}"

  if [ -z "${tunnel_url}" ] && curl -sf "${ngrok_api_url}" >/dev/null 2>&1; then
    tunnel_url="$(curl -sf "${ngrok_api_url}" | python3 -c \
      "import sys,json; ts=json.load(sys.stdin)['tunnels']; print(ts[0]['public_url'] if ts else '')" 2>/dev/null || true)"
  fi

  if [ -z "${tunnel_url}" ]; then
    tunnel_url="$(_extract_ngrok_url_from_log "${ngrok_log_file}" || true)"
  fi

  if [ -z "${tunnel_url}" ] && [ "${used_static_domain}" = "1" ] && [ -n "${domain}" ]; then
    tunnel_url="https://${domain}"
  fi

  if [ -z "${tunnel_url}" ]; then
    error "ngrok: could not determine tunnel URL."
    error "ngrok logs (${ngrok_log_file}):"
    tail -n 40 "${ngrok_log_file}" >&2 || true
    return 1
  fi

  info "ngrok: tunnel active → ${tunnel_url}"

  # Keep backend/.env in sync with the active ngrok tunnel whenever ngrok mode
  # is enabled, so Twilio callbacks always target the current tunnel.
  _set_webhook_host "${tunnel_url}" "ngrok active"
}

_ensure_docker_host_url() {
  # When running in Docker, localhost URLs for Ollama won't work because the
  # container's localhost is itself. We write overrides to a separate file
  # that docker-compose.yml loads AFTER backend/.env, so the user's .env
  # is never mutated and native runs are unaffected.
  local override_file="backend/.env.docker-overrides"
  : > "${override_file}"  # truncate / create

  if [ ! -f "backend/.env" ]; then
    return 0
  fi

  local ollama_url
  ollama_url="$(get_env_value "backend/.env" "OLLAMA_BASE_URL" 2>/dev/null || true)"
  local vllm_url
  vllm_url="$(get_env_value "backend/.env" "VLLM_BASE_URL" 2>/dev/null || true)"

  local changed=0

  if [[ "${ollama_url}" == *"localhost"* || "${ollama_url}" == *"127.0.0.1"* ]]; then
    local new_ollama="${ollama_url//localhost/host.docker.internal}"
    new_ollama="${new_ollama//127.0.0.1/host.docker.internal}"
    printf 'OLLAMA_BASE_URL=%s\n' "${new_ollama}" >> "${override_file}"
    printf 'VLLM_BASE_URL=%s\n' "${new_ollama}" >> "${override_file}"
    changed=1
  elif [[ "${vllm_url}" == *"localhost"* || "${vllm_url}" == *"127.0.0.1"* ]]; then
    local new_vllm="${vllm_url//localhost/host.docker.internal}"
    new_vllm="${new_vllm//127.0.0.1/host.docker.internal}"
    printf 'VLLM_BASE_URL=%s\n' "${new_vllm}" >> "${override_file}"
    changed=1
  fi

  if [ "${changed}" -eq 1 ]; then
    warn "Wrote host.docker.internal overrides to ${override_file} so the container can reach host Ollama."
    info "  (backend/.env is NOT modified — native runs still use localhost)"
  fi
}

if ! _start_ngrok; then
  exit 1
fi
_ensure_docker_host_url

if [ "${BACKEND_HOST_PORT}" = "${FRONTEND_HOST_PORT}" ]; then
  if [ "${AUTO_FIX_PORTS}" = "1" ]; then
    warn "Backend and frontend resolved to same host port (${BACKEND_HOST_PORT}). Auto-adjusting frontend."
    if ! FRONTEND_HOST_PORT="$(find_free_port "${FRONTEND_HOST_PORT}")"; then
      error "No distinct free frontend port available while backend is using ${BACKEND_HOST_PORT}."
      exit 1
    fi
    export FRONTEND_HOST_PORT
  else
    error "Backend and frontend host ports cannot be identical: ${BACKEND_HOST_PORT}."
    info "Pick distinct ports, for example:"
    info "  BACKEND_HOST_PORT=3001 FRONTEND_HOST_PORT=3000 ${COMPOSE_CMD[*]} up --build"
    exit 1
  fi
fi

if [ "${AUTO_FIX_PORTS}" = "0" ]; then
  info "Final ports: BACKEND_HOST_PORT=${BACKEND_HOST_PORT}, FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}"
else
  info "Auto-fixed ports: BACKEND_HOST_PORT=${BACKEND_HOST_PORT}, FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}"
fi

COMPOSE_EFFECTIVE_ARGS=("${COMPOSE_UP_ARGS[@]+"${COMPOSE_UP_ARGS[@]}"}")
if [ "${TWILIO_WEBHOOK_HOST_CHANGED}" = "1" ]; then
  COMPOSE_EFFECTIVE_ARGS=(--force-recreate "${COMPOSE_EFFECTIVE_ARGS[@]+"${COMPOSE_EFFECTIVE_ARGS[@]}"}")
  info "TWILIO_WEBHOOK_HOST changed; forcing container recreate so backend picks up new callback host."
fi

HAS_COMPOSE_ARGS=0
for _arg in "${COMPOSE_EFFECTIVE_ARGS[@]+"${COMPOSE_EFFECTIVE_ARGS[@]}"}"; do
  HAS_COMPOSE_ARGS=1
  break
done

if [ "${HAS_COMPOSE_ARGS}" = "1" ]; then
  info "Starting services with: ${COMPOSE_CMD[*]} up --build ${COMPOSE_EFFECTIVE_ARGS[*]}"
  "${COMPOSE_CMD[@]}" up --build "${COMPOSE_EFFECTIVE_ARGS[@]}"
else
  info "Starting services with: ${COMPOSE_CMD[*]} up --build"
  "${COMPOSE_CMD[@]}" up --build
fi
