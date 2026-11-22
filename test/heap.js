// Test workload: a heap of JS objects (argv[2] MB, default 512), like a dev server's in-memory cache.
const mb = Number(process.argv[2] || 512);
const a = [];
for (let i = 0; process.memoryUsage().rss < mb * 1e6; ) {
  for (let k = 0; k < 1e5; k++, i++) a.push({ id: i, name: "user_" + i, email: `u${i}@example.com`, score: Math.random() });
}
setInterval(() => { a[(Math.random() * a.length) | 0].score++; }, 50);
