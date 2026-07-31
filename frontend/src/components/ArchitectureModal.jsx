import React, { useState } from 'react';
import { BookOpen, Code, Cpu, ShieldAlert, Zap, Layers, CheckCircle2 } from 'lucide-react';

export default function ArchitectureModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ marginTop: '28px' }}>
      <button
        className="btn-action"
        style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--sage)', color: 'var(--sage-light)' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <BookOpen size={16} /> {isOpen ? 'Hide Architecture & Race Condition Explanation' : 'View Architecture & Lua Script Deep-Dive'}
      </button>

      {isOpen && (
        <div className="glass-panel animate-scale-in" style={{ padding: '28px', marginTop: '16px', border: '1px solid var(--border-sage)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-main)', fontSize: '1.4rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={22} color="var(--sage-light)" /> System Architecture & Race Condition Prevention
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Box 1: The Race Condition */}
            <div style={{ background: 'var(--rose-bg, rgba(232, 93, 117, 0.06))', border: '1px solid rgba(232, 93, 117, 0.2)', padding: '18px', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ color: 'var(--rose)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontFamily: 'var(--font-display)' }}>
                <ShieldAlert size={18} /> The Distributed Race Condition Problem
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                In a naive rate limiter, servers run: <br/>
                <code style={{ color: 'var(--rose)' }}>1. count = redis.get(key)</code><br/>
                <code style={{ color: 'var(--rose)' }}>2. if count &lt; max then allow request</code><br/>
                <code style={{ color: 'var(--rose)' }}>3. redis.incr(key)</code><br/><br/>
                If Server A and Server B handle concurrent requests, both read <code style={{ color: 'var(--rose)' }}>count = 9</code> simultaneously. Both see room, both allow the request, and 2 requests pass when only 1 token remained!
              </p>
            </div>

            {/* Box 2: The Lua Solution */}
            <div style={{ background: 'var(--sage-bg)', border: '1px solid var(--border-sage)', padding: '18px', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ color: 'var(--sage-light)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontFamily: 'var(--font-display)' }}>
                <CheckCircle2 size={18} /> The Atomic Redis Lua Fix
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Redis single-threads Lua scripts executed via <code style={{ color: 'var(--sage-light)' }}>EVAL</code>. <br/><br/>
                The Lua script performs token refill calculation, capacity capping, rate checking, and token deduction in <strong>one single atomic operation</strong>. No other server command can interleave mid-script execution.
              </p>
            </div>
          </div>

          {/* Code snippet display */}
          <div style={{ background: '#050608', border: '1px solid var(--border-color)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="mono-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <Code size={14} color="var(--sage-light)" /> REDIS LUA SCRIPT (TOKEN_BUCKET.LUA)
              </span>
              <span className="mono-label" style={{ fontSize: '0.7rem' }}>Executed Atomically</span>
            </div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', overflowX: 'auto', lineHeight: '1.5' }}>
{`local data = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local elapsed_ms = math.max(0, now - last_refill)
local refilled_tokens = elapsed_ms * (refill_rate_per_sec / 1000.0)
local current_tokens = math.min(capacity, stored_tokens + refilled_tokens)

if current_tokens >= requested then
    remaining_tokens = current_tokens - requested
    redis.call('HMSET', KEYS[1], 'tokens', remaining_tokens, 'last_refill', now)
    return { 1, remaining_tokens, reset_in_ms }
else
    return { 0, current_tokens, wait_ms }
end`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
