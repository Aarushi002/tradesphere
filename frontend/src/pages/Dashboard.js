import { useState, useEffect } from 'react';
import { formatINR } from '../utils/currency';
import PriceChart from '../components/PriceChart';
import Logo from '../assets/only_logo.jpg';

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

const WATCHLIST_KEY = 'tradesphere_watchlist';

// Deterministic mock candles per symbol so each stock has different chart
function generateMockCandles(symbol, nowUnix) {
  let seed = 0;
  const s = (symbol || '').toUpperCase();
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 16) / 65536;
  };
  const base = 80 + (rand() * 400) | 0;
  const count = 24;
  const candles = [];
  let open = base;
  for (let i = count; i >= 0; i--) {
    const time = nowUnix - 60 * 5 * i;
    const change = (rand() - 0.48) * 8;
    const close = Math.max(10, open + change);
    const high = Math.max(open, close) + rand() * 4;
    const low = Math.min(open, close) - rand() * 4;
    candles.push({ time, open, high, low, close });
    open = close;
  }
  return candles;
}

const DEFAULT_WATCHLIST = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'NIFTY 50'];

// Fallback mock indices when real quotes API is unavailable
const MOCK_INDICES = [
  { name: 'NIFTY 50', value: 24120.45, change: -128.50, changePercent: -0.53 },
  { name: 'SENSEX', value: 79234.12, change: -420.30, changePercent: -0.53 },
];

const INDEX_NAMES = ['NIFTY 50', 'SENSEX'];

// Per-symbol mock last price and change (for watchlist display)
function getMockQuote(symbol) {
  let seed = 0;
  const s = (symbol || '').toUpperCase();
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 16) / 65536; };
  const base = 80 + (rand() * 400) | 0;
  const change = (rand() - 0.5) * 2 * base / 100;
  const lastPrice = base + change;
  const changePercent = base ? (change / base * 100) : 0;
  return { lastPrice: Math.round(lastPrice * 100) / 100, change: Math.round(change * 100) / 100, changePercent: Math.round(changePercent * 100) / 100 };
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      return Array.isArray(list) && list.length > 0 ? list : DEFAULT_WATCHLIST;
    }
  } catch (_) {}
  return DEFAULT_WATCHLIST;
}

