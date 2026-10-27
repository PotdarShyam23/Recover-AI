import React, { useState, useEffect } from 'react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';

const TEMPLATES = [
  {
    id: 'gentle',
    label: '✨ Gentle Interrupted Checkout',
    text: (name, amount, link) =>
      `Hi ${name}! 👋 We noticed your payment of ₹${amount} to SaaSify India couldn't be completed.\n\nNo worries! You can complete it securely in 1-click here:\n${link}\n\nIf you prefer to pay on another date, just reply with your convenient date!`
  },
  {
    id: 'salary',
    label: '📅 Reschedule / Salary Friendly',
    text: (name, amount, link) =>
      `Namaste ${name} ji! 🙏 We understand cash flow timings can sometimes be tight. If you'd like to schedule your pending payment of ₹${amount} for your next salary date, just reply to this message with your preferred date (e.g., 'Friday ko salary aayegi').\n\nOr pay anytime here: ${link}`
  },
  {
    id: 'urgent',
    label: '⚡ Urgent / Subscription At Risk',
    text: (name, amount, link) =>
      `Hi ${name}! Your SaaSify subscription payment of ₹${amount} is currently at risk of interruption. Avoid service disruption by completing your payment in 1-click:\n${link}`
  }
];

export default function WhatsAppPage() {
  const [waStatus, setWaStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Form State
  const [phone, setPhone] = useState('+91');
  const [customerName, setCustomerName] = useState('Shyam Potdar');
  const [amount, setAmount] = useState('5500');
  const [paymentLink, setPaymentLink] = useState('https://rzp.io/i/rec_demo123');
  const [message, setMessage] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [cases, setCases] = useState([]);

  // Send State
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Recent Data
  const [recentMessages, setRecentMessages] = useState([]);
  const [recentPromises, setRecentPromises] = useState([]);

  // Initialize default template message
  useEffect(() => {
    setMessage(TEMPLATES[0].text(customerName, amount, paymentLink));
  }, []);

  async function loadInitialData() {
    try {
      const [statusRes, casesRes, promisesRes, logsRes] = await Promise.all([
        api.getWhatsAppStatus().catch(() => null),
        api.getCases().catch(() => []),
        api.getPromises().catch(() => []),
        api.getAuditLogs().catch(() => [])
      ]);

      if (statusRes) setWaStatus(statusRes);
      setCases(casesRes || []);
      setRecentPromises((promisesRes || []).filter(p => p.sourceChannel === 'whatsapp').slice(0, 5));
      setRecentMessages(
        (logsRes || []).filter(l => l.action?.includes('whatsapp') || l.description?.includes('WhatsApp')).slice(0, 6)
      );
    } catch (err) {
      console.error('Failed to load WhatsApp page data:', err);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  function handleApplyTemplate(tmpl) {
    setMessage(tmpl.text(customerName, amount, paymentLink));
  }

  async function handleSendWhatsApp(e) {
    e.preventDefault();
    if (!phone || phone.trim() === '+91' || phone.trim() === '+') {
      alert('Please enter a valid mobile number with country code (e.g. +91 98765 43210)');
      return;
    }

    setSending(true);
    setFeedback(null);

    try {
      const payload = {
        phone: phone.trim(),
        customerName: customerName.trim() || 'Customer',
        amount: Number(amount) || 0,
        paymentLink: paymentLink.trim(),
        message: message.trim(),
        caseId: selectedCaseId || null
      };

      const res = await api.sendDirectWhatsApp(payload);

      if (res && res.ok) {
        const waResult = res.result;

        if (waResult.mode === 'live_twilio') {
          setFeedback({
            type: 'success',
            title: '💬 Real WhatsApp Message Dispatched!',
            message: `Message sent to ${waResult.to} via Twilio! Message SID: ${waResult.messageSid}`
          });
        } else {
          setFeedback({
            type: 'warning',
            title: '⚠️ Running in Safe Simulation Mode',
            message: `${waResult.message}. To send real WhatsApp messages to your mobile phone, add your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env.`
          });
        }

        loadInitialData();
      } else {
        setFeedback({
          type: 'error',
          title: 'Dispatch Error',
          message: res.error || 'Failed to dispatch WhatsApp message'
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Error Sending WhatsApp',
        message: err.message
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid">
      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.75rem' }}>💬 Real Twilio WhatsApp Recovery Lab</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Send real 1-click recovery checkout messages to customer WhatsApp numbers, test customer replies, and extract promise commitments automatically.
          </p>
        </div>

        {waStatus && (
          <div>
            {waStatus.configured ? (
              <span className="status-badge badge-success" style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                🟢 Twilio WhatsApp Live Connected
              </span>
            ) : (
              <span className="status-badge badge-warning" style={{ fontSize: '0.82rem', padding: '6px 14px', background: 'rgba(245, 158, 11, 0.15)', color: '#fde047', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                🟡 WhatsApp Simulation Mode
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top Banner: Twilio WhatsApp Sandbox Info */}
      <div className="card panel" style={{ background: 'rgba(15, 36, 57, 0.75)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              TWILIO SENDER NUMBER
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '2px' }}>
              {waStatus?.whatsappNumber || 'whatsapp:+14155238886 (Sandbox)'}
            </div>
            <div className="muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              Standard Twilio WhatsApp Sandbox Sender
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              INCOMING WEBHOOK URL (FOR REPLIES)
            </div>
            <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#cbd5e1', marginTop: '4px', wordBreak: 'break-all' }}>
              {(waStatus?.serverPublicUrl || 'https://your-ngrok.ngrok-free.app')}/api/twilio/whatsapp/incoming
            </div>
            <div className="muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              Paste in your Twilio Console under WhatsApp Sandbox Settings (HTTP POST)
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Message Form on Left, WhatsApp Phone Mockup on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Left: Message Composer */}
        <div className="card panel">
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✍️</span> Compose WhatsApp Recovery Message
          </h2>

          <form onSubmit={handleSendWhatsApp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Phone Number Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Recipient Phone Number (with Country Code)
              </label>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%',
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

            {/* Customer Name & Amount */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="Shyam Potdar"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#041523',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="5500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#041523',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            {/* 1-Click Payment Link */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                1-Click Razorpay Recovery Link
              </label>
              <input
                type="text"
                placeholder="https://rzp.io/i/rec_demo123"
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#a5f3fc',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* AI Copywriting Templates */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                AI Copywriting Templates
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="secondary"
                    onClick={() => handleApplyTemplate(t)}
                    style={{ textAlign: 'left', fontSize: '0.8rem', padding: '8px 12px' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                WhatsApp Message Body
              </label>
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  lineHeight: 1.4
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
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#041523',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.88rem'
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

            {/* Send Button */}
            <div style={{ marginTop: '8px' }}>
              <button
                type="submit"
                disabled={sending}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '1rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #22c55e, #10b981)',
                  color: '#fff'
                }}
              >
                {sending ? 'Sending via Twilio...' : '💬 Send Real WhatsApp Recovery Message'}
              </button>
            </div>
          </form>

          {/* Feedback message */}
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

        {/* Right: Live WhatsApp Phone Mockup & Sandbox Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* WhatsApp UI Mockup */}
          <div className="card panel">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📱</span> Live WhatsApp Preview (Customer View)
            </h2>

            <div className="whatsapp-mockup" style={{ margin: '0 auto', maxWidth: '380px' }}>
              <div className="wa-header">
                <div className="wa-avatar">🤖</div>
                <div className="wa-contact-info">
                  <div className="wa-name">
                    SaaSify Billing Support <span className="wa-verified">✔</span>
                  </div>
                  <div className="wa-status">Online • Official Business Account</div>
                </div>
                <div className="wa-header-icons">📞 🎥 ︙</div>
              </div>

              <div className="wa-body" style={{ minHeight: '260px' }}>
                <div className="wa-encryption-notice">
                  🔒 Messages and calls are end-to-end encrypted.
                </div>

                <div className="wa-bubble wa-outbound">
                  <div className="wa-message-text" style={{ whiteSpace: 'pre-wrap' }}>
                    {message || 'Your personalized recovery message will appear here.'}
                  </div>

                  {paymentLink && (
                    <div className="wa-link-preview">
                      <div className="wa-link-title">💳 1-Click Razorpay Recovery Checkout</div>
                      <div className="wa-link-url">{paymentLink}</div>
                      <a
                        href={paymentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="wa-pay-btn"
                      >
                        Pay ₹{amount || '5500'} via Razorpay ⚡
                      </a>
                    </div>
                  )}

                  <div className="wa-time-row">
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="wa-ticks">✓✓</span>
                  </div>
                </div>
              </div>

              <div className="wa-input-bar">
                <span style={{ fontSize: '1.1rem', cursor: 'pointer' }}>😊 📎</span>
                <input
                  type="text"
                  placeholder="Customer replies here (e.g. 'Friday ko')"
                  disabled
                  style={{ opacity: 0.7 }}
                />
                <button type="button" disabled style={{ opacity: 0.7 }}>➤</button>
              </div>
            </div>
          </div>

          {/* Twilio Sandbox Setup Steps */}
          <div className="card panel" style={{ borderColor: 'rgba(34, 197, 94, 0.25)' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💡</span> How to Connect Your WhatsApp with Twilio Sandbox
            </h2>
            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', lineHeight: 1.6, color: '#cbd5e1' }}>
              <li>
                Open WhatsApp on your mobile phone.
              </li>
              <li>
                Send a message with your sandbox code (e.g. <code>join &lt;your-code&gt;</code>) to <strong>+1 415 523 8886</strong> (Twilio's Sandbox number).
              </li>
              <li>
                Twilio will instantly reply confirming your device is connected!
              </li>
              <li>
                Now click <strong>Send Real WhatsApp Message</strong> on the left, and it will arrive directly in your WhatsApp app!
              </li>
              <li>
                Reply to the WhatsApp message with: <em>"Friday ko salary aayegi tab pakka kar dunga"</em> to test the AI promise parser.
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent WhatsApp Activity & Captured Commitments */}
      <div className="card panel" style={{ marginTop: '10px' }}>
        <h2 className="section-title">📊 Recent WhatsApp Outreach & Extracted Commitments</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Captured Commitments */}
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '10px', color: '#86efac' }}>
              WhatsApp Promise-to-Pay Commitments
            </div>
            {recentPromises.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>No WhatsApp commitments logged yet. Send a message and reply to test.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentPromises.map((p) => (
                  <div key={p.id} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#86efac', fontSize: '0.88rem' }}>📅 Promised Date: {p.promisedDate}</strong>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="muted" style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                      Customer Replied: "{p.sourceText}"
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                      Confidence: {(p.confidence * 100).toFixed(0)}% • Case: {p.caseId}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Logs */}
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '10px', color: 'var(--primary)' }}>
              WhatsApp Delivery & Activity History
            </div>
            {recentMessages.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>No recent WhatsApp activity logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentMessages.map((log, idx) => (
                  <div key={log.id || idx} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid #22c55e' }}>
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
