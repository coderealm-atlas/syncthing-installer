#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/files.sh"

load_env_file "$script_dir/../config/env.local"

deploy_host="${LOCAL_DEPLOY_HOST:-}"
deploy_user="${LOCAL_DEPLOY_USER:-}"
deploy_port="${LOCAL_DEPLOY_PORT:-22}"
deploy_base_dir="${LOCAL_DEPLOY_BASE_DIR:-/opt/syncthing-installer-local-sync}"
deploy_systemd_prefix="${LOCAL_SYSTEMD_NAME_PREFIX:-syncthing-installer-local-sync}"
deploy_run_user="${LOCAL_RUN_USER:-$deploy_user}"
deploy_run_group="${LOCAL_RUN_GROUP:-$deploy_run_user}"
deploy_schedule="${LOCAL_TIMER_ON_CALENDAR:-*-*-* 03:00:00 Asia/Shanghai}"
local_publish_path="${LOCAL_PUBLISH_PATH:-}"

if [ -z "$deploy_host" ] || [ -z "$deploy_user" ] || [ -z "$local_publish_path" ]; then
  log_error "LOCAL_DEPLOY_HOST, LOCAL_DEPLOY_USER and LOCAL_PUBLISH_PATH are required"
  exit 1
fi

for required_cmd in rsync ssh scp; do
  if ! command -v "$required_cmd" >/dev/null 2>&1; then
    log_error "$required_cmd is required"
    exit 1
  fi
done

if [ ! -f "$script_dir/../config/env.local" ]; then
  log_error "sync/config/env.local is required before deployment"
  exit 1
fi

service_name="${deploy_systemd_prefix}.service"
timer_name="${deploy_systemd_prefix}.timer"
# Manual run on target host after deployment:
#   sudo systemctl start ${deploy_systemd_prefix}.service
remote_target="${deploy_user}@${deploy_host}"
remote_sync_dir="$deploy_base_dir/sync"
remote_env_path="$remote_sync_dir/config/env.local"
remote_service_path="/etc/systemd/system/${service_name}"
remote_timer_path="/etc/systemd/system/${timer_name}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

cat > "$tmp_dir/$service_name" <<EOF
[Unit]
Description=Syncthing Installer Local Sync Job
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$deploy_run_user
Group=$deploy_run_group
UMask=0022
WorkingDirectory=$remote_sync_dir
ExecStart=/bin/bash $remote_sync_dir/bin/run-local-sync-cycle.sh
EOF

cat > "$tmp_dir/$timer_name" <<EOF
[Unit]
Description=Run Syncthing Installer Local Sync Job

[Timer]
OnCalendar=$deploy_schedule
Persistent=true
Unit=$service_name

[Install]
WantedBy=timers.target
EOF

log_info "prepare remote directories on $remote_target"
ssh -p "$deploy_port" "$remote_target" "bash -s -- '$deploy_base_dir' '$deploy_run_user' '$deploy_run_group' '$remote_sync_dir' '$local_publish_path'" <<'EOF'
set -eu

deploy_base_dir="$1"
deploy_run_user="$2"
deploy_run_group="$3"
remote_sync_dir="$4"
local_publish_path="$5"

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
sudo mkdir -p "$local_publish_path"
sudo chown -R "$deploy_run_user:$deploy_run_group" "$deploy_base_dir"
sudo chown -R "$deploy_run_user:$deploy_run_group" "$local_publish_path"
sudo chmod 755 "$deploy_base_dir"
sudo chmod 755 "$remote_sync_dir"
sudo chmod 755 "$local_publish_path"
EOF

log_info "upload local sync directory to $remote_target:$remote_sync_dir"
rsync -av --delete --no-owner --no-group --rsync-path="sudo rsync" -e "ssh -p $deploy_port" \
  --exclude 'config/env' \
  --exclude 'config/env.local' \
  "$project_root/sync/" "$remote_target:$remote_sync_dir/"

ssh -p "$deploy_port" "$remote_target" "sudo chown -R '$deploy_run_user:$deploy_run_group' '$remote_sync_dir'"
ssh -p "$deploy_port" "$remote_target" "sudo find '$remote_sync_dir/bin' -maxdepth 1 -type f -name '*.sh' -exec chmod 755 {} +"

log_info "upload local runtime env to $remote_env_path"
remote_env_tmp="/tmp/${deploy_systemd_prefix}.env.local"
scp -P "$deploy_port" "$script_dir/../config/env.local" "$remote_target:$remote_env_tmp"
ssh -p "$deploy_port" "$remote_target" "sudo mkdir -p '$(dirname "$remote_env_path")' && sudo install -o '$deploy_run_user' -g '$deploy_run_group' -m 600 '$remote_env_tmp' '$remote_env_path' && rm -f '$remote_env_tmp'"

log_info "install local systemd service and timer on Ubuntu 24"
scp -P "$deploy_port" "$tmp_dir/$service_name" "$tmp_dir/$timer_name" "$remote_target:/tmp/"
ssh -p "$deploy_port" "$remote_target" "sudo mv '/tmp/$service_name' '$remote_service_path' && sudo mv '/tmp/$timer_name' '$remote_timer_path' && sudo systemctl daemon-reload && sudo systemctl enable --now '$timer_name'"

log_info "verify local systemd service and timer on $remote_target"
ssh -p "$deploy_port" "$remote_target" "sudo systemctl status '$service_name' --no-pager || true; echo; sudo systemctl status '$timer_name' --no-pager || true; echo; sudo systemctl list-timers '$timer_name' --no-pager || true; echo; sudo journalctl -u '$service_name' -n 20 --no-pager || true"

log_info "local deployment finished"
log_info "service: $service_name"
log_info "timer: $timer_name"
log_info "manual run: sudo systemctl start $service_name"