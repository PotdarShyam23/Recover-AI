import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateHinglishVoiceCall, parseCustomerIntent } from '../src/services/aiService.js';
import { simulateVoiceConversation } from '../src/services/voiceService.js';
import recoveryEngine from '../src/services/recoveryEngine.js';
import { dbStore } from '../src/db/store.js';

test('Hinglish AI Voice Agent - Conversational Extraction', async () => {
  const result = await simulateHinglishVoiceCall({
    customerName: 'Rohit Verma',
    merchantName: 'SaaSify India',
    amount: 14000,
    currency: 'INR',
    customerHistory: [4000, 8000],
    userResponseSimulation: 'Haan sir, thoda account issue tha. Friday ko salary aayegi, tab 100% kar dunga.'
  });

  assert.ok(result.transcript.length >= 2);
  assert.equal(result.extractedIntent, 'promise_to_pay');
  assert.ok(result.promisedDate !== null);
  assert.equal(result.sentiment, 'cooperative');
  assert.ok(result.summary.length > 10);
});

test('Promise & Intent Parser - Natural Language Date Commitments', async () => {
  const parsed1 = await parseCustomerIntent('Friday ko salary aayegi tab kar dunga');
  assert.equal(parsed1.intent, 'promise_to_pay');
  assert.ok(parsed1.promisedDate !== null);

  const parsedCancel = await parseCustomerIntent('I want to cancel my subscription please stop contacting me');
  assert.equal(parsedCancel.intent, 'cancel_subscription');
  assert.equal(parsedCancel.promisedDate, null);
});

test('Revenue Recovery Attribution - payment.captured event', async () => {
  // Create a case
  const testCase = {
    id: `RC_attr_${Date.now()}`,
    merchantId: 'mer_default_101',
    customerId: 'CUST-1001',
    paymentId: `pay_attr_${Date.now()}`,
    initialEventId: `evt_attr_${Date.now()}`,
    amount: 8500,
    currency: 'INR',
    status: 'CONTACTED',
    strategyAction: 'whatsapp',
    voiceAttempts: 0,
    messageAttempts: 1,
    attemptCount: 1,
    recoveredAmount: 0
  };

  await dbStore.saveCase(testCase);

  // Ingest payment captured
  const recoveryResult = await recoveryEngine.processPaymentCaptured({
    paymentId: testCase.paymentId,
    amount: 8500
  });

  assert.equal(recoveryResult.status, 'recovered');
  assert.equal(recoveryResult.caseRecord.status, 'RECOVERED');
  assert.equal(recoveryResult.caseRecord.recoveredAmount, 8500);
  assert.equal(recoveryResult.caseRecord.winningChannel, 'whatsapp');
});

test('VoiceService - Dynamic Voice Conversation Response to Customer Input', async () => {
  const caseId = `RC_voice_dyn_${Date.now()}`;
  const mockCase = {
    id: caseId,
    merchantId: 'mer_default_101',
    customerId: 'CUST-1001',
    amount: 6000,
    currency: 'INR',
    status: 'OPEN',
    voiceAttempts: 0
  };
  await dbStore.saveCase(mockCase);

  const result = await simulateVoiceConversation({
    caseRecord: mockCase,
    userResponse: 'Abhi travel kar raha hoon, Monday shaam tak payment 100% complete kar dunga.'
  });

  assert.equal(result.channel, 'voice');
  assert.equal(result.status, 'completed');
  assert.ok(result.agentReply.length > 0);
  assert.equal(result.extractedIntent, 'promise_to_pay');
  assert.ok(result.promisedDate !== null);
  assert.ok(result.promiseRecord !== null);
});
