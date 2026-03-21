type LinuxShellOptions = {
  downloadURL: string
  installDir: string
  openBrowser: boolean
  modeName: string
  serviceUser?: string
  variantLabel: string
}

export function generateLinuxShell(options: LinuxShellOptions): string {
  return `#!/usr/bin/env bash
set -eu

install_dir="${options.installDir}"
download_url="${options.downloadURL}"
mode_name="${options.modeName}"
service_user_override="${options.serviceUser || ""}"
open_browser=${options.openBrowser ? "1" : "0"}
tmp_dir="$(mktemp -d)"
archive_path="$tmp_dir/syncthing.tar.gz"
extract_root="$tmp_dir/extract"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

run_user_systemctl() {
  systemctl --user "$@"
}

service_exec_dir="/usr/local/libexec/syncthing-installer"
service_exec_bin="$service_exec_dir/syncthing"

system_service_name_for_user() {
  printf '%s\n' "syncthing-$1.service"
}

disable_matching_system_service_if_present() {
  local current_user unit_name unit_path

  current_user="$(id -un)"
  unit_name="$(system_service_name_for_user "$current_user")"
  unit_path="/etc/systemd/system/$unit_name"

  if [ ! -f "$unit_path" ]; then
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "检测到已有系统服务 $unit_name，但当前环境没有 sudo，无法自动切换到用户服务。请先手动执行: sudo systemctl disable --now $unit_name" >&2
    exit 1
  fi

  echo "检测到已有系统服务 $unit_name，正在停用后切换到用户服务..."
  sudo systemctl disable --now "$unit_name"
}

disable_matching_user_service_if_present() {
  local target_user target_uid target_home user_service_dir user_service_path

  target_user="$1"
  target_uid="$(id -u "$target_user")"
  target_home="$(resolve_user_home "$target_user")"
  user_service_dir="$target_home/.config/systemd/user"
  user_service_path="$user_service_dir/syncthing.service"

  if [ ! -f "$user_service_path" ]; then
    return
  fi

  echo "检测到已有用户服务 syncthing.service，正在停用后切换到系统服务..."

  if command -v runuser >/dev/null 2>&1 && [ -d "/run/user/$target_uid" ]; then
    runuser -u "$target_user" -- env XDG_RUNTIME_DIR="/run/user/$target_uid" systemctl --user disable --now syncthing.service >/dev/null 2>&1 || true
    runuser -u "$target_user" -- env XDG_RUNTIME_DIR="/run/user/$target_uid" systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi

  rm -f "$user_service_path"
  pkill -u "$target_user" -x syncthing >/dev/null 2>&1 || true
}

validate_mode_prerequisites() {
  case "$mode_name" in
    default|startup)
      if [ "$(id -u)" -eq 0 ]; then
        echo "Linux mode=$mode_name 应以普通用户运行，请使用 curl ... | bash，而不是 sudo bash。" >&2
        exit 1
      fi
      ;;
    service)
      if [ "$(id -u)" -ne 0 ]; then
        echo "Linux mode=service 需要 root 权限。请使用 curl -fsSL <安装URL> | sudo bash；如需指定运行账号，可在安装 URL 后追加 &service_user=<用户名>。" >&2
        exit 1
      fi
      ;;
  esac
}

wait_and_open_browser() {
  if [ "$open_browser" != "1" ]; then
    return
  fi

  if ! command -v xdg-open >/dev/null 2>&1; then
    return
  fi

  for _ in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:8384/ >/dev/null 2>&1; then
      nohup xdg-open http://127.0.0.1:8384/ >/dev/null 2>&1 &
      return
    fi

    sleep 1
  done
}

resolve_user_home() {
  getent passwd "$1" | cut -d: -f6
}

write_user_service() {
  local service_dir service_path state_dir

  if [ "$(id -u)" -eq 0 ]; then
    echo "Linux mode=$mode_name 应以普通用户运行，而不是 root。" >&2
    exit 1
  fi

  service_dir="\${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  service_path="$service_dir/syncthing.service"
  state_dir="\${XDG_STATE_HOME:-$HOME/.local/state}/syncthing"

  disable_matching_system_service_if_present

  mkdir -p "$service_dir" "$state_dir"

  cat > "$service_path" <<EOF
[Unit]
Description=Syncthing User Service
Documentation=https://docs.syncthing.net/
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$syncthing_bin serve --no-browser --no-restart --home=$state_dir
WorkingDirectory=$install_dir
Restart=on-failure
RestartSec=5
SuccessExitStatus=3 4
RestartForceExitStatus=3 4

[Install]
WantedBy=default.target
EOF

  run_user_systemctl daemon-reload
  run_user_systemctl enable --now syncthing.service

  if [ "$mode_name" = "startup" ]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo loginctl enable-linger "$(id -un)"
    else
      echo "mode=startup 需要 sudo loginctl enable-linger $(id -un)" >&2
      exit 1
    fi
  fi

  wait_and_open_browser
}

write_system_service() {
  local service_user service_home state_dir service_name service_path service_group

  service_user="$service_user_override"

  if [ -z "$service_user" ] && [ -n "\${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    service_user="$SUDO_USER"
  fi

  if [ -z "$service_user" ]; then
    echo "Linux mode=service 需要通过 service_user 指定运行账号，或通过 sudo 保留当前登录用户。" >&2
    exit 1
  fi

  if ! id "$service_user" >/dev/null 2>&1; then
    echo "service_user does not exist: $service_user" >&2
    exit 1
  fi

  service_group="$(id -gn "$service_user")"
  service_home="$(resolve_user_home "$service_user")"
  state_dir="$service_home/.local/state/syncthing"
  service_name="syncthing-$service_user.service"
  service_path="/etc/systemd/system/$service_name"

  disable_matching_user_service_if_present "$service_user"

  mkdir -p "$install_dir" "$state_dir"
  mkdir -p "$service_exec_dir"
  chown -R root:root "$install_dir"
  chown -R "$service_user:$service_group" "$state_dir"
  install -m 755 "$syncthing_bin" "$service_exec_bin"

  cat > "$service_path" <<EOF
[Unit]
Description=Syncthing System Service ($service_user)
Documentation=https://docs.syncthing.net/
After=network-online.target
Wants=network-online.target

[Service]
User=$service_user
Group=$service_group
ExecStart=$service_exec_bin serve --no-browser --no-restart --home=$state_dir
WorkingDirectory=$install_dir
Restart=on-failure
RestartSec=5
SuccessExitStatus=3 4
RestartForceExitStatus=3 4

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$service_name"
}

echo "Installing Syncthing (${options.variantLabel}) to $install_dir"

require_command curl
require_command tar
require_command systemctl
require_command install

validate_mode_prerequisites

mkdir -p "$install_dir" "$extract_root"
curl -fsSL "$download_url" -o "$archive_path"
tar -xzf "$archive_path" -C "$extract_root"

extract_source_dir="$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "$extract_source_dir" ]; then
  extract_source_dir="$extract_root"
fi

cp -a "$extract_source_dir"/. "$install_dir"

syncthing_bin="$install_dir/syncthing"

if [ ! -f "$syncthing_bin" ]; then
  syncthing_bin="$(find "$install_dir" -type f -name syncthing | head -n 1)"
fi

if [ -z "$syncthing_bin" ]; then
  echo "syncthing binary not found after extraction" >&2
  exit 1
fi

chmod 755 "$syncthing_bin"

case "$mode_name" in
  default|startup)
    write_user_service
    ;;
  service)
    write_system_service
    ;;
  *)
    echo "unsupported linux mode: $mode_name" >&2
    exit 1
    ;;
esac

echo "Linux installer for ${options.variantLabel} finished."
`
}