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

## Quick Start

### 1. Install Dependencies
```bash
npm run install:all
```
Installs all backend and frontend dependencies.

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
In `.env`:
- **MongoDB**: Put your MongoDB Atlas connection string in `MONGODB_URI` (e.g., `mongodb+srv://<user>:<password>@cluster.mongodb.net/recoverai?retryWrites=true&w=majority`). *(If left empty, the app runs in safe in-memory fallback mode).*
- **Google Gemini**: Add your `GEMINI_API_KEY` for live LLM reasoning (or let it run in contextual fallback mode).
- **Razorpay**: Set `RAZORPAY_WEBHOOK_SECRET` (defaults to `test_recoverai_secret_12345`).
- **Twilio Voice & WhatsApp**:
  - `TWILIO_ACCOUNT_SID`: Your Twilio Account SID.
  - `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token.
  - `TWILIO_PHONE_NUMBER`: Your purchased Twilio phone number.
  - `TWILIO_WHATSAPP_NUMBER`: Sandbox default is `whatsapp:+14155238886`.
  - `SERVER_PUBLIC_URL`: Your ngrok HTTPS URL (e.g. `https://xxxx.ngrok-free.app`) for Twilio speech and WhatsApp webhooks.

### 3. Run Automated Test Suite
```bash
npm --prefix backend test
```
Runs **16 automated tests** verifying HMAC signatures, multi-agent decisions, Hinglish voice dialogues, real Twilio phone call formatting & inbound TwiML, real Twilio WhatsApp messaging & replies, promise extraction, and revenue attribution.

### 4. Start Development Servers
```bash
npm run dev
```
Starts both the Express backend (Port **4001**) and React Vite frontend (Port **5173**).

Open your browser at **http://localhost:5173**.

---

## How to Test Live Features

### 1. Test Real Phone Calls (Voice Call Lab)
1. Go to **`📞 Twilio Voice Call`** in the sidebar.
2. Enter your mobile number (e.g. `+91 98765 43210`).
3. Click **"Place Real Call to Customer Phone"**.
4. Your phone rings! Answer it:
   - Amazon Polly *Aditi* speaks in natural Hinglish: *"Namaste Shyam ji! This is an AI recovery assistance call from SaaSify India..."*
   - Reply: *"Friday ko salary aane wali hai, tab pakka kar dunga"*.
   - Twilio's speech recognition captures your response, extracts the date, and logs it in the **Promise Tracker**!
5. **To test incoming calls**: Dial your Twilio number directly from your phone. The AI answers, checks your number for any pending payment, and converses with you.

### 2. Test Real WhatsApp Recovery (WhatsApp Lab)
1. Join the Twilio WhatsApp Sandbox: Open WhatsApp and send `join <your-sandbox-code>` to **+1 415 523 8886**.
2. Go to **`💬 Twilio WhatsApp`** in the sidebar.
3. Enter your phone number and click **"Send Real WhatsApp Recovery Message"**.
4. The message arrives on your WhatsApp with an authentic 1-click Razorpay payment link.
5. Reply on WhatsApp: *"Friday ko salary aayegi tab kar dunga"*.
6. The AI catches your reply, extracts the commitment date, saves it, and replies with an instant confirmation!

### 3. Test Razorpay Failure Scenarios (Test Lab)
1. Go to **`🧪 Test Lab & Webhooks`** in the sidebar.
2. Choose a pre-built scenario:
   - *UPI Drop-off / 3DS Timeout* (High Intent)
   - *Insufficient Balance* (Escalates to Hinglish Voice Agent)
   - *Suspected Fraud / Stolen Card* (Classified as Unrecoverable)
3. Click **"Simulate Razorpay Webhook Event"** to watch the HMAC signature get generated, the ingestion layer process it, and the AI multi-agents execute the recovery strategy.

---

## Environment Variables Reference

| Variable | Required | Description |
| :--- | :--- | :--- |
| `PORT` | Optional | Backend port (default: `4001`). |
| `FRONTEND_URL` | Optional | Frontend URL (default: `http://localhost:5173`). |
| `MONGODB_URI` | Recommended | MongoDB Atlas connection string. Safe in-memory fallback used if empty. |
| `GEMINI_API_KEY` | Recommended | Google Gemini API key for dynamic multi-agent reasoning. Contextual fallback used if absent. |
| `GEMINI_MODEL` | Optional | Gemini model name (default: `gemini-3.6-flash`). |
| `RAZORPAY_WEBHOOK_SECRET` | Required | Webhook secret for HMAC-SHA256 signature verification. |
| `RAZORPAY_KEY_ID` | Optional | Razorpay test key ID. |
| `RAZORPAY_KEY_SECRET` | Optional | Razorpay test key secret. |
| `TWILIO_ACCOUNT_SID` | Optional | Twilio Account SID for live phone calls and WhatsApp. |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio Auth Token for live phone calls and WhatsApp. |
| `TWILIO_PHONE_NUMBER` | Optional | Active Twilio phone number (caller ID). |
| `TWILIO_WHATSAPP_NUMBER` | Optional | Twilio WhatsApp sender number (sandbox: `whatsapp:+14155238886`). |
| `SERVER_PUBLIC_URL` | Optional | Public ngrok or domain URL for Twilio speech and WhatsApp webhooks. |

---

## Test Suite Summary

Run all tests via:
```bash
npm --prefix backend test
```

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
