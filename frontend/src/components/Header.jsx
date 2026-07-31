import React from 'react';
import { ShieldCheck, Server, Cpu, RefreshCw, Zap } from 'lucide-react';

export default function Header({ totalStats, onResetAll }) {
  return (
    <header className="glass-panel animate-fade-in-up" style={{ padding: '24px 32px', marginBottom: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--sage-bg)', padding: '10px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-sage)' }}>
              <ShieldCheck size={28} color="var(--sage-light)" />
            </div>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '2rem' }} className="gradient-text">
                Distributed Rate Limiter
              </h1>
              <p className="mono-label" style={{ marginTop: '4px' }}>
                Stateless Express Cluster (3 Nodes) + Load Balancer + Atomic Redis Lua Script
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="stat-pill" style={{ minWidth: '100px' }}>
              <span className="stat-label">Total Requests</span>
              <strong className="stat-value">{totalStats.total}</strong>
            </div>
            <div className="stat-pill" style={{ minWidth: '100px' }}>
              <span className="stat-label">Allowed</span>
              <strong className="stat-value" style={{ color: 'var(--emerald)' }}>{totalStats.allowed}</strong>
            </div>
            <div className="stat-pill" style={{ minWidth: '100px' }}>
              <span className="stat-label">Rate Limited</span>
              <strong className="stat-value" style={{ color: 'var(--rose)' }}>{totalStats.blocked}</strong>
            </div>
          </div>
          <button className="btn-action btn-reset" onClick={onResetAll} title="Reset all client token buckets in Redis">
            <RefreshCw size={16} /> Reset All Buckets
          </button>
        </div>
      </div>

      {/* Cluster Nodes Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div className="pulse-dot"></div>
          <span>LB Active on Port 3000</span>
        </div>
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Server size={14} color="var(--text-muted)" />
          <span style={{ color: 'var(--text-muted)' }}>Target Backend Cluster:</span>
          <span className="server-badge server-3001">Instance-3001</span>
          <span className="server-badge server-3002">Instance-3002</span>
          <span className="server-badge server-3003">Instance-3003</span>
        </div>
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--sage-light)' }}>
          <Cpu size={14} />
          <span>Atomic Lua EVAL in Redis</span>
        </div>
      </div>
    </header>
  );
}
