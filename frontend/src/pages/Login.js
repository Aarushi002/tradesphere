import { useState } from 'react';
import Logo from '../assets/only_logo.jpg';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const bottomCandles = [
    { left: '4%', height: 120, color: 'green', duration: 7, delay: 0 },
    { left: '8%', height: 160, color: 'red', duration: 8.5, delay: -1.2 },
    { left: '12%', height: 140, color: 'green', duration: 7.5, delay: -3.4 },
    { left: '16%', height: 180, color: 'red', duration: 9.5, delay: -2.1 },
    { left: '20%', height: 150, color: 'green', duration: 8.2, delay: -4.7 },
    { left: '26%', height: 170, color: 'red', duration: 10, delay: -1.8 },
    { left: '32%', height: 130, color: 'green', duration: 7.8, delay: -5.3 },
    { left: '38%', height: 190, color: 'red', duration: 10.5, delay: -3.9 },
    { left: '44%', height: 160, color: 'green', duration: 8.7, delay: -6.1 },
    { left: '50%', height: 175, color: 'red', duration: 9.8, delay: -2.9 },
    { left: '56%', height: 145, color: 'green', duration: 7.4, delay: -4.2 },
    { left: '62%', height: 185, color: 'red', duration: 9.9, delay: -5.8 },
    { left: '68%', height: 155, color: 'green', duration: 8.1, delay: -3.5 },
    { left: '74%', height: 165, color: 'red', duration: 9.1, delay: -6.4 },
    { left: '80%', height: 135, color: 'green', duration: 7.2, delay: -2.6 },
    { left: '86%', height: 195, color: 'red', duration: 10.3, delay: -5.1 },
    { left: '92%', height: 150, color: 'green', duration: 8.4, delay: -3.8 },
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
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4 overflow-hidden">
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
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/85 backdrop-blur-xl p-8 shadow-[0_18px_45px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col items-center mb-6">
          <img
            src={Logo}
            alt="TradeSphere"
            className="h-16 w-auto mb-3 drop-shadow-[0_0_35px_rgba(34,197,94,0.6)]"
          />
          <h1 className="text-2xl font-bold tracking-tight text-slate-50 mt-0">
            Trade<span className="text-emerald-400">Sphere</span>
          </h1>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300/80 mt-1">
            by GammaFlowCapital
          </p>
        </div>
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
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-sky-600 dark:text-sky-400 font-medium hover:underline">
            {isRegister ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}
