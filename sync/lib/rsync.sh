deploy_directory_with_rsync() {
  local source_dir="$1"
  local remote_user="$2"
  local remote_host="$3"
  local remote_path="$4"
  local dry_run="$5"
  local ssh_port="$6"

  local -a ssh_args
  local -a rsync_args

  ssh_args=(-p "$ssh_port")
  rsync_args=(
    -av
    --delete
    --delay-updates
    --safe-links
    -e "ssh ${ssh_args[*]}"
  )

  if [ "$dry_run" = "1" ]; then
    rsync_args+=(--dry-run --itemize-changes)
  fi

  ssh "${ssh_args[@]}" "${remote_user}@${remote_host}" "mkdir -p '$remote_path'"
  rsync "${rsync_args[@]}" "$source_dir"/ "${remote_user}@${remote_host}:${remote_path}/"
}

deploy_directory_locally() {
  local source_dir="$1"
  local target_dir="$2"
  local dry_run="$3"

  local -a rsync_args

  rsync_args=(
    -av
    --delete
    --delay-updates
    --safe-links
  )

  if [ "$dry_run" = "1" ]; then
    rsync_args+=(--dry-run --itemize-changes)
  fi

  mkdir -p "$target_dir"
  rsync "${rsync_args[@]}" "$source_dir"/ "$target_dir"/
}