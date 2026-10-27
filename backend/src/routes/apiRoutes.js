import express from 'express';
import crypto from 'crypto';
import { dbStore } from '../db/store.js';
import ingestionService from '../services/ingestionService.js';
import recoveryEngine from '../services/recoveryEngine.js';
import analyticsService from '../services/analyticsService.js';
import razorpayProvider from '../adapters/payment/razorpayProvider.js';
import twilioVoiceService from '../services/twilioVoiceService.js';
import twilioWhatsAppService from '../services/twilioWhatsAppService.js';

const router = express.Router();

/**
 * 1. Health check & System Status
 */
router.get('/health', async (req, res) => {
  const merchant = await dbStore.getMerchant();
  const twilioConfig = twilioVoiceService.getTwilioConfig();

  res.json({
    status: 'ok',
    system: 'RecoverAI Revenue Recovery Engine (MERN)',
    merchant: merchant ? merchant.name : 'Configured',
    twilio: {
      configured: twilioConfig.isConfigured,
      phoneNumber: twilioConfig.twilioPhoneNumber || null,
      serverPublicUrl: twilioConfig.serverPublicUrl || null
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * 2. Razorpay Webhook Ingestion Endpoint
 */
router.post('/webhooks/razorpay', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-test-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_recoverai_secret_12345';
    
    const result = await ingestionService.handleRazorpayWebhook(req.body, signature, secret);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Webhook processing error:', error.message);
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

/**
 * 3. Recovery Cases List & Detail
 */
router.get('/recovery-cases', async (req, res) => {
  const { status } = req.query;
  const cases = await dbStore.getAllCases(status ? { status } : {});
  res.json(cases);
});

router.get('/recovery-cases/:id', async (req, res) => {
  const caseRecord = await dbStore.getCaseById(req.params.id);
  if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

  const [customer, communications, promise, auditLogs] = await Promise.all([
    dbStore.getCustomer(caseRecord.customerId),
    dbStore.getCommunicationsForCase(caseRecord.id),
    dbStore.getPromiseForCase(caseRecord.id),
    dbStore.getAuditLogs({ caseId: caseRecord.id })
  ]);

  res.json({
    ...caseRecord,
    customer,
    communications,
    promise,
    auditLogs
  });
});

/**
 * 4. Case Actions (Outreach, Voice Agent, Promise Capture)
 */

// Digital Outreach (WhatsApp / SMS)
router.post('/recovery-cases/:id/message', async (req, res) => {
  try {
    const caseRecord = await dbStore.getCaseById(req.params.id);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const customer = await dbStore.getCustomer(caseRecord.customerId);
    const channel = req.body.channel || 'whatsapp';
    const result = await recoveryEngine.executeOutreach(caseRecord, customer, channel);

    res.json({ ok: true, result, case: caseRecord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Simulated Voice Call (Browser audio playback / simulation)
router.post('/recovery-cases/:id/voice', async (req, res) => {
  try {
    const caseRecord = await dbStore.getCaseById(req.params.id);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const customer = await dbStore.getCustomer(caseRecord.customerId);
    const userResponseSimulation = req.body.response || null;
    const result = await recoveryEngine.executeHinglishVoiceCall(caseRecord, customer, userResponseSimulation);

    res.json({ ok: true, result, case: caseRecord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Process simulated customer replies (e.g. text replies)
router.post('/recovery-cases/:id/customer-reply', async (req, res) => {
  try {
    const { replyText } = req.body;
    const result = await recoveryEngine.processCustomerReply(req.params.id, replyText || 'Friday ko salary aayegi tab kar dunga');
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Natural Indian Voice Audio Streaming (High-Quality MP3 via TTS proxy)
router.get('/voice/tts', async (req, res) => {
  try {
    const text = req.query.text || 'Namaste ji';
    const lang = req.query.lang || 'hi';
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text.slice(0, 200))}`;
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).send('TTS error');
    res.set('Content-Type', 'audio/mpeg');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Payment Success Simulation (Attributes recovered revenue)
router.post('/recovery-cases/:id/simulate-success', async (req, res) => {
  try {
    const caseRecord = await dbStore.getCaseById(req.params.id);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const result = await recoveryEngine.processPaymentCaptured({
      paymentId: caseRecord.paymentId,
      amount: caseRecord.amount
    });

    res.json({ ok: true, result, case: await dbStore.getCaseById(req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 5. REAL TWILIO VOICE SERVICES (Outbound, Inbound, Speech Recognition, Status)
 */

// Twilio Service Status check
router.get('/twilio/status', (req, res) => {
  const config = twilioVoiceService.getTwilioConfig();
  res.json({
    ok: true,
    configured: config.isConfigured,
    phoneNumber: config.twilioPhoneNumber || null,
    accountSidPrefix: config.accountSid ? `${config.accountSid.slice(0, 6)}...` : null,
    serverPublicUrl: config.serverPublicUrl || null
  });
});

// Update Twilio Configuration (e.g. ngrok URL or credentials from UI)
router.post('/twilio/config', (req, res) => {
  try {
    const { accountSid, authToken, phoneNumber, serverPublicUrl } = req.body;
    if (accountSid) process.env.TWILIO_ACCOUNT_SID = accountSid;
    if (authToken) process.env.TWILIO_AUTH_TOKEN = authToken;
    if (phoneNumber) process.env.TWILIO_PHONE_NUMBER = phoneNumber;
    if (serverPublicUrl !== undefined) process.env.SERVER_PUBLIC_URL = serverPublicUrl;

    const config = twilioVoiceService.getTwilioConfig();
    res.json({
      ok: true,
      configured: config.isConfigured,
      phoneNumber: config.twilioPhoneNumber,
      serverPublicUrl: config.serverPublicUrl
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Live Twilio Call Status Lookup (by CallSid)
router.get('/twilio/call/:callSid', async (req, res) => {
  try {
    const client = twilioVoiceService.getTwilioClient();
    if (!client) {
      return res.json({
        ok: true,
        callSid: req.params.callSid,
        status: 'simulated',
        message: 'Twilio running in simulation mode'
      });
    }

    const call = await client.calls(req.params.callSid).fetch();
    res.json({
      ok: true,
      callSid: call.sid,
      status: call.status,
      duration: call.duration,
      from: call.from,
      to: call.to,
      direction: call.direction,
      startTime: call.startTime,
      endTime: call.endTime
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Outbound Call from direct phone number input (e.g. user enters phone number in UI or API)
router.post('/twilio/voice/call', async (req, res) => {
  try {
    const { phone, customerName, amount, currency, caseId, callbackUrl } = req.body;
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Phone number is required to place a call' });
    }

    const merchant = (await dbStore.getMerchant()) || { name: 'SaaSify India' };
    const result = await twilioVoiceService.makeOutboundVoiceCall({
      to: phone,
      customerName: customerName || 'Customer',
      merchantName: merchant.name,
      amount: amount || 0,
      currency: currency || 'INR',
      caseId,
      callbackUrl
    });

    // If tied to a case, record attempts and audit trail
    if (caseId) {
      const caseRecord = await dbStore.getCaseById(caseId);
      if (caseRecord) {
        caseRecord.voiceAttempts = (caseRecord.voiceAttempts || 0) + 1;
        caseRecord.attemptCount = (caseRecord.attemptCount || 0) + 1;
        caseRecord.status = 'VOICE_ENGAGED';
        await dbStore.saveCase(caseRecord);

        await dbStore.logAudit({
          caseId,
          merchantId: caseRecord.merchantId,
          eventType: 'TWILIO_VOICE_CALL_INITIATED',
          action: 'voice',
          actor: 'AI_VOICE_AGENT',
          description: `Direct Twilio voice call placed to ${phone}. Result: ${result.mode || (result.success ? 'initiated' : 'error')}`,
          metadata: { result, phone }
        });
      }
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error('Twilio direct call error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Outbound Call tied to an existing Recovery Case ID
router.post('/recovery-cases/:id/twilio-call', async (req, res) => {
  try {
    const caseRecord = await dbStore.getCaseById(req.params.id);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const customer = (await dbStore.getCustomer(caseRecord.customerId)) || {};
    const merchant = (await dbStore.getMerchant()) || { name: 'SaaSify India' };

    const targetPhone = req.body.phone || customer.phone;
    if (!targetPhone) {
      return res.status(400).json({ ok: false, error: 'Customer phone number not available for this case' });
    }

    const result = await twilioVoiceService.makeOutboundVoiceCall({
      to: targetPhone,
      customerName: customer.name || 'Customer',
      merchantName: merchant.name,
      amount: caseRecord.amount,
      currency: caseRecord.currency || 'INR',
      caseId: caseRecord.id,
      callbackUrl: req.body.callbackUrl
    });

    caseRecord.voiceAttempts = (caseRecord.voiceAttempts || 0) + 1;
    caseRecord.attemptCount = (caseRecord.attemptCount || 0) + 1;
    caseRecord.status = 'VOICE_ENGAGED';
    await dbStore.saveCase(caseRecord);

    await dbStore.logCommunication({
      id: `comm_tw_out_${Date.now()}`,
      caseId: caseRecord.id,
      customerId: caseRecord.customerId,
      channel: 'voice',
      direction: 'OUTBOUND',
      recipient: targetPhone,
      messageText: `Outbound Twilio voice call to ${targetPhone} for pending recovery of ₹${caseRecord.amount}`,
      status: result.success ? 'SENT' : 'FAILED',
      metadata: { twilioResult: result }
    });

    await dbStore.logAudit({
      caseId: caseRecord.id,
      merchantId: caseRecord.merchantId,
      eventType: 'TWILIO_VOICE_CALL_DISPATCHED',
      action: 'voice',
      actor: 'AI_VOICE_AGENT',
      description: `Dispatched real Twilio voice recovery call to customer at ${targetPhone}. Mode: ${result.mode}`,
      metadata: { result, targetPhone }
    });

    res.json({ ok: true, result, case: caseRecord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Inbound Voice Call Webhook (Customer dials the Twilio Phone Number)
router.all('/twilio/voice/incoming', async (req, res) => {
  try {
    const fromNumber = req.body.From || req.query.From || '';
    const twiml = await twilioVoiceService.buildIncomingCallTwiml({
      fromNumber,
      serverPublicUrl: req.protocol + '://' + req.get('host')
    });

    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('Incoming Twilio call webhook error:', err);
    res.type('text/xml').send(
      '<Response><Say>Namaste! RecoverAI payment support me aapka swaagat hai. Technical error ke karan kripya baad me call karein.</Say><Hangup/></Response>'
    );
  }
});

// Twilio Speech & DTMF Keypad Result Webhook (<Gather> callback)
router.all('/twilio/voice/gather', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult || req.query.SpeechResult || '';
    const digits = req.body.Digits || req.query.Digits || '';
    const callSid = req.body.CallSid || req.query.CallSid || '';
    const fromNumber = req.body.From || req.query.From || req.query.from || '';
    const caseId = req.query.caseId || req.body.caseId || null;
    const customerName = req.query.customerName || req.body.customerName || 'Customer';
    const amount = Number(req.query.amount || req.body.amount || 0);

    const result = await twilioVoiceService.handleSpeechGather({
      speechResult,
      digits,
      callSid,
      fromNumber,
      caseId,
      customerName,
      amount
    });

    res.type('text/xml').send(result.twiml);
  } catch (err) {
    console.error('Twilio speech gather webhook error:', err);
    res.type('text/xml').send(
      '<Response><Say voice="alice" language="hi-IN">Dhanyawaad, humne aapka response note kar liya hai. Payment link aapke WhatsApp par bhej diya gaya hai. Shukriya!</Say><Hangup/></Response>'
    );
  }
});

// Twilio Call Status Webhook (initiated, ringing, answered, completed)
router.post('/twilio/voice/status', (req, res) => {
  const { CallSid, CallStatus, Duration, From, To } = req.body;
  console.log(`[TwilioVoice] 📡 Call status callback: SID=${CallSid}, Status=${CallStatus}, Duration=${Duration || 0}s, From=${From}, To=${To}`);
  res.sendStatus(200);
});

/**
 * 6. REAL TWILIO WHATSAPP SERVICES (Outbound, Inbound, Status)
 */

// WhatsApp Service Status
router.get('/twilio/whatsapp/status', (req, res) => {
  const config = twilioWhatsAppService.getWhatsAppConfig();
  res.json({
    ok: true,
    configured: config.isConfigured,
    whatsappNumber: config.whatsappNumber,
    serverPublicUrl: config.serverPublicUrl || null
  });
});

// Outbound direct WhatsApp message
router.post('/twilio/whatsapp/send', async (req, res) => {
  try {
    const { phone, message, paymentLink, customerName, caseId } = req.body;
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Phone number is required' });
    }

    const result = await twilioWhatsAppService.sendOutboundWhatsApp({
      to: phone,
      messageText: message,
      paymentLink,
      customerName: customerName || 'Customer',
      caseId
    });

    if (caseId) {
      const caseRecord = await dbStore.getCaseById(caseId);
      if (caseRecord) {
        caseRecord.messageAttempts = (caseRecord.messageAttempts || 0) + 1;
        caseRecord.attemptCount = (caseRecord.attemptCount || 0) + 1;
        caseRecord.status = 'CONTACTED';
        await dbStore.saveCase(caseRecord);

        await dbStore.logCommunication({
          id: `comm_wa_direct_${Date.now()}`,
          caseId,
          customerId: caseRecord.customerId,
          channel: 'whatsapp',
          direction: 'OUTBOUND',
          recipient: phone,
          messageText: result.body,
          paymentLink,
          status: result.success ? 'SENT' : (result.mode === 'simulated' ? 'SIMULATED' : 'FAILED'),
          metadata: { twilioResult: result }
        });

        await dbStore.logAudit({
          caseId,
          merchantId: caseRecord.merchantId,
          eventType: 'TWILIO_WHATSAPP_DISPATCHED',
          action: 'whatsapp',
          actor: 'AI_OUTREACH_AGENT',
          description: `Dispatched Twilio WhatsApp recovery message to ${phone}. Mode: ${result.mode || 'live'}`,
          metadata: { result, phone }
        });
      }
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error('Twilio WhatsApp send error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Outbound WhatsApp message for an existing Recovery Case
router.post('/recovery-cases/:id/twilio-whatsapp', async (req, res) => {
  try {
    const caseRecord = await dbStore.getCaseById(req.params.id);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const customer = (await dbStore.getCustomer(caseRecord.customerId)) || {};
    const targetPhone = req.body.phone || customer.phone;
    if (!targetPhone) {
      return res.status(400).json({ ok: false, error: 'Customer phone number not available for this case' });
    }

    const result = await twilioWhatsAppService.sendOutboundWhatsApp({
      to: targetPhone,
      messageText: req.body.messageText || null,
      paymentLink: caseRecord.recoveryLinkUrl,
      customerName: customer.name || 'Customer',
      caseId: caseRecord.id
    });

    caseRecord.messageAttempts = (caseRecord.messageAttempts || 0) + 1;
    caseRecord.attemptCount = (caseRecord.attemptCount || 0) + 1;
    caseRecord.status = 'CONTACTED';
    await dbStore.saveCase(caseRecord);

    await dbStore.logCommunication({
      id: `comm_wa_${Date.now()}`,
      caseId: caseRecord.id,
      customerId: caseRecord.customerId,
      channel: 'whatsapp',
      direction: 'OUTBOUND',
      recipient: targetPhone,
      messageText: result.body,
      paymentLink: caseRecord.recoveryLinkUrl,
      status: result.success ? 'SENT' : (result.mode === 'simulated' ? 'SIMULATED' : 'FAILED'),
      metadata: { twilioResult: result }
    });

    await dbStore.logAudit({
      caseId: caseRecord.id,
      merchantId: caseRecord.merchantId,
      eventType: 'TWILIO_WHATSAPP_DISPATCHED',
      action: 'whatsapp',
      actor: 'AI_OUTREACH_AGENT',
      description: `Dispatched Twilio WhatsApp recovery message to ${targetPhone}`,
      metadata: { result, targetPhone }
    });

    res.json({ ok: true, result, case: caseRecord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Inbound WhatsApp Webhook (Customer replies on WhatsApp)
router.all('/twilio/whatsapp/incoming', async (req, res) => {
  try {
    const from = req.body.From || req.query.From || '';
    const body = req.body.Body || req.query.Body || '';
    const messageSid = req.body.MessageSid || req.query.MessageSid || '';
    const to = req.body.To || req.query.To || '';

    const result = await twilioWhatsAppService.handleIncomingWhatsApp({
      from,
      body,
      messageSid,
      to
    });

    res.type('text/xml').send(result.twiml);
  } catch (err) {
    console.error('Twilio WhatsApp incoming webhook error:', err);
    res.type('text/xml').send(
      '<Response><Message>Namaste! Humne aapka response receive kar liya hai. Shukriya!</Message></Response>'
    );
  }
});

// WhatsApp Message Status Callback
router.post('/twilio/whatsapp/status', (req, res) => {
  const { MessageSid, MessageStatus, To, From } = req.body;
  console.log(`[TwilioWhatsApp] 📡 Message status callback: SID=${MessageSid}, Status=${MessageStatus}, To=${To}`);
  res.sendStatus(200);
});

/**
 * 6. Promises, Metrics, and Audit
 */
router.get('/promises', async (req, res) => {
  const promises = await dbStore.getAllPromises();
  res.json(promises);
});

router.get('/metrics', async (req, res) => {
  const metrics = await analyticsService.getOverviewMetrics();
  res.json(metrics);
});

router.get('/audit', async (req, res) => {
  const logs = await dbStore.getAuditLogs();
  res.json(logs);
});

/**
 * 7. Test Lab / Webhook Simulator Scenarios
 */
router.get('/simulator/scenarios', (req, res) => {
  res.json([
    {
      id: 'drop_off_upi',
      name: 'UPI Drop-off / 3DS Timeout (High Intent)',
      description: 'Customer abandoned OTP screen during UPI payment. Recoverable with direct 1-click WhatsApp recovery link.',
      payload: {
        event: 'payment.failed',
        id: `evt_test_${Date.now()}`,
        payload: {
          payment: {
            entity: {
              id: `pay_drop_${Date.now().toString().slice(-4)}`,
              amount: 550000,
              currency: 'INR',
              method: 'upi',
              contact: '+919876543210',
              email: 'aditi.sharma@example.com',
              error_code: 'BAD_REQUEST_PAYMENT_TIMED_OUT',
              error_description: 'User timed out during 3DS / UPI pin authorization',
              error_source: 'customer',
              error_step: 'payment_authorization',
              error_reason: 'payment_cancelled'
            }
          }
        }
      }
    },
    {
      id: 'insufficient_funds_voice',
      name: 'Insufficient Balance (Voice Agent Escalation)',
      description: 'Card charge declined for insufficient balance. Triggers Hinglish Voice Agent to capture promise-to-pay date.',
      payload: {
        event: 'payment.failed',
        id: `evt_test_${Date.now()}`,
        payload: {
          payment: {
            entity: {
              id: `pay_insuf_${Date.now().toString().slice(-4)}`,
              amount: 1400000,
              currency: 'INR',
              method: 'card',
              contact: '+919822011223',
              email: 'rohit.verma@example.com',
              error_code: 'BAD_REQUEST_PAYMENT_ACCOUNT_INSUFFICIENT_BALANCE',
              error_description: 'Account balance insufficient to complete subscription payment',
              error_source: 'bank',
              error_step: 'payment_authorization',
              error_reason: 'payment_declined'
            }
          }
        }
      }
    },
    {
      id: 'stolen_card_fraud',
      name: 'Suspected Fraud / Stolen Card (Unrecoverable)',
      description: 'Bank flagged card as stolen. RecoverAI immediately classifies as UNRECOVERABLE to protect the merchant.',
      payload: {
        event: 'payment.failed',
        id: `evt_test_${Date.now()}`,
        payload: {
          payment: {
            entity: {
              id: `pay_fraud_${Date.now().toString().slice(-4)}`,
              amount: 2500000,
              currency: 'INR',
              method: 'card',
              contact: '+919811133445',
              email: 'maya.nair@example.com',
              error_code: 'BAD_REQUEST_PAYMENT_POSSIBLE_FRAUD',
              error_description: 'Card reported stolen or flagged with high fraud risk',
              error_source: 'gateway',
              error_step: 'risk_check',
              error_reason: 'fraud_flag'
            }
          }
        }
      }
    }
  ]);
});

router.post('/simulator/trigger-webhook', async (req, res) => {
  try {
    const payload = req.body;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_recoverai_secret_12345';
    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    const result = await ingestionService.handleRazorpayWebhook(payload, signature, secret);
    res.json({ ok: true, signatureGenerated: signature, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
