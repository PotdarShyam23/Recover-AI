import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import RecoveryCases from './pages/RecoveryCases';
import RecoveryDetail from './pages/RecoveryDetail';
import Promises from './pages/Promises';
import AuditLog from './pages/AuditLog';
import Demo from './pages/Demo';
import VoiceCallPage from './pages/VoiceCallPage';
import WhatsAppPage from './pages/WhatsAppPage';

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">R</div>
            <div>
              <h1>RecoverAI</h1>
              <small>Merchant Revenue Recovery</small>
            </div>
          </div>

          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              📊 Dashboard
            </NavLink>
            <NavLink to="/cases" className={({ isActive }) => (isActive ? 'active' : '')}>
              📁 Recovery Cases
            </NavLink>
            <NavLink to="/voice-call" className={({ isActive }) => (isActive ? 'active' : '')}>
              📞 Twilio Voice Call
            </NavLink>
            <NavLink to="/whatsapp" className={({ isActive }) => (isActive ? 'active' : '')}>
              💬 Twilio WhatsApp
            </NavLink>
            <NavLink to="/promises" className={({ isActive }) => (isActive ? 'active' : '')}>
              🤝 Promise Tracker
            </NavLink>
            <NavLink to="/audit" className={({ isActive }) => (isActive ? 'active' : '')}>
              📜 Audit Trail
            </NavLink>
            <NavLink to="/demo" className={({ isActive }) => (isActive ? 'active' : '')}>
              🧪 Test Lab & Webhooks
            </NavLink>
          </nav>
        </div>

        <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <div><strong>Stack:</strong> MERN Architecture</div>
          <div><strong>Channels:</strong> Twilio Voice & WhatsApp</div>
          <div><strong>Intelligence:</strong> Gemini Multi-Agent</div>
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases" element={<RecoveryCases />} />
          <Route path="/cases/:id" element={<RecoveryDetail />} />
          <Route path="/voice-call" element={<VoiceCallPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/promises" element={<Promises />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/demo" element={<Demo />} />
        </Routes>
      </main>
    </div>
  );
}
