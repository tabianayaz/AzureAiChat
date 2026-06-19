import React, { useState } from 'react';
import LoginRegister from './components/LoginRegister';
import ChatLayout from './components/ChatLayout';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleAuthSuccess = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="w-full h-screen overflow-hidden font-sans">
      {user ? (
        <ChatLayout user={user} onLogout={handleLogout} />
      ) : (
        <LoginRegister onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
