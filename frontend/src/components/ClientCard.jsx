import React, { useState } from 'react';
import { Zap, Flame, RotateCcw, Server, Settings, Check, X, Sliders, Target } from 'lucide-react';

export default function ClientCard({
  clientConfig,
  clientState,
  onHitApi,
  onBurstApi,
  onResetClient,
  onUpdateConfig,
  isProcessing
}) {
  const { id, name, capacity, refillRate, description } = clientConfig;
  const tokens = clientState?.currentTokens ?? capacity;
  const lastServedBy = clientState?.lastServedBy;
  const pct = Math.min(100, Math.max(0, (tokens / capacity) * 100));

  const [isEditing, setIsEditing] = useState(false);
  const [newCapacity, setNewCapacity] = useState(capacity);
  const [newRefillRate, setNewRefillRate] = useState(refillRate);
  const [burstCount, setBurstCount] = useState(20);

  // Sync state if props change externally
  React.useEffect(() => {
    setNewCapacity(capacity);
    setNewRefillRate(refillRate);
  }, [capacity, refillRate]);

  // Determine color based on token level
  // Gauge colors — use raw hex so gradient opacity suffixes work
  let gaugeColor = '#8ba27c'; // sage-light (green)
  let gaugeGlow = 'rgba(139, 162, 124, 0.5)';
  if (pct <= 25) {
    gaugeColor = '#e85d75'; // rose (red)
    gaugeGlow = 'rgba(232, 93, 117, 0.5)';
  } else if (pct <= 50) {
    gaugeColor = '#d4a853'; // amber (yellow)
    gaugeGlow = 'rgba(212, 168, 83, 0.5)';
  }

  const refillIntervalSec = (1 / refillRate).toFixed(1);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    onUpdateConfig(id, parseFloat(newCapacity), parseFloat(newRefillRate));
    setIsEditing(false);
  };

  return (
    <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', position: 'relative', overflow: 'hidden' }}>
      
      {/* Top Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono-label" style={{ color: 'var(--sage-light)', letterSpacing: '0.2em' }}>
                {id}
              </span>
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{ 
                  background: 'transparent', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--text-dim)', 
                  borderRadius: '9999px', 
                  padding: '2px 8px', 
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem', 
                  cursor: 'pointer', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '4px' 
                }}
                title="Customize capacity and refill rate"
              >
                <Sliders size={10} /> {isEditing ? 'Cancel' : 'Edit Limit'}
              </button>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.35rem', margin: '6px 0 2px 0' }}>{name}</h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{description}</p>
          </div>

          {lastServedBy && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Handled By</span>
              <span className={`server-badge server-${lastServedBy.replace('Instance-', '')}`}>
                <Server size={10} /> {lastServedBy}
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Config Editor Dropdown Form */}
        {isEditing ? (
          <form onSubmit={handleSaveSettings} style={{ background: 'rgba(107,127,98,0.06)', border: '1px solid var(--border-sage)', borderRadius: 'var(--radius-md)', padding: '16px', margin: '16px 0' }}>
            <h4 className="mono-label" style={{ color: 'var(--sage-light)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Settings size={14} /> Adjust Rate Limit Config
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label className="mono-label" style={{ display: 'block', marginBottom: '6px' }}>Max Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  style={{ 
                    width: '100%', 
                    background: 'transparent', 
                    border: 'none',
                    borderBottom: '1px solid var(--border-color)', 
                    color: '#fff', 
                    padding: '4px 0', 
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.1rem',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--sage)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--border-color)'}
                />
              </div>
              <div>
                <label className="mono-label" style={{ display: 'block', marginBottom: '6px' }}>Refill Rate (/sec)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="20"
                  value={newRefillRate}
                  onChange={(e) => setNewRefillRate(e.target.value)}
                  style={{ 
                    width: '100%', 
                    background: 'transparent', 
                    border: 'none',
                    borderBottom: '1px solid var(--border-color)', 
                    color: '#fff', 
                    padding: '4px 0', 
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.1rem',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--sage)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--border-color)'}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-action btn-reset"
                onClick={() => setIsEditing(false)}
                style={{ padding: '6px 12px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-action"
                style={{ background: 'var(--sage)', color: '#fff', padding: '6px 16px' }}
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          /* Animated Radial / Linear Token Gauge */
          <div style={{ margin: '16px 0', background: 'rgba(0,0,0,0.4)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Available Tokens</span>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 300, color: gaugeColor, lineHeight: 1 }}>
                  {(tokens ?? capacity ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: '4px' }}>/ {capacity}</span>
              </div>
            </div>

            {/* Token Capacity Bar */}
            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden', position: 'relative' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${gaugeColor}66, ${gaugeColor})`,
                  boxShadow: `0 0 12px ${gaugeGlow}`,
                  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: 'var(--radius-full)'
                }}
              />
            </div>

            {/* Refill Rate & Threshold Explanation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span className="mono-label" style={{ color: 'var(--text-dim)' }}>Refill Speed: +1 / {refillIntervalSec}s</span>
              <span className="mono-label" style={{ color: 'var(--text-dim)' }}>{pct.toFixed(0)}% Capacity</span>
            </div>
          </div>
        )}
      </div>

      <div>
        {/* Threshold Banner Note */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '16px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={14} style={{ color: 'var(--sage-light)' }} />
          <span><strong>Threshold:</strong> Max <strong>{capacity}</strong> reqs/burst. Excess blocked.</span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            className="btn-action"
            style={{ flex: 1 }}
            disabled={isProcessing}
            onClick={() => onHitApi(id)}
          >
            <Zap size={14} /> Hit API (1 Req)
          </button>

          {/* Burst Count Dropdown & Trigger */}
          <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
            <select
              value={burstCount}
              onChange={(e) => setBurstCount(parseInt(e.target.value, 10))}
              style={{ 
                background: 'rgba(232,93,117,0.08)', 
                border: '1px solid rgba(232,93,117,0.2)', 
                color: 'var(--text-secondary)', 
                borderRadius: 'var(--radius-full)', 
                padding: '0 8px', 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.7rem', 
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="5" style={{ background: '#0a0a0a' }}>5 reqs</option>
              <option value="10" style={{ background: '#0a0a0a' }}>10 reqs</option>
              <option value="20" style={{ background: '#0a0a0a' }}>20 reqs</option>
              <option value="50" style={{ background: '#0a0a0a' }}>50 reqs</option>
            </select>

            <button
              className="btn-action btn-burst"
              style={{ flex: 1, padding: '8px' }}
              disabled={isProcessing}
              onClick={() => onBurstApi(id, burstCount)}
            >
              <Flame size={14} /> Burst
            </button>
          </div>
        </div>

        <button
          className="btn-action btn-reset"
          style={{ width: '100%', fontSize: '0.75rem', padding: '8px' }}
          onClick={() => onResetClient(id)}
        >
          <RotateCcw size={12} /> Reset Client Bucket
        </button>
      </div>
    </div>
  );
}
