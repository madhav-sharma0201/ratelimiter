# Benchmarks

Reproduce with:

```bash
redis-server                      # terminal 1
cd backend && npm run cluster     # terminal 2
cd backend && node bench/bench.js # terminal 3
```

**Environment.** Intel Core i9-9880H @ 2.30 GHz (16 logical cores), 16 GB RAM, macOS.
Redis 8.8.0, Node v24.11.1. Load generator, load balancer, all 3 backend instances, and Redis
run on the same host — so absolute throughput is bounded by that shared machine, and network
latency is excluded. The correctness results are unaffected by co-location; the throughput
numbers should be read as a floor, not a ceiling.

Run date: 2026-08-06.

---

## 1. Correctness under concurrency

Bucket capacity 100, refill rate set to 0.001 tokens/sec so refill during the test window is
negligible — any admission beyond 100 is a genuine race, not a legitimately refilled token.
All requests are fired simultaneously at the load balancer and distributed round-robin across
the three stateless instances.

| Concurrent requests | Expected admits | Admitted | Rejected (429) | Errors | Exact? | p99 latency |
|--------------------:|----------------:|---------:|---------------:|-------:|:------:|------------:|
| 50    | 50  | 50  | 0    | 0  | PASS | 71 ms |
| 100   | 100 | 100 | 0    | 0  | PASS | 105 ms |
| 250   | 100 | 100 | 150  | 0  | PASS | 264 ms |
| 500   | 100 | 100 | 400  | 0  | PASS | 473 ms |
| 1000  | 100 | 100 | 900  | 0  | PASS | 1310 ms |
| 2000  | 100 | 100 | 1875 | 25 | PASS | 16207 ms |

The limit held exactly at every level. The 25 failures at 2000 concurrent are
`connect ETIMEDOUT` on the **load generator's** side — the client exhausted local sockets
against a single-host target. They are not rate-limiter errors, but because they mean 25
requests never reached the service, **1000 concurrent is the highest level this run measures
cleanly**, and that is the figure quoted below.

## 2. Naive read-then-write baseline

The same workload run against the non-atomic pattern the project exists to fix — `GET` the
count, compare, then `INCR` — with one Redis connection per caller so the operations interleave
across clients exactly as they would across real backend instances.

| Concurrent requests | Expected admits | Admitted | Over-admitted | Correct? |
|--------------------:|----------------:|---------:|--------------:|:--------:|
| 50   | 50  | 50   | 0    | yes |
| 100  | 100 | 100  | 0    | yes |
| 250  | 100 | 176  | +76  | **no** |
| 500  | 100 | 357  | +257 | **no** |
| 1000 | 100 | 564  | +464 | **no** |
| 2000 | 100 | 1049 | +949 | **no** |

At 1000 concurrent the naive implementation admitted **564 requests against a limit of 100 —
a 5.6x breach**.

Note that it was *correct* at 50 and 100 concurrent. The race is real at every level; it simply
does not always get observed. That is precisely why this class of bug reaches production: it
passes low-concurrency testing and only manifests under real load.

## 3. Sustained throughput and latency

Capacity set high enough that nothing is rejected, so this measures the cost of the atomic
path itself rather than the cost of returning 429s. 5,000 requests per run through the
load balancer.

| Concurrency | Requests | req/sec | p50 | p95 | p99 | max |
|------------:|---------:|--------:|----:|----:|----:|----:|
| 10  | 5000 | 1611 | 5.6 ms  | 7.7 ms   | 15 ms   | 79 ms |
| 50  | 5000 | 1749 | 26.9 ms | 37.4 ms  | 44 ms   | 373 ms |
| 100 | 5000 | 1887 | 49.8 ms | 63.3 ms  | 85 ms   | 1049 ms |
| 200 | 5000 | 1891 | 73.0 ms | 103.3 ms | 1797 ms | 2639 ms |

Throughput saturates around **1,890 req/sec** on this hardware. Past concurrency 100 the
service is fully saturated: throughput stops improving (1887 → 1891) while p99 degrades by
more than 20x (85 ms → 1797 ms). That is queueing delay, not additional capacity —
**concurrency 100 is the knee of the curve** and the sensible operating point.

## 4. Load balancer distribution

Instance shares from the 2000-concurrent correctness run, confirming the test was genuinely
distributed rather than served by one instance:

| Instance | Requests | Share |
|---|---:|---:|
| Instance-3001 | 659 | 33.0% |
| Instance-3002 | 658 | 32.9% |
| Instance-3003 | 658 | 32.9% |
| (client-side timeouts) | 25 | 1.3% |

Round-robin distribution is even to within 1 request.

---

## Summary

- Exact limit enforcement held at up to **1,000 concurrent requests** across 3 stateless
  instances, with zero over-admission and zero errors.
- The equivalent **non-atomic implementation admitted 564 against a limit of 100** at the same
  concurrency — a **5.6x** breach.
- Sustained **1,887 req/sec at p99 85 ms** (concurrency 100) on a single 16-core host with all
  components co-located.

## Known limits of this benchmark

- Single-host: load generator, services, and Redis share one machine and compete for CPU.
  Absolute throughput would differ on separate hosts with real network latency between them.
- Redis is a single instance; no clustering or failover is exercised.
- Refill behaviour under sustained partial load is not measured — only the near-zero-refill
  correctness case and the no-rejection throughput case.
- Latency is measured client-side and includes load-balancer proxy overhead.
