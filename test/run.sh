#!/usr/bin/env bash
# End-to-end test on real boat sandboxes (billed to your personal account; all deleted at the end).
#
#   test/run.sh            every scenario, results in test/RESULTS.md (about 40 minutes)
#
# The workload is the one boat-keep exists for: a tmux session with a node server holding state in
# memory (a hit counter and a random secret) and a shell with a variable set. Before each event the
# test asks the server once (hits N); after it, the server must answer with the same pid and secret
# and hits N+1, so it's the state from right before the event, not an older checkpoint.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
KEEP=$HERE/../boat-keep
IDS=$(mktemp); SNAP=boat-keep-test-$$
ROWS=()

log() { printf '\n== %s\n' "$*" >&2; }
cleanup() {
  log "cleanup"
  boat snapshot rm "$SNAP" >/dev/null 2>&1
  while read -r id; do boat delete "$id" --yes --json >/dev/null 2>&1 && echo "deleted $id" >&2; done < "$IDS"
  rm -f "$IDS"
}
trap cleanup EXIT

field() { python3 -c "import json,sys
for line in sys.stdin:
    try: d = json.loads(line)
    except ValueError: continue
    d = d if '$1' in d else d.get('sandbox') or {}
    if '$1' in d: print(d['$1']); break"; }
track() { [ -n "$1" ] && echo "$1" >> "$IDS"; echo "$1"; }
state() { boat info "$1" --json | field state; }
wait_state() { local _; for _ in $(seq 120); do [ "$(state "$1")" = "$2" ] && return 0; sleep 3; done; return 1; }
wait_up() { # ssh answers and the boat-keep service finished its boot restore
  local _; sleep 10
  for _ in $(seq 60); do boat ssh "$1" 'systemctl is-active -q boat-keep' >/dev/null 2>&1 && return 0; sleep 3; done
  return 1
}

# Ask the server once and remember its boot and hit count: after the event it must answer hits+1.
before() {
  local out; out=$(boat ssh "$1" 'cut -c1-8 /proc/sys/kernel/random/boot_id; curl -s -m3 localhost:3000')
  B_BOOT=$(sed -n 1p <<< "$out"); B_HITS=$(sed -n 2p <<< "$out" | field hits)
}

# boot id, the server's answer, the shell's variable, what boat-keep did this boot: always 4 lines
probe() { boat ssh "$1" 'b=$(cut -c1-8 /proc/sys/kernel/random/boot_id); s=$(curl -s -m3 localhost:3000 || echo "{}")
  tmux send-keys -t work:1 "echo MARK=\$MARK" Enter 2>/dev/null; sleep .5
  m=$(tmux capture-pane -p -t work:1 2>/dev/null | grep "^MARK=" | tail -1)
  h=$(sudo boat-keep-agent status 2>/dev/null | sed -n "s/^this boot: //p")
  printf "%s\n%s\n%s\n%s\n" "$b" "$s" "$m" "$h"' 2>/dev/null; }

# check <sandbox> <scenario> [expect: kept|gone]
check() {
  local id=$1 name=$2 expect=${3:-kept} row
  row=$(probe "$id" | python3 -c '
import json, sys
name, id, expect, pid, secret, boot0, hits0 = sys.argv[1:8]
lines = sys.stdin.read().split("\n") + [""] * 4
boot, srv, mark, how = lines[:4]
try: s = json.loads(srv)
except ValueError: s = {}
same = str(s.get("pid")) == pid and s.get("secret") == secret
fresh = same and str(s.get("hits")) == str(int(hits0 or 0) + 1)
if fresh: server = "same pid + secret, hits %s → %s" % (hits0, s["hits"])
elif same: server = "same pid + secret, but hits %s → %s (older state)" % (hits0, s.get("hits"))
else: server = "restarted" if s else "not running"
shell = "yes" if mark == "MARK=still-here" else "no"
ok = (fresh and shell == "yes") if expect == "kept" else not s
print("| %s | %s | %s | %s | %s | %s | %s |" % (name, id, "warm (same boot)" if boot == boot0 else "cold (new boot)",
      server, shell, how or "?", "PASS" if ok else "FAIL"))
' "$name" "$id" "$expect" "$PID" "$SECRET" "$B_BOOT" "$B_HITS")
  echo "$row" >&2
  ROWS+=("$row")
}

log "source sandbox"
S=$(track "$(boat new --personal --type small --no-env --name keep-test --ttl 10800 --json | field id)")
[ -n "$S" ] || exit 1
"$KEEP" setup "$S"
boat scp "$HERE/counter.js" "$S:/home/user/counter.js" >/dev/null
boat ssh "$S" 'tmux new-session -d -s work "node ~/counter.js"; tmux new-window -t work bash; sleep 1
  tmux send-keys -t work:1 "export MARK=still-here" Enter; for i in 1 2; do curl -s localhost:3000 >/dev/null; done'
first=$(boat ssh "$S" 'curl -s localhost:3000')
PID=$(field pid <<< "$first"); SECRET=$(field secret <<< "$first")
echo "workload: pid $PID, secret $SECRET" >&2

log "1 fork"
before "$S"; F1=$(track "$("$KEEP" fork "$S" -- --no-env)"); check "$F1" "boat-keep fork: the fork"; check "$S" "boat-keep fork: the source"

log "2 resize (fork small → default)"
before "$S"; F2=$(track "$("$KEEP" fork "$S" -- --no-env --type default)"); check "$F2" "fork to a bigger size (small → default)"

log "2b resize in place: stop, resume at a bigger size, then back"
before "$S"; "$KEEP" resize "$S" default; check "$S" "resize in place (small → default)"
before "$S"; "$KEEP" resize "$S" small; check "$S" "resize in place (default → small)"

log "3 fork of a fork"
before "$F1"; F3=$(track "$("$KEEP" fork "$F1" -- --no-env)"); check "$F3" "fork of a fork"

log "4 reboot"
before "$S"; boat ssh "$S" 'sudo systemctl reboot' >/dev/null 2>&1; wait_up "$S"; check "$S" "reboot inside the sandbox"

log "5 boat-keep stop / resume"
before "$S"; "$KEEP" stop "$S"; "$KEEP" resume "$S"; check "$S" "boat-keep stop + resume"

log "6 plain boat stop / resume"
before "$S"; boat stop "$S" --json >/dev/null; wait_state "$S" stopped; boat resume "$S" --json >/dev/null; wait_up "$S"
check "$S" "plain boat stop + resume"

log "7 kernel crash: the machine restarts itself, boat-keep restores the last checkpoint"
before "$S"; "$KEEP" checkpoint "$S"
boat ssh "$S" 'sudo sh -c "echo 1 > /proc/sys/kernel/sysrq; sync; echo c > /proc/sysrq-trigger"' >/dev/null 2>&1
sleep 20; wait_up "$S"; check "$S" "kernel crash (sysrq c), restart after a checkpoint"

log "7b boat stop --force: no pre-stop hook, boat falls back to its last minute snapshot"
before "$S"; "$KEEP" checkpoint "$S"; sleep 75
boat stop "$S" --force --json >/dev/null; wait_state "$S" stopped; boat resume "$S" --json >/dev/null; wait_up "$S"
check "$S" "boat stop --force + resume, after a checkpoint"

log "8 plain boat stop + boat fork, no boat-keep command"
before "$S"; boat stop "$S" --json >/dev/null; wait_state "$S" stopped
F4=$(track "$(boat fork "$S" --no-env --json | field id)"); boat resume "$S" --json >/dev/null
wait_up "$F4"; wait_up "$S"; check "$F4" "plain boat stop + boat fork"

log "9 auto-stop"
before "$S"; boat extend "$S" --ttl 30 --json >/dev/null; wait_state "$S" stopped
boat resume "$S" --json >/dev/null; wait_up "$S"; boat extend "$S" --hours 2 --json >/dev/null
check "$S" "auto-stop + resume"

log "10 saved snapshot → boat new --from"
before "$S"; "$KEEP" save "$S" "$SNAP"
F5=$(track "$(boat new --personal --from "$SNAP" --no-env --ttl 3600 --json | field id)"); wait_up "$F5"
check "$F5" "boat new --from a saved snapshot"

log "11 stop, resume 11 minutes later (boat hands out a new machine after 10)"
before "$S"; boat stop "$S" --json >/dev/null; wait_state "$S" stopped; sleep 660
boat resume "$S" --json >/dev/null; wait_up "$S"; boat extend "$S" --hours 1 --json >/dev/null
check "$S" "stop, resume after 11 min"

log "12 nothing kept: the user quit tmux, so nothing may come back"
before "$F3"; boat ssh "$F3" 'tmux kill-server; sudo boat-keep-agent checkpoint; sudo systemctl reboot' >/dev/null 2>&1
wait_up "$F3"; check "$F3" "quit tmux, then reboot" gone

{
  echo "# boat-keep test results"
  echo
  echo "$(date -u '+%Y-%m-%d %H:%M UTC'), \`test/run.sh\` on boat.dev, \`small\` sandboxes. Workload: tmux with \`node counter.js\` (pid $PID) and a bash with \`\$MARK\` set. \"hits N → N+1\" means the server kept its memory from right before the event."
  echo
  echo "| Scenario | Sandbox | Machine | Server | Shell var | boat-keep at boot | Result |"
  echo "| --- | --- | --- | --- | --- | --- | --- |"
  printf '%s\n' "${ROWS[@]}"
} > "$HERE/RESULTS.md"
cat "$HERE/RESULTS.md"
! grep -q '| FAIL |' "$HERE/RESULTS.md"
