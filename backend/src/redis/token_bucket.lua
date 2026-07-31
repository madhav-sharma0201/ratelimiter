-- Redis Lua Script for Atomic Token Bucket Rate Limiting
-- KEYS[1]: Redis key for client bucket (e.g., "ratelimit:client-a")
-- ARGV[1]: Max bucket capacity (e.g., 10)
-- ARGV[2]: Refill rate in tokens per second (e.g., 0.5 = 1 token per 2s, 1.0 = 1 token per 1s)
-- ARGV[3]: Current timestamp in milliseconds (epoch ms)
-- ARGV[4]: Requested tokens (default 1)

local bucket_key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate_per_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4] or 1)

local refill_rate_per_ms = refill_rate_per_sec / 1000.0

-- Retrieve current bucket state
local data = redis.call('HMGET', bucket_key, 'tokens', 'last_refill')

local stored_tokens
local last_refill

if not data[1] or not data[2] then
    -- First time initializing bucket
    stored_tokens = capacity
    last_refill = now
else
    stored_tokens = tonumber(data[1])
    last_refill = tonumber(data[2])
end

-- Compute elapsed time and newly refilled tokens
local elapsed_ms = math.max(0, now - last_refill)
local refilled_tokens = elapsed_ms * refill_rate_per_ms
local current_tokens = math.min(capacity, stored_tokens + refilled_tokens)

local allowed = 0
local remaining_tokens = current_tokens
local reset_in_ms = 0

if current_tokens >= requested then
    allowed = 1
    remaining_tokens = current_tokens - requested
    -- Save updated token count and current timestamp
    redis.call('HMSET', bucket_key, 'tokens', tostring(remaining_tokens), 'last_refill', tostring(now))
    
    -- Calculate ms until full capacity is restored
    if remaining_tokens < capacity then
        reset_in_ms = math.ceil((capacity - remaining_tokens) / refill_rate_per_ms)
    else
        reset_in_ms = 0
    end
else
    allowed = 0
    remaining_tokens = current_tokens
    -- Update bucket state with refilled tokens up to now (without consuming)
    redis.call('HMSET', bucket_key, 'tokens', tostring(remaining_tokens), 'last_refill', tostring(now))
    
    -- Calculate ms until at least `requested` tokens are available
    local missing_tokens = requested - current_tokens
    reset_in_ms = math.ceil(missing_tokens / refill_rate_per_ms)
end

-- Set TTL for key cleanup (2x time to refill empty bucket to max, min 120s)
local fill_time_sec = math.ceil(capacity / refill_rate_per_sec)
local ttl = math.max(120, fill_time_sec * 2)
redis.call('EXPIRE', bucket_key, ttl)

-- Return array: { allowed (0 or 1), remaining_tokens (number), reset_in_ms (number), capacity (number) }
return { allowed, tostring(remaining_tokens), tostring(reset_in_ms), tostring(capacity) }
