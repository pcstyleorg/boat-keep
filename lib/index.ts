// boat-keep as a library: the same flows as the CLI, over boat's API (@boatdev/sdk) instead of the
// boat CLI. The sandbox side is the same agent/ that `boat-keep setup` installs.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { BoatApi, Configuration, execCommand, writeText, type CommandResponse, type ForkRequest, type ResumeRequestTypeEnum } from "@boatdev/sdk";

const AGENT = "/usr/local/sbin/boat-keep-agent";
const AGENT_FILES = ["boat-keep-agent", "boat-keep.service", "install.sh", "pre-stop"];
const AGENT_DIR = new URL("../agent/", import.meta.url);

export type BoatKeepOptions = {
  /** An existing client. Otherwise one is made from apiKey (default $BOAT_API_KEY). */
  api?: BoatApi;
  apiKey?: string;
  /** Default $BOAT_BASE_URL, then https://boat.dev/api/v1. */
  basePath?: string;
  /** Progress lines, such as what was checkpointed. Default: silent. */
  log?: (line: string) => void;
};

export type ForkResult = {
  /** The new sandbox. */
  id: string;
  seconds: number;
  /** `boat-keep status` of the fork and the source after both finished booting. */
  status: { fork: string; source: string };
};

export class BoatKeepError extends Error {
  override name = "BoatKeepError";
}

export function createBoatKeep(options: BoatKeepOptions = {}) {
  const api = options.api ?? new BoatApi(new Configuration({
    basePath: options.basePath ?? process.env.BOAT_BASE_URL ?? "https://boat.dev/api/v1",
    accessToken: options.apiKey ?? process.env.BOAT_API_KEY ?? fail("set BOAT_API_KEY, or pass apiKey or api"),
  }));
  const log = options.log ?? (() => {});

  async function run(id: string, command: string, timeoutSeconds = 120) {
    const r = (await execCommand(api, id, command, undefined, timeoutSeconds)) as CommandResponse; // not detached
    // The agent logs to stderr, as in the CLI.
    for (const line of (r.stderr ?? "").split("\n")) if (line.trim()) log(`${id}: ${line}`);
    if (r.exitCode !== 0) fail(`\`${command}\` failed on ${id} (exit ${r.exitCode}): ${(r.stderr || r.stdout || "").trim()}`);
    return (r.stdout ?? "").trim();
  }
  const agent = (id: string, cmd: string) => run(id, `sudo ${AGENT} ${cmd}`);

  async function waitFor<T>(what: string, tries: number, ms: number, check: () => Promise<T | undefined>) {
    for (let i = 0; i < tries; i++) {
      const v = await check().catch(() => undefined);
      if (v !== undefined) return v;
      await new Promise((r) => setTimeout(r, ms));
    }
    return fail(what);
  }
  // The stop snapshots the disk first; the fork needs that snapshot, so wait for the operation itself.
  const waitStopped = (id: string, stopId?: string) =>
    waitFor(`${id} didn't stop`, 90, 2000, async () => {
      const { sandbox } = await api.get({ sandboxId: id });
      if (sandbox?.stop?.status === "failing") log(`${id}: stop is retrying: ${sandbox.stop.error ?? ""}`);
      const done = stopId ? sandbox?.stop?.id === stopId && sandbox.stop.status === "completed" : sandbox?.state === "archived";
      return done ? true : undefined;
    });
  // Until the service has finished its boot restore (is-active fails while it runs), then its status.
  const waitKept = (id: string) =>
    waitFor(`boat-keep didn't start on ${id}: check journalctl -u boat-keep there`, 60, 2000, async () => {
      const r = (await execCommand(api, id, "systemctl is-active -q boat-keep", undefined, 30)) as CommandResponse;
      return r.exitCode === 0 ? agent(id, "status") : undefined;
    });
  async function stopAndWait(id: string) {
    const res = await api.stop({ sandboxId: id });
    await waitStopped(id, res.sandbox?.stop?.id);
  }

  return {
    /** Install CRIU and the boat-keep service on a sandbox. Forks and snapshots of it inherit both. */
    async setup(id: string) {
      const dir = await run(id, "mktemp -d");
      for (const f of AGENT_FILES) await writeText(api, id, `${dir}/${f}`, readFileSync(new URL(f, AGENT_DIR), "utf8"));
      return run(id, `sudo bash ${dir}/install.sh ${dir}`, 600);
    },

    /** Save the kept processes now. */
    checkpoint: (id: string) => agent(id, "checkpoint"),

    /** What is kept, and how the last boot went. */
    status: (id: string) => agent(id, "status"),

    /** Fork with the running processes. Pauses the source for a few seconds. */
    async fork(id: string, forkRequest: ForkRequest = {}): Promise<ForkResult> {
      const t0 = Date.now();
      await agent(id, "checkpoint");
      // A fork comes from the latest snapshot; a stop takes one in seconds (a named snapshot takes minutes).
      await stopAndWait(id);
      let forkId: string | undefined;
      try {
        const res = await api.fork({ sandboxId: id, idempotencyKey: randomUUID(), forkRequest });
        forkId = res.sandbox?.id ?? res.id;
      } finally {
        await api.resume({ sandboxId: id }).catch((e) => log(`couldn't resume ${id}: ${e}`));
      }
      if (!forkId) fail("boat fork returned no sandbox id");
      const [fork, source] = await Promise.all([waitKept(forkId), waitKept(id)]);
      return { id: forkId, seconds: Math.round((Date.now() - t0) / 1000), status: { fork, source } };
    },

    /** Checkpoint, then stop. */
    async stop(id: string) {
      await agent(id, "checkpoint");
      await stopAndWait(id);
    },

    /** Resume; a cold resume restores the processes. Returns the status once it's back. */
    async resume(id: string) {
      await api.resume({ sandboxId: id });
      return waitKept(id);
    },

    /** Stop, resume at another size (small, default, large, xlarge), restore. */
    async resize(id: string, type: ResumeRequestTypeEnum) {
      await agent(id, "checkpoint");
      await stopAndWait(id);
      await api.resume({ sandboxId: id, resumeRequest: { type } });
      return waitKept(id);
    },

    /** Checkpoint, then save a snapshot `boat new --from <name>` starts from with these processes. */
    async save(id: string, name: string) {
      await agent(id, "checkpoint");
      await api.saveSavedSnapshot({ savedSnapshotSaveRequest: { sandboxId: id, name } });
      const snap = await waitFor(`snapshot ${name} didn't finish saving`, 120, 5000, async () => {
        const s = (await api.getSavedSnapshot({ name })).snapshot;
        return s?.status === "ready" || s?.status === "failed" ? s : undefined;
      });
      if (snap.status === "failed") fail(`snapshot ${name} failed: ${snap.error ?? "unknown error"}`);
    },
  };
}

function fail(message: string): never {
  throw new BoatKeepError(message);
}
