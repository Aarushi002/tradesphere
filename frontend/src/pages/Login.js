import { useState } from 'react';
import Logo from '../logo.svg';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function Login({ onLogin, darkMode, onToggleDarkMode }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        <div className="candles-bg__candle candles-bg__candle--green" style={{ left: '8%', height: '110px', bottom: '-40px', animationDuration: '7s', animationDelay: '0s' }} />
        <div className="candles-bg__candle candles-bg__candle--red" style={{ left: '18%', height: '150px', bottom: '-60px', animationDuration: '9s', animationDelay: '-2s' }} />
        <div className="candles-bg__candle candles-bg__candle--green" style={{ left: '30%', height: '130px', bottom: '-50px', animationDuration: '8s', animationDelay: '-4s' }} />
        <div className="candles-bg__candle candles-bg__candle--red" style={{ left: '45%', height: '170px', bottom: '-70px', animationDuration: '10s', animationDelay: '-1s' }} />
        <div className="candles-bg__candle candles-bg__candle--green" style={{ left: '60%', height: '140px', bottom: '-55px', animationDuration: '7.5s', animationDelay: '-3s' }} />
        <div className="candles-bg__candle candles-bg__candle--red" style={{ left: '72%', height: '120px', bottom: '-45px', animationDuration: '8.5s', animationDelay: '-5s' }} />
        <div className="candles-bg__candle candles-bg__candle--green" style={{ left: '85%', height: '160px', bottom: '-65px', animationDuration: '9.5s', animationDelay: '-6s' }} />
      </div>
      <button
        type="button"
        onClick={onToggleDarkMode}
        className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-slate-800/80 text-slate-100 hover:bg-slate-700"
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>
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
