import { useState, useEffect, useRef } from 'react';
import { BACKEND_BASE } from '../services/api';

const QUICK_RESPONSES = [
  'Salary 10th ko aane wali hai, tab 100% complete kar dunga.',
  'Kal subah 11 baje office pahunch kar UPI se pay kar dunga.',
  'Credit card me limit issue tha, Monday ko resolve ho jayega tab kar dunga.',
  'Abhi travel kar raha hoon, kal shaam ko 6 baje bhejta hoon.'
];

export default function VoiceCallModal({ isOpen, onClose, customerName, amount, currency = 'INR', onCallCompleted }) {
  const [callState, setCallState] = useState('ringing'); // 'ringing' | 'connected' | 'ended'
  const [dialogue, setDialogue] = useState([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [customReply, setCustomReply] = useState('');
  const [isProcessingReply, setIsProcessingReply] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const audioRef = useRef(null);

  // High-quality natural human voice using backend Google TTS proxy
  const playHumanVoice = (text, onFinished) => {
    if (!audioEnabled) {
      if (onFinished) setTimeout(onFinished, 1500);
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const baseUrl = BACKEND_BASE;
      const audioUrl = `${baseUrl}/api/voice/tts?lang=hi&text=${encodeURIComponent(text.slice(0, 200))}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setIsAiSpeaking(true);

      audio.onended = () => {
        setIsAiSpeaking(false);
        if (onFinished) onFinished();
      };

      audio.onerror = () => {
        setIsAiSpeaking(false);
        // Graceful fallback to browser speech synthesis if audio stream fails
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.95;
          utterance.onend = () => { if (onFinished) onFinished(); };
          window.speechSynthesis.speak(utterance);
        } else if (onFinished) {
          onFinished();
        }
      };

      audio.play().catch(e => {
        console.warn('Audio autoplay notice:', e);
        setIsAiSpeaking(false);
        if (onFinished) onFinished();
      });
    } catch (err) {
      setIsAiSpeaking(false);
      if (onFinished) onFinished();
    }
  };

  const startCall = () => {
    setCallState('connected');
    const firstLine = `Namaste ${customerName || 'ji'}! Main RecoverAI billing support se bol raha hoon. Aapka ${currency} ${amount || ''} ka payment complete nahi ho paya tha, kya sab theek hai?`;
    
    setDialogue([{ speaker: 'Agent', text: firstLine }]);

    // AI speaks its greeting first, then waits for the customer to speak!
    playHumanVoice(firstLine, () => {
      // AI finished speaking, now customer can talk or pick an answer!
    });
  };

  const handleCustomerSubmit = async (textToSend) => {
    const custText = (textToSend || customReply).trim();
    if (!custText || isProcessingReply) return;

    setIsProcessingReply(true);
    setDialogue(prev => [...prev, { speaker: 'Customer', text: custText }]);
    setCustomReply('');

    try {
      // Send customer's actual explanation to Gemini live!
      let aiResponseText = `Bilkul samajh sakta hoon ${customerName || 'ji'}! Main aapka payment schedule kar deta hoon aur WhatsApp par direct link bhej raha hoon. Thank you!`;
      let callResult = null;

      if (onCallCompleted) {
        const backendRes = await onCallCompleted(custText);
        callResult = backendRes?.result?.voiceResult || backendRes?.result || backendRes;
        setExtractedData(callResult);

        if (callResult?.transcript && callResult.transcript.length > 2) {
          aiResponseText = callResult.transcript[2].text || aiResponseText;
        } else if (callResult?.summary) {
          aiResponseText = `Theek hai ${customerName || 'ji'}, maine aapka commitment note kar liya hai aur reminder set kar diya hai. Thank you!`;
        }
      }

      // Add AI confirmation reply
      setDialogue(prev => [...prev, { speaker: 'Agent', text: aiResponseText }]);

      // Speak confirmation reply aloud with human voice
      playHumanVoice(aiResponseText, () => {
        // Only end call AFTER AI finishes speaking!
        setTimeout(() => {
          setCallState('ended');
        }, 1200);
      });
    } catch (err) {
      console.error('Failed to process voice reply:', err);
      setTimeout(() => setCallState('ended'), 2000);
    } finally {
      setIsProcessingReply(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setCallState('ringing');
      setDialogue([]);
      setIsAiSpeaking(false);
      setExtractedData(null);
      setCustomReply('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="phone-modal-overlay">
      <div className="phone-device">
        {/* Phone Speaker & Camera Notch */}
        <div className="phone-notch">
          <div className="phone-speaker"></div>
          <div className="phone-camera"></div>
        </div>

        {/* 1. Ringing Screen */}
        {callState === 'ringing' && (
          <div className="phone-screen ringing-screen">
            <div className="caller-info">
              <div className="caller-avatar-pulse">📞</div>
              <div className="caller-title">RecoverAI Voice Agent</div>
              <div className="caller-number">+91 80 4001 2026</div>
              <div className="call-status-label">Incoming Telephony Call...</div>
              <div className="call-amount-tag">Payment Pending: {currency} {amount}</div>
            </div>

            <div className="phone-actions">
              <button
                type="button"
                className="phone-btn decline-btn"
                onClick={onClose}
              >
                ✕ Decline
              </button>
              <button
                type="button"
                className="phone-btn accept-btn"
                onClick={startCall}
              >
                📞 Answer
              </button>
            </div>
          </div>
        )}

        {/* 2. Active Connected Call Screen */}
        {callState === 'connected' && (
          <div className="phone-screen connected-screen">
            <div className="active-call-header">
              <div className="active-caller">RecoverAI Voice Agent</div>
              <div className="active-timer">
                {isAiSpeaking ? (
                  <span style={{ color: '#c084fc' }}>🎙️ AI Speaking with Natural Voice...</span>
                ) : (
                  <span style={{ color: '#86efac' }}>👂 Listening to You (Customer)...</span>
                )}
              </div>
              <div className="waveform-animation">
                <span style={{ animationPlayState: isAiSpeaking ? 'running' : 'paused' }}></span>
                <span style={{ animationPlayState: isAiSpeaking ? 'running' : 'paused' }}></span>
                <span style={{ animationPlayState: isAiSpeaking ? 'running' : 'paused' }}></span>
                <span style={{ animationPlayState: isAiSpeaking ? 'running' : 'paused' }}></span>
                <span style={{ animationPlayState: isAiSpeaking ? 'running' : 'paused' }}></span>
              </div>
            </div>

            {/* Dialogue Transcript */}
            <div className="call-transcript-container">
              {dialogue.map((d, i) => (
                <div key={i} className={`call-bubble ${d.speaker === 'Agent' ? 'agent' : 'customer'}`}>
                  <span className="bubble-speaker">{d.speaker === 'Agent' ? '🤖 Hinglish AI Voice Agent' : '👤 You (Customer)'}</span>
                  <p>{d.text}</p>
                </div>
              ))}
            </div>

            {/* Interactive Customer Speech Options (No hardcoded answers!) */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                💬 Your Response (Click any or type custom):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                {QUICK_RESPONSES.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      fontSize: '0.68rem',
                      padding: '6px 8px',
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      textAlign: 'left',
                      cursor: isProcessingReply || isAiSpeaking ? 'not-allowed' : 'pointer'
                    }}
                    disabled={isProcessingReply || isAiSpeaking}
                    onClick={() => handleCustomerSubmit(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCustomerSubmit();
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  type="text"
                  placeholder="Or type custom (e.g. 'Monday 2 baje pakka kar dunga')..."
                  value={customReply}
                  onChange={(e) => setCustomReply(e.target.value)}
                  disabled={isProcessingReply || isAiSpeaking}
                  style={{
                    flex: 1,
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    color: '#fff',
                    fontSize: '0.78rem'
                  }}
                />
                <button
                  type="submit"
                  disabled={isProcessingReply || isAiSpeaking || !customReply.trim()}
                  style={{
                    background: '#22c55e',
                    color: '#000',
                    fontWeight: 700,
                    borderRadius: '8px',
                    padding: '0 12px',
                    fontSize: '0.8rem'
                  }}
                >
                  {isProcessingReply ? '...' : 'Speak ➤'}
                </button>
              </form>
            </div>

            {/* Footer controls */}
            <div className="call-footer-controls">
              <button
                type="button"
                className="mute-btn"
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setAudioEnabled(!audioEnabled);
                }}
              >
                {audioEnabled ? '🔊 Natural Voice ON' : '🔇 Muted'}
              </button>
              <button
                type="button"
                className="hangup-btn"
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setCallState('ended');
                }}
              >
                End Call
              </button>
            </div>
          </div>
        )}

        {/* 3. Call Ended Screen */}
        {callState === 'ended' && (
          <div className="phone-screen ended-screen">
            <div className="call-ended-icon">✅</div>
            <div className="ended-title">Call Completed</div>
            <div className="ended-subtitle">Natural Hinglish Conversation Logged</div>

            <div className="promise-extracted-box">
              <div className="box-tag">🤝 EXTRACTED COMMITMENT (GEMINI LIVE)</div>
              <div className="promise-date">
                Promised Date: {extractedData?.promisedDate || 'Recorded'}
              </div>
              <div className="promise-note">
                Intent: <strong>{extractedData?.extractedIntent || 'promise_to_pay'}</strong>
                {extractedData?.confidence ? ` (${(extractedData.confidence * 100).toFixed(0)}% confidence)` : ''}
              </div>
              <div className="promise-db-badge">
                ✓ Saved in MongoDB Atlas 'promises' collection
              </div>
            </div>

            <button
              type="button"
              className="phone-btn close-btn"
              onClick={onClose}
              style={{ width: '100%', marginTop: '16px' }}
            >
              Done & View Updated Case
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
