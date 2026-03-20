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
ssh -p "$deploy_port" "$remote_target" "bash -s -- '$deploy_base_dir' '$deploy_run_user' '$deploy_run_group' '$remote_sync_dir'" <<'EOF'
set -eu

deploy_base_dir="$1"
deploy_run_user="$2"
deploy_run_group="$3"
remote_sync_dir="$4"

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

sudo mkdir -p "$remote_sync_dir"
sudo chown -R "$deploy_run_user:$deploy_run_group" "$deploy_base_dir"
EOF

log_info "upload sync directory to $remote_target:$remote_sync_dir"
rsync -av --delete -e "ssh -p $deploy_port" \
  --exclude 'config/env' \
  "$project_root/sync/" "$remote_target:$remote_sync_dir/"

log_info "upload runtime env to $remote_env_path"
scp -P "$deploy_port" "$script_dir/../config/env" "$remote_target:$remote_env_path"

log_info "install systemd service and timer on Ubuntu 24"
scp -P "$deploy_port" "$tmp_dir/$service_name" "$tmp_dir/$timer_name" "$remote_target:/tmp/"
ssh -p "$deploy_port" "$remote_target" "sudo mv '/tmp/$service_name' '$remote_service_path' && sudo mv '/tmp/$timer_name' '$remote_timer_path' && sudo systemctl daemon-reload && sudo systemctl enable --now '$timer_name'"

log_info "verify systemd service and timer on $remote_target"
ssh -p "$deploy_port" "$remote_target" "sudo systemctl status '$service_name' --no-pager || true; echo; sudo systemctl status '$timer_name' --no-pager || true; echo; sudo systemctl list-timers '$timer_name' --no-pager || true; echo; sudo journalctl -u '$service_name' -n 20 --no-pager || true"

log_info "deployment finished"
log_info "service: $service_name"
log_info "timer: $timer_name"
log_info "manual run: sudo systemctl start $service_name"