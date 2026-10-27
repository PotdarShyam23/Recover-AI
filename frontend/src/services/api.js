// Dynamically resolve Backend API URL from environment variables for Render / Production
function resolveApiBase() {
  const envUrl = 
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_KEY; // Supported in case set on Render

  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    let clean = envUrl.trim().replace(/\/+$/, '');
    // If full domain without /api (e.g. https://xyz.onrender.com), append /api
    if (!clean.endsWith('/api')) {
      clean = `${clean}/api`;
    }
    return clean;
  }

  // Local development fallback when running Vite dev server (port 5173)
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:4001/api';
  }

  // Same-origin relative path for unified deployment (e.g. Express serving frontend static build)
  return '/api';
}

export const API_BASE = resolveApiBase();
export const BACKEND_BASE = API_BASE.replace(/\/api$/, '');

if (typeof window !== 'undefined') {
  console.log(`[RecoverAI] API Base URL configured: ${API_BASE}`);
}

async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!res.ok) {
    let errorMsg = `API Error ${res.status}`;
    try {
      const body = await res.json();
      errorMsg = body.error || body.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return await res.json();
}

export const api = {
  // Health
  getHealth: () => fetchJson('/health'),

  // Analytics
  getMetrics: () => fetchJson('/metrics'),

  // Cases
  getCases: (status = '') => fetchJson(`/recovery-cases${status ? `?status=${status}` : ''}`),
  getCase: (id) => fetchJson(`/recovery-cases/${id}`),

  // Case Actions
  dispatchOutreach: (id, channel = 'whatsapp') =>
    fetchJson(`/recovery-cases/${id}/message`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    }),

  triggerVoiceCall: (id, responseText = null) =>
    fetchJson(`/recovery-cases/${id}/voice`, {
      method: 'POST',
      body: JSON.stringify({ response: responseText })
    }),

  sendCustomerReply: (id, replyText) =>
    fetchJson(`/recovery-cases/${id}/customer-reply`, {
      method: 'POST',
      body: JSON.stringify({ replyText })
    }),

  simulatePaymentSuccess: (id) =>
    fetchJson(`/recovery-cases/${id}/simulate-success`, {
      method: 'POST'
    }),

  // Twilio Voice Services
  getTwilioStatus: () => fetchJson('/twilio/status'),

  updateTwilioConfig: (data) =>
    fetchJson('/twilio/config', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  placeTwilioCall: (data) =>
    fetchJson('/twilio/voice/call', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  triggerCaseTwilioCall: (id, data = {}) =>
    fetchJson(`/recovery-cases/${id}/twilio-call`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getCallStatus: (callSid) => fetchJson(`/twilio/call/${callSid}`),

  // Twilio WhatsApp Services
  getWhatsAppStatus: () => fetchJson('/twilio/whatsapp/status'),

  sendDirectWhatsApp: (data) =>
    fetchJson('/twilio/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  sendCaseWhatsApp: (id, data = {}) =>
    fetchJson(`/recovery-cases/${id}/twilio-whatsapp`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Promises & Audit
  getPromises: () => fetchJson('/promises'),
  getAuditLogs: () => fetchJson('/audit'),

  // Test Lab / Simulator
  getScenarios: () => fetchJson('/simulator/scenarios'),
  triggerWebhook: (payload) =>
    fetchJson('/simulator/trigger-webhook', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};

export default api;