function saveWatchlist(list) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch (_) {}
}

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
  // eslint-disable-next-line no-unused-vars -- kept for future trade/tab UI
  const [tradeLoading, setTradeLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars -- kept for future tab UI
  const [bottomTab, setBottomTab] = useState('Holdings');
  const [searchQuery, setSearchQuery] = useState('');
  const [candles, setCandles] = useState([]);
  const [chartRange, setChartRange] = useState('6d'); // 1d, 6d, 14d, 52w, ytd, 1m, 3m
  const [chartLoading, setChartLoading] = useState(false);
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [chartError, setChartError] = useState('');
  const [backendDown, setBackendDown] = useState(false);
  const [mainNav, setMainNav] = useState('dashboard');
  const [indices, setIndices] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [kitePositions, setKitePositions] = useState([]);
  const [kiteOrderLoading, setKiteOrderLoading] = useState(false);
  const [orderProduct, setOrderProduct] = useState('CNC');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderType, setOrderType] = useState('MARKET');
  const [kiteMargins, setKiteMargins] = useState(null);
  const [mfHoldings, setMfHoldings] = useState([]);
  const [mfOrders, setMfOrders] = useState([]);

  function fetchPortfolio() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    fetch(`${API_URL}/api/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((data) => {
        setPortfolio(data);
        setBackendDown(false);
      })
      .catch((err) => {
        setBackendDown(true);
        setError(err.message === 'Failed to fetch' ? 'Cannot reach backend. Start it to trade.' : err.message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchPortfolio();
  }, []);

  // Instrument search suggestions (Zerodha-like)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchSuggestions([]);
      setSearchSuggestionsOpen(false);
      return;
    }
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/market/instruments/search?q=${encodeURIComponent(q)}&limit=500`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((json) => {
          setSearchSuggestions(json.suggestions || []);
          setSearchSuggestionsOpen(true);
        })
        .catch(() => setSearchSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Kite positions (live)
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/kite/positions`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((json) => setKitePositions(json.positions || []))
      .catch(() => setKitePositions([]));
  }, [portfolio, trades]);

  // Kite margins + MF data when on Funds tab
  useEffect(() => {
    if (mainNav !== 'funds') return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/kite/margins?segment=equity`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then(setKiteMargins)
      .catch(() => setKiteMargins(null));
    fetch(`${API_URL}/api/kite/mf/holdings`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((json) => setMfHoldings(json.holdings || []))
      .catch(() => setMfHoldings([]));
    fetch(`${API_URL}/api/kite/mf/orders`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((json) => setMfOrders(json.orders || []))
      .catch(() => setMfOrders([]));
  }, [mainNav]);

  // Fetch real-time quotes for indices and all watchlist symbols (live values)
  function updateQuotesFromResponse(json) {
    if (!json?.data || !Array.isArray(json.data)) return;
    const data = json.data;
    setIndices(data.filter((q) => INDEX_NAMES.includes(q.name)));
    const newQuotes = Object.fromEntries(
      data.map((q) => [q.name, { lastPrice: q.value, change: q.change, changePercent: q.changePercent }])
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }

  useEffect(() => {
    const symbols = [...INDEX_NAMES];
    watchlist.forEach((s) => {
      const sym = (s || '').toString().trim();
      if (sym && !symbols.includes(sym)) symbols.push(sym);
    });
    if (symbols.length === 0) return;
    const qs = symbols.map((s) => encodeURIComponent(s)).join(',');
    fetch(`${API_URL}/api/market/quotes?symbols=${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 503 ? 'Quotes unavailable' : 'Failed to fetch quotes');
        return res.json();
      })
      .then(updateQuotesFromResponse)
      .catch(() => {
        setIndices([]);
      });
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/market/quotes?symbols=${qs}`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then(updateQuotesFromResponse)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [watchlist]);

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

  function addToWatchlist(s) {
    const sym = (s || searchQuery).toString().trim().toUpperCase();
    if (!sym) return;
    setWatchlist((prev) => {
      if (prev.includes(sym)) return prev;
      const next = [...prev, sym];
      saveWatchlist(next);
      return next;
    });
    setSearchQuery('');
  }

  function removeFromWatchlist(s) {
    const next = watchlist.filter((x) => x !== s);
    saveWatchlist(next);
    setWatchlist(next);
    if (symbol === s) setSymbol(next[0] || '');
  }

  // Fetch real chart data by symbol + range (1d, 6d, 14d, 52w, ytd, 1m, 3m)
  useEffect(() => {
    const apiSymbol = (symbol || '').toString().trim();
    setChartError('');
    if (!apiSymbol) {
      setCandles([]);
      return;
    }

    setChartLoading(true);
    const token = getToken();
    fetch(`${API_URL}/api/market/candles?symbol=${encodeURIComponent(apiSymbol)}&range=${encodeURIComponent(chartRange)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to fetch');
        return json;
      })
      .then((json) => {
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const data = json.data.map((c) => ({
            time: typeof c.time === 'number' ? (c.time < 1e10 ? c.time : Math.floor(c.time / 1000)) : Math.floor((c.date || 0) / 1000),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }));
          setCandles(data);
          setChartError('');
        } else {
          throw new Error(json.error || 'No data');
        }
      })
      .catch((err) => {
        const now = Math.floor(Date.now() / 1000);
        setCandles(generateMockCandles(apiSymbol, now));
        setChartError(err?.message || 'Using sample data. Set Kite credentials for real charts.');
      })
      .finally(() => setChartLoading(false));
  }, [symbol, chartRange]);

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

  // eslint-disable-next-line no-unused-vars -- used when adding back legacy buy/sell
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

  function isOptionSymbol(trSymbol) {
    const s = String(trSymbol || '').toUpperCase();
    return /CE$/.test(s) || /PE$/.test(s);
  }

  async function placeKiteOrder(transactionType) {
    const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
    const isNfo = ex === 'NFO';
    const isOpt = isOptionSymbol(trSymbol);
    const useLimit = isNfo && isOpt ? true : orderType === 'LIMIT';
    const payload = {
      exchange: ex,
      tradingsymbol: trSymbol,
      transaction_type: transactionType,
      quantity: Number(quantity) || 1,
      order_type: useLimit ? 'LIMIT' : 'MARKET',
      product: isNfo ? (orderProduct === 'CNC' ? 'NRML' : orderProduct) : orderProduct,
    };
    if (useLimit && orderPrice) payload.price = Number(orderPrice);
    setKiteOrderLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/kite/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      setQuantity('10');
      fetch(`${API_URL}/api/kite/positions`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => r.ok && r.json())
        .then((j) => setKitePositions(j.positions || []))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setKiteOrderLoading(false);
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

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Orders' },
    { id: 'holdings', label: 'Holdings' },
    { id: 'positions', label: 'Positions' },
    { id: 'funds', label: 'Funds' },
  ];

  return (
    <div className={`flex h-screen flex-col ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-900'}`}>
      {/* Top Bar - Zerodha style: indices left, nav + user right */}
      <header className={`flex items-center justify-between border-b px-4 py-2 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 ring-1 ring-emerald-400/30">
              <img src={Logo} alt="TradeSphere" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Trade<span className="text-emerald-500 dark:text-emerald-400">Sphere</span>
            </h1>
          </div>
          {indices.length > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium mr-2">Live</span>
          )}
          {(indices.length > 0 ? indices : MOCK_INDICES).map((idx) => (
            <div key={idx.name} className="flex items-center gap-2 text-sm">
              <span className={darkMode ? 'text-slate-300' : 'text-gray-700'}>{idx.name}</span>
              <span className={darkMode ? 'text-slate-100' : 'text-gray-900'}>{Number(idx.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className={idx.change < 0 ? 'text-red-500' : 'text-green-500'}>
                {idx.change >= 0 ? '+' : ''}{idx.change} ({idx.changePercent}%)
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setMainNav(item.id)}
              className={`px-3 py-2 text-sm font-medium rounded ${mainNav === item.id ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700" title="Cart">🛒</button>
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700" title="Notifications">🔔</button>
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-200 dark:border-slate-600">
            <span className="text-sm font-medium">{user?.tradingId || '—'}</span>
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={onLogout} className="text-sm text-gray-600 dark:text-slate-400 hover:underline">Log out</button>
          </div>
        </div>
      </header>

      {backendDown && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Backend not running</strong> — Buy/Sell and portfolio need the server. In a terminal: <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded">cd backend && npm start</code> (ensure MongoDB is running).{' '}
          <button type="button" onClick={() => fetchPortfolio()} className="ml-2 font-medium underline">Retry</button>
        </div>
      )}
      {error && !backendDown && (
        <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Zerodha-style Watchlist */}
        <aside className={`w-64 shrink-0 border-r flex flex-col ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
          <div className="p-2 border-b border-gray-200 dark:border-slate-700 relative">
            <input
              type="text"
              placeholder="Search: infy, nifty future, bank nifty option, MF"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchSuggestions.length > 0 && setSearchSuggestionsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchSuggestions.length > 0) {
                    const first = searchSuggestions[0];
                    const key = first.key || `${first.exchange}:${first.tradingsymbol}`;
                    setWatchlist((prev) => (prev.includes(key) ? prev : [...prev, key]));
                    saveWatchlist(watchlist.includes(key) ? watchlist : [...watchlist, key]);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                    setSearchSuggestionsOpen(false);
                  } else addToWatchlist();
                }
              }}
              className={`w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            {searchSuggestionsOpen && searchSuggestions.length > 0 && (
              <ul className={`absolute left-2 right-2 top-full mt-0.5 z-20 max-h-56 overflow-auto rounded border shadow-lg ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                {searchSuggestions.map((inst) => (
                  <li
                    key={inst.key || `${inst.exchange}:${inst.tradingsymbol}`}
                    className={`flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer text-left border-b last:border-b-0 ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-100'}`}
                    onClick={() => {
                      const key = inst.key || `${inst.exchange}:${inst.tradingsymbol}`;
                      setWatchlist((prev) => (prev.includes(key) ? prev : [...prev, key]));
                      saveWatchlist(watchlist.includes(key) ? watchlist : [...watchlist, key]);
                      setSearchQuery('');
                      setSearchSuggestions([]);
                      setSearchSuggestionsOpen(false);
                      setSymbol(key);
                    }}
                  >
                    <span className="font-medium text-sm">{inst.tradingsymbol}</span>
                    <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {inst.name || inst.tradingsymbol} · {inst.exchange}
                      {inst.instrument_type ? ` · ${(inst.instrument_type === 'FUT' ? 'Future' : inst.instrument_type === 'CE' || inst.instrument_type === 'PE' ? 'Option' : inst.instrument_type === 'INDEX' ? 'Index' : inst.instrument_type === 'MF' ? 'MF' : inst.instrument_type)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Ctrl+K to search</p>
          </div>
          <div className="p-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Watchlist 1 ({watchlist.length}/250)</span>
            <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ New group</button>
          </div>
          <div className="px-2 text-xs font-medium text-gray-500 dark:text-slate-500">Default ({watchlist.length})</div>
          <ul className="flex-1 overflow-auto min-h-0 text-sm">
            {watchlist.map((s) => {
              const displaySymbol = s.includes(':') ? s.split(':')[1] : s;
              let quoteKey = s.includes(':') ? s.split(':')[1] : (s === 'NIFTY50' ? 'NIFTY 50' : s);
              if (quoteKey === 'NIFTYBANK') quoteKey = 'NIFTY BANK';
              const realQuote = quotes[quoteKey];
              const q = realQuote ? { lastPrice: realQuote.lastPrice, change: realQuote.change, changePercent: realQuote.changePercent } : getMockQuote(displaySymbol);
              const isSelected = symbol === s;
              return (
                <li
                  key={s}
                  className={`group flex items-center justify-between gap-1 py-1.5 px-2 border-b cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-200'}`}
                  onClick={() => setSymbol(s)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{displaySymbol}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={q.change < 0 ? 'text-red-500' : 'text-green-500'}>{q.change >= 0 ? '+' : ''}{q.change} ({q.changePercent}%)</span>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>{q.lastPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFromWatchlist(s); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                    aria-label={`Remove ${s}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-2 flex items-center gap-2 border-t border-gray-200 dark:border-slate-700">
            <button type="button" onClick={() => addToWatchlist()} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-lg leading-none" title="Add">+</button>
            <span className="text-xs text-gray-500 dark:text-slate-500">Add to watchlist above</span>
          </div>
        </aside>

        {/* Main Panel - Zerodha-style: [Content | Order sidebar] on dashboard */}
        <main className={`flex-1 flex flex-col min-h-0 ${mainNav === 'dashboard' ? '' : 'overflow-auto'} ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
          {mainNav === 'dashboard' && (
            <div className="flex flex-1 min-h-0">
              {/* Center: scrollable content (chart + cards) */}
              <div className="flex-1 min-h-0 overflow-auto">
                <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                  <h2 className={`text-lg md:text-xl font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Hi, {user?.name || 'Trader'}</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🕐</span>
                        <h3 className="font-semibold">Equity</h3>
                      </div>
                      <p className="text-2xl font-bold">{portfolio ? formatINR(portfolio.user?.cashBalance) : '—'}</p>
                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Margins used 0</p>
                      <p className="text-sm text-gray-500 dark:text-slate-400">Opening balance {portfolio ? formatINR(portfolio.user?.cashBalance) : '—'}</p>
                      <button type="button" className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">View statement</button>
                    </div>
                    <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">●</span>
                        <h3 className="font-semibold">Commodity</h3>
                      </div>
                      <p className="text-2xl font-bold">₹0</p>
                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Margins used 0</p>
                      <p className="text-sm text-gray-500 dark:text-slate-400">Opening balance 0</p>
                      <button type="button" className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">View statement</button>
                    </div>
                  </div>

                  <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <h3 className="font-semibold mb-2">Holdings ({portfolio?.holdings?.length || 0})</h3>
                    {portfolio?.holdings?.length ? (
                      <>
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className={totalUnrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {formatINR(totalUnrealizedPnl)} ({portfolio?.holdings?.length ? ((totalUnrealizedPnl / (portfolio.holdings.reduce((s, h) => s + (h.value || 0), 0)) || 0) * 100).toFixed(2) : 0}%)
                          </span>
                          <span className="text-sm text-gray-500 dark:text-slate-400">Current value {formatINR(portfolio?.holdings?.reduce((s, h) => s + (h.value || 0), 0) || 0)}</span>
                          <span className="text-sm text-gray-500 dark:text-slate-400">Investment {formatINR(portfolio?.holdings?.reduce((s, h) => s + h.quantity * h.avgBuyPrice, 0) || 0)}</span>
                        </div>
                        <div className="mt-2 h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden flex">
                          <div className="h-full bg-green-500" style={{ width: portfolio?.portfolioValue && portfolio.portfolioValue > 0 ? Math.min(100, Math.max(0, 100 * (portfolio.holdings?.reduce((s, h) => s + (h.value || 0), 0) || 0) / portfolio.portfolioValue)) : 50 }} />
                        </div>
                        <div className="mt-2 flex gap-4 text-sm">
                          <label className="flex items-center gap-1"><input type="radio" name="holdingsView" defaultChecked /> Current value</label>
                          <label className="flex items-center gap-1"><input type="radio" name="holdingsView" /> Invested</label>
                          <label className="flex items-center gap-1"><input type="radio" name="holdingsView" /> P&L</label>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 dark:text-slate-400 text-sm">No holdings. Place a buy order from the order panel.</p>
                    )}
                  </div>

                  <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h3 className="font-semibold">{symbol.includes(':') ? symbol.split(':')[1] : symbol}</h3>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { id: '1d', label: '1D' },
                          { id: '6d', label: '6D' },
                          { id: '14d', label: '14D' },
                          { id: '1m', label: '1M' },
                          { id: '3m', label: '3M' },
                          { id: '52w', label: '52W' },
                          { id: 'ytd', label: 'YTD' },
                        ].map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setChartRange(id)}
                            className={`px-2 py-1 text-xs font-medium rounded ${chartRange === id
                              ? darkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-[260px] md:h-[320px] rounded bg-gray-100 dark:bg-slate-900 relative">
                      {chartLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-slate-900/80 z-10 rounded">
                          <span className="text-sm text-gray-600 dark:text-slate-400">Loading chart…</span>
                        </div>
                      )}
                      <PriceChart data={candles} />
                    </div>
                    {chartError && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{chartError}</p>}
                  </div>
                </div>
              </div>

              {/* Right sidebar - Zerodha-style order panel (fixed width, same height as content) */}
              {(() => {
                const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
                const isNfo = ex === 'NFO';
                const isOpt = /(CE|PE)$/.test(String(trSymbol).toUpperCase());
                const optionsRequireLimit = isNfo && isOpt;
                return (
                  <aside className={`w-72 shrink-0 flex flex-col border-l ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Order</h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Scrip from watchlist or search</p>
                    </div>
                    <div className="p-3 flex flex-col gap-3 flex-1 min-h-0">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Symbol</label>
                        <input placeholder="e.g. RELIANCE or NFO:NIFTY24MARFUT" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`w-full rounded border px-2.5 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Quantity</label>
                        <input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} className={`w-full rounded border px-2.5 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                      </div>
                      {optionsRequireLimit && <p className="text-xs text-amber-600 dark:text-amber-400">Options: LIMIT order & price required</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Type</label>
                          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} disabled={optionsRequireLimit} className={`w-full rounded border px-2 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`}>
                            <option value="MARKET">Market</option>
                            <option value="LIMIT">Limit</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Product</label>
                          <select value={orderProduct} onChange={(e) => setOrderProduct(e.target.value)} className={`w-full rounded border px-2 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`}>
                            {isNfo ? (<><option value="MIS">MIS</option><option value="NRML">NRML</option></>) : (<><option value="CNC">CNC</option><option value="MIS">MIS</option><option value="NRML">NRML</option></>)}
                          </select>
                        </div>
                      </div>
                      {(orderType === 'LIMIT' || optionsRequireLimit) && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Price (₹)</label>
                          <input type="number" step="0.05" placeholder="0.00" value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} className={`w-full rounded border px-2.5 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                        <button type="button" onClick={() => placeKiteOrder('BUY')} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">Buy</button>
                        <button type="button" onClick={() => placeKiteOrder('SELL')} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">Sell</button>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500">Kite · F&O: MIS/NRML · Options: Limit</p>
                    </div>
                  </aside>
                );
              })()}
            </div>
          )}

          {mainNav === 'orders' && (
            <div className="p-6">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Orders</h3>
                <div className="overflow-auto max-h-96 p-4">
                  <table className="w-full text-left text-sm">
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
                </div>
              </div>
            </div>
          )}

          {mainNav === 'holdings' && (
            <div className="p-6">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Holdings</h3>
                <div className="p-4">
                  {portfolio?.holdings?.length ? (
                    <table className="w-full text-left text-sm">
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
                    <p className="text-gray-500 dark:text-slate-500">No holdings. Place a buy order from Dashboard.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {mainNav === 'positions' && (
            <div className="p-6">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Positions {kitePositions.length > 0 && <span className="text-xs font-normal text-green-600 dark:text-green-400">(Live from Kite)</span>}</h3>
                <div className="p-4">
                  {kitePositions.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                          <th className="pb-2 pr-4">Symbol</th>
                          <th className="pb-2 pr-4">Exchange</th>
                          <th className="pb-2 pr-4">Qty</th>
                          <th className="pb-2 pr-4">Avg</th>
                          <th className="pb-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kitePositions.map((p, i) => (
                          <tr key={p.tradingsymbol + i} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-4">{p.tradingsymbol}</td>
                            <td className="py-1.5 pr-4">{p.exchange || '—'}</td>
                            <td className="py-1.5 pr-4">{p.quantity}</td>
                            <td className="py-1.5 pr-4">{formatINR(p.average_price)}</td>
                            <td className={`py-1.5 ${(p.pnl || 0) >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatINR(p.pnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : portfolio?.holdings?.length ? (
                    <table className="w-full text-left text-sm">
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
                    <p className="text-gray-500 dark:text-slate-500">No open positions. Place orders via the Order panel (Kite) or use Buy/Sell for demo.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {mainNav === 'funds' && (
            <div className="p-6 space-y-6">
              <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="font-semibold mb-4">Funds & margin</h3>
                {kiteMargins && (kiteMargins.equity || kiteMargins.available) ? (
                  (() => {
                    const seg = kiteMargins.equity || kiteMargins;
                    const av = seg.available || {};
                    const util = seg.utilised || {};
                    return (
                      <div className="space-y-2 text-sm">
                        <p className="text-xl font-bold">{formatINR(av.cash ?? 0)}</p>
                        <p className="text-gray-500 dark:text-slate-400">Cash</p>
                        <p className="text-lg font-semibold">{formatINR(av.collateral ?? 0)}</p>
                        <p className="text-gray-500 dark:text-slate-400">Collateral (pledged)</p>
                        <p className="text-gray-500 dark:text-slate-400">Utilised: {formatINR(util.total ?? util.span ?? 0)}</p>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <p className="text-2xl font-bold">{portfolio ? formatINR(portfolio.user?.cashBalance) : '—'}</p>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Available balance (app)</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">Enable Kite for live margin</p>
                  </>
                )}
              </div>

              <div className={`rounded-lg border p-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="font-semibold mb-2">Pledge for trading margin</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">Pledge your holdings (equity/MF) to get collateral margin. Pledging is done via CDSL Easiest / Zerodha Console, not in-app.</p>
                <a href="https://cdsl.easiest.in/" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">CDSL Easiest →</a>
                <span className="text-gray-400 mx-2">·</span>
                <a href="https://console.zerodha.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Zerodha Console</a>
              </div>

              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Mutual fund holdings</h3>
                <div className="p-4">
                  {mfHoldings.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                          <th className="pb-2 pr-4">Fund</th>
                          <th className="pb-2 pr-4">Units</th>
                          <th className="pb-2 pr-4">Avg / LTP</th>
                          <th className="pb-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mfHoldings.map((h) => (
                          <tr key={h.tradingsymbol + (h.folio || '')} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-4 font-medium">{h.fund || h.tradingsymbol}</td>
                            <td className="py-1.5 pr-4">{Number(h.quantity).toFixed(3)}</td>
                            <td className="py-1.5 pr-4">{formatINR(h.average_price)} / {formatINR(h.last_price)}</td>
                            <td className={`py-1.5 ${(h.pnl || 0) >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatINR(h.pnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-500 text-sm">No MF holdings. Buy on <a href="https://coin.zerodha.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Coin</a>.</p>
                  )}
                </div>
              </div>

              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">MF orders (last 7 days)</h3>
                <div className="p-4 max-h-48 overflow-auto">
                  {mfOrders.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                          <th className="pb-2 pr-4">Fund</th>
                          <th className="pb-2 pr-4">Type</th>
                          <th className="pb-2 pr-4">Amount / Qty</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mfOrders.slice(0, 10).map((o) => (
                          <tr key={o.order_id} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-4 truncate max-w-[120px]" title={o.fund}>{o.fund || o.tradingsymbol}</td>
                            <td className="py-1.5 pr-4">{o.transaction_type}</td>
                            <td className="py-1.5 pr-4">{o.amount != null ? formatINR(o.amount) : (o.quantity != null ? o.quantity : '—')}</td>
                            <td className="py-1.5">{o.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-500 text-sm">No recent MF orders.</p>
                  )}
                </div>
                <p className="px-4 pb-3 text-xs text-gray-500 dark:text-slate-500">Buy/sell MF on <a href="https://coin.zerodha.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Coin</a>.</p>
              </div>
            </div>
          )}
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
