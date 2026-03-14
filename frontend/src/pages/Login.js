import { useState, useEffect } from 'react';
import Logo from '../assets/only_logo.jpg';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroLine1a, setHeroLine1a] = useState('');
  const [heroLine1b, setHeroLine1b] = useState('');
  const [heroLine1c, setHeroLine1c] = useState('');
  const [heroLine2, setHeroLine2] = useState('');

  useEffect(() => {
    const line1a = 'TradeSphere';
    const line1b = 'by';
    const line1c = 'GammaFlowCapital';
    const line2 = 'Your Strategy Lab for the Stock Market';

    let idx1a = 0;
    let idx1b = 0;
    let idx1c = 0;
    let idx2 = 0;
    let phase = 'line1a';
    let timer;

    const tick = () => {
      if (phase === 'line1a') {
        if (idx1a <= line1a.length) {
          setHeroLine1a(line1a.slice(0, idx1a));
          idx1a += 1;
        } else {
          phase = 'line1b';
          idx1b = 0;
        }
      } else if (phase === 'line1b') {
        if (idx1b <= line1b.length) {
          setHeroLine1b(line1b.slice(0, idx1b));
          idx1b += 1;
        } else {
          phase = 'line1c';
          idx1c = 0;
        }
      } else if (phase === 'line1c') {
        if (idx1c <= line1c.length) {
          setHeroLine1c(line1c.slice(0, idx1c));
          idx1c += 1;
        } else {
          phase = 'line2';
          idx2 = 0;
        }
      } else if (phase === 'line2') {
        if (idx2 <= line2.length) {
          setHeroLine2(line2.slice(0, idx2));
          idx2 += 1;
        } else {
          phase = 'pause';
          setTimeout(() => {
            idx1a = 0;
            idx1b = 0;
            idx1c = 0;
            idx2 = 0;
            setHeroLine1a('');
            setHeroLine1b('');
            setHeroLine1c('');
            setHeroLine2('');
            phase = 'line1a';
          }, 5000);
        }
      }
    };

    timer = setInterval(tick, 65);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const bottomCandles = [
    { left: '2%', height: 110, color: 'green', duration: 7, delay: 0 },
    { left: '6%', height: 150, color: 'red', duration: 8.5, delay: -1.1 },
    { left: '10%', height: 135, color: 'green', duration: 7.4, delay: -2.2 },
    { left: '14%', height: 170, color: 'red', duration: 9.5, delay: -3.3 },
    { left: '18%', height: 145, color: 'green', duration: 8.1, delay: -4.4 },
    { left: '22%', height: 165, color: 'red', duration: 9.8, delay: -5.5 },
    { left: '26%', height: 130, color: 'green', duration: 7.6, delay: -1.7 },
    { left: '30%', height: 190, color: 'red', duration: 10.6, delay: -2.8 },
    { left: '34%', height: 160, color: 'green', duration: 8.7, delay: -3.9 },
    { left: '38%', height: 175, color: 'red', duration: 9.9, delay: -5.0 },
    { left: '42%', height: 140, color: 'green', duration: 7.3, delay: -6.1 },
    { left: '46%', height: 185, color: 'red', duration: 10.2, delay: -2.4 },
    { left: '50%', height: 155, color: 'green', duration: 8.4, delay: -3.5 },
    { left: '54%', height: 170, color: 'red', duration: 9.4, delay: -4.6 },
    { left: '58%', height: 135, color: 'green', duration: 7.1, delay: -5.7 },
    { left: '62%', height: 180, color: 'red', duration: 10.1, delay: -1.9 },
    { left: '66%', height: 150, color: 'green', duration: 8.2, delay: -3.0 },
    { left: '70%', height: 165, color: 'red', duration: 9.3, delay: -4.1 },
    { left: '74%', height: 140, color: 'green', duration: 7.5, delay: -5.2 },
    { left: '78%', height: 175, color: 'red', duration: 10.4, delay: -6.3 },
    { left: '82%', height: 145, color: 'green', duration: 8.0, delay: -2.6 },
    { left: '86%', height: 195, color: 'red', duration: 10.8, delay: -3.7 },
    { left: '90%', height: 155, color: 'green', duration: 8.6, delay: -4.8 },
    { left: '94%', height: 170, color: 'red', duration: 9.7, delay: -5.9 },
    { left: '98%', height: 140, color: 'green', duration: 7.8, delay: -1.3 },
  ];

  const topCandles = [
    { left: '6%', height: 120, color: 'red', duration: 8.5, delay: -1.5 },
    { left: '10%', height: 150, color: 'green', duration: 9.2, delay: -3.1 },
    { left: '18%', height: 170, color: 'red', duration: 10.1, delay: -4.6 },
    { left: '24%', height: 140, color: 'green', duration: 8.7, delay: -2.4 },
    { left: '30%', height: 160, color: 'red', duration: 9.6, delay: -5.3 },
    { left: '36%', height: 135, color: 'green', duration: 7.9, delay: -1.8 },
    { left: '42%', height: 175, color: 'red', duration: 10.4, delay: -3.9 },
    { left: '48%', height: 145, color: 'green', duration: 8.3, delay: -5.7 },
    { left: '54%', height: 165, color: 'red', duration: 9.8, delay: -2.9 },
    { left: '60%', height: 130, color: 'green', duration: 7.6, delay: -4.2 },
    { left: '68%', height: 180, color: 'red', duration: 10.6, delay: -6.1 },
    { left: '74%', height: 150, color: 'green', duration: 8.9, delay: -3.5 },
    { left: '80%', height: 170, color: 'red', duration: 9.9, delay: -5.0 },
    { left: '88%', height: 140, color: 'green', duration: 8.1, delay: -2.2 },
    { left: '94%', height: 160, color: 'red', duration: 9.3, delay: -3.6 },
  ];

  const LOGIN_TIMEOUT_MS = 25000; // 25s — backend on free tier can take ~1 min to wake

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
      const url = isRegister ? `${API_URL}/api/auth/register` : `${API_URL}/api/auth/login`;
      const body = isRegister ? { name, email, password } : { email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      clearTimeout(timeoutId);
      const message =
        err.name === 'AbortError'
          ? 'Server is taking too long. If the backend is on a free tier, it may be waking up — wait a minute and try again.'
          : err.message === 'Failed to fetch'
            ? 'Cannot reach the server. Check that the backend URL is correct and the service is running.'
            : err.message;
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen min-h-[100dvh] lg:h-screen lg:min-h-0 flex flex-col lg:flex-row items-stretch bg-slate-950 overflow-x-hidden overflow-y-auto touch-manipulation">
      {/* Animated candlestick background */}
      <div className="candles-bg">
        {bottomCandles.map((candle, idx) => (
          <div
            key={idx}
            className={`candles-bg__candle ${
              candle.color === 'green' ? 'candles-bg__candle--green' : 'candles-bg__candle--red'
            }`}
            style={{
              left: candle.left,
              height: `${candle.height}px`,
              bottom: '-70px',
              animationDuration: `${candle.duration}s`,
              animationDelay: `${candle.delay}s`,
            }}
          />
        ))}
        {topCandles.map((candle, idx) => (
          <div
            key={`top-${idx}`}
            className={`candles-bg__candle candles-bg__candle--top ${
              candle.color === 'green' ? 'candles-bg__candle--green' : 'candles-bg__candle--red'
            }`}
            style={{
              left: candle.left,
              height: `${candle.height}px`,
              top: '-70px',
              animationDuration: `${candle.duration}s`,
              animationDelay: `${candle.delay}s`,
            }}
          />
        ))}
      </div>
      {/* Left half: logo + heading — full 50% of screen */}
      <div className="relative z-10 flex flex-col w-full lg:w-1/2 lg:min-w-0 lg:shrink-0 lg:h-screen lg:min-h-0">
        {/* Sticky top bar: logo + TradeSphere (mobile/tablet) */}
        <div className="sticky top-0 left-0 right-0 z-20 flex items-center gap-3 pl-4 pr-4 py-3 sm:pl-6 sm:pr-6 md:pl-10 lg:pl-12 xl:pl-16 lg:py-4 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 lg:border-0 lg:bg-transparent lg:backdrop-blur-none shrink-0">
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 shrink-0 overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-500/25 via-emerald-400/20 to-sky-500/15 shadow-[0_0_40px_rgba(16,185,129,0.6)] ring-1 ring-emerald-400/40 mt-3">
            <img
              src={Logo}
              alt="TradeSphere"
              className="absolute inset-0 h-full w-full object-cover mix-blend-screen opacity-90"
            />
          </div>
          <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-100 -mt-4">
            Trade<span className="text-emerald-400">Sphere</span>
          </p>
        </div>
        {/* Hero heading — four lines with space between each */}
        <div className="flex flex-1 flex-col justify-start min-h-0 pl-8 pr-4 sm:pl-12 sm:pr-6 md:pl-16 lg:pl-12 xl:pl-16 text-slate-50 pt-4 pb-6 sm:pt-6 sm:pb-8 lg:pt-16 xl:pt-24 lg:pb-12 -mt-4 lg:mt-0">
          <p className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-slate-50 mb-8 sm:mb-10">
            <><span className="text-red-400">{heroLine1a.slice(0, 5)}</span><span className="text-emerald-400">{heroLine1a.slice(5)}</span></>
          </p>
          <p className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-slate-50 mb-8 sm:mb-10">
            {heroLine1b}
          </p>
          <p className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-slate-50 mb-8 sm:mb-10">
            {heroLine1c}
            <span className="inline-block w-1.5 h-6 sm:h-8 xl:h-10 align-middle bg-emerald-400/90 animate-pulse ml-1" />
          </p>
          <p className="text-base sm:text-lg md:text-xl lg:text-xl xl:text-2xl text-slate-300/95 font-medium">
            {heroLine2}
          </p>
        </div>
      </div>
      {/* Right half: login segment fills entire half with visible divide */}
      <div className="relative z-10 w-full lg:w-1/2 lg:min-w-0 lg:h-screen lg:min-h-0 flex flex-col lg:border-l border-slate-700/80 bg-slate-900/40 lg:bg-slate-900/50">
        <div className="flex-1 min-h-0 flex flex-col justify-center w-full px-4 sm:px-6 md:px-10 lg:px-10 xl:px-16 py-6 sm:py-8 lg:py-12 rounded-2xl lg:rounded-none border border-slate-800/80 lg:border-0 bg-slate-950/85 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-none shadow-[0_22px_55px_rgba(0,0,0,0.7)] lg:shadow-none max-w-md lg:max-w-none mx-auto lg:mx-0">
          <div className="w-full lg:max-w-md xl:max-w-lg mx-auto">
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 mb-4 text-center">
            {isRegister ? 'Create your account' : 'Log in to your account'}
          </h2>
          <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-2.5 sm:py-2 text-base focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          )}
          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-2.5 sm:py-2 text-base focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-2.5 sm:py-2 text-base focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          {error && <p className="text-red-400 mb-3 text-sm leading-snug">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 sm:py-2.5 disabled:opacity-50 min-h-[44px] sm:min-h-0"
          >
            {loading ? '...' : isRegister ? 'Sign up' : 'Log in'}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-sky-400 font-medium hover:underline">
            {isRegister ? 'Log in' : 'Sign up'}
          </button>
        </p>
          </div>
        </div>
      </div>
    </div>
  );
}
