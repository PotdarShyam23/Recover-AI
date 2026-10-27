import test from 'node:test';
import assert from 'node:assert/strict';
import twilioWhatsAppService from '../src/services/twilioWhatsAppService.js';
import { dbStore } from '../src/db/store.js';

test('TwilioWhatsAppService - Number Formatting', () => {
  assert.equal(twilioWhatsAppService.formatWhatsAppNumber('9876543210'), 'whatsapp:+919876543210');
  assert.equal(twilioWhatsAppService.formatWhatsAppNumber('+91 98765-43210'), 'whatsapp:+919876543210');
  assert.equal(twilioWhatsAppService.formatWhatsAppNumber('whatsapp:+919876543210'), 'whatsapp:+919876543210');
});

test('TwilioWhatsAppService - Outbound WhatsApp (Safe Simulation Fallback)', async () => {
  const result = await twilioWhatsAppService.sendOutboundWhatsApp({
    to: '9876543210',
    messageText: 'Hi Shyam! Your payment of ₹5,500 was interrupted.',
    paymentLink: 'https://rzp.io/i/rec_test123',
    customerName: 'Shyam'
  });

  assert.ok(result);
  assert.equal(result.to, 'whatsapp:+919876543210');
  assert.ok(result.body.includes('https://rzp.io/i/rec_test123'));
  assert.ok(['simulated', 'live_twilio'].includes(result.mode));
});

test('TwilioWhatsAppService - Inbound WhatsApp Webhook & Promise Extraction', async () => {
  // Create a mock case for testing inbound WhatsApp reply
  const caseId = `RC_wa_test_${Date.now()}`;
  await dbStore.saveCase({
    id: caseId,
    merchantId: 'mer_default_101',
    customerId: 'CUST-1001',
    paymentId: `pay_wa_${Date.now()}`,
    amount: 6500,
    currency: 'INR',
    status: 'CONTACTED',
    messageAttempts: 1,
    recoveryLinkUrl: 'https://rzp.io/i/rec_wa123'
  });

  const replyResult = await twilioWhatsAppService.handleIncomingWhatsApp({
    from: 'whatsapp:+919876543210',
    body: 'Bhaiya Friday ko pakka payment kar dunga.',
    messageSid: 'SM_test_wa_123',
    to: 'whatsapp:+14155238886'
  });

  assert.ok(replyResult.twiml.includes('<Response>'));
  assert.ok(replyResult.twiml.includes('<Message>'));
  assert.equal(replyResult.parsed.intent, 'promise_to_pay');
  assert.ok(replyResult.promiseRecord);
  assert.equal(replyResult.promiseRecord.sourceChannel, 'whatsapp');
});
