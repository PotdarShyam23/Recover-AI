import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import VoiceTranscriptView from '../components/VoiceTranscriptView';
import WhatsAppPreview from '../components/WhatsAppPreview';
import VoiceCallModal from '../components/VoiceCallModal';

export default function RecoveryDetail() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('whatsapp'); // 'whatsapp' | 'voice' | 'audit'

  async function loadCase() {
    try {
      const data = await api.getCase(id);
      setCaseData(data);
    } catch (err) {
      console.error('Failed to load case detail:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCase();
  }, [id]);

  async function handleSendOutreach(channel = 'whatsapp') {
    setActionLoading(true);
    try {
      await api.dispatchOutreach(id, channel);
      await loadCase();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCallCompleted(simulationResponse) {
    const res = await api.triggerVoiceCall(id, simulationResponse);
    await loadCase();
    return res;
  }

  async function handleCustomerReply(replyText) {
    setActionLoading(true);
    try {
      await api.sendCustomerReply(id, replyText);
      await loadCase();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSimulateSuccess() {
    setActionLoading(true);
    try {
      await api.simulatePaymentSuccess(id);
      await loadCase();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRealTwilioCall() {
    const defaultPhone = caseData?.customer?.phone || '+91';
    const targetPhone = prompt('Enter customer phone number to dial via Twilio:', defaultPhone);
    if (!targetPhone) return;

    setActionLoading(true);
    try {
      const res = await api.triggerCaseTwilioCall(id, { phone: targetPhone.trim() });
      if (res && res.ok) {
        if (res.result?.mode === 'live_twilio') {
          alert(`📞 Real Twilio Call initiated to ${res.result.to}! Call SID: ${res.result.callSid}`);
        } else {
          alert(`Twilio Notice: ${res.result?.message || 'Call triggered in safe simulation mode.'}`);
        }
        await loadCase();
      }
    } catch (err) {
      alert('Twilio Call Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRealTwilioWhatsApp() {
    const defaultPhone = caseData?.customer?.phone || '+91';
    const targetPhone = prompt('Enter customer WhatsApp phone number to send message via Twilio:', defaultPhone);
    if (!targetPhone) return;

    setActionLoading(true);
    try {
      const res = await api.sendCaseWhatsApp(id, { phone: targetPhone.trim() });
      if (res && res.ok) {
        if (res.result?.mode === 'live_twilio') {
          alert(`💬 Real Twilio WhatsApp message sent to ${res.result.to}! Message SID: ${res.result.messageSid}`);
        } else {
          alert(`Twilio Notice: ${res.result?.message || 'WhatsApp message simulated.'}`);
        }
        await loadCase();
      }
    } catch (err) {
      alert('Twilio WhatsApp Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="card panel">Loading case details…</div>;
  if (!caseData) return <div className="card panel">Case not found.</div>;

  // Find most recent WhatsApp message
  const whatsappComm = (caseData.communications || []).find(c => c.channel === 'whatsapp' && c.direction === 'OUTBOUND');
  const latestMessageText = whatsappComm?.messageText || 
    `Hi ${caseData.customer?.name || 'there'}! We noticed your payment of ₹${caseData.amount?.toLocaleString('en-IN')} was interrupted. You can complete it securely in 1-click here: ${caseData.recoveryLinkUrl}`;

  // Find voice transcript
  const voiceComm = (caseData.communications || []).find(c => c.channel === 'voice' && c.metadata?.transcript);

  return (
    <div className="grid">
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/cases" className="muted" style={{ fontSize: '0.85rem' }}>← Back to Recovery Cases</Link>
          <h1 style={{ margin: '8px 0 0', fontSize: '1.6rem' }}>Case {caseData.id}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <StatusBadge status={caseData.status} />
          {caseData.status !== 'RECOVERED' && (
            <button
              type="button"
              onClick={handleSimulateSuccess}
              disabled={actionLoading}
              style={{ background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', fontSize: '0.85rem' }}
            >
              ⚡ Simulate Customer Paid on Link
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        {/* Left Column: Context & Interactive Triggers */}
        <div className="grid" style={{ gap: '16px' }}>
          {/* Recovery Case Overview Card */}
          <div className="card panel">
            <h2 className="section-title">Payment & Customer Context</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '16px' }}>
              <div>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Amount at Risk</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>₹{caseData.amount?.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Customer (Phone / Name)</span>
                <div style={{ fontWeight: 600 }}>{caseData.customer?.name || caseData.customerId}</div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>{caseData.customer?.phone || '+91 98765 43210'}</div>
              </div>
              <div>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Gateway Payment ID</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{caseData.paymentId}</div>
              </div>
              <div>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Gateway Error Code</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#fca5a5' }}>
                  {caseData.errorCode || caseData.failureCategory}
                </div>
              </div>
            </div>

            {/* 1-Click Recovery Payment Link */}
            {caseData.recoveryLinkUrl && (
              <div style={{ padding: '14px', background: 'rgba(45, 212, 191, 0.08)', borderRadius: '10px', border: '1px solid rgba(45, 212, 191, 0.25)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                  🔗 1-CLICK RAZORPAY RECOVERY PAYMENT LINK
                </div>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '8px' }}>
                  {caseData.recoveryLinkUrl}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    onClick={() => {
                      navigator.clipboard.writeText(caseData.recoveryLinkUrl);
                      alert('Recovery payment link copied to clipboard!');
                    }}
                  >
                    Copy Link
                  </button>
                  <a
                    href={caseData.recoveryLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="wa-pay-btn"
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    Open Link ↗
                  </a>
                </div>
              </div>
            )}

            {/* AI Strategy Evaluation from Gemini */}
            <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', marginBottom: '4px' }}>
                🤖 Gemini Strategy Reasoning
              </div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
                {caseData.strategyReason || 'Evaluating optimal recovery intervention.'}
              </div>
              {caseData.channelSequence && (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <strong>Channel Sequence:</strong> {caseData.channelSequence.join(' → ')}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Demo Action Triggers */}
          <div className="card panel">
            <h2 className="section-title">🎙️ Interactive Live Demo Actions</h2>
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '14px' }}>
              Test the Hinglish voice conversation out loud with browser audio, or test the WhatsApp communication:
            </p>

            <div className="button-group">
              <button
                type="button"
                onClick={handleRealTwilioWhatsApp}
                disabled={actionLoading}
                style={{ background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#021820', fontSize: '0.95rem' }}
              >
                💬 Real Twilio WhatsApp
              </button>
              <button
                type="button"
                onClick={handleRealTwilioCall}
                disabled={actionLoading}
                style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: '#021820', fontSize: '0.95rem' }}
              >
                📱 Real Twilio Phone Call
              </button>
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: '#fff', fontSize: '0.95rem' }}
              >
                📞 Simulate Hinglish Voice Call (Hear Audio)
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => handleSendOutreach('whatsapp')}
                disabled={actionLoading}
              >
                💬 Refresh WhatsApp Outreach
              </button>
            </div>
          </div>

          {/* Hinglish Voice Conversation History */}
          {voiceComm && (
            <div className="card panel">
              <h2 className="section-title">Hinglish Voice Conversation Log</h2>
              <VoiceTranscriptView
                transcript={voiceComm.metadata?.transcript}
                sentiment={voiceComm.metadata?.sentiment}
                summary={voiceComm.messageText}
              />
            </div>
          )}
        </div>

        {/* Right Column: WhatsApp Mockup, Active Promise, Audit */}
        <div className="grid" style={{ gap: '16px' }}>
          {/* View Mode Tabs */}
          <div className="filter-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`filter-pill ${activeTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => setActiveTab('whatsapp')}
            >
              📱 WhatsApp Preview
            </button>
            <button
              type="button"
              className={`filter-pill ${activeTab === 'promise' ? 'active' : ''}`}
              onClick={() => setActiveTab('promise')}
            >
              🤝 Promise-to-Pay
            </button>
            <button
              type="button"
              className={`filter-pill ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              📜 Audit History
            </button>
          </div>

          {/* TAB 1: WhatsApp Screen Mockup */}
          {activeTab === 'whatsapp' && (
            <WhatsAppPreview
              customerName={caseData.customer?.name}
              phone={caseData.customer?.phone}
              messageText={latestMessageText}
              paymentLink={caseData.recoveryLinkUrl}
              onSendReply={handleCustomerReply}
            />
          )}

          {/* TAB 2: Active Promise Card */}
          {activeTab === 'promise' && (
            <div className="card panel" style={{ borderColor: 'rgba(139, 92, 246, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#c4b5fd', fontWeight: 700 }}>🤝 ACTIVE PROMISE-TO-PAY</span>
                <StatusBadge status={caseData.promise?.status || 'PENDING'} />
              </div>
              {caseData.promise ? (
                <>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
                    Promised Date: {caseData.promise.promisedDate}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                    Captured via {caseData.promise.sourceChannel} (Confidence: {(caseData.promise.confidence * 100).toFixed(0)}%)
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '0.82rem', background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: '8px' }}>
                    <strong>Customer Context:</strong> {caseData.promise.sourceText}
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  No promise captured yet. Use the <strong>Simulate Hinglish Voice Call</strong> button or type a reply in the WhatsApp preview (e.g. <em>"Friday ko salary aayegi"</em>).
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Audit Trail */}
          {activeTab === 'audit' && (
            <div className="card panel">
              <h2 className="section-title">Chronological Audit Trail</h2>
              {(!caseData.auditLogs || caseData.auditLogs.length === 0) ? (
                <div className="muted" style={{ fontSize: '0.85rem' }}>No audit events logged.</div>
              ) : (
                <ul className="timeline-list">
                  {caseData.auditLogs.map((log, idx) => (
                    <li key={idx} className={log.eventType.includes('RECOVERED') ? 'recovered' : (log.eventType.includes('UNRECOVERABLE') ? 'stop' : '')}>
                      <strong>{log.eventType}</strong> by <em>{log.actor}</em>
                      <div className="muted" style={{ fontSize: '0.75rem', margin: '2px 0' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                      <div>{log.description}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Voice Call Phone Device Modal */}
      <VoiceCallModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        customerName={caseData.customer?.name}
        amount={caseData.amount}
        currency={caseData.currency}
        onCallCompleted={handleCallCompleted}
        initialSimulationText="Arre bhaiya Friday ko salary aane wali hai, Friday ko 100% pay kar dunga."
      />
    </div>
  );
}
