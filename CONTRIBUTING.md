# Contributing

boat-keep should stay small: a bash script on your laptop, a bash script and a systemd unit on the sandbox, and CRIU doing the hard part. Changes that keep it that way are the easiest to merge.

## Bugs

Open a [bug report](https://github.com/pcstyleorg/boat-keep/issues/new?template=bug_report.yml) with:

- what you ran, and what happened (fork, stop, reboot, resize...)
- what was running in tmux
- `boat-keep status <id>`
- the service log: `boat ssh <id> 'journalctl -u boat-keep --no-pager | tail -100'`

## Features

For anything bigger than a small fix, open a [feature request](https://github.com/pcstyleorg/boat-keep/issues/new?template=feature_request.yml) first so we can agree on it before you build it.

## Pull requests

Keep each PR to one change. Before opening it, run the same checks CI runs:

```sh
f="boat-keep install.sh agent/boat-keep-agent agent/install.sh agent/pre-stop test/run.sh"
bash -n $f && shellcheck -S warning $f
```

If you touched saving, restoring, setup or the fork flow, also run the end-to-end test:

```sh
test/run.sh   # ~40 minutes, a few cents on your own boat account
```

CI can't run it because it needs a boat account and costs money. If you can't run it, say so in the PR.

## Style

- Bash with `set -euo pipefail`. No new laptop dependencies beyond bash, python3 and boat.
- Error messages say what broke and what to run next.
- Comments explain why, especially anything you learned the hard way about boat or CRIU.

Contributions are MIT-licensed, and the [Code of Conduct](CODE_OF_CONDUCT.md) applies.
