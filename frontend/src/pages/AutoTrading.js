/**
 * Auto Trading dashboard: TradingView webhook → orders (paper/live).
 * Live positions, closed trades, orders, alerts; segment filter; export; WebSocket updates.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const TRADING_SERVICE_URL = process.env.REACT_APP_TRADING_SERVICE_URL || 'http://localhost:8000';
const SEGMENTS = [
  { value: '', label: 'All segments' },
  { value: 'fno_stock', label: 'F&O Stocks' },
  { value: 'index_options', label: 'Index Options' },
  { value: 'long_term', label: 'Long-term' },
];

function formatINR(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

function useTradingApi(path, segment = '', limit = 200) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const url = segment
    ? `${TRADING_SERVICE_URL}${path}?segment=${encodeURIComponent(segment)}&limit=${limit}`
    : `${TRADING_SERVICE_URL}${path}?limit=${limit}`;

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || 'Request failed');
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refetch: fetchData };
}

function useTradingStatus() {
  const [status, setStatus] = useState({ mode: 'paper', connector: 'paper', live: false, error: null });
  const fetchStatus = useCallback(() => {
    fetch(`${TRADING_SERVICE_URL}/api/status`)
      .then((res) => res.json())
      .then(setStatus)
      .catch((e) => setStatus((s) => ({ ...s, error: e.message })));
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  return { ...status, refetch: fetchStatus };
}

export default function AutoTrading({ darkMode }) {
  const [segmentFilter, setSegmentFilter] = useState('');
  const [activeTab, setActiveTab] = useState('positions'); // positions | orders | closed | alerts
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const { mode, connector, live, error: statusError, refetch: refetchStatus } = useTradingStatus();
  const { data: positionsData, loading: positionsLoading, error: positionsError, refetch: refetchPositions } = useTradingApi('/api/positions', segmentFilter || undefined);
  const { data: ordersData, loading: ordersLoading, error: ordersError, refetch: refetchOrders } = useTradingApi('/api/orders', segmentFilter || undefined, 200);
  const { data: closedData, loading: closedLoading, error: closedError, refetch: refetchClosed } = useTradingApi('/api/closed', segmentFilter || undefined, 500);
  const { data: alertsData, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useTradingApi('/api/alerts', segmentFilter || undefined, 200);

  const refetchAll = useCallback(() => {
    refetchStatus();
    refetchPositions();
    refetchOrders();
    refetchClosed();
    refetchAlerts();
  }, [refetchStatus, refetchPositions, refetchOrders, refetchClosed, refetchAlerts]);

  // WebSocket for live updates
  useEffect(() => {
    const wsUrl = (TRADING_SERVICE_URL.replace(/^http/, 'ws') + '/ws').replace(/\/\/+/g, '//');
    let ws;
    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => { if (reconnectRef.current) clearTimeout(reconnectRef.current); };
        ws.onmessage = () => refetchAll();
        ws.onclose = () => { reconnectRef.current = setTimeout(connect, 3000); };
        ws.onerror = () => {};
      } catch (_) {}
      wsRef.current = ws;
    }
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [refetchAll]);

  const positions = positionsData?.positions ?? [];
  const orders = ordersData?.orders ?? [];
  const trades = closedData?.trades ?? [];
  const alerts = alertsData?.alerts ?? [];

  const loading = activeTab === 'positions' ? positionsLoading : activeTab === 'orders' ? ordersLoading : activeTab === 'closed' ? closedLoading : alertsLoading;
  const error = activeTab === 'positions' ? positionsError : activeTab === 'orders' ? ordersError : activeTab === 'closed' ? closedError : alertsError;

  function exportJSON() {
    const payload = { segment: segmentFilter || 'all', positions, orders, trades, alerts, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trading-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCSV() {
    const rows = [];
    if (activeTab === 'positions' && positions.length) {
      rows.push('Segment,Symbol,Side,Quantity,Avg Price');
      positions.forEach((p) => rows.push([p.segment, p.symbol, p.side, p.quantity, p.avg_price].join(',')));
    } else if (activeTab === 'orders' && orders.length) {
      rows.push('Order ID,Segment,Symbol,Side,Qty,Type,Price,Status,Created');
      orders.forEach((o) => rows.push([o.order_id, o.segment, o.symbol, o.side, o.quantity, o.order_type, o.price, o.status, o.created_at].join(',')));
    } else if (activeTab === 'closed' && trades.length) {
      rows.push('Segment,Symbol,Side,Qty,Entry,Exit,P&L,Closed At');
      trades.forEach((t) => rows.push([t.segment, t.symbol, t.side, t.quantity, t.entry_price, t.exit_price, t.pnl, t.closed_at].join(',')));
    } else {
      rows.push('No data to export');
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trading-${activeTab}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const base = darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-900';
  const tableBorder = darkMode ? 'border-slate-600' : 'border-gray-200';

  return (
    <div className="p-3 sm:p-6 space-y-4 overflow-auto">
      {/* Status + mode */}
      <div className={`rounded-lg border p-4 ${base}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium ${live ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              {live ? 'Live' : 'Paper'}
            </span>
            <span className="text-sm text-gray-500 dark:text-slate-400">Connector: {connector}</span>
            {statusError && <span className="text-sm text-red-600 dark:text-red-400">Service: {statusError}</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-500">Mode is set by TRADING_MODE env in the trading service. Restart the service to switch.</p>
        </div>
      </div>

      {/* Segment filter + tabs + export */}
      <div className={`rounded-lg border overflow-hidden ${base}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-gray-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className={`rounded border px-2 py-1.5 text-sm ${darkMode ? 'border-slate-600 bg-slate-700' : 'border-gray-300 bg-white'}`}
            >
              {SEGMENTS.map((s) => (
                <option key={s.value || 'all'} value={s.value}>{s.label}</option>
              ))}
            </select>
            {['positions', 'orders', 'closed', 'alerts'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded ${activeTab === tab ? 'bg-red-600 text-white' : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refetchAll} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded hover:bg-gray-100 dark:hover:bg-slate-700">Refresh</button>
            <button type="button" onClick={exportCSV} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded hover:bg-gray-100 dark:hover:bg-slate-700">Export CSV</button>
            <button type="button" onClick={exportJSON} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded hover:bg-gray-100 dark:hover:bg-slate-700">Export JSON</button>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[200px]">
          {loading && <p className="p-4 text-gray-500 dark:text-slate-400">Loading…</p>}
          {error && <p className="p-4 text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && activeTab === 'positions' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b ${tableBorder} text-gray-600 dark:text-slate-400`}>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Symbol</th>
                  <th className="p-2">Side</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Avg price</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-gray-500 dark:text-slate-500">No positions</td></tr>
                ) : (
                  positions.map((p, i) => (
                    <tr key={`${p.segment}-${p.symbol}-${p.side}-${i}`} className={`border-b ${tableBorder}`}>
                      <td className="p-2">{p.segment}</td>
                      <td className="p-2 font-medium">{p.symbol}</td>
                      <td className="p-2">{p.side}</td>
                      <td className="p-2">{p.quantity}</td>
                      <td className="p-2">{formatINR(p.avg_price)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {!loading && !error && activeTab === 'orders' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b ${tableBorder} text-gray-600 dark:text-slate-400`}>
                  <th className="p-2">Order ID</th>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Symbol</th>
                  <th className="p-2">Side</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="p-4 text-gray-500 dark:text-slate-500">No orders</td></tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.order_id} className={`border-b ${tableBorder}`}>
                      <td className="p-2 font-mono text-xs truncate max-w-[120px]" title={o.order_id}>{o.order_id}</td>
                      <td className="p-2">{o.segment}</td>
                      <td className="p-2">{o.symbol}</td>
                      <td className="p-2">{o.side}</td>
                      <td className="p-2">{o.quantity}</td>
                      <td className="p-2">{o.status}</td>
                      <td className="p-2 text-xs text-gray-500 dark:text-slate-500">{o.created_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {!loading && !error && activeTab === 'closed' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b ${tableBorder} text-gray-600 dark:text-slate-400`}>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Symbol</th>
                  <th className="p-2">Side</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Entry</th>
                  <th className="p-2">Exit</th>
                  <th className="p-2">P&L</th>
                  <th className="p-2">Closed</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={8} className="p-4 text-gray-500 dark:text-slate-500">No closed trades</td></tr>
                ) : (
                  trades.map((t, i) => (
                    <tr key={`${t.closed_at}-${t.symbol}-${i}`} className={`border-b ${tableBorder}`}>
                      <td className="p-2">{t.segment}</td>
                      <td className="p-2 font-medium">{t.symbol}</td>
                      <td className="p-2">{t.side}</td>
                      <td className="p-2">{t.quantity}</td>
                      <td className="p-2">{formatINR(t.entry_price)}</td>
                      <td className="p-2">{formatINR(t.exit_price)}</td>
                      <td className={`p-2 font-medium ${(t.pnl || 0) >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatINR(t.pnl)}</td>
                      <td className="p-2 text-xs text-gray-500 dark:text-slate-500">{t.closed_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {!loading && !error && activeTab === 'alerts' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b ${tableBorder} text-gray-600 dark:text-slate-400`}>
                  <th className="p-2">ID</th>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Order ID</th>
                  <th className="p-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-gray-500 dark:text-slate-500">No alerts</td></tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className={`border-b ${tableBorder}`}>
                      <td className="p-2">{a.id}</td>
                      <td className="p-2">{a.segment}</td>
                      <td className="p-2">{a.status}</td>
                      <td className="p-2 font-mono text-xs truncate max-w-[100px]" title={a.order_id}>{a.order_id || '—'}</td>
                      <td className="p-2 text-xs text-gray-500 dark:text-slate-500">{a.received_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
