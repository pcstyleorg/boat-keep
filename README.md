# boat-keep

When you fork a [boat.dev](https://boat.dev) sandbox, you get the files but not what was running. Your dev server, your tmux session, the agent halfway through a task: gone.

boat-keep fixes that. It saves the running processes with [CRIU](https://criu.org) and puts them back on the fork, memory included. Same PIDs, same state, they just keep going. It also works for stop/resume, reboot and resize.

```sh
boat-keep setup bx_123              # once per sandbox
boat ssh bx_123                     # work inside tmux like you normally do
fork=$(boat-keep fork bx_123)       # about 15 seconds
boat ssh -t "$fork" tmux attach     # everything is still running
```

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/pcstyleorg/boat-keep/main/install.sh | bash
```

Or `npm i -g boat-keep`, or `bunx boat-keep <command>`.

You need bash, python3 and the [boat CLI](https://boat.dev) (logged in) on your laptop. The sandbox should be on boat's default Ubuntu image.

Then run `boat-keep setup <sandbox-id>` once. It installs CRIU and a small service on that sandbox. Forks and snapshots of it inherit both, so you don't run setup again.

## Commands

| Command | What it does |
| --- | --- |
| `boat-keep setup <id>` | Install boat-keep on a sandbox |
| `boat-keep fork <id>` | Fork with everything running. Add `-- --type large` to fork to another size |
| `boat-keep stop <id>` / `resume <id>` | Stop and resume without losing anything |
| `boat-keep resize <id> <size>` | Change size in place |
| `boat-keep save <id> <name>` | Save a snapshot for `boat new --from <name>` |
| `boat-keep checkpoint <id>` | Save the processes right now |
| `boat-keep status <id>` | Show what's kept and how the last boot went |

## From code

The same commands are a library, on top of boat's API ([`@boatdev/sdk`](https://docs.boat.dev/sdks/overview)). It needs a `BOAT_API_KEY` from the boat dashboard instead of the `boat` CLI.

```ts
import { createBoatKeep } from "boat-keep";

const keep = createBoatKeep({ log: console.log });   // reads BOAT_API_KEY
await keep.setup("bx_123");
const fork = await keep.fork("bx_123", { type: "large" });
console.log(fork.id, fork.status.fork);
```

It has `setup`, `fork`, `stop`, `resume`, `resize`, `save`, `checkpoint` and `status`, and throws `BoatKeepError` when something fails.

## What gets kept

Your tmux session and everything running inside it. Start the things you care about in tmux, after setup. Anything outside tmux isn't kept.

It also works when you don't use boat-keep's commands:

- Plain `boat stop`, auto-stop, `sudo reboot`: saved right before, restored on the next boot.
- Kernel crash or `boat stop --force`: you get the last automatic save, which happens every 5 minutes.
- Plain `boat fork` on a running sandbox: same, the last automatic save.

All 16 scenarios were tested on real sandboxes. Results are in [test/RESULTS.md](test/RESULTS.md).

## Limits

- `boat-keep fork` pauses the source sandbox for a few seconds.
- Setup turns off io_uring, which CRIU can't save. Some I/O gets a bit slower.
- Docker containers, GPU and desktop apps aren't supported.
- Open network connections come back closed.

## How it works

On your laptop, `boat-keep` is a bash script that runs `boat` commands. For a fork it saves the processes, stops the source (a stop snapshots the disk in seconds), forks, and resumes the source.

On the sandbox, a systemd service restores the last save at every boot, before anyone can log in. It saves at shutdown, every 5 minutes, and when boat stops the sandbox (through boat's `~/.boat/pre-stop` hook).

A few things took real debugging to get right:

- **io_uring.** Node 24 uses it even with `UV_USE_IO_URING=0`, so setup disables it system-wide.
- **Attached tmux clients.** CRIU can't save tmux while you're attached, so clients detach for under a second and reattach.
- **Missing folders.** `/tmp/tmux-1000` doesn't exist after a boot, so restore recreates socket folders first.
- **Lazy disk on forks.** A new fork serves its disk over FUSE for a few seconds before swapping in the real one. Restore waits for the swap.
- **PID clashes.** A fresh boot can take a PID a saved process needs, so new PIDs start at 1,000,000.

Settings live in `/etc/boat-keep.conf` on the sandbox: `KEEP_USER`, `ROOT` (the process tree to keep, default `tmux: server`) and `INTERVAL` (seconds between saves, default 300).

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
