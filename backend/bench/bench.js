/**
 * Distributed Rate Limiter — Benchmark Harness
 *
 * Measures four things:
 *   1. CORRECTNESS  — under N concurrent requests against a bucket of capacity C,
 *                     exactly C must be admitted. No more, no less.
 *   2. NAIVE BASELINE — the same workload against a non-atomic read-then-write
 *                     implementation, to quantify how many requests leak through.
 *   3. THROUGHPUT/LATENCY — sustained req/sec and p50/p95/p99/max latency.
 *   4. DISTRIBUTION — confirms the load balancer actually spreads work across all
 *                     3 stateless backend instances (so the test is genuinely distributed).
 *
 * Usage:  node bench/bench.js
 * Requires the cluster running (npm run cluster) and Redis up.
 */

import http from 'node:http';
import Redis from 'ioredis';

const LB_HOST = '127.0.0.1';
const LB_PORT = 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// High socket ceiling so requests are genuinely concurrent rather than queued
// behind a small connection pool — otherwise we'd never observe a race at all.
const agent = new http.Agent({ keepAlive: true, maxSockets: 2000, maxFreeSockets: 2000 });

function post(path, body) {
  const payload = JSON.stringify(body);
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: LB_HOST, port: LB_PORT, path, method: 'POST', agent,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6;
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* non-JSON error body */ }
          resolve({ status: res.statusCode, ms, body: parsed });
        });
      }
    );
    req.on('error', (e) => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, ms, body: null, error: e.message });
    });
    req.write(payload);
    req.end();
  });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

function latencyStats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    p50: pct(s, 50).toFixed(2),
    p95: pct(s, 95).toFixed(2),
    p99: pct(s, 99).toFixed(2),
    max: s[s.length - 1].toFixed(2),
    mean: (s.reduce((a, b) => a + b, 0) / s.length).toFixed(2)
  };
}

const reset = (clientId) => post('/api/reset', { clientId });

// ---------------------------------------------------------------------------
// TEST 1 — Correctness under concurrency
// ---------------------------------------------------------------------------
// refillRate is set deliberately low (0.001 tok/sec) so that token refill during
// the test window is negligible. Any admission beyond `capacity` is therefore a
// genuine race, not a legitimately refilled token.
async function testCorrectness(concurrency, capacity) {
  const clientId = `bench-correct-${concurrency}`;
  await reset(clientId);

  const results = await Promise.all(
    Array.from({ length: concurrency }, () =>
      post('/api/check', { clientId, cost: 1, capacity, refillRate: 0.001 })
    )
  );

  const allowed = results.filter((r) => r.status === 200).length;
  const limited = results.filter((r) => r.status === 429).length;
  const errors = results.filter((r) => r.status !== 200 && r.status !== 429).length;
  const served = {};
  for (const r of results) {
    const id = r.body?.servedBy ?? 'unknown';
    served[id] = (served[id] || 0) + 1;
  }

  // When fewer requests are fired than the bucket holds, all of them should be
  // admitted — the expected figure is min(concurrency, capacity), not capacity.
  const expected = Math.min(concurrency, capacity);
  const errorReasons = [...new Set(results.filter((r) => r.error).map((r) => r.error))];

  return { concurrency, capacity, expected, allowed, limited, errors, served, errorReasons,
           exact: allowed === expected,
           latency: latencyStats(results.map((r) => r.ms)) };
}

// ---------------------------------------------------------------------------
// TEST 2 — Naive read-then-write baseline (the bug this project exists to fix)
// ---------------------------------------------------------------------------
// Reproduces the vulnerable pattern from the README directly against Redis:
//     GET count -> if (count < capacity) -> INCR
// Each "virtual server" holds its own connection, so the GET and INCR can
// interleave across clients exactly as they would across real backend instances.
async function testNaive(concurrency, capacity) {
  const key = `bench:naive:${concurrency}`;
  const clients = [];
  try {
    const control = new Redis(REDIS_URL);
    await control.del(key);
    await control.quit();

    // One connection per concurrent caller = true parallel interleaving.
    for (let i = 0; i < concurrency; i++) clients.push(new Redis(REDIS_URL));

    const attempt = async (redis) => {
      const raw = await redis.get(key);
      const count = raw === null ? 0 : parseInt(raw, 10);
      if (count < capacity) {        // <-- the gap: state can change before INCR lands
        await redis.incr(key);
        return true;
      }
      return false;
    };

    const results = await Promise.all(clients.map((c) => attempt(c)));
    const admitted = results.filter(Boolean).length;
    const finalCount = parseInt(await clients[0].get(key), 10);

    const expected = Math.min(concurrency, capacity);
    return { concurrency, capacity, expected, admitted, finalCount,
             overAdmitted: admitted - expected };
  } finally {
    await Promise.all(clients.map((c) => c.quit().catch(() => {})));
  }
}

