#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/files.sh"

load_env_file "$script_dir/../config/env"

deploy_host="${SYNC_DEPLOY_HOST:-}"
deploy_user="${SYNC_DEPLOY_USER:-}"
deploy_port="${SYNC_DEPLOY_PORT:-22}"
deploy_base_dir="${SYNC_DEPLOY_BASE_DIR:-/opt/syncthing-installer-sync}"
deploy_systemd_prefix="${SYNC_SYSTEMD_NAME_PREFIX:-syncthing-installer-sync}"
deploy_run_user="${SYNC_RUN_USER:-$deploy_user}"
deploy_run_group="${SYNC_RUN_GROUP:-$deploy_run_user}"
deploy_schedule="${SYNC_TIMER_ON_CALENDAR:-hourly}"
refresh_publish_host_key="${SYNC_REFRESH_PUBLISH_HOST_KEY:-0}"

if [ -z "$deploy_host" ] || [ -z "$deploy_user" ]; then
  log_error "SYNC_DEPLOY_HOST and SYNC_DEPLOY_USER are required"
  exit 1
fi

for required_cmd in rsync ssh scp; do
  if ! command -v "$required_cmd" >/dev/null 2>&1; then
    log_error "$required_cmd is required"
    exit 1
  fi
done

if [ ! -f "$script_dir/../config/env" ]; then
  log_error "sync/config/env is required before deployment"
  exit 1
fi

service_name="${deploy_systemd_prefix}.service"
timer_name="${deploy_systemd_prefix}.timer"
remote_target="${deploy_user}@${deploy_host}"
remote_sync_dir="$deploy_base_dir/sync"
remote_env_path="$remote_sync_dir/config/env"
remote_service_path="/etc/systemd/system/${service_name}"
remote_timer_path="/etc/systemd/system/${timer_name}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

cat > "$tmp_dir/$service_name" <<EOF
[Unit]
Description=Syncthing Installer Sync Job
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$deploy_run_user
Group=$deploy_run_group
WorkingDirectory=$remote_sync_dir
ExecStart=$remote_sync_dir/bin/run-sync-cycle.sh
EOF

cat > "$tmp_dir/$timer_name" <<EOF
[Unit]
Description=Run Syncthing Installer Sync Job

[Timer]
OnCalendar=$deploy_schedule
Persistent=true
Unit=$service_name

[Install]
WantedBy=timers.target
EOF

log_info "prepare remote directories on $remote_target"
ssh -p "$deploy_port" "$remote_target" "bash -s -- '$deploy_base_dir' '$deploy_run_user' '$deploy_run_group' '$remote_sync_dir' '${REMOTE_HOST:-}' '${REMOTE_PORT:-22}' '$refresh_publish_host_key'" <<'EOF'
set -eu

deploy_base_dir="$1"
deploy_run_user="$2"
deploy_run_group="$3"
remote_sync_dir="$4"
publish_host="$5"
publish_port="$6"
refresh_publish_host_key="$7"

. /etc/os-release

if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
  echo "This deployment script currently supports Ubuntu 24.04 only." >&2
  exit 1
fi

missing_packages=""

for package in rsync curl jq; do
  if ! command -v "$package" >/dev/null 2>&1; then
    missing_packages="$missing_packages $package"
  fi
done

if [ -n "$missing_packages" ]; then
  sudo apt-get update
  sudo apt-get install -y $missing_packages
fi

if ! getent group "$deploy_run_group" >/dev/null 2>&1; then
  sudo groupadd --system "$deploy_run_group"
fi

if ! id -u "$deploy_run_user" >/dev/null 2>&1; then
  sudo useradd --system --gid "$deploy_run_group" --home-dir "$deploy_base_dir" --shell /usr/sbin/nologin "$deploy_run_user"
fi

sudo mkdir -p "$deploy_base_dir"
sudo mkdir -p "$remote_sync_dir"
sudo chown -R "$deploy_run_user:$deploy_run_group" "$deploy_base_dir"

