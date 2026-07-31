import express from 'express';
import cors from 'cors';
import redis, { CLIENT_CONFIGS } from './redis/client.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVER_ID = process.env.SERVER_ID || `Server-${PORT}`;

// GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    servedBy: SERVER_ID,
    port: PORT,
    uptime: process.uptime()
  });
});

// GET /api/clients - Get client configurations and live bucket state
app.get('/api/clients', async (req, res) => {
  try {
    const clientsWithState = await Promise.all(
      Object.values(CLIENT_CONFIGS).map(async (cfg) => {
        const key = `ratelimit:${cfg.id}`;
        const data = await redis.hmget(key, 'tokens', 'last_refill');
        let currentTokens = cfg.capacity;
        let lastRefill = Date.now();

        if (data[0] && data[1]) {
          const storedTokens = parseFloat(data[0]);
          const storedLastRefill = parseInt(data[1], 10);
          const elapsedMs = Math.max(0, Date.now() - storedLastRefill);
          const refilled = (elapsedMs * (cfg.refillRate / 1000.0));
          currentTokens = Math.min(cfg.capacity, storedTokens + refilled);
          lastRefill = storedLastRefill;
        }

        return {
          ...cfg,
          currentTokens: parseFloat(currentTokens.toFixed(2)),
          lastRefill
        };
      })
    );

    res.json({
      servedBy: SERVER_ID,
      clients: clientsWithState
    });
  } catch (err) {
    console.error('Error fetching clients state:', err);
    res.status(500).json({ error: 'Internal server error', servedBy: SERVER_ID });
  }
});

// POST /api/config - Update rate limit configuration for a client dynamically
app.post('/api/config', async (req, res) => {
  const { clientId, capacity, refillRate } = req.body;
  if (!clientId || capacity === undefined || refillRate === undefined) {
    return res.status(400).json({ error: 'clientId, capacity, and refillRate are required' });
  }

  const numCap = parseFloat(capacity);
  const numRefill = parseFloat(refillRate);

  if (numCap <= 0 || numRefill <= 0) {
    return res.status(400).json({ error: 'Capacity and refillRate must be positive numbers' });
  }

  CLIENT_CONFIGS[clientId] = {
    ...(CLIENT_CONFIGS[clientId] || { id: clientId, name: `Client (${clientId})` }),
    id: clientId,
    capacity: numCap,
    refillRate: numRefill,
    description: `${numCap} tokens max, ${numRefill} token/sec refill`
  };

  // Delete key so new capacity takes immediate effect
  await redis.del(`ratelimit:${clientId}`);

  res.json({
    message: `Updated configuration for ${clientId}`,
    config: CLIENT_CONFIGS[clientId],
    servedBy: SERVER_ID
  });
});

// POST /api/check - Check rate limit for a client
app.post('/api/check', async (req, res) => {
  const { clientId = 'client-a', cost = 1, capacity: customCap, refillRate: customRefill } = req.body;
  const config = CLIENT_CONFIGS[clientId] || {
    id: clientId,
    capacity: 10,
    refillRate: 0.5
  };

  const capacity = customCap ? parseFloat(customCap) : config.capacity;
  const refillRate = customRefill ? parseFloat(customRefill) : config.refillRate;

  const key = `ratelimit:${clientId}`;
  const now = Date.now();

  try {
    // Execute atomic Lua script via ioredis custom command
    const [allowedNum, remainingStr, resetInMsStr, capacityStr] = await redis.checkTokenBucket(
      key,
      capacity,
      refillRate,
      now,
      cost
    );

    const allowed = allowedNum === 1;
    const remaining = Math.max(0, parseFloat(parseFloat(remainingStr).toFixed(2)));
    const resetInMs = parseInt(resetInMsStr, 10);
    const returnCapacity = parseFloat(capacityStr);

    const responsePayload = {
      allowed,
      remaining,
      resetInMs,
      capacity: returnCapacity,
      refillRate: config.refillRate,
      clientId,
      cost,
      servedBy: SERVER_ID,
      timestamp: now
    };

    if (!allowed) {
      return res.status(429).json({
        ...responsePayload,
        error: 'Too Many Requests',
        message: `Rate limit exceeded for ${clientId}. Try again in ${Math.ceil(resetInMs / 1000)}s.`
      });
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Error in rate limit check:', err);
    return res.status(500).json({
      error: 'Rate limiter error',
      message: err.message,
      servedBy: SERVER_ID
    });
  }
});

// POST /api/reset - Reset rate limit bucket for a client
app.post('/api/reset', async (req, res) => {
  const { clientId } = req.body;
  try {
    if (clientId) {
      await redis.del(`ratelimit:${clientId}`);
    } else {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
    res.json({ message: `Reset bucket for ${clientId || 'all clients'}`, servedBy: SERVER_ID });
  } catch (err) {
    res.status(500).json({ error: err.message, servedBy: SERVER_ID });
  }
});

if (process.env.NODE_ENV !== 'test' && !process.env.NO_LISTEN) {
  app.listen(PORT, () => {
    console.log(`🚀 [${SERVER_ID}] Rate Limiter Server running on http://127.0.0.1:${PORT}`);
  });
}

export default app;
