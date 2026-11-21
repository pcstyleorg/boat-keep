# boat-keep test results

2026-11-21 03:49 UTC, `test/run.sh` on boat.dev, `small` sandboxes. Workload: tmux with `node counter.js` (pid 1000148) and a bash with `$MARK` set. "hits N → N+1" means the server kept its memory from right before the event.

| Scenario | Sandbox | Machine | Server | Shell var | boat-keep at boot | Result |
| --- | --- | --- | --- | --- | --- | --- |
| boat-keep fork: the fork | bx_3dh8khpk | cold (new boot) | same pid + secret, hits 4 → 5 | yes | restored 3 processes from a checkpoint 50s old | PASS |
| boat-keep fork: the source | bx_jk7hsb9q | warm (same boot) | same pid + secret, hits 4 → 5 | yes | nothing to restore | PASS |
| fork to a bigger size (small → default) | bx_z8b3jmyz | cold (new boot) | same pid + secret, hits 6 → 7 | yes | restored 3 processes from a checkpoint 24s old | PASS |
| resize in place (small → default) | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 7 → 8 | yes | restored 3 processes from a checkpoint 28s old | PASS |
| resize in place (default → small) | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 9 → 10 | yes | restored 3 processes from a checkpoint 14s old | PASS |
| fork of a fork | bx_jua7hkgw | cold (new boot) | same pid + secret, hits 6 → 7 | yes | restored 3 processes from a checkpoint 21s old | PASS |
| reboot inside the sandbox | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 11 → 12 | yes | restored 3 processes from a checkpoint 8s old | PASS |
| boat-keep stop + resume | bx_jk7hsb9q | warm (same boot) | same pid + secret, hits 13 → 14 | yes | restored 3 processes from a checkpoint 8s old | PASS |
| plain boat stop + resume | bx_jk7hsb9q | warm (same boot) | same pid + secret, hits 15 → 16 | yes | restored 3 processes from a checkpoint 8s old | PASS |
| kernel crash (sysrq c), restart after a checkpoint | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 17 → 18 | yes | restored 3 processes from a checkpoint 7s old | PASS |
| boat stop --force + resume, after a checkpoint | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 19 → 20 | yes | restored 3 processes from a checkpoint 122s old | PASS |
| plain boat stop + boat fork | bx_vrnbdq7p | cold (new boot) | same pid + secret, hits 21 → 22 | yes | restored 3 processes from a checkpoint 16s old | PASS |
| auto-stop + resume | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 22 → 23 | yes | restored 3 processes from a checkpoint 23s old | PASS |
| boat new --from a saved snapshot | bx_ax78d5x5 | cold (new boot) | same pid + secret, hits 24 → 25 | yes | restored 3 processes from a checkpoint 139s old | PASS |
| stop, resume after 11 min | bx_jk7hsb9q | cold (new boot) | same pid + secret, hits 25 → 26 | yes | restored 3 processes from a checkpoint 685s old | PASS |
| quit tmux, then reboot | bx_jua7hkgw | cold (new boot) | not running | no | nothing to restore | PASS |
