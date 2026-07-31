import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Client tier configurations
export const CLIENT_CONFIGS = {
  'client-a': {
    id: 'client-a',
    name: 'Standard Client (Client A)',
    capacity: 10,
    refillRate: 0.5, // 1 token every 2s
    description: '10 tokens max, 0.5 token/sec refill'
  },
  'client-b': {
    id: 'client-b',
    name: 'Strict Client (Client B)',
    capacity: 5,
    refillRate: 0.2, // 1 token every 5s
    description: '5 tokens max, 0.2 token/sec refill'
  },
  'client-c': {
    id: 'client-c',
    name: 'VIP Client (Client C)',
    capacity: 20,
    refillRate: 2.0, // 2 tokens per sec
    description: '20 tokens max, 2.0 tokens/sec refill'
  }
};

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 100, 2000)
});

redis.on('error', (err) => {
  console.error('[Redis Client Error]:', err.message);
});

const luaScriptPath = path.join(__dirname, 'token_bucket.lua');
const luaScript = fs.readFileSync(luaScriptPath, 'utf8');

// Define custom command for atomic token bucket check
redis.defineCommand('checkTokenBucket', {
  numberOfKeys: 1,
  lua: luaScript
});

export default redis;
