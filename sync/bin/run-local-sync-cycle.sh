#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

/bin/bash "$script_dir/fetch-assets-local.sh"
/bin/bash "$script_dir/publish-assets-local.sh"