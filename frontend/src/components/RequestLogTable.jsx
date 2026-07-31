import React, { useState } from 'react';
import { Terminal, Server, CheckCircle2, XCircle, Filter, Trash2, Lightbulb } from 'lucide-react';

export default function RequestLogTable({ logs, onClearLogs }) {
  const [filterClient, setFilterClient] = useState('all');

  const filteredLogs = filterClient === 'all'
    ? logs
    : logs.filter((log) => log.clientId === filterClient);

  return (
    <div className="glass-panel animate-fade-in-up delay-3" style={{ padding: '24px', marginTop: '28px' }}>
      {/* Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Terminal size={20} color="var(--sage-light)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.25rem', margin: 0 }}>Live Request Stream</h2>
          <span className="mono-label" style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {filteredLogs.length} events
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Filter:</span>
            {['all', 'client-a', 'client-b', 'client-c'].map((c) => (
              <button
                key={c}
                onClick={() => setFilterClient(c)}
                style={{
                  background: filterClient === c ? 'var(--sage-bg)' : 'var(--bg-elevated)',
                  border: filterClient === c ? '1px solid var(--border-sage)' : '1px solid var(--border-color)',
                  color: filterClient === c ? 'var(--sage-light)' : 'var(--text-dim)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {c === 'all' ? 'All Clients' : c}
              </button>
            ))}
          </div>
          <button
            className="btn-action btn-reset"
            style={{ fontSize: '0.75rem', padding: '5px 10px' }}
            onClick={onClearLogs}
            title="Clear Log History"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Explanatory Banner */}
      <div style={{ background: 'var(--sage-bg)', border: '1px solid var(--border-sage)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <Lightbulb size={16} color="var(--sage-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--text-main)' }}>Multi-Server Distributed Proof:</strong> Watch the <code style={{ color: 'var(--sage-light)' }}>Handled By Server</code> column alternate between <code style={{ color: 'var(--server-1)' }}>Instance-3001</code>, <code style={{ color: 'var(--server-2)' }}>Instance-3002</code>, and <code style={{ color: 'var(--server-3)' }}>Instance-3003</code> while the <code style={{ color: 'var(--text-main)' }}>Remaining Tokens</code> continues to decrement monotonically across servers.
        </div>
      </div>

      {/* Table Container */}
      <div style={{ maxHeight: '380px', overflowY: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            No request logs yet. Click <strong style={{ fontFamily: 'var(--font-display)' }}>"Hit API"</strong> or <strong style={{ fontFamily: 'var(--font-display)' }}>"Burst"</strong> on any client card to view live traffic!
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Client ID</th>
                <th>Handled By Server</th>
                <th>Status</th>
                <th>Remaining Tokens</th>
                <th>Reset / Wait</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const serverPort = log.servedBy?.replace('Instance-', '') || '3001';
                const serverClass = `server-${serverPort}`;
                return (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{log.timeStr}</td>
                    <td><strong style={{ color: 'var(--sage-light)' }}>{log.clientId}</strong></td>
                    <td><span className={`server-badge ${serverClass}`}><Server size={10} /> {log.servedBy}</span></td>
                    <td>{log.allowed ? (<span className="badge-allowed"><CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />200 Allowed</span>) : (<span className="badge-blocked"><XCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />429 Rate Limited</span>)}</td>
                    <td><strong style={{ color: log.allowed ? 'var(--emerald)' : 'var(--rose)' }}>{(log.remaining ?? 0).toFixed(2)}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/ {log.capacity || 10}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>{log.resetInMs > 0 ? `${(log.resetInMs / 1000).toFixed(1)}s` : '0s'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{log.latencyMs}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
