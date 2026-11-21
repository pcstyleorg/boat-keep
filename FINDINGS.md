# boat-keep: CRIU feasibility probe (2026-11-20)

Verdict: works. A cold-booted fork restored a live tmux + node process tree with its memory intact.

## Environment

- Sandbox `small`, Ubuntu 24.04.4, kernel 6.8.0-117-generic, KVM, `machineProvider: baremetal`.
- Root through passwordless sudo. `CONFIG_CHECKPOINT_RESTORE=y`, `MEM_SOFT_DIRTY`, `USERFAULTFD` on; `*_DIAG` as modules.
- CRIU isn't in Ubuntu 24.04's archive: `sudo add-apt-repository -y ppa:criu/ppa && sudo apt-get install -y criu` gives CRIU 4.3. `criu check` passes.

## What happened

| Step | Result |
| --- | --- |
| Dump node 24 (libuv 1.52) | Fails: `Unknown shit 600 (anon_inode:[io_uring])`. Node opens 3 io_uring rings. |
| `UV_USE_IO_URING=0` | Not enough: the rings still open (env var confirmed in /proc/<pid>/environ). |
| `sysctl -w kernel.io_uring_disabled=2`, then start the processes | Dump of the tmux server tree works, 13 MB image. |
| `boat stop` → `boat resume` (waited for `stopped`) | Same boot_id and uptime; a hand-started node server kept its PID and memory. **boat already resumes warm**, despite the docs saying hand-started processes don't come back. Untested: a long stop, or a resume on another host. |
| `boat fork` | Cold boot: new boot_id, no processes, the sysctl is back to 0, the CRIU image is on disk. |
| `criu restore` on the fork | Fails first: `/tmp/tmux-1000/default` can't bind, because /tmp is fresh. After `install -d -m 700 /tmp/tmux-1000` it works: same PIDs, node's in-memory secret and hit counter continue, the tmux scrollback and a bash `$MARK` variable are intact. |

## Commands that worked

```sh
sudo sysctl -w kernel.io_uring_disabled=2          # before starting the processes to keep
sudo criu dump -t "$(pgrep -x 'tmux: server')" -D /var/lib/boat-keep/img \
  --tcp-established --file-locks -v2 -o dump.log  # stops the tree
# on the fork / after a cold boot:
install -d -m 700 /tmp/tmux-1000
sudo criu restore -D /var/lib/boat-keep/img --tcp-established --file-locks -d -v2 -o restore.log
```

## What this means for the pitch

- Stop/resume is already warm on boat (at least short stops), so "survive stop/resume" is weaker than expected.
- The strong demo is **live fork**: fork a sandbox *with its running dev server, tmux and agent session*, not just its disk. Today a fork loses every process (docs: only enabled systemd services come back).

## Snapshot timing (for the fork)

- `boat fork` uses the latest snapshot; a brand-new sandbox has none (`fork_failed`, 409).
- `boat snapshot <id> <name>` captures the current disk but took ~2m05s, twice in a row (not incremental).
- `boat stop` snapshots in ~6 s, and the fork then has the fresh dump. v1 uses stop → fork → resume: 12–13 s end to end.

## Problems boat-keep has to solve

1. io_uring: set `kernel.io_uring_disabled=2` at boot (sysctl.d) so processes never hold rings, or detect them and say which process blocks the dump. Costs some I/O performance; say so.
2. Recreate folders for unix sockets and other paths under /tmp (read them from the images, `crit`).
3. PID clashes after a cold boot: restore needs the original PIDs free. Worked here (low PIDs on a fresh boot); consider PID namespaces or `--pidfile`-based retries.
4. Dump kills the source tree by default: use `--leave-running` when forking so the original keeps running.
5. Snapshot timing: the fork must come from a disk snapshot taken after the dump (`sync`, check `snapshotCompletedAt`).
6. Docker containers, established TCP to the outside, GPU/desktop processes: out of scope for v1.
