import test from 'node:test';
import assert from 'node:assert/strict';
import twilioVoiceService from '../src/services/twilioVoiceService.js';
import { dbStore } from '../src/db/store.js';

test('TwilioVoiceService - Phone Number Formatting', () => {
  assert.equal(twilioVoiceService.formatPhoneNumber('9876543210'), '+919876543210');
  assert.equal(twilioVoiceService.formatPhoneNumber('+91 98765-43210'), '+919876543210');
  assert.equal(twilioVoiceService.formatPhoneNumber('+1 (555) 123-4567'), '+15551234567');
});

test('TwilioVoiceService - Outbound Call Handling (Safe Simulation Fallback)', async () => {
  const result = await twilioVoiceService.makeOutboundVoiceCall({
    to: '9876543210',
    customerName: 'Aditi Sharma',
    merchantName: 'SaaSify India',
    amount: 5500,
    currency: 'INR',
    caseId: 'RC_test_123'
  });

  assert.ok(result);
  assert.equal(result.to, '+919876543210');
  assert.ok(['simulated', 'live_twilio'].includes(result.mode));
});

test('TwilioVoiceService - Inbound Call TwiML Generation', async () => {
  const twiml = await twilioVoiceService.buildIncomingCallTwiml({
    fromNumber: '+919876543210',
    serverPublicUrl: 'https://test.ngrok.io'
  });

  assert.ok(twiml.includes('<Response>'));
  assert.ok(twiml.includes('<Gather'));
  assert.ok(twiml.includes('<Say>'));
  assert.ok(twiml.includes('Namaste'));
});

test('TwilioVoiceService - Speech Gather & Promise Parsing', async () => {
  // Create a mock case for testing speech gather
  const caseId = `RC_gather_${Date.now()}`;
  await dbStore.saveCase({
    id: caseId,
    merchantId: 'mer_default_101',
    customerId: 'CUST-1001',
    paymentId: `pay_${Date.now()}`,
    amount: 7200,
    currency: 'INR',
    status: 'VOICE_ENGAGED',
    voiceAttempts: 0
  });

  const gatherResult = await twilioVoiceService.handleSpeechGather({
    speechResult: 'Haan bhaiya, Friday ko salary aayegi tab kar dunga.',
    callSid: 'CA_test_call_sid_123',
    fromNumber: '+919876543210',
    caseId,
    customerName: 'Aditi',
    amount: 7200
  });

  assert.ok(gatherResult.twiml.includes('<Response>'));
  assert.ok(gatherResult.twiml.includes('<Say'));
  assert.equal(gatherResult.parsed.intent, 'promise_to_pay');
  assert.ok(gatherResult.promiseRecord);
  assert.equal(gatherResult.promiseRecord.sourceChannel, 'voice');
});
