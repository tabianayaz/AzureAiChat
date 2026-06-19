import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Users, Bot, Settings, LogOut, Send, 
  Globe, Moon, Sun, CheckCircle, Circle, User, Languages, 
  HelpCircle, ChevronRight, Sparkles 
} from 'lucide-react';
import { HubConnectionBuilder } from '@microsoft/signalr';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5018';

export default function ChatLayout({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'assistant'
  const [users, setUsers] = useState([]);
  const [activeReceiver, setActiveReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  
  // RAG AI Assistant state
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am the Bunkyo University AI Assistant. Feel free to ask me anything about campuses, admissions, tuition, facilities, scholarships, clubs, or academic events!',
      timestamp: new Date()
    }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(user.preferredLanguage);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  const [hubConnection, setHubConnection] = useState(null);
  const chatEndRef = useRef(null);
  const assistantEndRef = useRef(null);

  // Toggle Dark Mode class
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.style.backgroundColor = '#0f172a'; // slate-900
    } else {
      root.classList.remove('dark');
      root.style.backgroundColor = '#f8fafc'; // slate-50
    }
  }, [darkMode]);

  // Load user list
  const fetchUsers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/users?excludeUserId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Load chat history with selected user
  const fetchMessages = async (receiverId) => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/chat/messages?senderId=${user.id}&receiverId=${receiverId}&autoTranslate=${autoTranslate}`
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  // Trigger loading of messages when receiver or autoTranslate changes
  useEffect(() => {
    if (activeReceiver) {
      fetchMessages(activeReceiver.id);
    }
  }, [activeReceiver, autoTranslate]);

  // Initialize SignalR Connection
  useEffect(() => {
    fetchUsers();

    const connection = new HubConnectionBuilder()
      .withUrl(`${BACKEND_URL}/chathub?userId=${user.id}`)
      .withAutomaticReconnect()
      .build();

    connection.on('ReceiveMessage', (msgDto) => {
      // If message belongs to the active conversation, append it
      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some(m => m.id === msgDto.id)) return prev;
        
        const isCurrentChat = 
          (msgDto.senderId === user.id && msgDto.receiverId === activeReceiver?.id) ||
          (msgDto.senderId === activeReceiver?.id && msgDto.receiverId === user.id);

        if (isCurrentChat) {
          // If we receive a message and auto-translate is on, but the translation wasn't computed on hub,
          // we could fetch again or calculate it. However, the hub handles translation automatically if languages differ!
          return [...prev, msgDto];
        }
        return prev;
      });

      // Refresh users to update last message preview or order if needed
      fetchUsers();
    });

    connection.on('UserStatusChanged', ({ userId, status }) => {
      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === userId ? { ...u, status } : u))
      );
      if (activeReceiver?.id === userId) {
        setActiveReceiver((prev) => prev ? { ...prev, status } : null);
      }
    });

    connection.start()
      .then(() => {
        console.log('SignalR Connected');
        setHubConnection(connection);
      })
      .catch((err) => console.error('SignalR Connection Error: ', err));

    return () => {
      if (connection) {
        connection.stop();
      }
    };
  }, [user.id, activeReceiver?.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  useEffect(() => {
    assistantEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantMessages, activeTab]);

  // Send Direct Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeReceiver || !hubConnection) return;

    try {
      // Invoke SendPrivateMessage in hub
      await hubConnection.invoke('SendPrivateMessage', user.id, activeReceiver.id, messageInput.trim());
      setMessageInput('');
    } catch (err) {
      console.error('Error sending SignalR message:', err);
    }
  };

  // Ask AI Assistant (RAG)
  const handleAskAssistant = async (e) => {
    e.preventDefault();
    if (!assistantInput.trim() || assistantLoading) return;

    const query = assistantInput.trim();
    setAssistantInput('');
    setAssistantLoading(true);

    // Append user message immediately
    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date()
    };
    setAssistantMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/assistant/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      });

      if (!response.ok) {
        throw new Error('Assistant failed to respond');
      }

      const data = await response.json();
      
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: data.answer,
        context: data.contextUsed,
        timestamp: new Date()
      };
      setAssistantMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date()
        }
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/settings/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        user.preferredLanguage = updatedUser.preferredLanguage; // sync memory
        setShowSettings(false);
        // Refresh message view translation
        if (activeReceiver) {
          fetchMessages(activeReceiver.id);
        }
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Log out
  const handleLogout = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout/${user.id}`, { method: 'POST' });
    } catch (err) {
      console.error('Logout error on backend:', err);
    } finally {
      onLogout();
    }
  };

  return (
    <div className={`flex h-screen w-full select-none ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* LEFT SIDEBAR (Navigation & Users List) */}
      <div className={`w-80 flex flex-col flex-shrink-0 border-r ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'} transition-colors`}>
        
        {/* User profile header */}
        <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white relative shadow-md shadow-blue-500/20">
              {user.username.charAt(0).toUpperCase()}
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-900" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">{user.username}</h3>
              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</span>
            </div>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className={`p-2 rounded-lg cursor-pointer ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'} transition-all`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Tab buttons (Teams Style) */}
        <div className="p-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`py-2 px-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                : darkMode 
                  ? 'bg-slate-950/40 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('assistant')}
            className={`py-2 px-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'assistant'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                : darkMode 
                  ? 'bg-slate-950/40 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Bot className="w-4 h-4" />
            AI Assistant
          </button>
        </div>

        {/* Dynamic section: Direct Chats list (if activeTab === 'chat') */}
        {activeTab === 'chat' ? (
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            <div className="px-3 mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" />
              Direct Messages
            </div>
            {users.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                No users registered yet.
              </div>
            ) : (
              users.map((u) => {
                const isSelected = activeReceiver?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => setActiveReceiver(u)}
                    className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'
                        : darkMode ? 'hover:bg-slate-800/40 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-700/60 rounded-xl flex items-center justify-center font-bold text-slate-200 text-sm relative">
                        {u.username.charAt(0).toUpperCase()}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-slate-900' : 'border-white'} ${
                          u.status === 'Online' ? 'bg-green-500' : 'bg-slate-500'
                        }`} />
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-sm leading-none mb-1">{u.username}</p>
                        <span className="text-xs text-slate-500 leading-none">
                          Preferred: {u.preferredLanguage === 'ja' ? '日本語' : 'English'}
                        </span>
                      </div>
                    </div>
                    {u.status === 'Online' && (
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          /* AI Assistant Menu Quick Guides */
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              Quick Questions
            </div>
            
            <div className="space-y-2">
              {[
                { en: "Where is the Information Faculty?", ja: "情報学部はどこですか？" },
                { en: "What are the scholarship requirements?", ja: "留学生奨学金はありますか？" },
                { en: "What is the tuition fee?", ja: "学費はいくらですか？" },
                { en: "Tell me about campuses.", ja: "キャンパスについて教えて。" }
              ].map((q, idx) => {
                const queryText = user.preferredLanguage === 'ja' ? q.ja : q.en;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setAssistantInput(queryText);
                    }}
                    className={`w-full text-left p-3 text-xs rounded-xl border flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      darkMode 
                        ? 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/40 text-slate-400 hover:text-slate-200' 
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{queryText}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                );
              })}
            </div>

            <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
              darkMode ? 'bg-blue-950/10 border-blue-900/30 text-blue-400/90' : 'bg-blue-50 border-blue-100 text-blue-800'
            }`}>
              <HelpCircle className="w-5 h-5 mb-1 text-blue-500" />
              <p className="font-semibold">Bunkyo Assistant Policy</p>
              <p>Answers are generated strictly using the official university knowledge base. External queries are filtered out politely.</p>
            </div>
          </div>
        )}

        {/* Settings button Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Languages className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">
              Auto-Translate: <strong className="text-blue-500">{autoTranslate ? 'ON' : 'OFF'}</strong>
            </span>
          </div>
          <button
            onClick={handleLogout}
            className={`p-2 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-all`}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      {/* RIGHT DISPLAY PANEL (Chat window or AI Assistant workspace) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {activeTab === 'chat' ? (
          /* DIRECT MESSAGING CHAT WINDOW */
          activeReceiver ? (
            <>
              {/* Chat Header */}
              <div className={`p-4 border-b flex items-center justify-between flex-shrink-0 ${
                darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-700/60 rounded-xl flex items-center justify-center font-bold text-slate-200">
                    {activeReceiver.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm leading-tight">{activeReceiver.username}</h2>
                    <div className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${activeReceiver.status === 'Online' ? 'bg-green-500' : 'bg-slate-500'}`} />
                      <span className="text-xs text-slate-500">{activeReceiver.status}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Quick Auto-Translate Toggle in topbar */}
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <span className="text-slate-400">Auto Translate</span>
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(e) => setAutoTranslate(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Message scroll container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                    <MessageSquare className="w-12 h-12 text-slate-700 mb-2 animate-bounce" />
                    <p className="font-semibold">No messages yet</p>
                    <p className="text-xs">Type a message to start real-time conversation.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSelf = msg.senderId === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[80%] ${isSelf ? 'ml-auto flex-row-reverse' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isSelf ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'
                        }`}>
                          {isSelf ? user.username.charAt(0).toUpperCase() : activeReceiver.username.charAt(0).toUpperCase()}
                        </div>

                        <div className="space-y-1">
                          <div className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                            isSelf 
                              ? 'bg-blue-600 text-white rounded-tr-none' 
                              : darkMode 
                                ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none' 
                                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                          }`}>
                            {msg.messageText}
                          </div>

                          {/* Translation block (rendered directly under) */}
                          {autoTranslate && msg.translatedText && (
                            <div className={`p-2.5 rounded-xl text-xs flex flex-col gap-1 ${
                              isSelf 
                                ? 'bg-blue-700/30 border border-blue-600/20 text-blue-200/90' 
                                : darkMode 
                                  ? 'bg-slate-950/60 border border-slate-800/40 text-slate-400' 
                                  : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span className="font-semibold flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-60">
                                <Languages className="w-3 h-3" />
                                Auto-Translated
                              </span>
                              <span>{msg.translatedText}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className={`p-4 border-t flex-shrink-0 flex gap-2 ${
                darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className={`flex-1 px-4 py-3 text-sm rounded-xl outline-none border focus:ring-1 focus:ring-blue-500 transition-all ${
                    darkMode 
                      ? 'bg-slate-950/80 border-slate-850 focus:border-blue-500 text-white placeholder-slate-500' 
                      : 'bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-905'
                  }`}
                />
                <button
                  type="submit"
                  className="px-5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-medium rounded-xl transition-all flex items-center justify-center cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="p-4 bg-blue-600/10 rounded-3xl mb-4 text-blue-500">
                <MessageSquare className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-1">Azure AI Chat Platform</h2>
              <p className="text-slate-500 text-sm max-w-sm">
                Select a classmate or colleague from the left sidebar to start messaging in real-time.
              </p>
            </div>
          )
        ) : (
          /* UNIVERSITY AI ASSISTANT PANEL */
          <>
            {/* AI Assistant Header */}
            <div className={`p-4 border-b flex items-center justify-between flex-shrink-0 ${
              darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm leading-tight">Bunkyo University AI Assistant</h2>
                  <span className="text-xs text-blue-500 font-medium">Local RAG GPT-4.1-mini</span>
                </div>
              </div>
            </div>

            {/* AI Assistant Message Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {assistantMessages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                      isUser ? 'bg-blue-600 text-white' : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white'
                    }`}>
                      {isUser ? user.username.charAt(0).toUpperCase() : <Bot className="w-4 h-4" />}
                    </div>

                    <div className="space-y-1.5">
                      <div className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                        isUser 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : darkMode 
                            ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-md' 
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                      }`}>
                        {msg.text}
                      </div>

                      {/* Display retrieved context used for transparency / validation if present */}
                      {!isUser && msg.context && (
                        <details className={`text-[11px] rounded-xl border p-2 cursor-pointer transition-all ${
                          darkMode ? 'bg-slate-950/80 border-slate-900 text-slate-500 hover:text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500 hover:text-slate-700'
                        }`}>
                          <summary className="font-semibold select-none outline-none">
                            View RAG Sources ({msg.context.split('--- Source:').length - 1} documents matches)
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap font-mono leading-normal text-[10px]">
                            {msg.context}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
              {assistantLoading && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className={`p-4 rounded-2xl rounded-tl-none flex items-center gap-1.5 ${
                    darkMode ? 'bg-slate-900' : 'bg-slate-100'
                  }`}>
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={assistantEndRef} />
            </div>

            {/* AI Assistant Input Box */}
            <form onSubmit={handleAskAssistant} className={`p-4 border-t flex-shrink-0 flex gap-2 ${
              darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <input
                type="text"
                placeholder="Ask about admissions, tuition, campuses, libraries..."
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                disabled={assistantLoading}
                className={`flex-1 px-4 py-3 text-sm rounded-xl outline-none border focus:ring-1 focus:ring-blue-500 transition-all ${
                  darkMode 
                    ? 'bg-slate-950/80 border-slate-850 focus:border-blue-500 text-white placeholder-slate-500' 
                    : 'bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-905'
                }`}
              />
              <button
                type="submit"
                disabled={assistantLoading}
                className="px-5 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* SETTINGS DIALOG / MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl relative ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-500" />
              App Settings
            </h2>

            <div className="space-y-4">
              {/* Profile Details */}
              <div className={`p-3 rounded-2xl border ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Signed In As</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600/10 text-blue-500 rounded-lg flex items-center justify-center font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{user.username}</p>
                    <p className="text-xs text-slate-500 leading-tight">{user.email}</p>
                  </div>
                </div>
              </div>

              {/* Preferred Language */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  Preferred Language
                </label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className={`w-full px-3 py-2.5 text-sm rounded-xl outline-none border focus:ring-1 focus:ring-blue-500 transition-all ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="en">English</option>
                  <option value="ja">日本語 (Japanese)</option>
                </select>
              </div>

              {/* Auto Translate Toggle */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Languages className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="leading-tight">Auto Translate Messages</p>
                    <span className="text-xs text-slate-500">Translate incoming peer texts</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={(e) => setAutoTranslate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {darkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  <div>
                    <p className="leading-tight">Dark Mode Theme</p>
                    <span className="text-xs text-slate-500">Toggle dark / light appearance</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={(e) => setDarkMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className={`px-4 py-2 text-sm font-medium rounded-xl cursor-pointer ${
                  darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-md shadow-blue-500/10"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
