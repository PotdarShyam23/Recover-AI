# RecoverAI: Architecture Notes

What happens when a failed payment walks in, and which file does each job.

## What happens when a payment fails

```text
┌────────────────────────────────────────────────────────────┐
│ 1. PAYMENT FAILS (Razorpay)                                │
│    customer's checkout dropped or interrupted              │
└──────────────────────────────┬─────────────────────────────┘
                               │ webhook knocks
                               ▼
┌────────────────────────────────────────────────────────────┐
│ 2. GATEKEEPER (security)                                   │
│    checks HMAC-SHA256 signature, drops duplicate events    │
└──────────────────────────────┬─────────────────────────────┘
                               │ clean event goes in
                               ▼
┌────────────────────────────────────────────────────────────┐
│ 3. HEART  (recoveryEngine.js)                              │
│    runs the recovery; asks Brain + Conscience first        │
└──────────────┬──────────────────────────────┬──────────────┘
               ▲                              ▲
               │                              │
               ▼                              ▼
┌──────────────┴─────────────┐  ┌─────────────┴──────────────┐
│ 4. BRAIN (aiService.js)    │  │ 5. CONSCIENCE              │
│ picks WhatsApp or call,    │  │ quiet hours 9 PM-9 AM      │
│ writes the words, reads    │  │ max 2 WhatsApp + 1 call    │
│ replies as dates           │  │ 6 hr cooldown between tries│
└──────────────┬─────────────┘  └─────────────┬──────────────┘
               │                              │
               └───────────────┬──────────────┘
                               ▼ both say go
               ┌───────────────┴──────────────┐
               ▼                              ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│ 6a. VOICE (Twilio call)    │  │ 6b. WHATSAPP (Twilio)      │
│ dials the customer, speaks │  │ sends a friendly message   │
│ Hinglish (Polly Aditi) and │  │ with a 1-click pay link    │
│ listens to the reply       │  │ and reads the reply        │
└──────────────┬─────────────┘  └─────────────┬──────────────┘
               │                              │
               └───────────────┬──────────────┘
                               ▼ customer answers
┌────────────────────────────────────────────────────────────┐
│ 7. CUSTOMER REPLIES                                        │
│    "Friday ko salary aayegi"  (call or WhatsApp)           │
└──────────────────────────────┬─────────────────────────────┘
                               │ intent parser reads it
                               ▼
┌────────────────────────────────────────────────────────────┐
│ 8. MEMORY (promise tracker)                                │
│    intent parser: "Friday" -> 2026-10-30, promise saved    │
└──────────────────────────────┬─────────────────────────────┘
                               │ customer pays via the link
                               ▼
┌────────────────────────────────────────────────────────────┐
│ 9. REVENUE RECOVERED!                                      │
│    customer pays via 1-click link -> shown on dashboard    │
└────────────────────────────────────────────────────────────┘
```

## Who does what

```text
RecoverAI/
├── backend/
│   ├── server.js                 boots Express on :4001, connects MongoDB
│   ├── app.js                    CORS, JSON + Twilio bodies, mounts routes
│   ├── apiRoutes.js              every API door: webhooks, cases, calls, metrics
│   │
│   ├── ingestionService.js       GATEKEEPER: takes webhooks, drops duplicates
│   ├── razorpayProvider.js       checks HMAC signature, makes 1-click pay links
│   │
│   ├── recoveryEngine.js         HEART: runs recovery, credits revenue on pay
│   ├── aiService.js              BRAIN: 4 Gemini agents (strategy/copy/voice/intent)
│   ├── recoveryPolicy.js         CONSCIENCE: quiet hours, touch limits, cooldown
│   │
│   ├── twilioVoiceService.js     calls, Polly Aditi voice, listens, TwiML
│   ├── twilioWhatsAppService.js  sends recovery chats, reads replies
│   ├── notificationService.js    helper for WhatsApp / SMS / email
│   │
│   ├── analyticsService.js       revenue at risk, recovered, rate, best channel
│   ├── store.js                  MongoDB when online, in-memory for offline demo
│   ├── connection.js             connects to MongoDB Atlas
│   └── constants.js              state transitions, touch limits, promise statuses
├── models/
│   ├── RecoveryCase.js           one failed payment, start to recovered/stopped
│   ├── Promise.js                promise-to-pay: target date + status
│   ├── Customer.js               contact info, spend history, preferred channel
│   ├── PaymentEvent.js           permanent log of every gateway webhook
│   ├── CommunicationLog.js       every call and WhatsApp, sent or received
│   ├── AuditLog.js               permanent timeline of every decision made
│   └── Merchant.js               business settings, Razorpay keys, policy
└── frontend/
    ├── App.jsx                   React shell: sidebar + routing
    ├── api.js                    one helper that talks to the backend
    │
    ├── Dashboard.jsx             recovered revenue, rate %, funnel, channels
    ├── RecoveryCases.jsx         searchable case list with status tabs
    ├── RecoveryDetail.jsx        one case up close + call/WhatsApp buttons
    ├── Promises.jsx              promised dates and whether they were kept
    ├── AuditLog.jsx              visual timeline of every action
    │
    ├── VoiceCallPage.jsx         enter your number, get a real AI Hinglish call
    ├── WhatsAppPage.jsx          send a real recovery message, preview chat
    └── Demo.jsx                  test webhooks: UPI drop, low balance, stolen card
```