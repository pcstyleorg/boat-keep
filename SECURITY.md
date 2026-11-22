# Security

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/pc-style/boat-keep/security/advisories/new), not in a public issue or pull request. Include what an attacker could do, the steps to reproduce, and the boat-keep commit you tested.

You'll get an answer within 7 days. Once a fix is out, the advisory is published with credit to you unless you'd rather stay anonymous.

Problems in boat.dev itself go to boat, and problems in CRIU go to the [CRIU project](https://github.com/checkpoint-restore/criu/security).

## What boat-keep trusts

boat-keep runs as root on your sandbox and handles copies of your processes' memory, so these are worth knowing before you report:

- Checkpoints contain everything your kept processes had in memory, including secrets and tokens. They live on the sandbox disk under `/var/lib/boat-keep`, owned by root. Anyone who can use the sandbox, or a fork or snapshot of it, can read them, the same way they can read the rest of the disk.
- `setup` installs `/usr/local/sbin/boat-keep-agent` and a `~/.boat/pre-stop` hook that runs it with `sudo -n`. It adds no sudo rules: it relies on the passwordless sudo boat sandboxes already give user `user`.
- The laptop CLI only runs `boat` commands; it sends nothing anywhere else.

## Supported versions

Only the latest commit on `main` gets fixes.
