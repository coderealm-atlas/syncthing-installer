type FreeBSDShellOptions = {
  downloadURL: string
  installDir: string
  guiListenAddress: string
  guiURL: string
  tailscaleMode: boolean
  openBrowser: boolean
  modeName: string
  serviceUser?: string
  variantLabel: string
}

export function generateFreeBSDShell(options: FreeBSDShellOptions): string {
  const freebsdInstallerRevision = "freebsd-rcd-20260321b"

  return `#!/usr/bin/env sh
set -eu

install_dir="${options.installDir}"
download_url="${options.downloadURL}"
gui_listen_address="${options.guiListenAddress}"
gui_url="${options.guiURL}"
tailscale_mode=${options.tailscaleMode ? "1" : "0"}
mode_name="${options.modeName}"
service_user_override="${options.serviceUser || ""}"
open_browser=${options.openBrowser ? "1" : "0"}
tmp_dir="$(mktemp -d -t syncthing-installer)"
archive_path="$tmp_dir/syncthing.tar.gz"
extract_root="$tmp_dir/extract"
launcher_dir="$HOME/.local/bin"
launcher_path="$launcher_dir/syncthing-start"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT INT TERM

detect_host_os() {
  uname -s 2>/dev/null || echo unknown
}

validate_host_os() {
  host_os="$(detect_host_os)"

  if [ "$host_os" = "FreeBSD" ]; then
    return
  fi

  echo "This installer URL targets FreeBSD, but detected host OS: $host_os" >&2
  echo "Please use a matching installer URL for your host operating system." >&2
  exit 1
}

configure_gui_address() {
  local tailscale_ip

  if [ "$tailscale_mode" != "1" ]; then
    return
  fi

  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale=1 was requested, but tailscale is not installed. Falling back to $gui_listen_address." >&2
    return
  fi

  tailscale_ip="$(tailscale ip -4 2>/dev/null | head -n 1)"

  if [ -z "$tailscale_ip" ]; then
    echo "tailscale=1 was requested, but no Tailscale IPv4 address was detected. Falling back to $gui_listen_address." >&2
    return
  fi

  gui_listen_address="$tailscale_ip:8384"
  gui_url="http://$gui_listen_address/"
  echo "Detected Tailscale GUI listen address: $gui_listen_address"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

remove_user_crontab_entry() {
  existing_crontab="$(crontab -l 2>/dev/null || true)"

  if [ -z "$existing_crontab" ]; then
    return
  fi

  filtered_crontab="$(printf '%s\n' "$existing_crontab" | grep -Fv "$launcher_path" || true)"

  if [ "$filtered_crontab" = "$existing_crontab" ]; then
    return
  fi

  if [ -n "$filtered_crontab" ]; then
    printf '%s\n' "$filtered_crontab" | crontab -
  else
    crontab -r
  fi

  echo "Removed existing user crontab startup entry for Syncthing."
}

resolve_user_home() {
  user_name="$1"
  pw usershow -n "$user_name" 2>/dev/null | awk -F: 'NR==1 { print $9 }'
}

stop_user_process_if_present() {
  user_name="$1"

  if command -v pkill >/dev/null 2>&1; then
    if pkill -u "$user_name" -x syncthing >/dev/null 2>&1; then
      echo "Stopped existing user-mode Syncthing process for $user_name."
    fi
  fi
}

disable_matching_system_service_if_present() {
  if [ ! -f "/usr/local/etc/rc.d/syncthing" ]; then
    return
  fi

  if ! command -v service >/dev/null 2>&1 || ! command -v sysrc >/dev/null 2>&1; then
    echo "Detected existing FreeBSD rc.d service, but service/sysrc is unavailable so it cannot be disabled automatically." >&2
    exit 1
  fi

  echo "Detected existing rc.d service syncthing; disabling it before switching to user mode..."
  service syncthing stop >/dev/null 2>&1 || true
  sysrc syncthing_enable=NO >/dev/null 2>&1 || true
  echo "Disabled existing rc.d service syncthing."
}

disable_matching_user_mode_if_present() {
  target_user="$1"
  target_home="$2"
  target_launcher_dir="$target_home/.local/bin"
  target_launcher_path="$target_launcher_dir/syncthing-start"
  target_state_dir="$target_home/.local/state/syncthing"
  target_pid_path="$target_state_dir/syncthing.pid"

  echo "Checking for existing FreeBSD user-mode Syncthing install before switching to system service..."

  if [ -f "$target_pid_path" ]; then
    existing_pid="$(cat "$target_pid_path" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      kill "$existing_pid" >/dev/null 2>&1 || true
      sleep 1
      echo "Stopped existing user launcher process (pid $existing_pid)."
    fi
    rm -f "$target_pid_path"
    echo "Removed previous user-mode pid file."
  fi

  stop_user_process_if_present "$target_user"

  if [ -f "$target_launcher_path" ]; then
    rm -f "$target_launcher_path"
    echo "Removed previous user launcher script at $target_launcher_path."
  fi

  if command -v crontab >/dev/null 2>&1; then
    target_crontab="$(crontab -u "$target_user" -l 2>/dev/null || true)"

    if [ -n "$target_crontab" ]; then
      filtered_crontab="$(printf '%s\n' "$target_crontab" | grep -Fv "$target_launcher_path" || true)"

      if [ "$filtered_crontab" != "$target_crontab" ]; then
        if [ -n "$filtered_crontab" ]; then
          printf '%s\n' "$filtered_crontab" | crontab -u "$target_user" -
        else
          crontab -u "$target_user" -r
        fi

        echo "Removed previous user crontab startup entry for $target_user."
      fi
    fi
  fi
}

write_launcher() {
  state_dir="$1"
  log_path="$2"

  mkdir -p "$state_dir" "$launcher_dir"

  cat > "$launcher_path" <<EOF
#!/usr/bin/env sh
exec "$syncthing_bin" serve --no-browser --no-restart --home "$state_dir" --gui-address "$gui_listen_address" >> "$log_path" 2>&1
EOF
  chmod 755 "$launcher_path"
}

start_process_now() {
  state_dir="$1"
  log_path="$2"
  pid_path="$3"

  write_launcher "$state_dir" "$log_path"

  if [ -f "$pid_path" ]; then
    existing_pid="$(cat "$pid_path" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      kill "$existing_pid" 2>/dev/null || true
      sleep 1
    fi
  fi

  nohup "$launcher_path" >/dev/null 2>&1 &
  echo $! > "$pid_path"
}

wait_and_open_browser() {
  if [ "$open_browser" != "1" ]; then
    return
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    open_command="xdg-open"
  elif command -v open >/dev/null 2>&1; then
    open_command="open"
  else
    return
  fi

  attempt=0
  while [ "$attempt" -lt 20 ]; do
    if fetch -qo /dev/null "$gui_url" >/dev/null 2>&1; then
      nohup "$open_command" "$gui_url" >/dev/null 2>&1 &
      return
    fi

    attempt=$((attempt + 1))
    sleep 1
  done
}

wait_for_local_health() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if fetch -qo- "\${gui_url%/}/rest/noauth/health" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"OK"'; then
      return 0
    fi

    attempt=$((attempt + 1))
    sleep 1
  done

  return 1
}

install_user_crontab_entry() {
  reboot_entry="@reboot $launcher_path"
  existing_crontab="$(crontab -l 2>/dev/null || true)"

  if printf '%s\n' "$existing_crontab" | grep -Fqx "$reboot_entry"; then
    return
  fi

  {
    printf '%s\n' "$existing_crontab"
    printf '%s\n' "$reboot_entry"
  } | awk 'NF { print }' | crontab -
}

write_service_rc() {
  service_user="$service_user_override"

  if [ -z "$service_user" ] && [ -n "\${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    service_user="$SUDO_USER"
  fi

  if [ -z "$service_user" ]; then
    echo "FreeBSD mode=service requires service_user or sudo preserving the login user." >&2
    exit 1
  fi

  if ! id "$service_user" >/dev/null 2>&1; then
    echo "service_user does not exist: $service_user" >&2
    exit 1
  fi

  service_group="$(id -gn "$service_user")"
  service_home="$(resolve_user_home "$service_user")"

  if [ -z "$service_home" ]; then
    echo "Failed to resolve home directory for $service_user" >&2
    exit 1
  fi

  service_rc_path="/usr/local/etc/rc.d/syncthing"
  service_exec_dir="/usr/local/libexec/syncthing-installer"
  service_exec_bin="$service_exec_dir/syncthing"
  service_state_dir="$service_home/.local/state/syncthing"
  service_log_path="/var/log/syncthing.log"
  service_pid_path="/var/run/syncthing.pid"

  disable_matching_user_mode_if_present "$service_user" "$service_home"

  mkdir -p "$install_dir" "$service_exec_dir" "$service_state_dir"
  install -m 755 "$syncthing_bin" "$service_exec_bin"
  chown -R root:wheel "$install_dir" "$service_exec_dir"
  chown -R "$service_user:$service_group" "$service_state_dir"
  touch "$service_log_path"
  chown "$service_user:$service_group" "$service_log_path"

  cat > "$service_rc_path" <<'EOF'
#!/bin/sh
# PROVIDE: syncthing
# REQUIRE: DAEMON
# KEYWORD: shutdown

. /etc/rc.subr

name=syncthing
rcvar=syncthing_enable
start_cmd="syncthing_start"
stop_postcmd="syncthing_cleanup"

load_rc_config syncthing
: \${syncthing_enable:=NO}
: \${syncthing_home:=__SERVICE_STATE_DIR__}
: \${syncthing_log_file:=__SERVICE_LOG_PATH__}
: \${syncthing_user:=__SERVICE_USER__}
syncthing_group=\${syncthing_group:-__SERVICE_GROUP__}
syncthing_gui_address='__GUI_LISTEN_ADDRESS__'

command=__SERVICE_EXEC_BIN__
pidfile=__SERVICE_PID_PATH__
syncthing_cmd=serve
syncthing_flags="--no-browser --no-restart --home=\${syncthing_home} --logfile=\${syncthing_log_file} --gui-address=\${syncthing_gui_address}"

syncthing_start() {
    echo "Starting syncthing"
  touch \${pidfile} && chown \${syncthing_user}:\${syncthing_group} \${pidfile}
  touch \${syncthing_log_file} && chown \${syncthing_user}:\${syncthing_group} \${syncthing_log_file}
  /usr/sbin/daemon -cf -p \${pidfile} -u \${syncthing_user} \${command} \${syncthing_cmd} \${syncthing_flags}
}

syncthing_cleanup() {
  [ -f \${pidfile} ] && rm -f \${pidfile}
}

run_rc_command "$1"
EOF
  sed -i '' \
    -e "s|__SERVICE_STATE_DIR__|$service_state_dir|g" \
    -e "s|__SERVICE_LOG_PATH__|$service_log_path|g" \
    -e "s|__SERVICE_USER__|$service_user|g" \
    -e "s|__SERVICE_GROUP__|$service_group|g" \
    -e "s|__GUI_LISTEN_ADDRESS__|$gui_listen_address|g" \
    -e "s|__SERVICE_EXEC_BIN__|$service_exec_bin|g" \
    -e "s|__SERVICE_PID_PATH__|$service_pid_path|g" \
    "$service_rc_path"
  chmod 755 "$service_rc_path"

  sysrc syncthing_enable=YES >/dev/null
  sysrc syncthing_user="$service_user" >/dev/null
  sysrc syncthing_group="$service_group" >/dev/null
  sysrc syncthing_home="$service_state_dir" >/dev/null
  sysrc syncthing_log_file="$service_log_path" >/dev/null
  service syncthing restart || service syncthing start

  echo "Installed FreeBSD rc.d service: syncthing (${freebsdInstallerRevision})"
  echo "rc.conf flag: syncthing_enable=YES"
  echo "log file: $service_log_path"
}

validate_mode_prerequisites() {
  case "$mode_name" in
    default|startup)
      if [ "$(id -u)" -eq 0 ]; then
        echo "FreeBSD mode=$mode_name should run as a regular user, not root." >&2
        exit 1
      fi
      ;;
    service)
      if [ "$(id -u)" -ne 0 ]; then
        echo "FreeBSD mode=service requires root. Use curl -fsSL <install URL> | sudo sh and optionally append &service_user=<username>." >&2
        exit 1
      fi
      ;;
  esac
}

echo "Installing Syncthing (${options.variantLabel}) to $install_dir"

validate_host_os
configure_gui_address

require_command tar
require_command install
require_command fetch
require_command pw

if [ "$mode_name" = "startup" ]; then
  require_command crontab
fi

if [ "$mode_name" = "service" ]; then
  require_command service
  require_command sysrc
fi

validate_mode_prerequisites

mkdir -p "$install_dir" "$extract_root"
fetch -o "$archive_path" "$download_url"
tar -xzf "$archive_path" -C "$extract_root"

extract_source_dir="$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "$extract_source_dir" ]; then
  extract_source_dir="$extract_root"
fi

cp -R "$extract_source_dir"/. "$install_dir"

syncthing_bin="$install_dir/syncthing"

if [ ! -f "$syncthing_bin" ]; then
  syncthing_bin="$(find "$install_dir" -type f -name syncthing | head -n 1)"
fi

if [ -z "$syncthing_bin" ] || [ ! -f "$syncthing_bin" ]; then
  echo "syncthing binary not found after extraction" >&2
  exit 1
fi

chmod 755 "$syncthing_bin"

case "$mode_name" in
  default)
    state_dir="\${XDG_STATE_HOME:-$HOME/.local/state}/syncthing"
    log_path="$state_dir/syncthing.log"
    pid_path="$state_dir/syncthing.pid"
    disable_matching_system_service_if_present
    remove_user_crontab_entry
    start_process_now "$state_dir" "$log_path" "$pid_path"
    if wait_for_local_health; then
      echo "Syncthing health check passed at ${options.guiURL}."
    else
      echo "Syncthing process was started, but the local health check did not return OK within 30 seconds. Check $log_path for details." >&2
    fi
    wait_and_open_browser
    echo "Syncthing started for the current user. It will not auto-start after reboot in mode=default."
    ;;
  startup)
    state_dir="\${XDG_STATE_HOME:-$HOME/.local/state}/syncthing"
    log_path="$state_dir/syncthing.log"
    pid_path="$state_dir/syncthing.pid"
    disable_matching_system_service_if_present
    start_process_now "$state_dir" "$log_path" "$pid_path"
    install_user_crontab_entry
    if wait_for_local_health; then
      echo "Syncthing health check passed at ${options.guiURL}."
    else
      echo "Syncthing process was started, but the local health check did not return OK within 30 seconds. Check $log_path for details." >&2
    fi
    wait_and_open_browser
    echo "Installed a user crontab @reboot entry for Syncthing."
    ;;
  service)
    write_service_rc
    ;;
  *)
    echo "unsupported freebsd mode: $mode_name" >&2
    exit 1
    ;;
esac

echo "FreeBSD installer for ${options.variantLabel} finished."
`
}
