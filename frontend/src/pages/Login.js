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
  const [heroLine1, setHeroLine1] = useState('');
  const [heroLine2, setHeroLine2] = useState('');

  useEffect(() => {
    const full1 = 'TradeSphere by GammaFlowCapital';
    const full2 = 'Your Strategy Lab for the Stock Market';

    let idx1 = 0;
    let idx2 = 0;
    let phase = 'line1';
    let timer;

    const tick = () => {
      if (phase === 'line1') {
        if (idx1 <= full1.length) {
          setHeroLine1(full1.slice(0, idx1));
          idx1 += 1;
        } else {
          phase = 'line2';
          idx2 = 0;
        }
      } else if (phase === 'line2') {
        if (idx2 <= full2.length) {
          setHeroLine2(full2.slice(0, idx2));
          idx2 += 1;
        } else {
          phase = 'pause';
          setTimeout(() => {
            idx1 = 0;
            idx2 = 0;
            setHeroLine1('');
            setHeroLine2('');
            phase = 'line1';
          }, 2200);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = isRegister ? `${API_URL}/api/auth/register` : `${API_URL}/api/auth/login`;
      const body = isRegister ? { name, email, password } : { email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-stretch justify-center bg-slate-950 px-6 md:px-12 overflow-hidden">
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
      {/* Left hero area */}
      <div className="relative z-10 hidden lg:flex flex-1 flex-col justify-center pr-10 text-slate-50">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/25 via-emerald-400/20 to-sky-500/15 shadow-[0_0_55px_rgba(16,185,129,0.75)] ring-1 ring-emerald-400/40 backdrop-blur">
            <img
              src={Logo}
              alt="TradeSphere mark"
              className="absolute inset-0 h-full w-full object-cover mix-blend-screen opacity-90"
            />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-100">
              Trade<span className="text-emerald-400">Sphere</span>
            </p>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="text-3xl font-semibold md:text-4xl tracking-tight text-slate-50 mb-3">
            {heroLine1}
            <span className="inline-block w-3 h-6 align-middle bg-emerald-400/80 animate-pulse ml-1" />
          </p>
          <p className="text-lg md:text-xl text-slate-300/90">
            {heroLine2}
          </p>
        </div>
      </div>
      {/* Right side: two-column panel for symmetry */}
      <div className="relative z-10 w-full max-w-3xl lg:flex lg:items-stretch lg:ml-12">
        {/* Auth card */}
        <div className="w-full lg:w-1/2 rounded-2xl border border-slate-800/80 bg-slate-950/85 backdrop-blur-xl p-8 shadow-[0_22px_55px_rgba(0,0,0,0.7)] mb-6 lg:mb-0 lg:mr-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 text-center">
            {isRegister ? 'Create your account' : 'Log in to your account'}
          </h2>
          <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          )}
          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          {error && <p className="text-red-600 dark:text-red-400 mb-3 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white font-medium py-2.5 disabled:opacity-50"
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
        {/* Secondary info card for symmetry */}
        <div className="w-full lg:w-1/2 rounded-2xl border border-slate-900/80 bg-slate-950/70 backdrop-blur-xl p-6 shadow-[0_18px_45px_rgba(0,0,0,0.5)] flex flex-col justify-between text-slate-100">
          <div>
            <h3 className="text-base font-semibold mb-2 text-emerald-300">Why TradeSphere?</h3>
            <p className="text-sm text-slate-300/90 mb-3">
              Simulated trading, clean analytics, and a playground to test your ideas before risking real capital.
            </p>
            <ul className="space-y-1 text-sm text-slate-300/80 list-disc list-inside">
              <li>Paper trade strategies and track performance</li>
              <li>Visualize positions and P&amp;L in one place</li>
              <li>Collaborate by sharing ideas with your circle</li>
            </ul>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Built for learners, quants, and curious investors.
          </p>
        </div>
      </div>
    </div>
  );
}