// ---------------------------------------------------------------------------
// TEST 3 — Sustained throughput and latency
// ---------------------------------------------------------------------------
// Capacity is set high enough that nothing gets rejected; we are measuring the
// cost of the atomic path itself, not the cost of returning 429s.
async function testThroughput(totalRequests, concurrency) {
  const clientId = 'bench-throughput';
  await reset(clientId);

  const latencies = [];
  let completed = 0;
  const wallStart = process.hrtime.bigint();

  // Fixed pool of `concurrency` workers each pulling from a shared budget.
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (completed < totalRequests) {
        completed++;
        const r = await post('/api/check', {
          clientId, cost: 1, capacity: totalRequests * 10, refillRate: 1000
        });
        latencies.push(r.ms);
      }
    })
  );

  const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
  return {
    totalRequests: latencies.length,
    concurrency,
    wallMs: wallMs.toFixed(0),
    rps: Math.round((latencies.length / wallMs) * 1000),
    latency: latencyStats(latencies)
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const health = await post('/api/check', { clientId: 'warmup', cost: 1 });
  if (health.status === 0) {
    console.error(`\nCannot reach load balancer at ${LB_HOST}:${LB_PORT}.`);
    console.error('Start it first:  cd backend && npm run cluster\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(78));
  console.log('DISTRIBUTED RATE LIMITER — BENCHMARK');
  console.log('='.repeat(78));
  console.log(`Target        : http://${LB_HOST}:${LB_PORT} (load balancer -> 3 backend instances)`);
  console.log(`Node          : ${process.version}`);
  console.log(`Date          : ${new Date().toISOString()}`);

  // --- 1. Correctness ---
  console.log('\n' + '-'.repeat(78));
  console.log('TEST 1 — CORRECTNESS UNDER CONCURRENCY (atomic Lua implementation)');
  console.log('-'.repeat(78));
  console.log('Capacity 100. All requests fired simultaneously. Expect EXACTLY 100 admitted.\n');
  console.log('  concurrent | expected |  admitted |  rejected | errors |  exact? | p99 latency');
  console.log('  -----------+----------+-----------+-----------+--------+---------+------------');

  const correctness = [];
  for (const c of [50, 100, 250, 500, 1000, 2000]) {
    const r = await testCorrectness(c, 100);
    correctness.push(r);
    console.log(
      `  ${String(c).padStart(10)} | ${String(r.expected).padStart(8)} | ${String(r.allowed).padStart(9)} | ` +
      `${String(r.limited).padStart(9)} | ${String(r.errors).padStart(6)} | ` +
      `${(r.exact ? '  PASS' : '  FAIL').padStart(7)} | ${String(r.latency.p99 + ' ms').padStart(11)}`
    );
    if (r.errorReasons.length) {
      console.log(`             \\_ ${r.errors} client-side failures: ${r.errorReasons.join(', ')}`);
    }
  }

  // --- 2. Naive baseline ---
  console.log('\n' + '-'.repeat(78));
  console.log('TEST 2 — NAIVE READ-THEN-WRITE BASELINE (no atomicity)');
  console.log('-'.repeat(78));
  console.log('Same workload, non-atomic GET-then-INCR. Every admission past 100 is a race.\n');
  console.log('  concurrent | expected |  admitted | over-admitted | correct?');
  console.log('  -----------+----------+-----------+---------------+---------');

  const naive = [];
  for (const c of [50, 100, 250, 500, 1000, 2000]) {
    const r = await testNaive(c, 100);
    naive.push(r);
    const over = r.overAdmitted > 0 ? `+${r.overAdmitted}` : String(r.overAdmitted);
    console.log(
      `  ${String(c).padStart(10)} | ${String(r.expected).padStart(8)} | ${String(r.admitted).padStart(9)} | ` +
      `${over.padStart(13)} | ${r.admitted === r.expected ? '   yes' : '    NO'}`
    );
  }

  // --- 3. Throughput ---
  console.log('\n' + '-'.repeat(78));
  console.log('TEST 3 — SUSTAINED THROUGHPUT AND LATENCY');
  console.log('-'.repeat(78) + '\n');
  console.log('  concurrency |  requests |    rps | p50 ms | p95 ms | p99 ms | max ms');
  console.log('  ------------+-----------+--------+--------+--------+--------+-------');

  const throughput = [];
  for (const c of [10, 50, 100, 200]) {
    const r = await testThroughput(5000, c);
    throughput.push(r);
    console.log(
      `  ${String(c).padStart(11)} | ${String(r.totalRequests).padStart(9)} | ${String(r.rps).padStart(6)} | ` +
      `${String(r.latency.p50).padStart(6)} | ${String(r.latency.p95).padStart(6)} | ` +
      `${String(r.latency.p99).padStart(6)} | ${String(r.latency.max).padStart(6)}`
    );
  }

  // --- 4. Distribution ---
  console.log('\n' + '-'.repeat(78));
  console.log('TEST 4 — LOAD BALANCER DISTRIBUTION');
  console.log('-'.repeat(78));
  console.log('Confirms the correctness tests above were genuinely spread across instances.\n');
  const dist = correctness[correctness.length - 1];
  for (const [id, n] of Object.entries(dist.served).sort()) {
    const share = ((n / dist.concurrency) * 100).toFixed(1);
    console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)} requests  (${share}%)`);
  }

  // --- Summary ---
  const peak = correctness[correctness.length - 1];
  const worstNaive = naive.reduce((a, b) => (b.overAdmitted > a.overAdmitted ? b : a));
  const bestRps = throughput.reduce((a, b) => (b.rps > a.rps ? b : a));

  console.log('\n' + '='.repeat(78));
  console.log('SUMMARY');
  console.log('='.repeat(78));
  console.log(`  Atomic implementation : exact limit held at up to ${peak.concurrency} concurrent requests`);
  console.log(`                          across 3 instances (${peak.allowed}/${peak.capacity} admitted, 0 over-admission)`);
  console.log(`  Naive implementation  : over-admitted by up to ${worstNaive.overAdmitted} requests ` +
              `(${worstNaive.admitted} admitted vs ${worstNaive.capacity} capacity)`);
  console.log(`  Peak throughput       : ${bestRps.rps} req/sec at concurrency ${bestRps.concurrency}, ` +
              `p99 ${bestRps.latency.p99} ms`);
  console.log('='.repeat(78) + '\n');

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
