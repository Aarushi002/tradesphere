import { useState, useEffect } from 'react';
import { formatINR } from '../utils/currency';
import PriceChart from '../components/PriceChart';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('token');
}

function CommentForm({ postId, onAdd }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    onAdd(text);
    setText('');
    setLoading(false);
  }
  return (
    <form onSubmit={handleSubmit} className="mt-2 ml-4 flex gap-2">
      <input
        placeholder="Add a comment..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        className="flex-1 rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 px-2 py-1 text-sm"
      />
      <button type="submit" disabled={loading} className="rounded bg-gray-200 dark:bg-slate-600 px-2 py-1 text-sm hover:bg-gray-300 dark:hover:bg-slate-500">Reply</button>
    </form>
  );
}

const BOTTOM_TABS = ['Orders', 'Positions', 'Holdings', 'P&L'];

export default function Dashboard({ user, onLogout, darkMode, onToggleDarkMode }) {
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
  const [feed, setFeed] = useState([]);
  const [postContent, setPostContent] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [commentByPost, setCommentByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [symbol, setSymbol] = useState('RELIANCE');
  const [quantity, setQuantity] = useState('10');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [bottomTab, setBottomTab] = useState('Holdings');
  const [searchQuery, setSearchQuery] = useState('');
  const [candles, setCandles] = useState([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => { setPortfolio(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/trades`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setTrades)
      .catch(() => setTrades([]));
  }, [portfolio]);

  useEffect(() => {
    fetch(`${API_URL}/api/social/feed`)
      .then((res) => res.json())
      .then(setFeed)
      .catch(() => setFeed([]));
  }, [portfolio]);

  // Temporary mock data for the price chart (Step 3)
  useEffect(() => {
    // In Step 4 we'll replace this with real backend data
    const now = Math.floor(Date.now() / 1000);
    const mock = [
      { time: now - 60 * 5, open: 100, high: 105, low: 98, close: 103 },
      { time: now - 60 * 4, open: 103, high: 108, low: 101, close: 107 },
      { time: now - 60 * 3, open: 107, high: 110, low: 104, close: 105 },
      { time: now - 60 * 2, open: 105, high: 109, low: 103, close: 108 },
      { time: now - 60 * 1, open: 108, high: 112, low: 107, close: 111 },
    ];
    setCandles(mock);
  }, []);

  async function loadComments(postId) {
    const res = await fetch(`${API_URL}/api/social/posts/${postId}/comments`);
    const data = await res.json();
    setCommentByPost((prev) => ({ ...prev, [postId]: data }));
  }

  async function handleCreatePost(e) {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPostLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/social/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: postContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post');
      setPostContent('');
      setFeed((prev) => [data, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setPostLoading(false);
    }
  }

  async function handleAddComment(postId, content) {
    if (!content?.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/social/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to comment');
      setCommentByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
    } catch (err) {
      setError(err.message);
    }
  }

  function refreshPortfolio() {
    setLoading(true);
    const token = getToken();
    fetch(`${API_URL}/api/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => { setPortfolio(data); setLoading(false); });
    fetch(`${API_URL}/api/trades`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setTrades);
  }

  async function handleBuy(e) {
    e.preventDefault();
    setTradeLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/trades/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), quantity: Number(quantity) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Buy failed');
      setQuantity('10');
      refreshPortfolio();
    } catch (err) {
      setError(err.message);
    } finally {
      setTradeLoading(false);
    }
  }

  async function handleSell(e) {
    e.preventDefault();
    setTradeLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/trades/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), quantity: Number(quantity) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sell failed');
      setQuantity('10');
      refreshPortfolio();
    } catch (err) {
      setError(err.message);
    } finally {
      setTradeLoading(false);
    }
  }

  const totalUnrealizedPnl = portfolio?.holdings?.reduce((sum, h) => sum + (h.unrealizedPnl || 0), 0) ?? 0;

  if (loading && !portfolio) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100 dark:bg-slate-900">
      {/* Top Bar - Gamma Flow style */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 shadow-sm">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-sky-600 dark:text-sky-400">TradeSphere</h1>
          <input
            type="text"
            placeholder="Search stocks, indices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded bg-emerald-500/15 dark:bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Funds: {portfolio ? formatINR(portfolio.user?.cashBalance) : '—'}
          </div>
          <span className="text-sm text-gray-600 dark:text-slate-400">{user?.tradingId || '—'} · {user?.name}</span>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="rounded p-1.5 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button
            onClick={onLogout}
            className="rounded bg-gray-200 dark:bg-slate-600 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-slate-500"
          >
            Log out
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Watchlist */}
        <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
          <h2 className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">Watchlist</h2>
          <ul className="space-y-1 text-sm">
            {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'NIFTY 50'].map((s) => (
              <li
                key={s}
                className={`cursor-pointer rounded px-2 py-1.5 ${symbol === s ? 'bg-sky-100 dark:bg-sky-900/50 font-medium text-sky-700 dark:text-sky-300' : 'hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                onClick={() => setSymbol(s)}
              >
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">Click to select for trading</p>
        </aside>

        {/* Main Panel - Chart + Order */}
        <main className="flex flex-1 flex-col min-h-0">
          <div className="flex flex-1 min-h-0 gap-2 p-2">
            {/* Chart area */}
            <div className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-gray-800 dark:text-slate-200">{symbol}</span>
                <span className="text-xs text-gray-500 dark:text-slate-400">Candlestick chart</span>
              </div>
              <div className="h-full min-h-[200px] rounded bg-gray-50 dark:bg-slate-900">
                <PriceChart data={candles} />
              </div>
            </div>

            {/* Order window */}
            <div className="w-72 shrink-0 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-slate-200">Order</h3>
              <form onSubmit={handleBuy} className="mb-3 space-y-2">
                <input
                  placeholder="Symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={1}
                  className="w-full rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={tradeLoading}
                  className="w-full rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Buy
                </button>
              </form>
              <form onSubmit={handleSell} className="space-y-2">
                <button
                  type="submit"
                  disabled={tradeLoading}
                  className="w-full rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Sell
                </button>
              </form>
            </div>
          </div>

          {/* Bottom Panel - Tabs */}
          <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex border-b border-gray-200 dark:border-slate-700">
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2 text-sm font-medium ${bottomTab === tab ? 'border-b-2 border-sky-600 dark:border-sky-400 text-sky-600 dark:text-sky-400' : 'text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="max-h-48 overflow-auto p-3 text-slate-900 dark:text-slate-100">
              {bottomTab === 'Orders' && (
                <table className="w-full text-left text-sm text-slate-800 dark:text-slate-200">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Instrument</th>
                      <th className="pb-2 pr-4">Side</th>
                      <th className="pb-2 pr-4">Qty</th>
                      <th className="pb-2 pr-4">Price</th>
                      <th className="pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-gray-500 dark:text-slate-500">No orders yet</td></tr>
                    ) : (
                      [...trades].reverse().slice(0, 20).map((t) => (
                        <tr key={t._id} className="border-b border-gray-100 dark:border-slate-700">
                          <td className="py-1.5 pr-4 text-gray-600 dark:text-slate-400">{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                          <td className="py-1.5 pr-4">{t.symbol}</td>
                          <td className={`py-1.5 pr-4 font-medium ${t.side === 'buy' ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{t.side}</td>
                          <td className="py-1.5 pr-4">{t.quantity}</td>
                          <td className="py-1.5 pr-4">{formatINR(t.price)}</td>
                          <td className="py-1.5">{formatINR(t.totalAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
              {bottomTab === 'Positions' && (
                <div className="text-sm">
                  {portfolio?.holdings?.length ? (
                    <table className="w-full text-left text-slate-800 dark:text-slate-200">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                          <th className="pb-2 pr-4">Symbol</th>
                          <th className="pb-2 pr-4">Qty</th>
                          <th className="pb-2 pr-4">Avg</th>
                          <th className="pb-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.holdings.map((h) => (
                          <tr key={h.symbol} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-4">{h.symbol}</td>
                            <td className="py-1.5 pr-4">{h.quantity}</td>
                            <td className="py-1.5 pr-4">{formatINR(h.avgBuyPrice)}</td>
                            <td className={`py-1.5 ${(h.unrealizedPnl || 0) >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatINR(h.unrealizedPnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-500">No open positions</p>
                  )}
                </div>
              )}
              {bottomTab === 'Holdings' && (
                <div className="text-sm">
                  {portfolio?.holdings?.length ? (
                    <table className="w-full text-left text-slate-800 dark:text-slate-200">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                          <th className="pb-2 pr-4">Stock</th>
                          <th className="pb-2 pr-4">Qty</th>
                          <th className="pb-2 pr-4">Avg Price</th>
                          <th className="pb-2 pr-4">Current</th>
                          <th className="pb-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.holdings.map((h) => (
                          <tr key={h.symbol} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-4">{h.symbol}</td>
                            <td className="py-1.5 pr-4">{h.quantity}</td>
                            <td className="py-1.5 pr-4">{formatINR(h.avgBuyPrice)}</td>
                            <td className="py-1.5 pr-4">{formatINR(h.value / h.quantity)}</td>
                            <td className={`py-1.5 ${(h.unrealizedPnl || 0) >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatINR(h.unrealizedPnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-500">No holdings. Place a buy order above.</p>
                  )}
                </div>
              )}
              {bottomTab === 'P&L' && (
                <div className="space-y-2 text-sm">
                  <p><strong>Portfolio value:</strong> {portfolio ? formatINR(portfolio.portfolioValue) : '—'}</p>
                  <p><strong>Unrealized P&L:</strong> <span className={totalUnrealizedPnl >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{formatINR(totalUnrealizedPnl)}</span></p>
                  <p className="text-gray-500 dark:text-slate-500">Realized P&L (from closed trades) will appear here when we track it.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Collapsible Feed (optional) - keep for social */}
      <details className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">Feed</summary>
        <div className="max-h-64 overflow-auto border-t border-gray-100 dark:border-slate-700 p-4">
          <form onSubmit={handleCreatePost} className="mb-4">
            <textarea
              placeholder="Share a thought or strategy..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              maxLength={2000}
              rows={2}
              className="mb-2 w-full rounded border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 text-sm"
            />
            <button type="submit" disabled={postLoading} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Post</button>
          </form>
          {feed.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-500">No posts yet.</p>
          ) : (
            feed.map((post) => (
              <div key={post._id} className="border-b border-gray-100 dark:border-slate-700 py-3">
                <p className="font-medium text-gray-800 dark:text-slate-200">{post.user?.name}</p>
                <p className="text-sm text-gray-700 dark:text-slate-300">{post.content}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}</p>
                {commentByPost[post._id] === undefined && (
                  <button type="button" onClick={() => loadComments(post._id)} className="mt-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">View comments</button>
                )}
                {commentByPost[post._id] && (
                  <>
                    {commentByPost[post._id].map((c) => (
                      <div key={c._id} className="ml-4 mt-2 text-sm text-slate-800 dark:text-slate-200"><strong>{c.user?.name}:</strong> {c.content}</div>
                    ))}
                    <CommentForm postId={post._id} onAdd={(content) => handleAddComment(post._id, content)} />
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
