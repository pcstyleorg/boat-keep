# boat-keep

Keep a [boat.dev](https://boat.dev) sandbox's running processes when it's forked, stopped, rebooted or resized.

A boat fork copies the disk. Everything you started by hand is gone on the copy: the dev server, the tmux session, the agent halfway through a task. boat-keep checkpoints them with [CRIU](https://criu.org) and brings them back on the next boot, memory included.

```sh
boat-keep setup bx_123                 # once: installs CRIU and the boat-keep service
boat ssh bx_123                        # start your work inside tmux, as usual
fork=$(boat-keep fork bx_123)          # ~15 s; the fork has the same tmux, shells and servers
boat ssh -t "$fork" tmux attach
```

## Install

```sh
git clone https://github.com/pc-style/boat-keep
ln -s "$PWD/boat-keep/boat-keep" /usr/local/bin/boat-keep   # or any folder on your PATH
boat-keep setup <sandbox-id>
```

`boat-keep` finds its `agent/` folder through the symlink, so keep the clone. `setup` installs CRIU and the service on that one sandbox; forks and snapshots of it already have them.

## Requirements

- **Laptop:** macOS or Linux with bash, python3, and the [boat CLI](https://boat.dev), logged in.
- **Sandbox:** a boat sandbox on its default Ubuntu image (setup uses passwordless sudo and installs CRIU 4.x from `ppa:criu/ppa`). Your processes run inside tmux as user `user`, started after `setup`.

## What it keeps

The tmux server of user `user` and every process in it. Change that in `/etc/boat-keep.conf` (`KEEP_USER`, `ROOT`, `INTERVAL`).

## When it brings them back

A service on the sandbox (`boat-keep.service`) restores the last checkpoint at every boot. Checkpoints happen on `boat stop` and auto-stop (through boat's `~/.boat/pre-stop` hook), at OS shutdown, and every 5 minutes.

| Event | Command | What comes back |
| --- | --- | --- |
| Fork | `boat-keep fork <id>` | Everything, as of the fork |
| Fork to another size | `boat-keep fork <id> -- --type large` | Everything, as of the fork |
| Resize in place | `boat-keep resize <id> large` | Everything; bigger and smaller both work |
| Stop / resume | `boat-keep stop`, `boat-keep resume` | Everything, as of the stop |
| Plain `boat stop` / `boat resume`, any time later | none | Everything: the pre-stop hook checkpoints it |
| Plain `boat stop`, then `boat fork` | none | Everything: the pre-stop hook checkpoints it |
| Auto-stop | none | Everything: the pre-stop hook checkpoints it |
| Reboot | `sudo reboot` in the sandbox | Everything: the shutdown checkpoints it |
| Kernel crash, `boat stop --force` | none | The last checkpoint (up to 5 min old; `boat-keep checkpoint` makes one now) |
| Plain `boat fork` of a running sandbox | none | The last checkpoint (up to 5 min old; not in the test run) |
| Saved snapshot | `boat-keep save <id> <name>`, then `boat new --from <name>` | Everything, as of the save |

A resume within 10 minutes of a stop usually gets the same machine back with everything still running, so boat-keep restores nothing; later resumes boot a new machine and boat-keep restores. Quit tmux and nothing is kept.

All 16 scenarios pass on real sandboxes: [test/RESULTS.md](test/RESULTS.md), from `test/run.sh` (about 40 minutes, a few cents). Each check asks the server once before the event and needs its very next answer after it, so a pass means the memory from right before the event, not an older checkpoint.

## How

- **Laptop:** `boat-keep` is bash over `boat ssh`. `fork` checkpoints, stops the source (a stop snapshots in seconds, `boat snapshot` takes about 2 minutes), forks, resumes the source, and waits for both to finish their boot restore.
- **Sandbox:** `boat-keep-agent` runs `criu dump --leave-running` on the tree and moves it into the service's cgroup, so systemd checkpoints it at shutdown before tearing down the user's session. `boat stop` doesn't shut the OS down at all, so setup also installs `~/.boat/pre-stop`, which boat runs before the stop's last snapshot (it leaves an existing pre-stop of yours alone and tells you the line to add). At boot it runs `criu restore` before ssh accepts logins, so nothing else takes the kept PIDs.
- **Details that took debugging:**
  - **io_uring:** CRIU can't checkpoint it, and node 24 opens rings even with `UV_USE_IO_URING=0`. `setup` sets `kernel.io_uring_disabled=2`; a checkpoint names any process that still holds a ring.
  - **Attached tmux clients:** CRIU can't checkpoint the tmux server while a client outside it is connected. Each client detaches for the checkpoint (under a second) and reattaches itself 2 s later.
  - **Socket folders:** `/tmp/tmux-1000` is gone after a boot, so each checkpoint records the folders its unix sockets live in and restore recreates them.
  - **Lazy disk on forks:** a fork boots with `/home/user`, `/usr` and `/etc` served over FUSE while boat copies them in, then swaps in the real disk. Restoring before the swap leaves processes writing into the retired copy, and the next fork can't restore them. Restore waits for the swap (a few seconds), and a checkpoint refuses processes still holding files in the old copy.
  - **PIDs:** CRIU gives processes their old PIDs back. A fork's boot took a kept PID once (it uses a few thousand, and the count varies), so setup and every boot restore raise the PID counter to 1,000,000.
  - **Open TCP connections:** restored closed, since the peer or this machine's address may be gone.

## Limits

- io_uring off costs some I/O speed.
- Restore needs the original PIDs free. Setup moves new PIDs up to 1,000,000, beyond anything a boot uses, so start the processes you want kept after setup.
- Not covered: Docker containers, GPU or desktop processes, processes outside the kept tree.
- `boat-keep fork` stops the source for a few seconds.

## Files

- `boat-keep`: the laptop CLI
- `agent/`: what `setup` installs on the sandbox
- `test/`: the end-to-end test and its last results
- `FINDINGS.md`: notes from the first CRIU probe
- `reel/`: the demo video and the scene it's rendered from

## Contributing

Bug reports, ideas and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as [SECURITY.md](SECURITY.md) describes.

## License

[MIT](LICENSE)
