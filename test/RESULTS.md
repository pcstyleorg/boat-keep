# boat-keep test results

2026-11-22 21:49 UTC, `test/run.sh` on boat.dev, `small` sandboxes. Workload: tmux with `node counter.js` (pid 1000175), a bash with `$MARK` set, and `node heap.js 512` (a 512 MB heap). "hits N → N+1" means the server kept its memory from right before the event.

| Scenario | Sandbox | Machine | Server | Shell var | boat-keep at boot | Result |
| --- | --- | --- | --- | --- | --- | --- |
| boat-keep fork: the fork | bx_mwut28j4 | cold (new boot) | same pid + secret, hits 4 → 5 | yes | restored 4 processes from a checkpoint 29s old | PASS |
| boat-keep fork: the source | bx_v5jwn5gu | warm (same boot) | same pid + secret, hits 4 → 5 | yes | nothing to restore | PASS |
| boat-keep fork --live: the fork | bx_4gh25c56 | cold (new boot) | same pid + secret, hits 6 → 7 | yes | restored 4 processes from a checkpoint 52s old | PASS |
| boat-keep fork --live: the source (never stopped) | bx_v5jwn5gu | warm (same boot) | same pid + secret, hits 6 → 7 | yes | nothing to restore | PASS |
| fork to a bigger size (small → default) | bx_mg8zxnd8 | cold (new boot) | same pid + secret, hits 8 → 9 | yes | restored 4 processes from a checkpoint 19s old | PASS |
| resize in place (small → default) | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 9 → 10 | yes | restored 4 processes from a checkpoint 20s old | PASS |
| resize in place (default → small) | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 11 → 12 | yes | restored 4 processes from a checkpoint 18s old | PASS |
| fork of a fork | bx_e26bpyqv | cold (new boot) | same pid + secret, hits 6 → 7 | yes | restored 4 processes from a checkpoint 16s old | PASS |
| reboot inside the sandbox | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 13 → 14 | yes | restored 4 processes from a checkpoint 11s old | PASS |
| boat-keep stop + resume | bx_v5jwn5gu | warm (same boot) | same pid + secret, hits 15 → 16 | yes | restored 4 processes from a checkpoint 11s old | PASS |
| plain boat stop + resume | bx_v5jwn5gu | warm (same boot) | same pid + secret, hits 17 → 18 | yes | restored 4 processes from a checkpoint 11s old | PASS |
| kernel crash (sysrq c), restart after a checkpoint | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 19 → 20 | yes | restored 4 processes from a checkpoint 11s old | PASS |
| boat stop --force + resume, after a checkpoint | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 21 → 22 | yes | restored 4 processes from a checkpoint 122s old | PASS |
| plain boat stop + boat fork | bx_btb78rcn | cold (new boot) | same pid + secret, hits 23 → 24 | yes | restored 4 processes from a checkpoint 25s old | PASS |
| auto-stop + resume | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 24 → 25 | yes | restored 4 processes from a checkpoint 22s old | PASS |
| boat new --from a saved snapshot | bx_8xf3cnh5 | cold (new boot) | same pid + secret, hits 26 → 27 | yes | restored 4 processes from a checkpoint 153s old | PASS |
| stop, resume after 11 min | bx_v5jwn5gu | cold (new boot) | same pid + secret, hits 27 → 28 | yes | restored 4 processes from a checkpoint 682s old | PASS |
| quit tmux, then reboot | bx_e26bpyqv | cold (new boot) | not running | no | nothing to restore | PASS |
