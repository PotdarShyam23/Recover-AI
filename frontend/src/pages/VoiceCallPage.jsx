import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';

export default function VoiceCallPage() {
  // Twilio Connection Status
  const [twilioStatus, setTwilioStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Form Fields
  const [phone, setPhone] = useState('+91');
  const [customerName, setCustomerName] = useState('Shyam Potdar');
  const [amount, setAmount] = useState('5500');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [cases, setCases] = useState([]);

  // Config editing (ngrok / public URL)
  const [showConfig, setShowConfig] = useState(false);
  const [publicUrlInput, setPublicUrlInput] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  // Active Call State
  const [calling, setCalling] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [callMonitor, setCallMonitor] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Recent Data
  const [recentPromises, setRecentPromises] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  const pollIntervalRef = useRef(null);

  // 1. Load Twilio status, active cases, promises & audit logs
  async function loadInitialData() {
    try {
      const [statusRes, casesRes, promisesRes, logsRes] = await Promise.all([
        api.getTwilioStatus().catch(() => null),
        api.getCases().catch(() => []),
        api.getPromises().catch(() => []),
        api.getAuditLogs().catch(() => [])
      ]);

      if (statusRes) {
        setTwilioStatus(statusRes);
        setPublicUrlInput(statusRes.serverPublicUrl || '');
      }

      setCases(casesRes || []);
      setRecentPromises((promisesRes || []).slice(0, 5));
      setRecentLogs((logsRes || []).filter(l => l.action?.includes('voice') || l.actor?.includes('VOICE')).slice(0, 6));
    } catch (err) {
      console.error('Failed to load voice page data:', err);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    loadInitialData();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // 2. Poll live call status if Call SID exists
  useEffect(() => {
    if (!activeCall?.callSid || activeCall?.mode === 'simulated') return;

    async function checkCall() {
      try {
        const res = await api.getCallStatus(activeCall.callSid);
        if (res && res.ok) {
          setCallMonitor(res);
          if (['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(res.status)) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            // Refresh promises and logs
            loadInitialData();
          }
        }
      } catch (err) {
        console.warn('Call polling error:', err);
      }
    }

    pollIntervalRef.current = setInterval(checkCall, 2500);
    checkCall();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeCall]);

  // 3. Initiate Outbound Call
  async function handlePlaceCall(e) {
    e.preventDefault();
    if (!phone || phone.trim() === '+91' || phone.trim() === '+') {
      alert('Please enter your full mobile number with country code (e.g. +91 98765 43210)');
      return;
    }

    setCalling(true);
    setFeedback(null);
    setActiveCall(null);
    setCallMonitor(null);

    try {
      const payload = {
        phone: phone.trim(),
        customerName: customerName.trim() || 'Customer',
        amount: Number(amount) || 0,
        currency: 'INR',
        caseId: selectedCaseId || null,
        callbackUrl: publicUrlInput?.trim() || null
      };

      const res = await api.placeTwilioCall(payload);

      if (res && res.ok) {
        const callResult = res.result;
        setActiveCall(callResult);

        if (callResult.mode === 'live_twilio') {
          setFeedback({
            type: 'success',
            title: '📞 Real Twilio Call Dialed!',
            message: `Twilio is ringing your phone (${callResult.to}). Call SID: ${callResult.callSid}`
          });
        } else if (callResult.mode === 'simulated') {
          setFeedback({
            type: 'warning',
            title: '⚠️ Running in Safe Simulation Mode',
            message: `${callResult.message}. To make your actual phone ring, paste your Twilio Account SID, Auth Token, and Twilio Number in your .env file.`
          });
        } else {
          setFeedback({
            type: 'error',
            title: 'Twilio Notice',
            message: callResult.error || 'Could not initiate call'
          });
        }

        loadInitialData();
      } else {
        setFeedback({
          type: 'error',
          title: 'Call Error',
          message: res.error || 'Failed to trigger Twilio call'
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Error Triggering Call',
        message: err.message
      });
    } finally {
      setCalling(false);
    }
  }

  // 4. Save Public ngrok URL or credentials dynamically
  async function handleSaveConfig(e) {
    e.preventDefault();
    setConfigSaving(true);
    try {
      const res = await api.updateTwilioConfig({
        serverPublicUrl: publicUrlInput.trim()
      });
      if (res && res.ok) {
        setTwilioStatus(prev => ({
          ...prev,
          serverPublicUrl: res.serverPublicUrl
        }));
        alert('Server Public URL updated successfully!');
        setShowConfig(false);
      }
    } catch (err) {
      alert('Error updating config: ' + err.message);
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="grid">
      {/* Page Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.75rem' }}>📞 Real Twilio Voice Call Lab</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Test outbound AI voice calls to your mobile number, receive incoming calls, and test real-time Hinglish promise extraction.
          </p>
        </div>

        {/* Twilio Status Badge */}
        {twilioStatus && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {twilioStatus.configured ? (
              <span className="status-badge badge-success" style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                🟢 Twilio Live Connected
              </span>
            ) : (
              <span className="status-badge badge-warning" style={{ fontSize: '0.82rem', padding: '6px 14px', background: 'rgba(245, 158, 11, 0.15)', color: '#fde047', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                🟡 Twilio Simulation Mode
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top Banner: Twilio Setup & Public Webhook Info */}
      <div className="card panel" style={{ background: 'rgba(15, 36, 57, 0.75)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>
              Twilio Caller ID Phone Number: <span style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{twilioStatus?.phoneNumber || 'Not yet configured in .env'}</span>
            </div>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              Webhook Public URL: <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{twilioStatus?.serverPublicUrl || 'http://localhost:4001'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowConfig(!showConfig)}
              style={{ fontSize: '0.82rem' }}
            >
              ⚙️ {showConfig ? 'Hide Settings' : 'Configure ngrok / Webhook URL'}
            </button>
          </div>
        </div>

        {/* Quick URL updater drawer */}
        {showConfig && (
          <form onSubmit={handleSaveConfig} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ marginBottom: '10px', fontSize: '0.85rem', color: 'var(--muted)' }}>
              If testing on localhost, run <code>ngrok http 4001</code> in your terminal and paste the generated HTTPS URL below so Twilio can send speech transcripts back to your server:
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="https://xxxx.ngrok-free.app"
                value={publicUrlInput}
                onChange={(e) => setPublicUrlInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontFamily: 'monospace'
                }}
              />
              <button type="submit" disabled={configSaving}>
                {configSaving ? 'Saving...' : 'Update URL'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Grid: Call Form on Left, Active Call Status on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Call Dispatcher Form */}
        <div className="card panel">
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📞</span> Direct Call Dialpad
          </h2>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '-10px', marginBottom: '18px' }}>
            Enter your mobile number to test the outbound Hinglish AI voice recovery call right now.
          </p>

          <form onSubmit={handlePlaceCall} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Phone Number Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Your Phone Number (with Country Code)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: '#041523',
                    border: '1px solid rgba(45, 212, 191, 0.3)',
                    color: '#fff',
                    fontSize: '1rem',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPhone('+91')}
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  🇮🇳 +91 (India)
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPhone('+1')}
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  🇺🇸 +1 (US)
                </button>
              </div>
            </div>

            {/* Customer Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Customer Name (Spoken by AI Voice Agent)
              </label>
              <input
                type="text"
                placeholder="Shyam Potdar"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {/* Pending Amount */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Pending Recovery Amount (INR ₹)
              </label>
              <input
                type="number"
                placeholder="5500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {/* Optional: Link with Active Case */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Link to Recovery Case (Optional)
              </label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- No specific case (Standalone Direct Test) --</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — ₹{c.amount?.toLocaleString('en-IN')} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Call Action Button */}
            <div style={{ marginTop: '8px' }}>
              <button
                type="submit"
                disabled={calling}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '1rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)'
                }}
              >
                {calling ? 'Connecting to Twilio...' : '📞 Place Real Call to Customer Phone'}
              </button>
            </div>
          </form>

          {/* Feedback notice */}
          {feedback && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '10px',
                background: feedback.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : (feedback.type === 'warning' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)'),
                border: `1px solid ${feedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : (feedback.type === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '0.9rem', color: feedback.type === 'success' ? '#86efac' : (feedback.type === 'warning' ? '#fde047' : '#fca5a5') }}>
                {feedback.title}
              </div>
              <div style={{ fontSize: '0.82rem', lineHeight: 1.4, color: 'var(--text)' }}>
                {feedback.message}
              </div>
            </div>
          )}
        </div>

        {/* Live Call Monitor & Dialogue Script */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Active Call Tracker Card */}
          <div className="card panel">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📡</span> Live Call Status Tracker
            </h2>

            {activeCall ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>DESTINATION NUMBER</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '4px', fontFamily: 'monospace' }}>
                      {activeCall.to}
                    </div>
                  </div>

                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>CALL STATUS</div>
                    <div style={{ marginTop: '4px' }}>
                      <span className="status-badge badge-promise" style={{ fontSize: '0.8rem' }}>
                        {callMonitor?.status || activeCall.status || 'initiated'}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>CALL SID</div>
                    <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#94a3b8', marginTop: '4px' }}>
                      {activeCall.callSid || 'Simulated-SID'}
                    </div>
                  </div>

                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>DURATION</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}>
                      {callMonitor?.duration ? `${callMonitor.duration}s` : 'Connecting...'}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '14px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c4b5fd', marginBottom: '4px' }}>
                    💡 What to do when your phone rings:
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                    <li>Answer the phone call.</li>
                    <li>Listen to the voice agent speaking in friendly Hinglish.</li>
                    <li>Reply by speaking (e.g. <em>"Friday ko salary aayegi tab kar dunga"</em>) or press <strong>1</strong> to schedule for Friday, or <strong>2</strong> for WhatsApp link.</li>
                    <li>The AI captures your promise and saves it directly to the Promise Tracker!</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ padding: '24px 0', textAlign: 'center', fontSize: '0.9rem' }}>
                No active call in progress. Enter your phone number on the left and click <strong>Place Real Call</strong>.
              </div>
            )}
          </div>

          {/* Incoming Call Testing Instructions */}
          <div className="card panel" style={{ borderColor: 'rgba(45, 212, 191, 0.25)' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📲</span> Testing Incoming Calls (Receive Calls)
            </h2>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#cbd5e1' }}>
              <p style={{ margin: '0 0 10px' }}>
                Want to test calling the AI Recovery Agent yourself? You can dial the Twilio number directly:
              </p>
              <div style={{ padding: '12px', background: '#03121d', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
                <div className="muted" style={{ fontSize: '0.75rem' }}>DIAL THIS TWILIO NUMBER FROM YOUR PHONE:</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                  {twilioStatus?.phoneNumber || '+1 (Configure in .env)'}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                <strong>Twilio Console Webhook URL:</strong><br />
                In your Twilio Console Phone Number settings, set <em>"A Call Comes In"</em> to:
                <div style={{ fontFamily: 'monospace', color: '#93c5fd', marginTop: '4px', wordBreak: 'break-all' }}>
                  {twilioStatus?.serverPublicUrl || 'https://your-ngrok.ngrok-free.app'}/api/twilio/voice/incoming
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Commitments Extracted from Voice Calls */}
      <div className="card panel" style={{ marginTop: '10px' }}>
        <h2 className="section-title">🎙️ Recent Commitments & Voice Activity Log</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Extracted Promises */}
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '10px', color: '#c4b5fd' }}>
              Extracted Promise-to-Pay Commitments
            </div>
            {recentPromises.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>No commitments captured yet. Place a call to test.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentPromises.map((p) => (
                  <div key={p.id} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#c4b5fd', fontSize: '0.88rem' }}>📅 Promised: {p.promisedDate}</strong>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="muted" style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                      Customer Spoke: "{p.sourceText}"
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                      Channel: {p.sourceChannel} • Confidence: {(p.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Voice Audit Logs */}
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '10px', color: 'var(--primary)' }}>
              Voice Call Audit Trail
            </div>
            {recentLogs.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>No recent voice audit logs recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentLogs.map((log, idx) => (
                  <div key={log.id || idx} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <strong>{log.eventType}</strong>
                      <span className="muted">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>{log.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
