import { useState, useEffect, useRef } from 'react';
import { formatINR, formatINRCompact } from '../utils/currency';
import PriceChart from '../components/PriceChart';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('token');
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

const DEFAULT_WATCHLIST = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'NIFTY 50'];

// Zerodha-style display for NFO option tradingsymbol (e.g. NIFTY26031723500CE -> NIFTY 17th w MAR 23500 CE)
function formatOptionDisplayZerodha(exchange, tradingsymbol) {
  if ((exchange || '').toUpperCase() !== 'NFO' || !tradingsymbol) return null;
  const ts = tradingsymbol.toUpperCase();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const ordinal = (n) => {
    const d = n % 10, t = n % 100;
    if (d === 1 && t !== 11) return n + 'st';
    if (d === 2 && t !== 12) return n + 'nd';
    if (d === 3 && t !== 13) return n + 'rd';
    return n + 'th';
  };
  // Weekly (NSE format): UNDERLYING + YY + M + DD + STRIKE + CE/PE. M = 1-9 or O/N/D for Oct/Nov/Dec
  const weeklyMatch = ts.match(/^(.+?)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$/);
  if (weeklyMatch) {
    const [, underlying, , mChar, dd, strike, optType] = weeklyMatch;
    const monthNum = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'O': 10, 'N': 11, 'D': 12 }[mChar];
    const dayNum = parseInt(dd, 10);
    if (!monthNum || dayNum < 1 || dayNum > 31) return null;
    const mon = months[monthNum - 1];
    return `${underlying} ${ordinal(dayNum)} w ${mon} ${strike} ${optType}`;
  }
  // Monthly: UNDERLYING + YY + MON + STRIKE + CE/PE
  const monthlyMatch = ts.match(/^(.+?)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d+)(CE|PE)$/);
  if (monthlyMatch) {
    const [, underlying, yy, mon, strike, optType] = monthlyMatch;
    return `${underlying} ${yy} ${mon} ${strike} ${optType}`;
  }
  return null;
}

function getSymbolDisplayLabel(key) {
  if (!key || !key.includes(':')) return key || '';
  const [ex, sym] = key.split(':');
  return (ex === 'NFO' && formatOptionDisplayZerodha(ex, sym)) || sym || key;
}

const INDEX_NAMES = ['NIFTY 50', 'SENSEX'];

