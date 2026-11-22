#!/usr/bin/env bash
# Installs boat-keep on this sandbox. `boat-keep setup` runs it as root from the unpacked agent/ folder.
set -euo pipefail
d=$1

if ! command -v criu >/dev/null; then
  add-apt-repository -y ppa:criu/ppa >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y criu >/dev/null 2>&1
fi
command -v zstd >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y zstd >/dev/null 2>&1
# CRIU can't checkpoint io_uring; with it off, node (libuv) and others use epoll.
echo kernel.io_uring_disabled=2 > /etc/sysctl.d/99-boat-keep.conf
sysctl -q -w kernel.io_uring_disabled=2

install -m 755 "$d/boat-keep-agent" /usr/local/sbin/boat-keep-agent
install -m 644 "$d/boat-keep.service" /etc/systemd/system/boat-keep.service
systemctl daemon-reload
systemctl enable -q boat-keep
# Restart, so a running loop picks up a new agent. The kept processes stay (KillMode=process).
systemctl restart boat-keep
# Processes started from now on get PIDs no boot reaches (see raise_pid_counter).
/usr/local/sbin/boat-keep-agent raise-pids

# boat doesn't shut the OS down on a stop; it runs ~/.boat/pre-stop (on boat stop and auto-stop,
# before the last snapshot) and nothing else.
hook=/home/user/.boat/pre-stop
if [ -e "$hook" ] && ! grep -q boat-keep "$hook"; then
  # shellcheck disable=SC2088 # a literal ~ for the reader
  echo "~/.boat/pre-stop is yours, so it was left alone. Add this line to it:"
  echo "  sudo -n /usr/local/sbin/boat-keep-agent checkpoint"
else
  install -d -o user -g user /home/user/.boat
  install -m 755 -o user -g user "$d/pre-stop" "$hook"
fi

# On a new sandbox, processes started before boat has moved the disk in can't be kept.
/usr/local/sbin/boat-keep-agent wait-disk
echo "criu $(criu --version | awk '/Version/ {print $2}'), service $(systemctl is-active boat-keep)"
