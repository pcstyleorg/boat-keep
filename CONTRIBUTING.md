# Contributing

Thanks for helping. boat-keep is meant to stay small: a bash CLI on your laptop, one agent script and a systemd unit on the sandbox, and CRIU doing the real work. Changes that keep it that way are the easiest to merge.

## Reporting a bug

Open a [bug report](https://github.com/pcstyleorg/boat-keep/issues/new?template=bug_report.yml). The most useful things to include:

- the command you ran and the event (fork, stop, resume, reboot, resize, auto-stop, `boat new --from`)
- `boat-keep status <id>` from the sandbox that lost its processes
- the service log: `boat ssh <id> 'journalctl -u boat-keep --no-pager | tail -100'` (checkpoints and the boot restore)
- what was running in tmux (node, python, a database, an agent…)

Security problems go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Proposing a feature

Open a [feature request](https://github.com/pcstyleorg/boat-keep/issues/new?template=feature_request.yml) first for anything bigger than a small fix, so we can agree on the shape before you write it.

## Pull requests

1. Keep each PR to one change, and say in the description which events it affects.
2. Run the static checks; CI runs the same ones:

   ```sh
   bash -n boat-keep install.sh agent/boat-keep-agent agent/install.sh agent/pre-stop test/run.sh
   shellcheck -S warning boat-keep install.sh agent/boat-keep-agent agent/install.sh agent/pre-stop test/run.sh
   ```

3. If you changed checkpoint, restore, setup or the fork flow, run the end-to-end test and say which scenarios you ran:

   ```sh
   test/run.sh   # about 40 minutes, creates and deletes sandboxes on your personal boat account (a few cents)
   ```

   CI doesn't run it, because it needs a boat account and costs money. If you can't run it, say so in the PR and the maintainer will.

4. Update the README table if what comes back after an event changes.

## Style

- Bash with `set -euo pipefail`, no new runtime dependencies on the laptop beyond bash, python3 and the boat CLI.
- Error messages say what failed and the command that fixes or explains it.
- Comments explain why, especially for behaviour learned by debugging boat or CRIU.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
