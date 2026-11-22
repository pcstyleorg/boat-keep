#!/usr/bin/env bash
# Installs the boat-keep CLI on your laptop. Run it again to update.
#
#   curl -fsSL https://raw.githubusercontent.com/pcstyleorg/boat-keep/main/install.sh | bash
#
# BOAT_KEEP_DIR (default ~/.local/share/boat-keep) holds the files; BOAT_KEEP_BIN (default
# ~/.local/bin) gets the boat-keep command. BOAT_KEEP_REF picks a branch or tag (default main).
set -euo pipefail

main() { # everything runs from here, so a cut-off download runs nothing
  local dir=${BOAT_KEEP_DIR:-$HOME/.local/share/boat-keep}
  local bin=${BOAT_KEEP_BIN:-$HOME/.local/bin}
  local ref=${BOAT_KEEP_REF:-main}
  local url=https://codeload.github.com/pcstyleorg/boat-keep/tar.gz/$ref
  local cmd tmp

  for cmd in curl tar python3; do
    command -v "$cmd" >/dev/null || { echo "boat-keep: needs $cmd" >&2; exit 1; }
  done

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$url" | tar -xzf - -C "$tmp" --strip-components 1
  [ -x "$tmp/boat-keep" ] || { echo "boat-keep: $url has no boat-keep" >&2; exit 1; }

  mkdir -p "$(dirname "$dir")" "$bin"
  rm -rf "$dir"
  mv "$tmp" "$dir"
  trap - EXIT
  ln -sfn "$dir/boat-keep" "$bin/boat-keep"

  echo "boat-keep installed: $bin/boat-keep"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) echo "add $bin to your PATH:  export PATH=\"$bin:\$PATH\"" ;;
  esac
  command -v boat >/dev/null || echo "boat-keep runs on the boat CLI, which isn't installed yet: https://boat.dev"
  echo "next: boat-keep setup <sandbox-id>"
}

main "$@"
