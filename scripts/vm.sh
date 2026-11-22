#!/usr/bin/env bash
# Run and test the macOS build in an isolated Tart VM so your own desktop stays usable.
# Usage: scripts/vm.sh <create|start|headless|reset|ssh|test|stop>
set -euo pipefail

VM=wdygdtw-dev
GOLDEN=wdygdtw-golden
IMAGE=ghcr.io/cirruslabs/macos-tahoe-base:latest # brew + CLT (swiftc); Node is installed on first `test`
REPO="$(cd "$(dirname "$0")/.." && pwd)"

cmd=${1:-}
case "$cmd" in
  create) # one-off: pull the base image (~25GB), keep a pristine copy
    tart clone "$IMAGE" "$GOLDEN"
    tart clone "$GOLDEN" "$VM"
    ;;
  start) # opens the VM in its own window; repo is mounted read-write at /Volumes/My Shared Files/project
    tart run "$VM" --dir=project:"$REPO"
    ;;
  headless) # same, without a window; use `ssh`/`test` to drive it
    exec tart run "$VM" --no-graphics --dir=project:"$REPO"
    ;;
  reset) # throw the VM away and go back to the pristine copy
    tart stop "$VM" 2>/dev/null || true
    tart delete "$VM"
    tart clone "$GOLDEN" "$VM"
    ;;
  ssh) # interactive shell in the guest via the Tart guest agent (no password needed)
    tart exec -i -t "$VM" bash -l
    ;;
  test) # build + unit tests inside the guest, copying the repo off the share so node_modules is native
    tart exec "$VM" bash -lc \
      'command -v node >/dev/null || brew install node; rm -rf ~/project && mkdir ~/project && rsync -a --exclude node_modules --exclude dist "/Volumes/My Shared Files/project/" ~/project/ && cd ~/project && npm ci && npm test'
    ;;
  stop)
    tart stop "$VM"
    ;;
  *)
    echo "usage: $0 <create|start|headless|reset|ssh|test|stop>" >&2
    exit 1
    ;;
esac
