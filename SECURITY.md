# Security

Report vulnerabilities [privately on GitHub](https://github.com/pcstyleorg/boat-keep/security/advisories/new), not in a public issue. Say what an attacker could do, how to reproduce it, and which commit you tested. You'll hear back within 7 days, and you get credit in the advisory unless you'd rather not.

Bugs in boat itself go to boat. Bugs in CRIU go to [CRIU](https://github.com/checkpoint-restore/criu/security).

## Good to know

- Saved checkpoints contain your processes' memory, secrets and tokens included. They're stored under `/var/lib/boat-keep`, owned by root. Anyone with access to the sandbox, or a fork or snapshot of it, can read them, just like the rest of the disk.
- The agent runs as root. The `~/.boat/pre-stop` hook calls it with `sudo -n`, using the passwordless sudo boat sandboxes already have. Setup doesn't add sudo rules.
- The laptop script only runs `boat` commands. It doesn't send anything anywhere else.

Only the latest `main` gets fixes.
