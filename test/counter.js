// The test workload: an in-memory counter with a secret, appending each hit to an open log file.
const http = require("http");
const fs = require("fs");
const log = fs.openSync(`${process.env.HOME}/counter.log`, "a");
const secret = Math.random().toString(36).slice(2);
let hits = 0;
http.createServer((req, res) => {
  hits++;
  fs.writeSync(log, `${new Date().toISOString()} ${hits}\n`);
  res.end(JSON.stringify({ pid: process.pid, hits, secret }) + "\n");
}).listen(3000, "127.0.0.1");
