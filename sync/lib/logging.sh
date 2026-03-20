log_info() {
  printf '[INFO] %s\n' "$*"
}

log_error() {
  printf '[ERROR] %s\n' "$*" >&2
}