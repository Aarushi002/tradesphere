import { useState, useEffect } from 'react';
import { formatINR, formatINRCompact } from '../utils/currency';
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

const WATCHLIST_KEY = 'tradesphere_watchlist';
const WATCHLIST_GROUPS_KEY = 'tradesphere_watchlist_groups';

function getDefaultGroupsState() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    const list = raw ? JSON.parse(raw) : null;
    const symbols = Array.isArray(list) && list.length > 0 ? list : DEFAULT_WATCHLIST;
    return {
      groups: [{ id: 'default', name: 'Default', symbols }],
      activeId: 'default',
    };
  } catch (_) {}
  return { groups: [{ id: 'default', name: 'Default', symbols: DEFAULT_WATCHLIST }], activeId: 'default' };
}

function loadWatchlistGroups() {
  try {
    const raw = localStorage.getItem(WATCHLIST_GROUPS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.groups?.length > 0) return data;
    }
  } catch (_) {}
  const state = getDefaultGroupsState();
  try {
    localStorage.setItem(WATCHLIST_GROUPS_KEY, JSON.stringify(state));
  } catch (_) {}
  return state;
}

function saveWatchlistGroups(state) {
  try {
    localStorage.setItem(WATCHLIST_GROUPS_KEY, JSON.stringify(state));
  } catch (_) {}
}

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
  const [watchlistGroups, setWatchlistGroups] = useState(loadWatchlistGroups);
  const activeGroup = watchlistGroups.groups.find((g) => g.id === watchlistGroups.activeId) || watchlistGroups.groups[0];
  const watchlist = activeGroup ? activeGroup.symbols : [];
  function setWatchlist(updater) {
    const nextList = typeof updater === 'function' ? updater(watchlist) : updater;
    setWatchlistGroups((prev) => {
      const next = {
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === prev.activeId ? { ...g, symbols: nextList } : g
        ),
      };
      saveWatchlistGroups(next);
      return next;
    });
  }
  function addWatchlistGroup() {
    const n = watchlistGroups.groups.length + 1;
    const id = `wl-${Date.now()}-${n}`;
    setWatchlistGroups((prev) => {
      const next = {
        groups: [...prev.groups, { id, name: `Watchlist ${n}`, symbols: [] }],
        activeId: id,
      };
      saveWatchlistGroups(next);
      return next;
    });
  }
  function switchWatchlistGroup(id) {
    setWatchlistGroups((prev) => {
      const next = { ...prev, activeId: id };
      saveWatchlistGroups(next);
      return next;
    });
  }
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
  const [tradingMode, setTradingMode] = useState(() => localStorage.getItem('tradesphere_trading_mode') || 'paper'); // 'paper' | 'live'
  useEffect(() => {
    localStorage.setItem('tradesphere_trading_mode', tradingMode);
  }, [tradingMode]);
  useEffect(() => setWatchlistPage(1), [watchlistGroups.activeId]);
  const [showRiskDisclosure, setShowRiskDisclosure] = useState(() => !sessionStorage.getItem('tradesphere_risk_ack'));
  const [watchlistOptionsOpen, setWatchlistOptionsOpen] = useState(null); // symbol key or null
  const [optionChainSymbol, setOptionChainSymbol] = useState(null);
  const [optionChainData, setOptionChainData] = useState(null);
  const [optionChainLoading, setOptionChainLoading] = useState(false);
  const [optionChainExpiry, setOptionChainExpiry] = useState(null); // YYYY-MM-DD or null for server default
  const [marketDepthSymbol, setMarketDepthSymbol] = useState(null);
  const [watchlistChangeType, setWatchlistChangeType] = useState('close'); // 'close' | 'open'
  const [watchlistShow, setWatchlistShow] = useState({ priceChange: true, priceChangePct: true, priceDirection: true, holdings: false, notes: false, groupColors: false });
  const [watchlistSortBy, setWatchlistSortBy] = useState('LTP'); // '%' | 'LTP' | 'A-Z' | 'EXCH'
  const [watchlistFilterOpen, setWatchlistFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile watchlist drawer
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [alertBannerDismissed, setAlertBannerDismissed] = useState(() => !!localStorage.getItem('tradesphere_alert_banner_dismissed'));
  const [holdingsView, setHoldingsView] = useState('current'); // 'current' | 'invested' | 'pnl'
  const [watchlistPage, setWatchlistPage] = useState(1);
  function isMarketHours() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    const hours = ist.getHours() + ist.getMinutes() / 60;
    if (day === 0 || day === 6) return false;
    return hours >= 9 && hours < 15.5;
  }
  const marketLive = isMarketHours();

  useEffect(() => {
    if (!optionChainSymbol) {
      setOptionChainData(null);
      return;
    }
    const symbol = optionChainSymbol.includes(':') ? optionChainSymbol.split(':')[1] : optionChainSymbol;
    setOptionChainLoading(true);
    setOptionChainData(null);
    // optionChainExpiry is set by user when they click an expiry tab; otherwise server picks default
    const qs = new URLSearchParams({ symbol });
    if (optionChainExpiry) qs.set('expiry', optionChainExpiry);
    fetch(`${API_URL}/api/market/option-chain?${qs}`)
      .then((res) => res.json())
      .then((data) => setOptionChainData(data))
      .catch((err) => setOptionChainData({ error: err.message, chain: [], expiries: [] }))
      .finally(() => setOptionChainLoading(false));
  }, [optionChainSymbol, optionChainExpiry]);

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
    const intervalMs = marketLive ? 5000 : 15000;
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/market/quotes?symbols=${qs}`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then(updateQuotesFromResponse)
        .catch(() => {});
    }, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when watchlist symbols or market hours change
  }, [watchlist.length, watchlist.join(','), marketLive]);

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
    setWatchlist((prev) => (prev.includes(sym) ? prev : [...prev, sym]));
    setSearchQuery('');
  }

  function removeFromWatchlist(s) {
    const next = watchlist.filter((x) => x !== s);
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

  async function placeOrder(transactionType) {
    const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
    const qty = Number(quantity) || 1;
    setKiteOrderLoading(true);
    setError('');

    if (tradingMode === 'paper') {
      try {
        const endpoint = transactionType === 'BUY' ? `${API_URL}/api/trades/buy` : `${API_URL}/api/trades/sell`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ symbol: trSymbol, quantity: qty }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Order failed');
        setQuantity('10');
        fetchPortfolio();
        fetch(`${API_URL}/api/trades`, { headers: { Authorization: `Bearer ${getToken()}` } })
          .then((r) => r.ok && r.json())
          .then(setTrades)
          .catch(() => {});
      } catch (err) {
        setError(err.message);
      } finally {
        setKiteOrderLoading(false);
      }
      return;
    }

    const isNfo = ex === 'NFO';
    const isOpt = isOptionSymbol(trSymbol);
    const useLimit = isNfo && isOpt ? true : orderType === 'LIMIT';
    const payload = {
      exchange: ex,
      tradingsymbol: trSymbol,
      transaction_type: transactionType,
      quantity: qty,
      order_type: useLimit ? 'LIMIT' : 'MARKET',
      product: isNfo ? (orderProduct === 'CNC' ? 'NRML' : orderProduct) : orderProduct,
    };
    if (useLimit && orderPrice) payload.price = Number(orderPrice);
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
    { id: 'bids', label: 'Bids' },
    { id: 'funds', label: 'Funds' },
  ];

  const getQuoteKeyForSort = (sym) => {
    const part = sym.includes(':') ? sym.split(':')[1] : sym;
    if (part === 'NIFTYBANK') return 'NIFTY BANK';
    if (part === 'NIFTY50') return 'NIFTY 50';
    return part || sym;
  };
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    const nameA = (a.includes(':') ? a.split(':')[1] : a).toLowerCase();
    const nameB = (b.includes(':') ? b.split(':')[1] : b).toLowerCase();
    const qA = quotes[getQuoteKeyForSort(a)] || {};
    const qB = quotes[getQuoteKeyForSort(b)] || {};
    if (watchlistSortBy === 'A-Z') return nameA.localeCompare(nameB);
    if (watchlistSortBy === 'EXCH') return (a.split(':')[0] || '').localeCompare(b.split(':')[0] || '');
    if (watchlistSortBy === '%') return (qB.changePercent ?? 0) - (qA.changePercent ?? 0);
    return (qB.lastPrice ?? 0) - (qA.lastPrice ?? 0);
  });

  const watchlistPageSize = 8;
  const watchlistPageCount = Math.max(1, Math.ceil(sortedWatchlist.length / watchlistPageSize));
  const paginatedWatchlist = sortedWatchlist.slice((watchlistPage - 1) * watchlistPageSize, watchlistPage * watchlistPageSize);
  const userInitials = (user?.name || user?.email || 'U').split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className={`flex h-screen flex-col overflow-hidden min-h-0 w-full max-w-[100vw] ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-900'}`}>
      {/* Risk Disclosure Popup - show once per session after login */}
      {showRiskDisclosure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className={`max-w-lg w-full rounded-lg shadow-xl p-4 sm:p-6 my-4 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white border border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">📄</span>
              <h2 className="text-lg font-semibold">Risk disclosures on derivatives</h2>
            </div>
            <ul className="list-disc list-inside text-sm space-y-2 mb-4 text-gray-700 dark:text-slate-300">
              <li>9 out of 10 individual traders in equity Futures and Options Segment, incurred net losses.</li>
              <li>On an average, loss makers registered net trading loss close to ₹50,000.</li>
              <li>Over and above the net trading losses incurred, loss makers expended an additional 28% of net trading losses as transaction costs.</li>
              <li>Those making net trading profits, incurred between 15% to 50% of such profits as transaction cost.</li>
            </ul>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">Source: SEBI study dated January 25, 2023 on &quot;Analysis of Profit and Loss of Individual Traders dealing in equity Futures and Options (F&O) Segment&quot;, wherein Aggregate Level findings are based on annual Profit/Loss incurred by individual traders in equity F&O during FY 2021-22.</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => { sessionStorage.setItem('tradesphere_risk_ack', '1'); setShowRiskDisclosure(false); }} className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700">I understand</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: backdrop when watchlist drawer is open */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        className={`fixed inset-0 z-30 bg-black/50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
      />

      {/* Top Bar - Zerodha-style: indices | Default + NEW + grid | Dashboard/Orders/... | cart bell avatar user menu */}
      <header className={`flex items-center justify-between gap-1 sm:gap-2 border-b px-2 sm:px-3 py-1.5 sm:py-2 min-h-[48px] sm:min-h-[52px] shrink-0 min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 overflow-hidden">
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="lg:hidden p-2 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation flex-shrink-0" aria-label="Toggle watchlist">☰</button>
          <div className="hidden sm:flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide shrink-0">
            {(indices.length > 0 || marketLive) && (
              <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium shrink-0">Live</span>
            )}
            {(indices.length > 0 ? indices : MOCK_INDICES).map((idx) => (
              <div key={idx.name} className="flex items-center gap-1 text-xs shrink-0 whitespace-nowrap">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>{idx.name}</span>
                <span className={darkMode ? 'text-slate-100' : 'text-gray-900'}>{Number(idx.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className={idx.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                  {idx.change >= 0 ? '+' : ''}{idx.change} ({idx.changePercent}%)
                </span>
              </div>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-0.5 shrink-0">
            <select
              value={watchlistGroups.activeId}
              onChange={(e) => switchWatchlistGroup(e.target.value)}
              className={`text-xs font-medium rounded border py-1.5 pl-2 pr-6 appearance-none cursor-pointer bg-no-repeat bg-right ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-gray-50 border-gray-300 text-gray-700'}`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundSize: '1rem' }}
            >
              {watchlistGroups.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.symbols.length}/250)</option>
              ))}
            </select>
            <button type="button" onClick={addWatchlistGroup} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1.5">NEW</button>
            <button type="button" onClick={() => setWatchlistFilterOpen((o) => !o)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700" title="Layout">▦</button>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 min-w-0">
          <div className="hidden md:flex items-center border-b-2 border-transparent" style={{ marginBottom: -1 }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setMainNav(item.id)}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium touch-manipulation ${mainNav === item.id ? 'text-red-600 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400' : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                style={mainNav === item.id ? { marginBottom: -2 } : {}}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select aria-label="Section" className={`md:hidden block rounded border px-2 py-1.5 text-sm font-medium min-w-0 max-w-[100px] touch-manipulation ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'}`} value={mainNav} onChange={(e) => setMainNav(e.target.value)}>
            {NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation hidden sm:block" title="Cart">🛒</button>
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation hidden sm:block" title="Notifications">🔔</button>
          <div className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 ml-0.5 border-l border-gray-200 dark:border-slate-600 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-semibold shrink-0" title={user?.name}>{userInitials}</div>
            <span className="text-xs sm:text-sm font-medium truncate max-w-[70px] sm:max-w-none">{user?.tradingId || '—'}</span>
            <div className="relative">
              <button type="button" onClick={() => setHeaderMenuOpen((o) => !o)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation" aria-label="Menu">⋮</button>
              {headerMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} aria-hidden="true" />
                  <div className={`absolute right-0 top-full mt-1 z-50 py-1 rounded border shadow-lg min-w-[140px] ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                    <button type="button" onClick={() => { onToggleDarkMode(); setHeaderMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700">{darkMode ? '☀️ Light mode' : '🌙 Dark mode'}</button>
                    <button type="button" onClick={() => { onLogout(); setHeaderMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700">Log out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {backendDown && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-3 sm:px-4 py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          <strong>Backend not running</strong> — Buy/Sell and portfolio need the server. In a terminal: <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded break-all">cd backend && npm start</code> (ensure MongoDB is running).{' '}
          <button type="button" onClick={() => fetchPortfolio()} className="ml-2 font-medium underline touch-manipulation">Retry</button>
        </div>
      )}
      {error && !backendDown && (
        <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
        {/* Left Panel - Watchlist: drawer on mobile, sidebar on lg+ */}
        <aside
          className={`fixed lg:relative inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] lg:w-64 lg:max-w-none shrink-0 border-r flex flex-col transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}
          style={{ top: '52px', bottom: 0 }}
        >
          <div className="lg:hidden flex items-center justify-between px-2 py-2 border-b border-gray-200 dark:border-slate-700">
            <span className="font-semibold text-sm">Watchlist</span>
            <button type="button" onClick={() => setSidebarOpen(false)} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-slate-700" aria-label="Close">×</button>
          </div>
          <div className="p-2 border-b border-gray-200 dark:border-slate-700 relative">
            <div className="flex gap-1 items-center">
              <span className={`shrink-0 text-gray-400 ${darkMode ? 'text-slate-500' : ''}`} aria-hidden>🔍</span>
              <input
                type="text"
                placeholder="Search eg: infy bse, nifty fut, index fund, et"
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
                      setSearchQuery('');
                      setSearchSuggestions([]);
                      setSearchSuggestionsOpen(false);
                    } else addToWatchlist();
                  }
                }}
                className={`flex-1 min-w-0 rounded border px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900'}`}
              />
              <button type="button" onClick={() => setWatchlistFilterOpen((o) => !o)} title="Filter / Sort" className={`p-1.5 rounded border ${darkMode ? 'border-slate-600 bg-slate-700' : 'border-gray-300 bg-white'}`}>▤</button>
            </div>
            {watchlistFilterOpen && (
              <div className={`mt-2 p-2 rounded border text-xs ${darkMode ? 'border-slate-600 bg-slate-700' : 'border-gray-200 bg-white'}`}>
                <div className="mb-2 font-medium flex items-center gap-1">CHANGE TYPE <span title="Reference for change">ⓘ</span></div>
                <label className="flex items-center gap-2 mb-1"><input type="radio" name="changeType" checked={watchlistChangeType === 'close'} onChange={() => setWatchlistChangeType('close')} /> Close price</label>
                <label className="flex items-center gap-2 mb-2"><input type="radio" name="changeType" checked={watchlistChangeType === 'open'} onChange={() => setWatchlistChangeType('open')} /> Open price</label>
                <div className="mb-2 font-medium">SHOW</div>
                {['priceChange', 'priceChangePct', 'priceDirection', 'holdings', 'notes', 'groupColors'].map((k) => (
                  <label key={k} className="flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={watchlistShow[k]} onChange={() => setWatchlistShow((p) => ({ ...p, [k]: !p[k] }))} />
                    {k === 'priceChange' && 'Price change'}
                    {k === 'priceChangePct' && 'Price change %'}
                    {k === 'priceDirection' && 'Price direction'}
                    {k === 'holdings' && 'Holdings'}
                    {k === 'notes' && 'Notes'}
                    {k === 'groupColors' && 'Group colors'}
                  </label>
                ))}
                <div className="mb-2 font-medium mt-2">SORT BY</div>
                <div className="flex flex-wrap gap-1">
                  {['%', 'LTP', 'A-Z', 'EXCH'].map((opt) => (
                    <button key={opt} type="button" onClick={() => setWatchlistSortBy(opt)} className={`px-2 py-1 rounded ${watchlistSortBy === opt ? 'bg-blue-600 text-white' : darkMode ? 'bg-slate-600' : 'bg-gray-200'}`}>{opt === '%' ? '%' : opt === 'LTP' ? 'LTP' : opt === 'A-Z' ? 'A-Z' : 'EXCH'}</button>
                  ))}
                </div>
                <p className="text-gray-500 dark:text-slate-400 mt-1">Sort items within a group.</p>
              </div>
            )}
            {searchSuggestionsOpen && searchSuggestions.length > 0 && (
              <ul className={`absolute left-2 right-2 top-full mt-0.5 z-20 max-h-56 overflow-auto rounded border shadow-lg ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                {searchSuggestions.map((inst) => (
                  <li
                    key={inst.key || `${inst.exchange}:${inst.tradingsymbol}`}
                    className={`flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer text-left border-b last:border-b-0 ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-100'}`}
                    onClick={() => {
                      const key = inst.key || `${inst.exchange}:${inst.tradingsymbol}`;
                      setWatchlist((prev) => (prev.includes(key) ? prev : [...prev, key]));
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
          <div className="px-2 pt-1 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">{activeGroup?.name ?? 'Default'} ({watchlist.length}/250)</span>
            <button type="button" onClick={addWatchlistGroup} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">+ New group</button>
          </div>
          <div className="px-2 text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wide">{activeGroup?.name ?? 'Default'} ({watchlist.length})</div>
          <ul className="flex-1 overflow-auto min-h-0 text-sm">
            {paginatedWatchlist.map((s) => {
              const displaySymbol = s.includes(':') ? s.split(':')[1] : s;
              let quoteKey = s.includes(':') ? s.split(':')[1] : (s === 'NIFTY50' ? 'NIFTY 50' : s);
              if (quoteKey === 'NIFTYBANK') quoteKey = 'NIFTY BANK';
              const realQuote = quotes[quoteKey];
              const q = realQuote ? { lastPrice: realQuote.lastPrice, change: realQuote.change, changePercent: realQuote.changePercent } : getMockQuote(displaySymbol);
              const isSelected = symbol === s;
              const optionsOpen = watchlistOptionsOpen === s;
              return (
                <li
                  key={s}
                  className={`group flex items-center gap-0.5 py-1.5 px-2 border-b ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-200'}`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-1 cursor-pointer" onClick={() => setSymbol(s)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{displaySymbol}{s.includes('NIFTY') || s.includes('SENSEX') ? ' INDEX' : ''}</div>
                      <div className="flex items-center gap-2 text-xs">
                        {watchlistShow.priceChange && <span className={q.change < 0 ? 'text-red-500' : 'text-green-500'}>{q.change >= 0 ? '+' : ''}{q.change}</span>}
                        {watchlistShow.priceChangePct && <span className={q.change < 0 ? 'text-red-500' : 'text-green-500'}>({q.changePercent}%)</span>}
                        {watchlistShow.priceDirection && <span className={q.change < 0 ? 'text-red-500' : 'text-green-500'}>{q.change < 0 ? '▼' : '▲'}</span>}
                        <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>{q.lastPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { setSymbol(s); setMainNav('dashboard'); setSidebarOpen(false); }} className="p-1.5 sm:p-1 rounded bg-green-600 text-white hover:bg-green-700 touch-manipulation min-w-[28px]" title="Buy">▲</button>
                    <button type="button" onClick={() => { setSymbol(s); setMainNav('dashboard'); setSidebarOpen(false); }} className="p-1.5 sm:p-1 rounded bg-red-600 text-white hover:bg-red-700 touch-manipulation min-w-[28px]" title="Sell">▼</button>
                    <button type="button" onClick={() => { setMarketDepthSymbol(s); setWatchlistOptionsOpen(null); setSidebarOpen(false); }} className="p-1.5 sm:p-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 touch-manipulation min-w-[28px]" title="Market Depth">≡</button>
                    <button type="button" onClick={() => { setSymbol(s); setWatchlistOptionsOpen(null); setMainNav('dashboard'); setSidebarOpen(false); }} className="p-1.5 sm:p-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 touch-manipulation min-w-[28px]" title="Chart">📈</button>
                    <button type="button" onClick={() => removeFromWatchlist(s)} className="p-1.5 sm:p-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 touch-manipulation min-w-[28px]" title="Delete">🗑</button>
                    <div className="relative">
                      <button type="button" onClick={() => setWatchlistOptionsOpen(optionsOpen ? null : s)} className="p-1.5 sm:p-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 touch-manipulation min-w-[28px]" title="Options">⋮</button>
                      {optionsOpen && (
                        <div className={`absolute left-0 top-full mt-0.5 z-30 min-w-[160px] py-1 rounded border shadow-lg ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                          <button type="button" onClick={() => { setOptionChainExpiry(null); setOptionChainSymbol(s); setWatchlistOptionsOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Option chain</button>
                          <button type="button" onClick={() => { setMarketDepthSymbol(s); setWatchlistOptionsOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Market depth</button>
                          <button type="button" onClick={() => { setSymbol(s); setWatchlistOptionsOpen(null); setMainNav('dashboard'); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Chart</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Create alert / ATO</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Notes</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Fundamentals</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Technicals</button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="p-2 flex items-center justify-between gap-1 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: Math.min(7, watchlistPageCount) }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setWatchlistPage(p)} className={`w-6 h-6 text-xs font-medium rounded ${watchlistPage === p ? 'bg-blue-600 text-white' : darkMode ? 'hover:bg-slate-600' : 'hover:bg-gray-200'}`}>{p}</button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setWatchlistFilterOpen((o) => !o)} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600" title="Layout">▦</button>
              <button type="button" onClick={() => addToWatchlist()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-lg leading-none" title="Add">+</button>
            </div>
          </div>
        </aside>

        {/* Main Panel - Zerodha-style: [Content | Order sidebar] on dashboard */}
        <main className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden ${mainNav === 'dashboard' ? '' : 'overflow-auto'} ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
          {mainNav === 'dashboard' && (
            <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row overflow-hidden">
              {/* Center: scrollable content (chart + cards) */}
              <div className="flex-1 min-h-0 min-w-0 overflow-auto">
                <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 min-w-0 max-w-full">
                  {!alertBannerDismissed && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 sm:px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex items-start justify-between gap-2">
                      <p>The advance tax filing deadline is tomorrow, March 15. Download tax statements for all your trading and investing activity from Console to file your taxes. <a href="https://console.zerodha.com" target="_blank" rel="noopener noreferrer" className="font-medium underline">Read more</a>.</p>
                      <button type="button" onClick={() => { setAlertBannerDismissed(true); localStorage.setItem('tradesphere_alert_banner_dismissed', '1'); }} className="shrink-0 p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800" aria-label="Dismiss">×</button>
                    </div>
                  )}
                  <h2 className={`text-lg sm:text-xl md:text-2xl font-semibold truncate ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Hi, {user?.name || 'Trader'}</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div className={`rounded-lg border p-4 min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg shrink-0" aria-hidden>🕐</span>
                        <h3 className="font-semibold text-gray-900 dark:text-slate-100">Equity</h3>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">{portfolio ? formatINRCompact(portfolio.user?.cashBalance ?? 0) : '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">Margin available</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Margins used 0</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">Opening balance {portfolio ? formatINRCompact(portfolio.user?.cashBalance ?? 0) : '—'}</p>
                      <button type="button" className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">View statement</button>
                    </div>
                    <div className={`rounded-lg border p-4 min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg shrink-0" aria-hidden>📊</span>
                        <h3 className="font-semibold text-gray-900 dark:text-slate-100">Commodity</h3>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">0</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">Margin available</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Margins used 0</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">Opening balance 0</p>
                      <button type="button" className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">View statement</button>
                    </div>
                  </div>

                  <div className={`rounded-lg border p-4 min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">Holdings ({portfolio?.holdings?.length || 0})</h3>
                    {portfolio?.holdings?.length ? (
                      <>
                        <div className="flex flex-wrap items-start gap-4">
                          <div>
                            <p className={`text-2xl sm:text-3xl font-bold ${totalUnrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {Math.round(totalUnrealizedPnl)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">P&L</p>
                            <p className={`text-sm font-medium ${totalUnrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {portfolio?.holdings?.length ? ((totalUnrealizedPnl / (portfolio.holdings.reduce((s, h) => s + (h.value || 0), 0)) || 0) * 100).toFixed(2) : 0}%
                            </p>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-slate-300">
                            <p>Current value {formatINR(portfolio?.holdings?.reduce((s, h) => s + (h.value || 0), 0) || 0)}</p>
                            <p>Investment {formatINR(portfolio?.holdings?.reduce((s, h) => s + h.quantity * h.avgBuyPrice, 0) || 0)}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden flex">
                          <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: portfolio?.portfolioValue && portfolio.portfolioValue > 0 ? Math.min(100, Math.max(0, 100 * (portfolio.holdings?.reduce((s, h) => s + (h.value || 0), 0) || 0) / portfolio.portfolioValue)) : 50 }} />
                        </div>
                        <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">{holdingsView === 'current' && formatINR(portfolio?.holdings?.reduce((s, h) => s + (h.value || 0), 0) || 0)}{holdingsView === 'invested' && formatINR(portfolio?.holdings?.reduce((s, h) => s + h.quantity * h.avgBuyPrice, 0) || 0)}{holdingsView === 'pnl' && formatINR(totalUnrealizedPnl)}</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm">
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="holdingsView" checked={holdingsView === 'current'} onChange={() => setHoldingsView('current')} /> Current value</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="holdingsView" checked={holdingsView === 'invested'} onChange={() => setHoldingsView('invested')} /> Invested</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="holdingsView" checked={holdingsView === 'pnl'} onChange={() => setHoldingsView('pnl')} /> P&L</label>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 dark:text-slate-400 text-sm">No holdings. Place a buy order from the order panel.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
                    <div className="lg:col-span-2 min-w-0">
                      <div className={`rounded-lg border p-4 min-w-0 overflow-hidden h-full flex flex-col ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg text-gray-500 dark:text-slate-400" aria-hidden>📈</span>
                          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Market overview</h3>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0">
                          <span className="text-sm font-medium text-gray-600 dark:text-slate-400 truncate">{symbol.includes(':') ? symbol.split(':')[1] : symbol}</span>
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
                                  ? 'bg-blue-600 text-white'
                                  : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="h-[260px] md:h-[320px] rounded bg-gray-100 dark:bg-slate-900 relative flex-1 min-h-0">
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
                    <div className={`rounded-lg border p-6 min-w-0 flex flex-col items-center justify-center text-center min-h-[260px] lg:min-h-0 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
                      <span className="text-4xl text-gray-300 dark:text-slate-600 mb-2" aria-hidden>⚓</span>
                      <p className="text-sm font-medium text-gray-700 dark:text-slate-300">You don&apos;t have any positions yet</p>
                      <button type="button" onClick={() => setMainNav('dashboard')} className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded touch-manipulation">Get started</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right sidebar - Order panel: full width below chart on mobile, sidebar on lg+ */}
              {(() => {
                const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
                const isNfo = ex === 'NFO';
                const isOpt = /(CE|PE)$/.test(String(trSymbol).toUpperCase());
                const optionsRequireLimit = isNfo && isOpt;
                return (
                  <aside className={`w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 border-l min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 shrink-0">Order</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${tradingMode === 'paper' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'}`}>{tradingMode === 'paper' ? 'Paper' : 'Live'}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate" title={tradingMode === 'paper' ? 'Simulated on TradeSphere' : 'Scrip from watchlist or search'}>{tradingMode === 'paper' ? 'Simulated on TradeSphere' : 'Scrip from watchlist or search'}</p>
                    </div>
                    <div className="p-3 flex flex-col gap-3 flex-1 min-h-0 min-w-0">
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Symbol</label>
                        <input placeholder="e.g. RELIANCE" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`w-full min-w-0 rounded border px-2.5 py-2.5 sm:py-2 text-sm touch-manipulation box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Quantity</label>
                        <input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} className={`w-full min-w-0 rounded border px-2.5 py-2.5 sm:py-2 text-sm touch-manipulation box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                      </div>
                      {optionsRequireLimit && <p className="text-xs text-amber-600 dark:text-amber-400">Options: LIMIT order & price required</p>}
                      <div className="grid grid-cols-2 gap-2 min-w-0">
                        <div className="min-w-0">
                          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Type</label>
                          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} disabled={optionsRequireLimit} className={`w-full min-w-0 rounded border px-2 py-2 text-sm box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`}>
                            <option value="MARKET">Market</option>
                            <option value="LIMIT">Limit</option>
                          </select>
                        </div>
                        <div className="min-w-0">
                          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Product</label>
                          <select value={orderProduct} onChange={(e) => setOrderProduct(e.target.value)} className={`w-full min-w-0 rounded border px-2 py-2 text-sm box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`}>
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
                      <div className="grid grid-cols-2 gap-2 mt-auto pt-2 min-w-0">
                        <button type="button" onClick={() => placeOrder('BUY')} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-3 sm:py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 min-w-0">Buy</button>
                        <button type="button" onClick={() => placeOrder('SELL')} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-3 sm:py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 min-w-0">Sell</button>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 break-words overflow-hidden">Kite · F&O: MIS/NRML · Options: Limit</p>
                    </div>
                  </aside>
                );
              })()}
            </div>
          )}

          {mainNav === 'orders' && (
            <div className="p-3 sm:p-6 overflow-auto">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-3 sm:px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Orders</h3>
                <div className="overflow-x-auto max-h-96 p-3 sm:p-4">
                  <table className="w-full text-left text-sm min-w-[500px]">
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
            <div className="p-3 sm:p-6 overflow-auto">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-3 sm:px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Holdings</h3>
                <div className="p-3 sm:p-4 overflow-x-auto">
                  {portfolio?.holdings?.length ? (
                    <table className="w-full text-left text-sm min-w-[400px]">
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
            <div className="p-3 sm:p-6 overflow-auto">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-3 sm:px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Positions {kitePositions.length > 0 && <span className="text-xs font-normal text-green-600 dark:text-green-400">(Live from Kite)</span>}</h3>
                <div className="p-3 sm:p-4 overflow-x-auto">
                  {kitePositions.length > 0 ? (
                    <table className="w-full text-left text-sm min-w-[400px]">
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
                    <table className="w-full text-left text-sm min-w-[320px]">
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

          {mainNav === 'bids' && (
            <div className="p-3 sm:p-6 overflow-auto">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Bids</h3>
                <div className="p-6 text-center text-gray-500 dark:text-slate-400">
                  <p className="text-sm">IPO and SGB bids will appear here.</p>
                  <p className="text-xs mt-1">Place bids from Console or the app when an issue is open.</p>
                </div>
              </div>
            </div>
          )}

          {mainNav === 'funds' && (
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 overflow-auto">
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
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold">Trading mode</h3>
                  <div className="flex rounded overflow-hidden border border-gray-300 dark:border-slate-600">
                    <button type="button" onClick={() => setTradingMode('paper')} className={`px-3 py-1.5 text-xs font-medium ${tradingMode === 'paper' ? 'bg-emerald-600 text-white' : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>Paper</button>
                    <button type="button" onClick={() => setTradingMode('live')} className={`px-3 py-1.5 text-xs font-medium ${tradingMode === 'live' ? 'bg-emerald-600 text-white' : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>Live (Kite)</button>
                  </div>
                </div>
                {tradingMode === 'paper' ? (
                  <>
                    <h3 className="font-semibold mb-2">Pledge & margin (Paper)</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">All balance, collateral, and orders are simulated on TradeSphere. No external broker links—everything stays here.</p>
                    <p className="text-sm text-gray-500 dark:text-slate-500">Paper collateral: use your simulated holdings as margin for F&O. Place orders from the Order panel; they are tracked in-app only.</p>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold mb-2">Pledge for trading margin (Live)</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">Pledge your real holdings (equity/MF) via CDSL to get collateral. Then place live orders on this site via Kite.</p>
                    <a href="https://cdsl.easiest.in/" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">CDSL Easiest →</a>
                    <span className="text-gray-400 mx-2">·</span>
                    <a href="https://console.zerodha.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Zerodha Console</a>
                  </>
                )}
              </div>

              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <h3 className="px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Mutual fund holdings</h3>
                <div className="p-3 sm:p-4 overflow-x-auto">
                  {mfHoldings.length > 0 ? (
                    <table className="w-full text-left text-sm min-w-[360px]">
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
                <div className="p-3 sm:p-4 max-h-48 overflow-auto overflow-x-auto">
                  {mfOrders.length > 0 ? (
                    <table className="w-full text-left text-sm min-w-[360px]">
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

      {/* Quick order: when user clicks Buy/Sell on watchlist, symbol is set so order panel is ready */}

      {/* Option Chain modal */}
      {optionChainSymbol && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto" onClick={() => { setOptionChainSymbol(null); setOptionChainExpiry(null); setOptionChainData(null); }}>
          <div className={`max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-auto rounded-t-xl sm:rounded-lg shadow-xl flex flex-col ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 bg-inherit shrink-0">
              <h2 className="text-base sm:text-lg font-semibold truncate pr-2">Option chain — {optionChainSymbol.includes(':') ? optionChainSymbol.split(':')[1] : optionChainSymbol}</h2>
              <button type="button" onClick={() => { setOptionChainSymbol(null); setOptionChainExpiry(null); setOptionChainData(null); }} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation shrink-0">×</button>
            </div>
            <div className="p-3 sm:p-4 overflow-x-auto">
              {optionChainLoading ? (
                <div className="py-12 text-center text-gray-500 dark:text-slate-400">Loading option chain…</div>
              ) : optionChainData?.error ? (
                <p className="py-4 text-amber-600 dark:text-amber-400">{optionChainData.error}</p>
              ) : optionChainData?.message && !optionChainData?.chain?.length ? (
                <p className="py-4 text-gray-600 dark:text-slate-400">{optionChainData.message}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    {(optionChainData?.expiries || []).map((exp) => {
                      const d = exp.slice(0, 10);
                      const active = (optionChainData?.selectedExpiry || '').slice(0, 10) === d || optionChainExpiry === d;
                      const label = d ? (() => { const [, m, day] = d.split('-'); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${day} ${months[Number(m) - 1]}`; })() : exp;
                      return (
                        <button key={exp} type="button" onClick={() => setOptionChainExpiry(d)} className={`px-3 py-1.5 rounded border text-sm ${active ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-100'}`}>{label}</button>
                      );
                    })}
                    <span className="ml-2 text-xs text-gray-500 self-center">OI</span>
                    <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600">Greeks</button>
                  </div>
                  <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <table className="w-full text-xs sm:text-sm min-w-[360px]">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600">
                          <th className="text-left py-2 pr-2">Call OI (L)</th>
                          <th className="text-left py-2 pr-2">Call LTP</th>
                          <th className="text-left py-2 pr-2 font-medium">Strike</th>
                          <th className="text-left py-2 pr-2">Put LTP</th>
                          <th className="text-left py-2">Put OI (L)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(optionChainData?.chain || []).map((row) => (
                          <tr key={row.strike} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 pr-2 text-gray-600 dark:text-slate-400">{row.call_oi != null ? (row.call_oi / 1e5).toFixed(2) : '—'}</td>
                            <td className="py-1.5 pr-2 text-green-600 dark:text-green-400">{row.call_ltp != null ? Number(row.call_ltp).toFixed(2) : '—'}</td>
                            <td className="py-1.5 pr-2 font-medium">{Number(row.strike).toLocaleString('en-IN')}</td>
                            <td className="py-1.5 pr-2 text-red-600 dark:text-red-400">{row.put_ltp != null ? Number(row.put_ltp).toFixed(2) : '—'}</td>
                            <td className="py-1.5 text-gray-600 dark:text-slate-400">{row.put_oi != null ? (row.put_oi / 1e5).toFixed(2) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {optionChainData?.chain?.length > 0 && (() => {
                    const totalCallOi = (optionChainData.chain || []).reduce((s, r) => s + (r.call_oi || 0), 0);
                    const totalPutOi = (optionChainData.chain || []).reduce((s, r) => s + (r.put_oi || 0), 0);
                    const pcr = totalCallOi > 0 ? (totalPutOi / totalCallOi).toFixed(2) : '—';
                    return (
                      <div className="mt-4 flex gap-6 text-xs text-gray-500 dark:text-slate-400">
                        <span>PCR: {pcr}</span>
                        <span>Max Pain: —</span>
                        <span>ATM IV: —</span>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Market Depth modal */}
      {marketDepthSymbol && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto" onClick={() => setMarketDepthSymbol(null)}>
          <div className={`max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-auto rounded-t-xl sm:rounded-lg shadow-xl ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 bg-inherit">
              <h2 className="text-base sm:text-lg font-semibold truncate pr-2">Market depth — {marketDepthSymbol.includes(':') ? marketDepthSymbol.split(':')[1] : marketDepthSymbol}</h2>
              <button type="button" onClick={() => setMarketDepthSymbol(null)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation">×</button>
            </div>
            <div className="p-3 sm:p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                    <th className="text-left py-2">Bid Qty</th>
                    <th className="text-left py-2">Bid</th>
                    <th className="text-left py-2">Ask</th>
                    <th className="text-left py-2">Ask Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {[5, 4, 3, 2, 1].map((i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-slate-700">
                      <td className="py-1.5 text-green-600 dark:text-green-400">—</td>
                      <td className="py-1.5 text-green-600 dark:text-green-400">—</td>
                      <td className="py-1.5 text-red-600 dark:text-red-400">—</td>
                      <td className="py-1.5 text-red-600 dark:text-red-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">Connect Kite for live market depth (order book).</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Feed (optional) - keep for social */}
      <details className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        <summary className="cursor-pointer px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 touch-manipulation">Feed</summary>
        <div className="max-h-64 overflow-auto border-t border-gray-100 dark:border-slate-700 p-3 sm:p-4">
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
