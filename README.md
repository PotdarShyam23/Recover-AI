# RecoverAI - Merchant Revenue Recovery System (MERN Stack)

AI Revenue Recovery Agent platform designed for merchants using **Razorpay**, built with the **MERN Stack** (MongoDB, Express, React, Node.js), **Google Gemini Multi-Agents**, and **Twilio Voice & WhatsApp**.

---

## What RecoverAI Does

RecoverAI is **NOT** a system that attempts to diagnose gateway decline codes or fix payment rails. Razorpay handles payment processing.

**RecoverAI is a merchant-side revenue recovery layer:**
1. **Ingests Payment Events**: Ingests authentic Razorpay webhooks (`payment.failed`, `payment.captured`, `order.paid`) with cryptographic HMAC-SHA256 signature verification and idempotency checks.
2. **Evaluates Recoverability**: Determines if the failure is a genuine merchant recovery opportunity (e.g. UPI PIN timeouts, temporary card issues, drop-offs) or unrecoverable (e.g. stolen card / fraud alerts).
3. **Dynamic LLM Multi-Agent Decisioning (Google Gemini)**:
   - **Agent 1: Strategy & Action Agent**: Evaluates failure context dynamically (without hardcoding arbitrary amount thresholds) to decide whether to send a digital message, wait, or escalate to Voice.
   - **Agent 2: Personalized Outreach Generator**: Crafts empathetic recovery copy with a 1-click Razorpay payment recovery link.
   - **Agent 3: Conversational Hinglish Voice Agent**: Speaks natural Hinglish, understands customer reasons (e.g., *"Friday ko salary aayegi"*), and dynamically extracts promise-to-pay dates.
   - **Agent 4: Promise & Intent Tracker**: Parses commitments from customer responses and schedules follow-up reminders.
4. **Omnichannel Telecom Execution (Twilio)**:
   - **Twilio Voice**: Places real outbound phone calls speaking in natural Indian Hinglish using Amazon Polly *Aditi*, listens to customer speech using speech recognition, and answers incoming customer calls.
   - **Twilio WhatsApp**: Dispatches personalized recovery messages with 1-click Razorpay checkout links and listens to customer WhatsApp replies.
   - ALL TWILIO SREVICES ARE PAID I MADE THE INTERFACE FOR CALLING AND MESSAGING 
5. **Policy Guardrails**: Programmatically enforces quiet hours (no outreach 9:00 PM - 9:00 AM), anti-spam limits (max 2 WhatsApp, max 1 Voice), and mandatory 6-hour cooldown periods.
6. **Revenue Attribution**: When the customer pays using the recovery link, Razorpay's `payment.captured` event is attributed to the winning channel (Voice / WhatsApp / SMS) and marked as Recovered Revenue.

---

## System Architecture

```
Frontend (React 18 + Vite)
  |-- Dashboard (Live KPIs, Funnel, Channel Attribution)
  |-- Recovery Cases (Status Filters, Payment Links, Audit Trail)
  |-- Twilio Voice Call Lab (Direct Dialpad, Live Call Tracker, Inbound Guide)
  |-- Twilio WhatsApp Lab (1-Click Recovery Checkout, Live Chat Preview, Sandbox Guide)
  |-- Promise Tracker (Extracted Commitments & Target Dates)
  |-- Audit Log (Immutable chronological history)
  \-- Test Lab (Razorpay Webhook Simulator & Payload Editor)
  |
  v  HTTP / REST
Backend (Express 4 + Node.js)
  |-- Razorpay Provider Adapter (HMAC-SHA256 Signature Verification)
  |-- Ingestion Service (Idempotency & Deduplication)
  |-- Recovery Engine (Central Orchestrator)
  |     |-- Agent 1: Strategy & Action Agent (Gemini)
  |     |-- Agent 2: Copywriting Outreach Agent (Gemini)
  |     |-- Agent 3: Hinglish AI Voice Agent (Gemini)
  |     \-- Agent 4: Promise & Intent Parser (Gemini)
  |-- Twilio Voice Service (Outbound Calling, Inbound TwiML, Speech Gather)
  |-- Twilio WhatsApp Service (Outbound Messaging, Inbound Replies, TwiML)
  |-- Policy Guardrails (Anti-Spam, Cooldowns, Quiet Hours 9 PM - 9 AM)
  \-- Analytics Service (Revenue Aggregations & Channel Attribution)
  |
  v
Database (MongoDB via Mongoose / Dual-Mode In-Memory Fallback)
  |-- merchants
  |-- customers
  |-- payment_events
  |-- recovery_cases
  |-- communication_logs
  |-- promises
  \-- audit_logs
```

> 📖 **Looking for a deeper dive?** Check out [`ARCHITECTURE.md`](ARCHITECTURE.md) for a human-readable walkthrough of the system using relatable organ analogies (Heart, Brain, Gatekeeper, Mouth, Ears, Hands, Memory).

---


## How to Test Live Features



###. Test Razorpay Failure Scenarios (Test Lab)
1. Go to **`🧪 Test Lab & Webhooks`** in the sidebar.
2. Choose a pre-built scenario:
   - *UPI Drop-off / 3DS Timeout* (High Intent)
   - *Insufficient Balance* (Escalates to Hinglish Voice Agent)
   - *Suspected Fraud / Stolen Card* (Classified as Unrecoverable)
3. Click **"Simulate Razorpay Webhook Event"** to watch the HMAC signature get generated, the ingestion layer process it, and the AI multi-agents execute the recovery strategy.

---




Test coverage includes:
* **Razorpay HMAC Signatures**: Verifies authentic and rejects tampered signatures.
* **Idempotency Prevention**: Guarantees duplicate webhook events are ignored.
* **AI Strategy Decisioning**: Evaluates failure context without hardcoded thresholds.
* **Personalized Copywriting**: Generates dynamic copy with customer names, amounts, and links.
* **Policy Guardrails**: Enforces quiet hours (9 PM - 9 AM), touch limits, and cooldowns.
* **Twilio Voice Engine**: Number formatting, outbound call fallback, inbound TwiML, and speech gather handling.
* **Twilio WhatsApp Engine**: Number standardization, outbound WhatsApp delivery, and inbound reply parsing.
* **Hinglish Voice Dialogues**: Two-way conversational script generation and sentiment analysis.
* **Promise Extraction**: Natural language date parsing from customer statements.
* **Revenue Attribution**: Matches `payment.captured` events and attributes revenue to the winning channel.
