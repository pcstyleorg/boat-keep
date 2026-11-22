// The reel's sound: a few short clicks with silence between them. Every sound is a handful of
// decaying sines under 40 ms; no noise source, no reverb, no music.
//
//   bun story/sound.ts story/sound.wav
//   ffmpeg -i story/boat-keep-reel.mp4 -i story/sound.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -movflags +faststart out.mp4
//
// The in-memory counter is a steel tally counter that clacks on every count; the plain fork's copy
// gives a dead thunk; after boat-keep's restore, only the fork's counter clacks the 4. Soft ticks
// follow the typing.
const SR = 48000, SECONDS = 18, N = SR * SECONDS;
const L = new Float32Array(N), R = new Float32Array(N);

// modes: [frequency Hz, amplitude, decay time constant s]; 0.5 ms attack so nothing pops
function ping(t0: number, pan: number, modes: [number, number, number][], len = 0.04) {
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4), s0 = Math.round(t0 * SR);
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR, k = s0 + i; if (k < 0 || k >= N) continue;
    const env = Math.min(1, t / 0.0005) * Math.min(1, (len - t) / 0.005);
    let v = 0; for (const [f, a, d] of modes) v += a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f * t);
    L[k] += env * v * gl; R[k] += env * v * gr;
  }
}
// tally counter: the press, then the lever returning
const clack = (t0: number, pan: number) => {
  ping(t0, pan, [[2350, 0.5, 0.008], [3870, 0.3, 0.006], [1180, 0.25, 0.007]]);
  ping(t0 + 0.07, pan, [[2600, 0.22, 0.005], [1400, 0.12, 0.005]], 0.025);
};
const thunk = (t0: number, pan: number) => ping(t0, pan, [[150, 0.7, 0.014], [310, 0.3, 0.008]], 0.05);
const tick = (t0: number, f: number) => ping(t0, 0, [[f, 0.12, 0.003], [f * 2.7, 0.04, 0.002]], 0.015);
// one soft tick per ~3 typed characters, so typing reads as typing, not a patter
function typing(t0: number, t1: number, chars: number) {
  const n = Math.round(chars / 3);
  for (let i = 0; i < n; i++) tick(t0 + (t1 - t0) * (i + 0.5) / n, i % 2 ? 1650 : 1500);
}

clack(1.0, 0); clack(1.6, 0);
typing(2.95, 3.6, 21);            // $ boat fork bx_4xbm74bw
thunk(5.05, 0.45);                // the copy: Can't connect
typing(8.0, 8.35, 6);             // erase
typing(8.4, 9.05, 26);            // $ boat-keep fork bx_4xbm74bw
clack(11.1, 0.45);                // only the fork counts: 3 → 4

// quiet: peak at -12 dBFS; 16-bit stereo WAV
let peak = 0; for (let k = 0; k < N; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
const gain = 0.25 / peak, out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let k = 0; k < N; k++) {
  out.writeInt16LE(Math.round(L[k] * gain * 32767), 44 + k * 4);
  out.writeInt16LE(Math.round(R[k] * gain * 32767), 46 + k * 4);
}
await Bun.write(process.argv[2] ?? "sound.wav", out);
