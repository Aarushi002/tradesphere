import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

const THEME_KEY = 'tradesphere-theme';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      localStorage.setItem(THEME_KEY, 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const isDeployed = typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (isDeployed) {
      setAuthResolved(true);
      return;
    }
    if (!token || !saved) {
      setAuthResolved(true);
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(saved);
    } catch (_) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setAuthResolved(true);
      return;
    }
    fetch(`${API_URL}/api/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.ok) {
          setUser(parsed);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setAuthResolved(true));
  }, []);

  function handleLogin(u) {
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  if (!authResolved) {
    return (
      <div className="App min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-slate-900 text-gray-600 dark:text-slate-400">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="App min-h-screen min-h-[100dvh] bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-slate-100 overflow-x-hidden">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((d) => !d)} />
      ) : (
        <Login onLogin={handleLogin} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((d) => !d)} />
      )}
    </div>
  );
}

export default App;
