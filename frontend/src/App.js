import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

const THEME_KEY = 'tradesphere-theme';

function App() {
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(THEME_KEY, 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (token && saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (_) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  function handleLogin(u) {
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return (
    <div className="App min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((d) => !d)} />
      ) : (
        <Login onLogin={handleLogin} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((d) => !d)} />
      )}
    </div>
  );
}

export default App;
