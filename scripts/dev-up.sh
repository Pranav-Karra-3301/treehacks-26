#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

AUTO_FIX_PORTS="${AUTO_FIX_PORTS:-1}"

warn() { printf '\033[1;33mwarning\033[0m: %s\n' "$*" >&2; }
info() { printf '\033[1;34minfo\033[0m: %s\n' "$*" >&2; }
error() { printf '\033[1;31merror\033[0m: %s\n' "$*" >&2; }

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
  warn "Docker daemon is not available for your user (permission denied or service issue)."
  error "Run one of the following and re-run this script:"
  echo "  - sudo systemctl start docker"
  echo "  - sudo systemctl restart docker"
  echo "  - Add user to docker group: sudo usermod -aG docker \$(whoami); newgrp docker"
  exit 1
fi

for pair in "backend/.env backend/.env.example" "frontend/.env.local frontend/.env.example"; do
  IFS=' ' read -r target source <<<"${pair}"
  if [ ! -f "${target}" ]; then
    if [ -f "${source}" ]; then
      cp "${source}" "${target}"
      warn "Created ${target} from ${source}."
    else
      warn "Missing both ${target} and ${source}; create ${target} manually."
    fi
  fi
done

if [ "${AUTO_FIX_PORTS}" = "1" ]; then
  info "AUTO_FIX_PORTS is enabled. If default host ports are in use, free alternatives are selected automatically."
fi

if [ "${SKIP_PREFLIGHT:-0}" != "1" ]; then
  if ! "${PROJECT_ROOT}/scripts/preflight.sh" "${PRECHECK_STRICT-1}" ; then
    exit 1
  fi
fi

BACKEND_HOST_PORT="$(resolve_host_port "BACKEND_HOST_PORT" "3001")"
FRONTEND_HOST_PORT="$(resolve_host_port "FRONTEND_HOST_PORT" "3000")"

BACKEND_HOST_PORT="$(resolve_or_reassign_port "backend" "${BACKEND_HOST_PORT}")"
FRONTEND_HOST_PORT="$(resolve_or_reassign_port "frontend" "${FRONTEND_HOST_PORT}")"

export BACKEND_HOST_PORT FRONTEND_HOST_PORT

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

_start_ngrok() {
  # Opt-out: NGROK_ENABLED=0
  if [ "${NGROK_ENABLED:-1}" = "0" ]; then
    info "ngrok: skipped (NGROK_ENABLED=0)"
    return 0
  fi

  # Skip if ngrok binary is missing
  if ! command -v ngrok >/dev/null 2>&1; then
    warn "ngrok binary not found in PATH — skipping tunnel. Install: https://ngrok.com/download"
    return 0
  fi

  # Reuse if ngrok is already running (API on :4040)
  if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
    local existing_url
    existing_url="$(curl -sf http://127.0.0.1:4040/api/tunnels | python3 -c \
      "import sys,json; ts=json.load(sys.stdin)['tunnels']; print(ts[0]['public_url'] if ts else '')" 2>/dev/null || true)"
    if [ -n "${existing_url}" ]; then
      info "ngrok: reusing running tunnel → ${existing_url}"
      return 0
    fi
  fi

  # Read TWILIO_WEBHOOK_HOST from backend/.env
  local webhook_host
  webhook_host="$(get_env_value "backend/.env" "TWILIO_WEBHOOK_HOST" 2>/dev/null || true)"

  local ngrok_args=("http" "${BACKEND_HOST_PORT}")

  # If the configured host is a static ngrok domain, pin to it
  if [[ "${webhook_host}" == *".ngrok"* ]]; then
    local domain="${webhook_host#https://}"
    domain="${domain#http://}"
    domain="${domain%%/*}"
    ngrok_args+=("--url" "${domain}")
    info "ngrok: starting with static domain ${domain}…"
  else
    info "ngrok: starting with dynamic URL…"
  fi

  ngrok "${ngrok_args[@]}" >/dev/null 2>&1 &
  NGROK_PID=$!

  # Wait for the ngrok API to become available (up to 10 s)
  local waited=0
  while ! curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; do
    if [ "${waited}" -ge 10 ]; then
      warn "ngrok: API at localhost:4040 did not respond within 10 s"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # Fetch the tunnel URL
  local tunnel_url
  tunnel_url="$(curl -sf http://127.0.0.1:4040/api/tunnels | python3 -c \
    "import sys,json; ts=json.load(sys.stdin)['tunnels']; print(ts[0]['public_url'] if ts else '')" 2>/dev/null || true)"

  if [ -z "${tunnel_url}" ]; then
    warn "ngrok: could not determine tunnel URL from API"
    return 0
  fi

  info "ngrok: tunnel active → ${tunnel_url}"

  # If the webhook host was a placeholder or missing, update backend/.env
  if [ -z "${webhook_host}" ] \
    || [ "${webhook_host}" = "https://your-public-url" ] \
    || [ "${webhook_host}" = "https://your-public-ngrok-url" ]; then
    if [ -f "backend/.env" ]; then
      sed -i "s|^TWILIO_WEBHOOK_HOST=.*|TWILIO_WEBHOOK_HOST=${tunnel_url}|" "backend/.env"
      info "ngrok: updated TWILIO_WEBHOOK_HOST in backend/.env → ${tunnel_url}"
    fi
  fi
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

_start_ngrok
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

info "Starting services with: ${COMPOSE_CMD[*]} up --build ${*+"$*"}"
${COMPOSE_CMD[@]} up --build ${@+"$@"}