if [ -n "$publish_host" ]; then
  run_user_home="$(getent passwd "$deploy_run_user" | cut -d: -f6)"
  known_hosts_path="$run_user_home/.ssh/known_hosts"
  current_keys_file="$(mktemp)"
  existing_keys_file="$(mktemp)"
  normalized_current_keys_file="$(mktemp)"
  normalized_existing_keys_file="$(mktemp)"
  known_host_lookup="$publish_host"

  cleanup_ssh_hostkey_files() {
    rm -f "$current_keys_file" "$existing_keys_file" "$normalized_current_keys_file" "$normalized_existing_keys_file"
  }

  trap cleanup_ssh_hostkey_files EXIT

  sudo -u "$deploy_run_user" mkdir -p "$run_user_home/.ssh"
  sudo chmod 700 "$run_user_home/.ssh"
  sudo touch "$known_hosts_path"
  sudo chmod 600 "$known_hosts_path"

  if [ "$publish_port" != "22" ]; then
    known_host_lookup="[$publish_host]:$publish_port"
  fi

  ssh-keyscan -p "$publish_port" "$publish_host" > "$current_keys_file" 2>/dev/null

  if [ ! -s "$current_keys_file" ]; then
    echo "Failed to fetch SSH host key for $known_host_lookup" >&2
    exit 1
  fi

  sort -u "$current_keys_file" > "$normalized_current_keys_file"

  if ssh-keygen -F "$known_host_lookup" -f "$known_hosts_path" > "$existing_keys_file" 2>/dev/null; then
    grep -v '^#' "$existing_keys_file" > "$existing_keys_file.filtered"
    mv "$existing_keys_file.filtered" "$existing_keys_file"
    sort -u "$existing_keys_file" > "$normalized_existing_keys_file"

    if ! cmp -s "$normalized_existing_keys_file" "$normalized_current_keys_file"; then
      if [ "$refresh_publish_host_key" = "1" ]; then
        ssh-keygen -R "$known_host_lookup" -f "$known_hosts_path" >/dev/null 2>&1 || true
        sudo -u "$deploy_run_user" sh -c "cat '$current_keys_file' >> '$known_hosts_path'"
      else
        echo "SSH host key mismatch for $known_host_lookup in $known_hosts_path" >&2
        echo "Remove the stale key manually or redeploy with SYNC_REFRESH_PUBLISH_HOST_KEY=1" >&2
        exit 1
      fi
    fi
  else
    sudo -u "$deploy_run_user" sh -c "cat '$current_keys_file' >> '$known_hosts_path'"
  fi
fi
EOF

log_info "upload sync directory to $remote_target:$remote_sync_dir"
rsync -av --delete --no-owner --no-group --rsync-path="sudo rsync" -e "ssh -p $deploy_port" \
  --exclude 'config/env' \
  "$project_root/sync/" "$remote_target:$remote_sync_dir/"

ssh -p "$deploy_port" "$remote_target" "sudo chown -R '$deploy_run_user:$deploy_run_group' '$remote_sync_dir'"

log_info "upload runtime env to $remote_env_path"
remote_env_tmp="/tmp/${deploy_systemd_prefix}.env"
scp -P "$deploy_port" "$script_dir/../config/env" "$remote_target:$remote_env_tmp"
ssh -p "$deploy_port" "$remote_target" "sudo mkdir -p '$(dirname "$remote_env_path")' && sudo install -o '$deploy_run_user' -g '$deploy_run_group' -m 600 '$remote_env_tmp' '$remote_env_path' && rm -f '$remote_env_tmp'"

log_info "install systemd service and timer on Ubuntu 24"
scp -P "$deploy_port" "$tmp_dir/$service_name" "$tmp_dir/$timer_name" "$remote_target:/tmp/"
ssh -p "$deploy_port" "$remote_target" "sudo mv '/tmp/$service_name' '$remote_service_path' && sudo mv '/tmp/$timer_name' '$remote_timer_path' && sudo systemctl daemon-reload && sudo systemctl enable --now '$timer_name'"

log_info "verify systemd service and timer on $remote_target"
ssh -p "$deploy_port" "$remote_target" "sudo systemctl status '$service_name' --no-pager || true; echo; sudo systemctl status '$timer_name' --no-pager || true; echo; sudo systemctl list-timers '$timer_name' --no-pager || true; echo; sudo journalctl -u '$service_name' -n 20 --no-pager || true"

log_info "deployment finished"
log_info "service: $service_name"
log_info "timer: $timer_name"
log_info "manual run: sudo systemctl start $service_name"