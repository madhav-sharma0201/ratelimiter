process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import redis from '../src/redis/client.js';
import app from '../src/server.js';

const PORT_A = 3011;
const PORT_B = 3012;
const PORT_C = 3013;

let serverA, serverB, serverC;

test.before(async () => {
  // Clear any existing rate limit test keys
  const keys = await redis.keys('ratelimit:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // Helper to create test app server instance
  const createServer = (port, serverId) => {
    const instanceApp = express();
    instanceApp.use(express.json());
    instanceApp.use((req, res, next) => {
      process.env.SERVER_ID = serverId;
      next();
    });
    instanceApp.use(app);
    return new Promise((resolve) => {
      const s = instanceApp.listen(port, () => resolve(s));
    });
  };

  serverA = await createServer(PORT_A, 'Server-3011');
  serverB = await createServer(PORT_B, 'Server-3012');
  serverC = await createServer(PORT_C, 'Server-3013');
});

test.after(async () => {
  if (serverA) serverA.close();
  if (serverB) serverB.close();
  if (serverC) serverC.close();
  await redis.quit();
});

test('1. Single-server correctness: 15 rapid requests against bucket capacity of 10', async () => {
  // Clear bucket state
  await redis.del('ratelimit:client-a');

  const results = [];
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`http://127.0.0.1:${PORT_A}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'client-a' })
    });
    const data = await res.json();
    results.push({ status: res.status, allowed: data.allowed, remaining: data.remaining });
  }

  const allowedRequests = results.filter((r) => r.status === 200 && r.allowed === true);
  const blockedRequests = results.filter((r) => r.status === 429 && r.allowed === false);

  assert.equal(allowedRequests.length, 10, 'Exactly 10 requests should be allowed');
  assert.equal(blockedRequests.length, 5, 'Exactly 5 requests should be blocked (429)');
  assert.ok(allowedRequests[9].remaining < 0.1, 'Last allowed request should have remaining tokens close to 0');
});

test('2. Refill mechanics: waiting for refill recovers tokens', async () => {
  // Reset client-a bucket
  await redis.del('ratelimit:client-a');

  // Deplete all 10 tokens
  for (let i = 0; i < 10; i++) {
    await fetch(`http://127.0.0.1:${PORT_A}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'client-a' })
    });
  }

  // Immediately confirm blocked
  const resImmediate = await fetch(`http://127.0.0.1:${PORT_A}/api/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'client-a' })
  });
  assert.equal(resImmediate.status, 429, 'Immediate request when empty must be 429');

  // Wait 2100ms for 1 token to refill (client-a refill rate: 0.5 tokens/sec = 1 token per 2000ms)
  await new Promise((resolve) => setTimeout(resolve, 2100));

  const resAfterRefill = await fetch(`http://127.0.0.1:${PORT_A}/api/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'client-a' })
  });
  const dataAfterRefill = await resAfterRefill.json();

  assert.equal(resAfterRefill.status, 200, 'Request after refill window should be allowed');
  assert.equal(dataAfterRefill.allowed, true, 'Request allowed should be true');
});

test('3. Multi-server atomicity: 30 concurrent parallel requests across 3 backend instances', async () => {
  // Reset client-a bucket
  await redis.del('ratelimit:client-a');

  const ports = [PORT_A, PORT_B, PORT_C];
  const promises = [];

  // Launch 30 concurrent requests round-robined across ports 3011, 3012, 3013
  for (let i = 0; i < 30; i++) {
    const targetPort = ports[i % ports.length];
    promises.push(
      fetch(`http://127.0.0.1:${targetPort}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-a' })
      }).then(async (res) => ({
        status: res.status,
        data: await res.json(),
        port: targetPort
      }))
    );
  }

  const responses = await Promise.all(promises);

  const allowed = responses.filter((r) => r.status === 200 && r.data.allowed === true);
  const blocked = responses.filter((r) => r.status === 429 && r.data.allowed === false);

  assert.equal(allowed.length, 10, 'Parallel requests across 3 servers must allow EXACTLY 10 requests');
  assert.equal(blocked.length, 20, 'Parallel requests across 3 servers must block EXACTLY 20 requests');
});