export default function Dashboard({ user, onLogout, darkMode, onToggleDarkMode }) {
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
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
  const [chartRefreshTick, setChartRefreshTick] = useState(0); // increment every 60s to refetch candles (live chart)
  const [chartFullScreen, setChartFullScreen] = useState(false); // full-screen chart when opened from watchlist
  const [chartLtp, setChartLtp] = useState(null); // real-time LTP when in full-screen chart
  const [orderSide, setOrderSide] = useState(null); // 'BUY' | 'SELL' | null - when set, order panel shows only that action (Zerodha-like)
  const [orderPanelClosedOnOrdersTab, setOrderPanelClosedOnOrdersTab] = useState(false); // hide order panel on Orders tab when user closes it
  const [orderModalOpen, setOrderModalOpen] = useState(false); // Zerodha-style popup when clicking B/S from watchlist
  const [orderModalSide, setOrderModalSide] = useState(null); // 'BUY' | 'SELL' when modal is open
  const orderPanelRef = useRef(null);
  // Scroll order panel into view when it opens (after it mounts)
  useEffect(() => {
    if (orderSide === null) return;
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        orderPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    return () => cancelAnimationFrame(t);
  }, [orderSide]);

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
  const [dataFeedLive, setDataFeedLive] = useState(false); // true when TrueData WebSocket connected (live tick feed)
  const [quotesApiUnavailable, setQuotesApiUnavailable] = useState(false); // true when backend returns 503 (Kite not configured)
  const [kiteRefreshMessage, setKiteRefreshMessage] = useState(null); // 'success' | error string after redirect from Kite callback
  const [kiteAutoConnecting, setKiteAutoConnecting] = useState(false); // true when redirecting to Kite to enable live data (no manual "Connect Kite" step)
  const [kiteSetupOpen, setKiteSetupOpen] = useState(false); // one-time setup: paste API key/secret, no env vars needed
  const [kiteRedirectUrl, setKiteRedirectUrl] = useState(''); // URL to add in Kite developer console (fallback: API_URL + /api/kite/callback)
  const kiteRedirectUrlDisplay = kiteRedirectUrl || `${API_URL.replace(/\/$/, '')}/api/kite/callback`;
  const [kiteSetupApiKey, setKiteSetupApiKey] = useState('');
  const [kiteSetupApiSecret, setKiteSetupApiSecret] = useState('');
  const [kiteSetupSaving, setKiteSetupSaving] = useState(false);
  const [kiteSetupError, setKiteSetupError] = useState('');
  const kiteRedirectDoneRef = useRef(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchSuggestionsTotal, setSearchSuggestionsTotal] = useState(0);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [searchSuggestionsLoadingMore, setSearchSuggestionsLoadingMore] = useState(false);
  const [findInstrumentModalOpen, setFindInstrumentModalOpen] = useState(false);
  const [findInstrumentQuery, setFindInstrumentQuery] = useState('');
  const [findInstrumentSuggestions, setFindInstrumentSuggestions] = useState([]);
  const [findInstrumentLoading, setFindInstrumentLoading] = useState(false);
  const findInstrumentSearchRef = useRef(null);
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
  const [marketDepthData, setMarketDepthData] = useState(null);
  const [marketDepthLoading, setMarketDepthLoading] = useState(false);
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

  useEffect(() => {
    if (!marketDepthSymbol) {
      setMarketDepthData(null);
      return;
    }
    const sym = marketDepthSymbol.includes(':') ? marketDepthSymbol : marketDepthSymbol;
    setMarketDepthLoading(true);
    setMarketDepthData(null);
    fetch(`${API_URL}/api/market/market-depth?symbol=${encodeURIComponent(sym)}`)
      .then((res) => res.json())
      .then((data) => setMarketDepthData(data))
      .catch((err) => setMarketDepthData({ error: err.message, buy: [], sell: [] }))
      .finally(() => setMarketDepthLoading(false));
  }, [marketDepthSymbol]);

  // Find instrument modal: fetch suggestions when query changes (modal open)
  useEffect(() => {
    if (!findInstrumentModalOpen) return;
    const q = (findInstrumentQuery || '').trim();
    if (q.length < 1) {
      setFindInstrumentSuggestions([]);
      return;
    }
    setFindInstrumentLoading(true);
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/market/instruments/search?q=${encodeURIComponent(q)}&limit=100&offset=0`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((json) => {
          setFindInstrumentSuggestions(json.suggestions || []);
        })
        .catch(() => { setFindInstrumentSuggestions([]); })
        .finally(() => setFindInstrumentLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [findInstrumentModalOpen, findInstrumentQuery]);

  // Focus find-instrument search when modal opens
  useEffect(() => {
    if (findInstrumentModalOpen && findInstrumentSearchRef.current) {
      findInstrumentSearchRef.current.focus();
    }
  }, [findInstrumentModalOpen]);

  // Ctrl+Shift+F to open Find instrument modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setFindInstrumentModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Prefill order price with LTP when opening order modal
  useEffect(() => {
    if (!orderModalOpen || !symbol) return;
    const qk = symbol.includes(':') ? symbol.split(':')[1] : (symbol === 'NIFTY 50' ? 'NIFTY 50' : symbol === 'NIFTY BANK' ? 'NIFTY BANK' : symbol);
    const ltp = quotes[qk]?.lastPrice ?? quotes[qk]?.value;
    if (ltp != null) setOrderPrice(String(ltp));
  }, [orderModalOpen, symbol, quotes]);

  const PORTFOLIO_TIMEOUT_MS = 10000; // 10s – avoid stuck "Loading..." when backend is slow/unreachable

  function fetchPortfolio() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PORTFOLIO_TIMEOUT_MS);
    fetch(`${API_URL}/api/portfolio`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
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
        const msg = err.name === 'AbortError'
          ? 'Connection timed out. Check backend URL and try again.'
          : (err.message === 'Failed to fetch' ? 'Cannot reach backend. Start it to trade.' : err.message);
        setError(msg);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchPortfolio();
  }, []);

  // Instrument search suggestions (Zerodha-like)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchSuggestions([]);
      setSearchSuggestionsTotal(0);
      setSearchSuggestionsOpen(false);
      return;
    }
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/market/instruments/search?q=${encodeURIComponent(q)}&limit=1000&offset=0`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((json) => {
          setSearchSuggestions(json.suggestions || []);
          setSearchSuggestionsTotal(json.total != null ? json.total : (json.suggestions || []).length);
          setSearchSuggestionsOpen(true);
        })
        .catch(() => { setSearchSuggestions([]); setSearchSuggestionsTotal(0); });
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

  // Fetch real-time quotes for indices and all watchlist symbols (live values from Kite)
  function updateQuotesFromResponse(json) {
    if (!json?.data || !Array.isArray(json.data)) return;
    const data = json.data;
    setQuotesApiUnavailable(false);
    setIndices(data.filter((q) => INDEX_NAMES.includes(q.name)));
    const newQuotes = Object.fromEntries(
      data.map((q) => [q.name, { lastPrice: q.value, change: q.change, changePercent: q.changePercent }])
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }

  // After Kite login redirect: show success/error and clean URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refreshed = params.get('kite_refreshed');
    const err = params.get('kite_error');
    if (refreshed === '1') {
      setKiteRefreshMessage('success');
      setQuotesApiUnavailable(false);
      kiteRedirectDoneRef.current = false; // allow future auto-redirect if token is lost
      window.history.replaceState({}, '', window.location.pathname);
      const t = setTimeout(() => setKiteRefreshMessage(null), 5000);
      return () => clearTimeout(t);
    }
    if (err) {
      setKiteRefreshMessage(decodeURIComponent(err));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-connect Kite for live data: if not configured show one-time setup; else capture frontend URL and redirect to Kite
  useEffect(() => {
    if (!getToken() || kiteRedirectDoneRef.current) return;
    fetch(`${API_URL}/api/kite/status`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        if (data.redirectUrlToAddInKite) setKiteRedirectUrl(data.redirectUrlToAddInKite);
        if (!data.configured) {
          setKiteSetupOpen(true);
          return;
        }
        if (!data.hasSession) {
          kiteRedirectDoneRef.current = true;
          setKiteAutoConnecting(true);
          // Auto-capture frontend URL so backend knows where to redirect after Kite login (no FRONTEND_URL env needed)
          const origin = window.location.origin;
          fetch(`${API_URL}/api/kite/set-redirect-origin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin }),
          })
            .catch(() => {})
            .finally(() => {
              window.location.href = `${API_URL}/api/kite/login?for=market&redirect_origin=${encodeURIComponent(origin)}`;
            });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const symbols = [...INDEX_NAMES];
    watchlist.forEach((s) => {
      const sym = (s || '').toString().trim();
      if (sym && !symbols.includes(sym)) symbols.push(sym);
    });
    if (symbols.length === 0) return;
    const qs = symbols.map((s) => encodeURIComponent(s)).join(',');
    const headers = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
    fetch(`${API_URL}/api/market/quotes?symbols=${qs}`, { headers })
      .then((res) => {
        if (res.status === 503) {
          setQuotesApiUnavailable(true);
          return res.json().then(() => { throw new Error('Quotes unavailable'); });
        }
        if (!res.ok) throw new Error('Failed to fetch quotes');
        return res.json();
      })
      .then(updateQuotesFromResponse)
      .catch(() => {
        setIndices([]);
      });
    const intervalMs = marketLive ? 5000 : 15000;
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/market/quotes?symbols=${qs}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
        .then((res) => {
          if (res.status === 503) setQuotesApiUnavailable(true);
          return res.ok ? res.json() : Promise.reject();
        })
        .then(updateQuotesFromResponse)
        .catch(() => {});
    }, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when watchlist symbols or market hours change
  }, [watchlist.length, watchlist.join(','), marketLive]);

  // Poll realtime feed status (TrueData connected = live; else delayed Yahoo)
  useEffect(() => {
    const check = () => {
      fetch(`${API_URL}/api/market/realtime-status`)
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((json) => setDataFeedLive(Boolean(json?.live)))
        .catch(() => setDataFeedLive(false));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/trades`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setTrades)
      .catch(() => setTrades([]));
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

  // Live chart: refresh candles more often when full-screen (30s), else every 60s on dashboard
  useEffect(() => {
    if (mainNav !== 'dashboard') return;
    const ms = chartFullScreen ? 30000 : 60000;
    const id = setInterval(() => setChartRefreshTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [mainNav, chartFullScreen]);

  // Real-time LTP for full-screen chart: poll quotes every 5s
  useEffect(() => {
    if (!chartFullScreen || !symbol) return;
    const apiSymbol = symbol.includes(':') ? symbol : symbol.replace(/\s+/g, ' ');
    const fetchQuote = () => {
      fetch(`${API_URL}/api/market/quotes?symbols=${encodeURIComponent(apiSymbol)}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((json) => {
          const arr = json.data || [];
          const first = arr[0];
          if (first && typeof first.value === 'number') setChartLtp(first.value);
        })
        .catch(() => {});
    };
    fetchQuote();
    const id = setInterval(fetchQuote, 5000);
    return () => { clearInterval(id); setChartLtp(null); };
  }, [chartFullScreen, symbol]);

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
        if (!res.ok) {
          const err = new Error(json?.error || json?.message || 'Failed to fetch');
          err.status = res.status;
          throw err;
        }
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
          const err = new Error(json?.error || 'No data');
          err.status = 0;
          throw err;
        }
      })
      .catch((err) => {
        setCandles([]);
        const msg = String(err?.message || '');
        const isKiteAuth = /api_key|access_token|authentication failed/i.test(msg);
        if (isKiteAuth) setQuotesApiUnavailable(true);
        setChartError(err?.status === 503 || /market data unavailable|link your zerodha|kite session/i.test(msg)
          ? 'Market data unavailable. Administrator: connect Kite once to enable live charts for everyone.'
          : isKiteAuth
            ? 'Live data requires Kite to be connected. Click "Enable live data" below.'
            : (msg || 'Could not load chart. Connect Kite for real data.'));
      })
      .finally(() => setChartLoading(false));
  }, [symbol, chartRange, chartRefreshTick]);

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
      <header className={`flex items-center justify-between gap-1 sm:gap-2 border-b px-2 sm:px-3 py-1.5 sm:py-2 min-h-[48px] sm:min-h-[52px] shrink-0 min-w-0 overflow-visible ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 overflow-hidden">
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="lg:hidden p-2 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation flex-shrink-0" aria-label="Toggle watchlist">☰</button>
          <div className="hidden sm:flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide shrink-0">
            {dataFeedLive && (
              <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium shrink-0" title="Live tick data (TrueData)">Live</span>
            )}
            {!dataFeedLive && indices.length > 0 && (
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 shrink-0" title="Free feed, typically 15–20 min delayed">Delayed (~15 min)</span>
            )}
            {quotesApiUnavailable && !kiteAutoConnecting && (
              <span className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 shrink-0" title="Live data is being set up">Enabling…</span>
            )}
            {indices.length > 0 ? indices.map((idx) => (
              <div key={idx.name} className="flex items-center gap-1 text-xs shrink-0 whitespace-nowrap">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>{idx.name}</span>
                <span className={darkMode ? 'text-slate-100' : 'text-gray-900'}>{Number(idx.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className={idx.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                {idx.change >= 0 ? '+' : ''}{idx.change} ({idx.changePercent}%)
              </span>
            </div>
            )) : quotesApiUnavailable && !kiteAutoConnecting ? (
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">Enabling live indices…</span>
            ) : null}
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
                onClick={() => { setMainNav(item.id); if (item.id === 'orders') setOrderPanelClosedOnOrdersTab(false); }}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium touch-manipulation ${mainNav === item.id ? 'text-red-600 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400' : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                style={mainNav === item.id ? { marginBottom: -2 } : {}}
            >
              {item.label}
            </button>
          ))}
          </div>
          <select aria-label="Section" className={`md:hidden block rounded border px-2 py-1.5 text-sm font-medium min-w-0 max-w-[100px] touch-manipulation ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'}`} value={mainNav} onChange={(e) => { const v = e.target.value; setMainNav(v); if (v === 'orders') setOrderPanelClosedOnOrdersTab(false); }}>
            {NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <button type="button" onClick={onToggleDarkMode} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation" title={darkMode ? 'Light mode' : 'Dark mode'} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>{darkMode ? '☀️' : '🌙'}</button>
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation hidden sm:block" title="Cart">🛒</button>
          <button type="button" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation hidden sm:block" title="Notifications">🔔</button>
          <div className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 ml-0.5 border-l border-gray-200 dark:border-slate-600 min-w-0 overflow-visible">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-semibold shrink-0" title={user?.name}>{userInitials}</div>
            <span className="text-xs sm:text-sm font-medium truncate max-w-[70px] sm:max-w-none">{user?.tradingId || '—'}</span>
            <div className="relative overflow-visible">
              <button type="button" onClick={() => setHeaderMenuOpen((o) => !o)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 touch-manipulation" aria-label="Menu">⋮</button>
              {headerMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} aria-hidden="true" />
                  <div className={`absolute right-0 top-full mt-1 z-50 py-1 rounded border shadow-lg min-w-[140px] ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                    <button type="button" onClick={() => { onLogout(); setHeaderMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700">Log out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Zerodha-style order popup when clicking B/S from watchlist */}
      {orderModalOpen && orderModalSide && (() => {
        const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
        const isNfo = ex === 'NFO';
        const isOpt = /(CE|PE)$/.test(String(trSymbol).toUpperCase());
        const optionsRequireLimit = isNfo && isOpt;
        const quoteKey = symbol.includes(':') ? symbol.split(':')[1] : (symbol === 'NIFTY 50' ? 'NIFTY 50' : symbol === 'NIFTY BANK' ? 'NIFTY BANK' : symbol);
        const ltp = quotes[quoteKey]?.lastPrice ?? quotes[quoteKey]?.value ?? null;
        const priceVal = orderType === 'LIMIT' || optionsRequireLimit ? (Number(orderPrice) || ltp) : ltp;
        const qtyNum = Number(quantity) || 1;
        const reqAmount = (priceVal != null && priceVal > 0) ? qtyNum * priceVal : 0;
        const avail = portfolio?.user?.cashBalance ?? 0;
        const segmentLabel = ex === 'NFO' ? 'NFO' : ex === 'BSE' ? 'BSE' : 'NSE';
        const isSell = orderModalSide === 'SELL';
        return (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-3 pb-4 overflow-y-auto">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setOrderModalOpen(false); setOrderModalSide(null); }} aria-hidden="true" />
            <div className={`relative w-full max-w-md rounded-xl shadow-xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
              {/* Header - orange for Sell, green for Buy */}
              <div className={`px-4 py-3 ${isSell ? 'bg-orange-500' : 'bg-blue-600'} text-white`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{getSymbolDisplayLabel(symbol).replace(/\s w\s/g, ' ʷ ')}</p>
                    <p className="text-white/90 text-sm">{segmentLabel} {ltp != null ? formatINR(ltp) : '—'}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${tradingMode === 'paper' ? 'bg-white/20' : 'bg-white/20'}`}>{tradingMode === 'paper' ? 'Paper' : 'Live'}</span>
                </div>
              </div>
              {/* Tabs: Quick / Regular / Iceberg */}
              <div className="flex border-b border-gray-200 dark:border-slate-600">
                <button type="button" className={`px-4 py-2.5 text-sm font-medium ${isSell ? 'text-orange-600 dark:text-orange-400 border-b-2 border-orange-500' : 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'}`}>Quick</button>
                <button type="button" className="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-slate-400 border-b-2 border-transparent">Regular</button>
                <button type="button" className="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-slate-400 border-b-2 border-transparent">Iceberg</button>
              </div>
              <div className="p-4 space-y-4">
                {/* Qty */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Qty.</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`flex-1 min-w-0 rounded border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                    <button type="button" onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 1) - 1)))} className="p-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300">−</button>
                    <button type="button" onClick={() => setQuantity(String((Number(quantity) || 1) + 1))} className="p-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300">+</button>
                  </div>
                </div>
                {/* Price */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Price</label>
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.05" placeholder={ltp != null ? String(ltp) : '0'} value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} className={`flex-1 min-w-0 rounded border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                    <button type="button" onClick={() => setOrderPrice('')} className="p-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400" title="Clear">×</button>
                  </div>
                </div>
                {/* Order type & Product */}
                <div className="grid grid-cols-2 gap-3">
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
                {optionsRequireLimit && <p className="text-xs text-amber-600 dark:text-amber-400">Options require Limit order and price</p>}
                {/* Intraday checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={orderProduct === 'MIS'} onChange={(e) => setOrderProduct(e.target.checked ? 'MIS' : (isNfo ? 'NRML' : 'CNC'))} className="rounded border-gray-300 dark:border-slate-600" />
                  <span className="text-sm text-gray-700 dark:text-slate-300">Intraday</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">1 lot</span>
                </label>
                {/* Req. / Avail. */}
                <div className="text-sm space-y-1">
                  <p className="text-gray-600 dark:text-slate-400">Req. {formatINR(reqAmount)}</p>
                  <p className="text-gray-600 dark:text-slate-400">Avail. {formatINR(avail)}</p>
                </div>
                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button type="button" onClick={() => { placeOrder(orderModalSide); setOrderModalOpen(false); setOrderModalSide(null); }} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className={`py-3 rounded-lg font-semibold text-white touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${isSell ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    {kiteOrderLoading ? '...' : orderModalSide}
                  </button>
                  <button type="button" onClick={() => { setOrderModalOpen(false); setOrderModalSide(null); }} className="py-3 rounded-lg font-medium border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600 touch-manipulation">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Find an instrument modal - opened from Get started (positions empty state) or Ctrl+Shift+F */}
      {findInstrumentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setFindInstrumentModalOpen(false); setFindInstrumentQuery(''); setFindInstrumentSuggestions([]); }} aria-hidden="true" />
          <div className={`relative w-full max-w-lg rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} aria-hidden>🔍</span>
                <input
                  ref={findInstrumentSearchRef}
                  type="text"
                  placeholder="Search eg: infy bse, nifty fut, index fund, etc"
                  value={findInstrumentQuery}
                  onChange={(e) => setFindInstrumentQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (setFindInstrumentModalOpen(false), setFindInstrumentQuery(''))}
                  className={`flex-1 min-w-0 rounded border px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'}`}
                />
                <span className={`shrink-0 text-[10px] px-2 py-1 rounded ${darkMode ? 'bg-slate-600 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>Ctrl+Shift+F</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-4">
              {findInstrumentQuery.trim().length < 1 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="text-5xl text-gray-300 dark:text-slate-500 mb-4" aria-hidden>🔍</span>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200 mb-1">Find an instrument</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Use the above search bar to find an instrument</p>
                </div>
              ) : findInstrumentLoading ? (
                <div className="py-12 text-center text-sm text-gray-500 dark:text-slate-400">Searching…</div>
              ) : findInstrumentSuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="text-5xl text-gray-300 dark:text-slate-500 mb-4" aria-hidden>🔍</span>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200 mb-1">Find an instrument</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">No results. Try another search.</p>
                </div>
              ) : (
                <ul className="space-y-0 divide-y divide-gray-200 dark:divide-slate-600">
                  {findInstrumentSuggestions.map((inst) => {
                    const key = inst.key || `${inst.exchange}:${inst.tradingsymbol}`;
                    const tag = (inst.instrument_type || '').toUpperCase() === 'INDEX' ? 'INDICES' : (inst.segment_label || inst.exchange || '').toUpperCase();
                    return (
                      <li
                        key={key}
                        className={`flex items-center justify-between gap-2 px-2 py-2.5 cursor-pointer text-left ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50'}`}
                        onClick={() => {
                          setWatchlist((prev) => (prev.includes(key) ? prev : [...prev, key]));
                          setSymbol(key);
                          setMainNav('dashboard');
                          setFindInstrumentModalOpen(false);
                          setFindInstrumentQuery('');
                          setFindInstrumentSuggestions([]);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900 dark:text-slate-100 block truncate">{inst.zerodha_display_name || inst.tradingsymbol || inst.name}</span>
                          <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{inst.name || inst.tradingsymbol}{inst.segment_label ? ` · ${inst.segment_label}` : ''}</span>
                        </div>
                        {tag && <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>{tag}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-slate-600 shrink-0 flex justify-end">
              <button type="button" onClick={() => { setFindInstrumentModalOpen(false); setFindInstrumentQuery(''); setFindInstrumentSuggestions([]); }} className="px-4 py-2 rounded-lg font-medium border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600">
                Close
            </button>
          </div>
        </div>
        </div>
      )}

      {backendDown && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-3 sm:px-4 py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          <strong>Backend not running</strong> — Buy/Sell and portfolio need the server. In a terminal: <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded break-all">cd backend && npm start</code> (ensure MongoDB is running).{' '}
          <button type="button" onClick={() => fetchPortfolio()} className="ml-2 font-medium underline touch-manipulation">Retry</button>
        </div>
      )}
      {kiteRefreshMessage === 'success' && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-3 sm:px-4 py-2 text-xs sm:text-sm text-green-800 dark:text-green-200">
          Kite session refreshed. Live data should appear shortly.
        </div>
      )}
      {kiteRefreshMessage && kiteRefreshMessage !== 'success' && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-3 sm:px-4 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          Kite login failed: {kiteRefreshMessage}
        </div>
      )}
      {/* One-time Kite setup: open console, copy URL, paste key/secret — maximum automation (redirect URL must be added manually in Kite; no API exists) */}
      {kiteSetupOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50" onClick={() => setKiteSetupOpen(false)} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-xl shadow-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">One-time setup: Live market data</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">All steps happen in the Kite developer console we open for you.</p>

            <div className="space-y-4 mb-4">
              <div>
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Step 1 — Add redirect URL</span>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 mb-1">Open Kite, create an app if needed, then paste the URL below into your app’s “Redirect URL” field.</p>
                <div className="flex gap-2">
                  <code className={`flex-1 min-w-0 truncate rounded px-2 py-1.5 text-xs ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-800'}`} title={kiteRedirectUrlDisplay}>{kiteRedirectUrlDisplay}</code>
                  <button type="button" onClick={() => { try { navigator.clipboard.writeText(kiteRedirectUrlDisplay); } catch (_) {} }} className="shrink-0 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 text-xs font-medium">Copy</button>
                </div>
                <a href="https://developers.kite.trade" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  Open Kite developer console →
                </a>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Step 2 — Paste API key & secret</span>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 mb-2">From the same app, copy API key and secret here.</p>
                <div className="space-y-2">
                  <input type="text" value={kiteSetupApiKey} onChange={(e) => setKiteSetupApiKey(e.target.value)} placeholder="API Key" className={`w-full rounded border px-3 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                  <input type="password" value={kiteSetupApiSecret} onChange={(e) => setKiteSetupApiSecret(e.target.value)} placeholder="API Secret" className={`w-full rounded border px-3 py-2 text-sm ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-300 bg-white text-gray-900'}`} />
                </div>
              </div>
            </div>

            {kiteSetupError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{kiteSetupError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setKiteSetupOpen(false)} className="px-4 py-2 rounded border border-gray-300 dark:border-slate-600 text-sm font-medium">Cancel</button>
              <button
                type="button"
                disabled={!kiteSetupApiKey.trim() || !kiteSetupApiSecret.trim() || kiteSetupSaving}
                onClick={async () => {
                  setKiteSetupError('');
                  setKiteSetupSaving(true);
                  try {
                    const res = await fetch(`${API_URL}/api/kite/setup`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                      body: JSON.stringify({ apiKey: kiteSetupApiKey.trim(), apiSecret: kiteSetupApiSecret.trim() }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error || 'Failed to save');
                    setKiteSetupOpen(false);
                    kiteRedirectDoneRef.current = true;
                    setKiteAutoConnecting(true);
                    const origin = window.location.origin;
                    fetch(`${API_URL}/api/kite/set-redirect-origin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin }) }).catch(() => {});
                    window.location.href = `${API_URL}/api/kite/login?for=market&redirect_origin=${encodeURIComponent(origin)}`;
                  } catch (e) {
                    setKiteSetupError(e.message || 'Failed');
                  } finally {
                    setKiteSetupSaving(false);
                  }
                }}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {kiteSetupSaving ? 'Saving…' : 'Save and connect'}
              </button>
            </div>
          </div>
        </div>
      )}
      {kiteAutoConnecting && (
        <div className="bg-sky-50 dark:bg-sky-900/20 border-b border-sky-200 dark:border-sky-800 px-3 sm:px-4 py-2 text-xs sm:text-sm text-sky-800 dark:text-sky-200">
          Enabling live data…
        </div>
      )}
      {quotesApiUnavailable && !backendDown && !kiteAutoConnecting && (
        <div className="bg-sky-50 dark:bg-sky-900/20 border-b border-sky-200 dark:border-sky-800 px-3 sm:px-4 py-2 text-xs sm:text-sm text-sky-800 dark:text-sky-200">
          <strong>Paper trading</strong> — Live prices for practice. {kiteRefreshMessage ? (
            <>Kite login failed. <a href={`${API_URL}/api/kite/login?for=market`} className="font-semibold underline hover:no-underline">Try again</a></>
          ) : (
            <>Enabling live data…</>
          )}{' '}
          <button type="button" onClick={() => { setKiteSetupOpen(true); if (!kiteRedirectUrl) fetch(`${API_URL}/api/kite/setup`).then((r) => r.json()).then((d) => d.redirectUrlToAddInKite && setKiteRedirectUrl(d.redirectUrlToAddInKite)); }} className="font-semibold underline hover:no-underline">Setup Kite</button>
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
                placeholder="Search: NSE/BSE stocks, indices, NFO F&O, MCX commodity"
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
                      setSearchSuggestionsTotal(0);
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
              <div className={`absolute left-2 right-2 top-full mt-0.5 z-20 rounded border shadow-lg overflow-hidden ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                {searchSuggestionsTotal > 0 && (
                  <div className={`px-2 py-1.5 text-xs font-medium border-b shrink-0 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                    Showing {searchSuggestions.length} of {searchSuggestionsTotal} matches (stocks, F&O, options, indices, MCX)
                  </div>
                )}
                <ul className="max-h-72 overflow-auto">
                  {searchSuggestions.map((inst) => (
                    <li
                      key={inst.key || `${inst.exchange}:${inst.tradingsymbol}`}
                      className={`flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer text-left border-b last:border-b-0 ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-100'}`}
                      onClick={() => {
                        const key = inst.key || `${inst.exchange}:${inst.tradingsymbol}`;
                        setWatchlist((prev) => (prev.includes(key) ? prev : [...prev, key]));
                        setSearchQuery('');
                        setSearchSuggestions([]);
                        setSearchSuggestionsTotal(0);
                        setSearchSuggestionsOpen(false);
                        setSymbol(key);
                      }}
                    >
                      <span className="font-medium text-sm">
                        {inst.zerodha_display_name || inst.tradingsymbol}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        {inst.zerodha_expiry_label ? (
                          <>
                            <span className="font-medium">{inst.zerodha_expiry_label}</span>
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>NFO</span>
                          </>
                        ) : (
                          <>{inst.name || inst.tradingsymbol}{inst.segment_label ? ` · ${inst.segment_label}` : ` · ${inst.exchange}${inst.instrument_type ? ` · ${(inst.instrument_type === 'FUT' ? 'Future' : inst.instrument_type === 'CE' || inst.instrument_type === 'PE' ? 'Option' : inst.instrument_type === 'INDEX' ? 'Index' : inst.instrument_type === 'MF' ? 'MF' : inst.instrument_type)}` : ''}`}</>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {searchSuggestionsTotal > searchSuggestions.length && (
                  <button
                    type="button"
                    disabled={searchSuggestionsLoadingMore}
                    className={`w-full py-2 text-sm font-medium border-t ${darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600 text-slate-200' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                    onClick={() => {
                      setSearchSuggestionsLoadingMore(true);
                      const q = searchQuery.trim();
                      fetch(`${API_URL}/api/market/instruments/search?q=${encodeURIComponent(q)}&limit=1000&offset=${searchSuggestions.length}`)
                        .then((res) => res.ok ? res.json() : Promise.reject())
                        .then((json) => {
                          const more = json.suggestions || [];
                          setSearchSuggestions((prev) => [...prev, ...more]);
                          setSearchSuggestionsLoadingMore(false);
                        })
                        .catch(() => setSearchSuggestionsLoadingMore(false));
                    }}
                  >
                    {searchSuggestionsLoadingMore ? 'Loading…' : `Load more (${searchSuggestionsTotal - searchSuggestions.length} more of ${searchSuggestionsTotal} total)`}
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Ctrl+K to search</p>
          </div>
          <div className="px-2 pt-1 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">{activeGroup?.name ?? 'Default'} ({watchlist.length}/250)</span>
            <button type="button" onClick={addWatchlistGroup} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">+ New group</button>
          </div>
          <div className="px-2 flex items-center justify-between gap-1">
            <span className="text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wide">{activeGroup?.name ?? 'Default'} ({watchlist.length})</span>
            {dataFeedLive && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Live</span>}
            {!dataFeedLive && watchlist.length > 0 && <span className="text-[10px] text-gray-500 dark:text-slate-400">Delayed</span>}
            {quotesApiUnavailable && !kiteAutoConnecting && <span className="text-[10px] text-amber-600 dark:text-amber-400">Enabling…</span>}
          </div>
          <ul className="flex-1 overflow-auto min-h-0 text-sm">
            {paginatedWatchlist.map((s) => {
              const hasColon = s.includes(':');
              const ex = hasColon ? s.split(':')[0] : null;
              const sym = hasColon ? s.split(':')[1] : s;
              const displaySymbol = (ex === 'NFO' && sym && formatOptionDisplayZerodha(ex, sym)) || sym || s;
              let quoteKey = sym || (s === 'NIFTY50' ? 'NIFTY 50' : s);
              if (quoteKey === 'NIFTYBANK') quoteKey = 'NIFTY BANK';
              const realQuote = quotes[quoteKey];
              const hasQuote = !!realQuote;
              const lastPrice = hasQuote ? realQuote.lastPrice : null;
              const change = hasQuote ? realQuote.change : null;
              const changePercent = hasQuote ? realQuote.changePercent : null;
              const isSelected = symbol === s;
              const optionsOpen = watchlistOptionsOpen === s;
              return (
                <li
                  key={s}
                  className={`group flex items-center gap-0.5 py-1.5 px-2 border-b ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-gray-100 hover:bg-gray-200'}`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-1 cursor-pointer" onClick={() => setSymbol(s)}>
                  <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{displaySymbol.replace(/\s w\s/g, ' ʷ ')}{ex !== 'NFO' && (s.includes('NIFTY') || s.includes('SENSEX')) ? ' INDEX' : ''}</div>
                    <div className="flex items-center gap-2 text-xs">
                        {watchlistShow.priceChange && (hasQuote ? <span className={change < 0 ? 'text-red-500' : 'text-green-500'}>{change >= 0 ? '+' : ''}{change}</span> : <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>—</span>)}
                        {watchlistShow.priceChangePct && (hasQuote ? <span className={changePercent < 0 ? 'text-red-500' : 'text-green-500'}>({changePercent}%)</span> : <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>—</span>)}
                        {watchlistShow.priceDirection && (hasQuote ? <span className={change < 0 ? 'text-red-500' : 'text-green-500'}>{change < 0 ? '▼' : '▲'}</span> : <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>—</span>)}
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>{lastPrice != null ? Number(lastPrice).toFixed(2) : '—'}</span>
                    </div>
                  </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { setSymbol(s); setOrderModalSide('BUY'); setOrderModalOpen(true); setMainNav('dashboard'); setChartFullScreen(false); setSidebarOpen(false); }} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded text-white font-semibold text-sm bg-blue-600 hover:bg-blue-700 touch-manipulation shrink-0" title="Buy">B</button>
                    <button type="button" onClick={() => { setSymbol(s); setOrderModalSide('SELL'); setOrderModalOpen(true); setMainNav('dashboard'); setChartFullScreen(false); setSidebarOpen(false); }} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded text-white font-semibold text-sm bg-orange-500 hover:bg-orange-600 touch-manipulation shrink-0" title="Sell">S</button>
                    <button type="button" onClick={() => { setSymbol(s); setChartFullScreen(true); setWatchlistOptionsOpen(null); setMainNav('dashboard'); setSidebarOpen(false); }} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 touch-manipulation shrink-0" title="Chart">📈</button>
                    <div className="relative">
                      <button type="button" onClick={() => setWatchlistOptionsOpen(optionsOpen ? null : s)} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 touch-manipulation shrink-0 text-gray-700 dark:text-slate-200" title="Menu" aria-label="Options">☰</button>
                      {optionsOpen && (
                        <div className={`absolute left-0 top-full mt-0.5 z-30 min-w-[160px] py-1 rounded border shadow-lg ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                          <button type="button" onClick={() => { setOptionChainExpiry(null); setOptionChainSymbol(s); setWatchlistOptionsOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Option chain</button>
                          <button type="button" onClick={() => { setMarketDepthSymbol(s); setWatchlistOptionsOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Market depth</button>
                          <button type="button" onClick={() => { setSymbol(s); setChartFullScreen(true); setWatchlistOptionsOpen(null); setMainNav('dashboard'); setSidebarOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Chart</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Create alert / ATO</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Notes</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Fundamentals</button>
                          <button type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700">Technicals</button>
                          <button type="button" onClick={() => { removeFromWatchlist(s); setWatchlistOptionsOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700">Remove from watchlist</button>
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => { setSymbol(s); setOrderModalSide('BUY'); setOrderModalOpen(true); setMainNav('dashboard'); setChartFullScreen(false); setSidebarOpen(false); }} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded text-white font-semibold text-lg leading-none bg-green-600 hover:bg-green-700 touch-manipulation shrink-0" title="Quick buy">+</button>
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
              {/* Full-screen chart when opened from watchlist Chart */}
              {chartFullScreen ? (
                <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                  <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">{getSymbolDisplayLabel(symbol)}</span>
                    <div className="flex items-center gap-2">
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
                            className={`px-2 py-1 text-xs font-medium rounded ${chartRange === id ? 'bg-blue-600 text-white' : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {chartLtp != null && (
                        <span className={`text-sm font-medium ${chartLtp >= (candles[candles.length - 1]?.open ?? 0) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          LTP {Number(chartLtp).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <button type="button" onClick={() => setChartFullScreen(false)} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-400 font-medium" title="Close chart">✕</button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 min-w-0 relative">
                    {chartLoading && (
                      <div className={`absolute inset-0 flex items-center justify-center z-10 ${darkMode ? 'bg-slate-900/80' : 'bg-gray-100/80'}`}>
                        <span className="text-sm text-gray-600 dark:text-slate-400">Loading chart…</span>
                      </div>
                    )}
                    {!chartLoading && candles.length === 0 && chartError ? (
                      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600'}`}>
                        <p className="text-sm text-center px-4 max-w-md">{chartError}</p>
                        {/live data|kite|api_key|access_token/i.test(chartError) && (
                          <button type="button" onClick={() => { setKiteSetupOpen(true); if (!kiteRedirectUrl) fetch(`${API_URL}/api/kite/setup`).then((r) => r.json()).then((d) => d.redirectUrlToAddInKite && setKiteRedirectUrl(d.redirectUrlToAddInKite)); }} className="px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">
                            Enable live data
                          </button>
                        )}
                      </div>
                    ) : (
                      <PriceChart data={candles} darkMode={darkMode} lastPrice={chartLtp} />
                    )}
                  </div>
                  {chartError && candles.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 px-3 py-1 shrink-0" role="alert">{chartError}</p>}
                </div>
              ) : (
              <>
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
                          <span className="text-sm font-medium text-gray-600 dark:text-slate-400 truncate">{getSymbolDisplayLabel(symbol)}</span>
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
                          {!chartLoading && candles.length === 0 && chartError ? (
                            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                              <p className="text-sm text-center px-4 max-w-md">{chartError}</p>
                              {/live data|kite|api_key|access_token/i.test(chartError) && (
                                <button type="button" onClick={() => { setKiteSetupOpen(true); if (!kiteRedirectUrl) fetch(`${API_URL}/api/kite/setup`).then((r) => r.json()).then((d) => d.redirectUrlToAddInKite && setKiteRedirectUrl(d.redirectUrlToAddInKite)); }} className="px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">
                                  Enable live data
                                </button>
                              )}
                            </div>
                          ) : (
                            <PriceChart data={candles} darkMode={darkMode} />
                          )}
                        </div>
                        {chartError && candles.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" role="alert">{chartError}</p>}
                      </div>
                    </div>
                    <div className={`rounded-lg border p-6 min-w-0 flex flex-col items-center justify-center text-center min-h-[260px] lg:min-h-0 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
                      <span className="text-4xl text-gray-300 dark:text-slate-600 mb-2" aria-hidden>⚓</span>
                      <p className="text-sm font-medium text-gray-700 dark:text-slate-300">You don&apos;t have any positions yet</p>
                      <button type="button" onClick={() => setFindInstrumentModalOpen(true)} className="mt-4 px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none touch-manipulation">
                        Get started
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right sidebar - Order panel: only when user clicked Buy/Sell from watchlist */}
              {(orderSide !== null) && (() => {
                const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
                const isNfo = ex === 'NFO';
                const isOpt = /(CE|PE)$/.test(String(trSymbol).toUpperCase());
                const optionsRequireLimit = isNfo && isOpt;
                return (
                  <aside ref={orderPanelRef} className={`w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 border-l min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 shrink-0">Order</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tradingMode === 'paper' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'}`}>{tradingMode === 'paper' ? 'Paper' : 'Live'}</span>
                          <button type="button" onClick={() => setOrderSide(null)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200" title="Close order panel" aria-label="Close">×</button>
              </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate" title={tradingMode === 'paper' ? 'Simulated on TradeSphere' : 'Scrip from watchlist or search'}>{tradingMode === 'paper' ? 'Simulated on TradeSphere' : 'Scrip from watchlist or search'}</p>
                    </div>
                    <div className="p-3 flex flex-col gap-3 flex-1 min-h-0 min-w-0">
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Symbol</label>
                        <input placeholder="e.g. RELIANCE" value={symbol} onChange={(e) => { setSymbol(e.target.value); setOrderSide(null); }} className={`w-full min-w-0 rounded border px-2.5 py-2.5 sm:py-2 text-sm touch-manipulation box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`} />
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
                      <div className={`grid gap-2 mt-auto pt-2 min-w-0 ${orderSide ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {(orderSide === null || orderSide === 'BUY') && (
                          <button type="button" onClick={() => { placeOrder('BUY'); setOrderSide(null); }} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-3 sm:py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 min-w-0">Buy</button>
                        )}
                        {(orderSide === null || orderSide === 'SELL') && (
                          <button type="button" onClick={() => { placeOrder('SELL'); setOrderSide(null); }} disabled={kiteOrderLoading || (optionsRequireLimit && !orderPrice)} className="rounded py-3 sm:py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 min-w-0">Sell</button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 break-words overflow-hidden">Kite · F&O: MIS/NRML · Options: Limit</p>
                    </div>
                  </aside>
                );
              })()}
            </>
            )}
            </div>
          )}

          {mainNav === 'orders' && (
            <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-6">
              <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                  <h3 className="px-3 sm:px-4 py-3 font-semibold border-b border-gray-200 dark:border-slate-700">Orders</h3>
                  {orderPanelClosedOnOrdersTab && (
                    <button type="button" onClick={() => setOrderPanelClosedOnOrdersTab(false)} className="m-3 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Show order panel</button>
                  )}
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
              {/* Order panel on Orders tab - hidden when user closed it */}
              {!orderPanelClosedOnOrdersTab && (() => {
                const [ex, trSymbol] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol];
                const isNfo = ex === 'NFO';
                const isOpt = /(CE|PE)$/.test(String(trSymbol).toUpperCase());
                const optionsRequireLimit = isNfo && isOpt;
                return (
                  <aside className={`w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 border-l min-w-0 overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 shrink-0">Order</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tradingMode === 'paper' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'}`}>{tradingMode === 'paper' ? 'Paper' : 'Live'}</span>
                          <button type="button" onClick={() => setOrderPanelClosedOnOrdersTab(true)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200" title="Close order panel" aria-label="Close">×</button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">{tradingMode === 'paper' ? 'Simulated on TradeSphere' : 'Scrip from watchlist or search'}</p>
                    </div>
                    <div className="p-3 flex flex-col gap-3 flex-1 min-h-0 min-w-0">
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Symbol</label>
                        <input placeholder="e.g. RELIANCE" value={symbol} onChange={(e) => { setSymbol(e.target.value); setOrderSide(null); }} className={`w-full min-w-0 rounded border px-2.5 py-2.5 sm:py-2 text-sm touch-manipulation box-border ${darkMode ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`} />
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
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-gray-500 dark:text-slate-500 mb-4">No open positions. Place orders via the Order panel (Kite) or use Buy/Sell for demo.</p>
                      <button type="button" onClick={() => setFindInstrumentModalOpen(true)} className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none">Get started</button>
                    </div>
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
                          <th className="text-left py-2 pr-2 cursor-help" title="Call open interest in lakhs — total outstanding call option contracts">Call OI (L)</th>
                          <th className="text-left py-2 pr-2 cursor-help" title="Call last traded price — latest price at which the call option was traded">Call LTP</th>
                          <th className="text-left py-2 pr-2 font-medium cursor-help" title="Strike price — the price at which the option can be exercised">Strike</th>
                          <th className="text-left py-2 pr-2 cursor-help" title="Put last traded price — latest price at which the put option was traded">Put LTP</th>
                          <th className="text-left py-2 cursor-help" title="Put open interest in lakhs — total outstanding put option contracts">Put OI (L)</th>
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
              {marketDepthLoading ? (
                <div className="py-6 text-center text-gray-500 dark:text-slate-400">Loading market depth…</div>
              ) : marketDepthData?.error ? (
                <div className="py-4 px-4 text-center">
                  <p className="text-amber-600 dark:text-amber-400 font-medium">{marketDepthData.error}</p>
                  {marketDepthData.message && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">{marketDepthData.message}</p>
                  )}
                </div>
              ) : (
                <>
                  {/* OHLC card + day range bar (real data from Kite) */}
                  {marketDepthData?.ohlc && (
                    <div className={`mb-4 rounded-lg border p-4 ${darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Open</p>
                          <p className="font-medium text-gray-900 dark:text-slate-100">{(marketDepthData.ohlc?.open ?? marketDepthData.last_price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Low</p>
                          <p className="font-medium text-red-600 dark:text-red-400">{(marketDepthData.ohlc?.low ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Prev. Close</p>
                          <p className="font-medium text-gray-900 dark:text-slate-100">{(marketDepthData.ohlc?.close ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">High</p>
                          <p className="font-medium text-green-600 dark:text-green-400">{(marketDepthData.ohlc?.high ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                      {/* Day range bar: low ---- [current] ---- high */}
                      {marketDepthData.ohlc && Number(marketDepthData.ohlc.high) > Number(marketDepthData.ohlc.low) && (
                        <div className="mt-3">
                          <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden relative flex">
                            <div
                              className="absolute top-0 bottom-0 bg-red-500 dark:bg-red-500 rounded-full"
                              style={{
                                left: 0,
                                width: '100%',
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-gray-700 dark:bg-slate-300 rounded-full -translate-x-1/2"
                              style={{
                                left: `${Math.min(100, Math.max(0, ((Number(marketDepthData.last_price) || Number(marketDepthData.ohlc.close)) - Number(marketDepthData.ohlc.low)) / (Number(marketDepthData.ohlc.high) - Number(marketDepthData.ohlc.low)) * 100))}%`,
                              }}
                              title={`LTP ${(marketDepthData.last_price ?? marketDepthData.ohlc.close).toFixed(2)}`}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mt-1">
                            <span>Low {Number(marketDepthData.ohlc.low).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            <span>LTP {(marketDepthData.last_price ?? marketDepthData.ohlc.close).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            <span>High {Number(marketDepthData.ohlc.high).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Order book</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400">
                        <th className="text-left py-2 cursor-help" title="Total quantity of buy orders at this price level (number of shares or contracts bid)">Bid Qty</th>
                        <th className="text-left py-2 cursor-help" title="Bid price — the price at which buyers are willing to buy">Bid</th>
                        <th className="text-left py-2 cursor-help" title="Ask price — the price at which sellers are willing to sell">Ask</th>
                        <th className="text-left py-2 cursor-help" title="Total quantity of sell orders at this price level (number of shares or contracts offered)">Ask Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const buy = marketDepthData?.buy || [];
                        const sell = marketDepthData?.sell || [];
                        const rows = Math.max(buy.length, sell.length, 5);
                        if (rows === 0 && !marketDepthData?.ohlc && marketDepthData?.last_price == null) {
                          return (
                            <tr><td colSpan={4} className="py-4 text-gray-500 dark:text-slate-400 text-center">No depth data. Connect Kite and try during market hours.</td></tr>
                          );
                        }
                        return Array.from({ length: rows }, (_, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-1.5 text-green-600 dark:text-green-400">{buy[i]?.quantity != null && buy[i].quantity > 0 ? Number(buy[i].quantity).toLocaleString('en-IN') : '—'}</td>
                            <td className="py-1.5 text-green-600 dark:text-green-400">{buy[i]?.price != null && buy[i].price > 0 ? Number(buy[i].price).toFixed(2) : '—'}</td>
                            <td className="py-1.5 text-red-600 dark:text-red-400">{sell[i]?.price != null && sell[i].price > 0 ? Number(sell[i].price).toFixed(2) : '—'}</td>
                            <td className="py-1.5 text-red-600 dark:text-red-400">{sell[i]?.quantity != null && sell[i].quantity > 0 ? Number(sell[i].quantity).toLocaleString('en-IN') : '—'}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                  {marketDepthData && !marketDepthData.error && (marketDepthData.buy?.length > 0 || marketDepthData.sell?.length > 0) && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">Live order book from Kite. Updates on each open.</p>
                  )}
                  {marketDepthData && !marketDepthData.error && (!marketDepthData.buy?.length && !marketDepthData.sell?.length) && marketDepthData.message && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">{marketDepthData.message}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
