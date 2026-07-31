import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ClientCard from './components/ClientCard';
import RequestLogTable from './components/RequestLogTable';
import ArchitectureModal from './components/ArchitectureModal';
import { Flame, CheckCircle2, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';

const CLIENT_DEFINITIONS = [
  {
    id: 'client-a',
    name: 'Standard Client (Client A)',
    capacity: 10,
    refillRate: 0.5,
    description: '10 tokens max, 0.5 token/sec (1 every 2s)'
  },
  {
    id: 'client-b',
    name: 'Strict Client (Client B)',
    capacity: 5,
    refillRate: 0.2,
    description: '5 tokens max, 0.2 token/sec (1 every 5s)'
  },
  {
    id: 'client-c',
    name: 'VIP Client (Client C)',
    capacity: 20,
    refillRate: 2.0,
    description: '20 tokens max, 2.0 tokens/sec refill'
  }
];

export default function App() {
  const [clientStates, setClientStates] = useState({
    'client-a': { currentTokens: 10, lastServedBy: null },
    'client-b': { currentTokens: 5, lastServedBy: null },
    'client-c': { currentTokens: 20, lastServedBy: null }
  });

  const [logs, setLogs] = useState([]);
  const [totalStats, setTotalStats] = useState({ total: 0, allowed: 0, blocked: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [burstSummary, setBurstSummary] = useState(null);

  // Fetch live client token states from backend
  const fetchClientStates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clients`);
      if (res.ok) {
        const data = await res.json();
        const updated = {};
        data.clients.forEach((c) => {
          updated[c.id] = {
            currentTokens: c.currentTokens,
            lastServedBy: clientStates[c.id]?.lastServedBy || null
          };
        });
        setClientStates((prev) => ({ ...prev, ...updated }));
      }
    } catch (err) {
      // Backend may be starting or offline
    }
  }, [clientStates]);

  // Periodic polling for token refill animation
  useEffect(() => {
    fetchClientStates();
    const interval = setInterval(fetchClientStates, 1000);
    return () => clearInterval(interval);
  }, []);

  // Execute single API check
  const handleHitApi = async (clientId) => {
    const startTime = performance.now();
    try {
      const res = await fetch(`${API_BASE}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const data = await res.json();

      const timeStr = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });

      const newLog = {
        id: `${Date.now()}-${Math.random()}`,
        timeStr,
        clientId,
        servedBy: data.servedBy || 'Server-3000',
        allowed: data.allowed,
        remaining: data.remaining,
        capacity: data.capacity,
        resetInMs: data.resetInMs || 0,
        latencyMs
      };

      setLogs((prev) => [newLog, ...prev.slice(0, 49)]);

      setTotalStats((prev) => ({
        total: prev.total + 1,
        allowed: prev.allowed + (data.allowed ? 1 : 0),
        blocked: prev.blocked + (data.allowed ? 0 : 1)
      }));

      setClientStates((prev) => ({
        ...prev,
        [clientId]: {
          currentTokens: data.remaining,
          lastServedBy: data.servedBy
        }
      }));
    } catch (err) {
      console.error('API call failed:', err);
    }
  };

  // Execute custom batch burst requests
  const handleBurstApi = async (clientId, count = 20) => {
    setIsProcessing(true);
    setBurstSummary(null);

    const clientDef = CLIENT_DEFINITIONS.find((c) => c.id === clientId) || { capacity: 10 };
    const requests = Array.from({ length: count }, (_, i) => i);

    const startTime = performance.now();
    const results = await Promise.all(
      requests.map(async () => {
        const reqStart = performance.now();
        try {
          const res = await fetch(`${API_BASE}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
          });
          const latencyMs = Math.round(performance.now() - reqStart);
          const data = await res.json();
          return {
            status: res.status,
            allowed: data.allowed,
            remaining: data.remaining,
            capacity: data.capacity || clientDef.capacity,
            resetInMs: data.resetInMs || 0,
            servedBy: data.servedBy,
            latencyMs
          };
        } catch (err) {
          return { status: 500, allowed: false, error: true };
        }
      })
    );

    const totalDuration = Math.round(performance.now() - startTime);
    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    // Breakdown by server instance
    const serverCounts = {};
    results.forEach((r) => {
      if (r.servedBy) {
        serverCounts[r.servedBy] = (serverCounts[r.servedBy] || 0) + 1;
      }
    });

    // Create log entries for all burst requests
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    // Sort burst results chronologically by atomic Redis execution order:
    // Allowed requests first (sorted by remaining tokens descending 9 -> 8 -> ... -> 0), then blocked requests
    const sortedResults = [...results].sort((a, b) => {
      if (a.allowed && !b.allowed) return -1;
      if (!a.allowed && b.allowed) return 1;
      if (a.allowed && b.allowed) return b.remaining - a.remaining;
      return 0;
    });

    const newLogs = sortedResults.map((r, idx) => ({
      id: `${Date.now()}-burst-${idx}`,
      timeStr,
      clientId,
      servedBy: r.servedBy || 'Server-3000',
      allowed: r.allowed,
      remaining: r.remaining ?? 0,
      capacity: r.capacity || clientDef.capacity,
      resetInMs: r.resetInMs || 0,
      latencyMs: r.latencyMs || 0
    }));

    setLogs((prev) => [...newLogs, ...prev].slice(0, 99));

    setTotalStats((prev) => ({
      total: prev.total + count,
      allowed: prev.allowed + allowedCount,
      blocked: prev.blocked + blockedCount
    }));

    // Find last remaining token count from burst
    const lastValidResult = [...results].reverse().find((r) => r.remaining !== undefined);
    if (lastValidResult) {
      setClientStates((prev) => ({
        ...prev,
        [clientId]: {
          currentTokens: lastValidResult.remaining,
          lastServedBy: lastValidResult.servedBy
        }
      }));
    }

    setBurstSummary({
      clientId,
      allowedCount,
      blockedCount,
      capacity: clientDef.capacity,
      totalDuration,
      count,
      serverCounts
    });

    setIsProcessing(false);
  };

  // Update client capacity and refill rate configuration dynamically
  const handleUpdateConfig = async (clientId, capacity, refillRate) => {
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, capacity, refillRate })
      });
      if (res.ok) {
        const data = await res.json();
        // Update local definitions
        const idx = CLIENT_DEFINITIONS.findIndex((c) => c.id === clientId);
        if (idx !== -1) {
          CLIENT_DEFINITIONS[idx] = {
            ...CLIENT_DEFINITIONS[idx],
            capacity: data.config.capacity,
            refillRate: data.config.refillRate,
            description: data.config.description
          };
        }
        fetchClientStates();
      }
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  // Reset client bucket
  const handleResetClient = async (clientId) => {
    try {
      await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      fetchClientStates();
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  // Reset all client buckets
  const handleResetAll = async () => {
    try {
      await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      setLogs([]);
      setTotalStats({ total: 0, allowed: 0, blocked: 0 });
      setBurstSummary(null);
      fetchClientStates();
    } catch (err) {
      console.error('Reset all error:', err);
    }
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <Header totalStats={totalStats} onResetAll={handleResetAll} />

      {/* Burst Summary Banner */}
      {burstSummary && (
        <div className="burst-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Flame size={24} color="var(--rose)" />
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-main)', margin: 0, fontSize: '1.1rem' }}>
                  Burst Completed for <span style={{ color: 'var(--sage-light)' }}>{burstSummary.clientId}</span>
                </h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                  Fired 20 parallel requests in {burstSummary.totalDuration}ms across distributed servers.
                </p>
              </div>
            </div>

            {/* Results Pill Tally */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span className="badge-allowed" style={{ fontSize: '0.9rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {burstSummary.allowedCount} Allowed
                </span>
                <span className="badge-blocked" style={{ fontSize: '0.9rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} /> {burstSummary.blockedCount} Blocked
                </span>
              </div>

              {/* Server Distribution Breakdown */}
              <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem' }}>
                {Object.entries(burstSummary.serverCounts).map(([srv, count]) => (
                  <span key={srv} className={`server-badge server-${srv.replace('Instance-', '')}`}>
                    {srv}: {count} reqs
                  </span>
                ))}
              </div>

              <button
                onClick={() => setBurstSummary(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3 Client Cards Grid */}
      <div className="cards-grid">
        {CLIENT_DEFINITIONS.map((cfg) => (
          <ClientCard
            key={cfg.id}
            clientConfig={cfg}
            clientState={clientStates[cfg.id]}
            onHitApi={handleHitApi}
            onBurstApi={handleBurstApi}
            onResetClient={handleResetClient}
            onUpdateConfig={handleUpdateConfig}
            isProcessing={isProcessing}
          />
        ))}
      </div>

      {/* Live Request Logs */}
      <RequestLogTable logs={logs} onClearLogs={() => setLogs([])} />

      {/* Architecture Deep-Dive */}
      <ArchitectureModal />
    </div>
  );
}
