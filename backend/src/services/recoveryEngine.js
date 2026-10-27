import { dbStore } from '../db/store.js';
import { decideRecoveryStrategy, generateOutreachMessage, simulateHinglishVoiceCall, parseCustomerIntent } from './aiService.js';
import { evaluatePolicyGuardrails } from './recoveryPolicy.js';
import razorpayProvider from '../adapters/payment/razorpayProvider.js';
import twilioWhatsAppService from './twilioWhatsAppService.js';
import { simulateVoiceConversation } from './voiceService.js';

export class RecoveryEngine {
  /**
   * Processes a failed payment and executes the initial recovery strategy
   */
  async processFailedPayment({ eventId, paymentId, orderId, amount, currency, customer, error, rawPayload }) {
    const merchant = await dbStore.getMerchant();
    const merchantId = merchant ? merchant.id : 'mer_default_101';

    // 1. Resolve or create customer record
    let customerRecord = null;
    const allCustomers = await dbStore.getAllCustomers();
    // if DB has a record and then return it
    customerRecord = allCustomers.find(c => c.phone === customer.contact || c.email === customer.email);
    // not then formed the data
    if (!customerRecord) {
      customerRecord = {
        id: `CUST_${Date.now()}`,
        merchantId,
        name: customer.name || customer.email?.split('@')[0] || 'Customer',
        phone: customer.contact || '+919876543210',
        email: customer.email || 'customer@example.com',
        preferredLanguage: 'hinglish',
        engagement: 'medium',
        totalSpent: 0
      };
      await dbStore.saveCustomer?.(customerRecord);
    }

    // 2. Check if recovery case already exists for this payment
    let caseRecord = await dbStore.findCaseByPaymentId(paymentId);
    if (!caseRecord) {
      const caseId = `RC_${Date.now()}`;
      
      // Generate 1-click Razorpay payment recovery link

      // razorpay 1 click link
      const link = await razorpayProvider.createRecoveryPaymentLink({
        caseId,
        customerName: customerRecord.name,
        amount,
        currency,
        customerPhone: customerRecord.phone,
        customerEmail: customerRecord.email
      });

      caseRecord = {
        id: caseId,
        merchantId,
        customerId: customerRecord.id,
        paymentId,
        initialEventId: eventId,
        amount,
        currency: currency || 'INR',
        status: 'EVALUATING',
        failureCategory: error?.reason || 'DROP_OFF',
        errorCode: error?.code,
        errorDescription: error?.description,
        attemptCount: 0,
        messageAttempts: 0,
        voiceAttempts: 0,
        recoveryLinkId: link.id,
        recoveryLinkUrl: link.shortUrl,
        recoveredAmount: 0,
        createdAt: new Date()
      };
    }

    // 3. Check for active promise
    const activePromise = await dbStore.getPromiseForCase(caseRecord.id);

    // 4. Run AGENT 1: Strategy & Action Agent
    const strategyContext = {
      amount: caseRecord.amount,
      currency: caseRecord.currency,
      errorCode: error?.code,
      errorDescription: error?.description,
      customerTier: customerRecord.engagement,
      customerPreferredChannel: customerRecord.preferredChannel || 'whatsapp',
      attemptCount: caseRecord.attemptCount,
      messageAttempts: caseRecord.messageAttempts,
      voiceAttempts: caseRecord.voiceAttempts,
      hasActivePromise: !!activePromise
    };

    const strategy = await decideRecoveryStrategy(strategyContext);

    // If marked unrecoverable (e.g. fatal fraud), close case
    if (!strategy.isRecoverable) {
      caseRecord.status = 'UNRECOVERABLE';
      caseRecord.recoverabilityReason = strategy.reason;
      caseRecord.stopReason = strategy.reason;
      await dbStore.saveCase(caseRecord);
      // if it is non recoverable then we close the case as no more needed
      await dbStore.logAudit({
        caseId: caseRecord.id,
        merchantId,
        eventType: 'CASE_CLOSED_UNRECOVERABLE',
        action: 'stop',
        actor: 'AI_STRATEGY_AGENT',
        description: `Case deemed unrecoverable: ${strategy.reason}`,
        metadata: { strategy, error }
      });

      return { caseRecord, strategy, actionExecuted: 'none' };
    }

    // 5. Evaluate Policy Guardrails
    const policy = evaluatePolicyGuardrails(caseRecord, strategy.action);
    const finalAction = policy.approved ? strategy.action : policy.fallbackAction;

    caseRecord.status = 'RECOVERABLE';
    caseRecord.strategyAction = finalAction;
    caseRecord.strategyReason = strategy.reason;
    caseRecord.aiConfidence = strategy.confidence;
    caseRecord.channelSequence = strategy.channelSequence;

    // 6. Execute Approved Action
    let executionResult = null;
    if (finalAction === 'whatsapp' || finalAction === 'sms') {
      // if outreach is WP or SMS then follow this function
      executionResult = await this.executeOutreach(caseRecord, customerRecord, finalAction);
    } else if (finalAction === 'voice') {
      // if voice then follows this function
      executionResult = await this.executeHinglishVoiceCall(caseRecord, customerRecord);
    } else if (finalAction === 'wait') {
      // change to wait
      caseRecord.status = 'AWAITING_PAYMENT';
      await dbStore.saveCase(caseRecord);
    } else if (finalAction === 'stop') {
      // change to stop and give the reason
      caseRecord.status = 'STOPPED';
      caseRecord.stopReason = policy.reason;
      await dbStore.saveCase(caseRecord);
    }

    return { caseRecord, strategy, policy, executionResult };
  }

  /**
   * Executes digital outreach (WhatsApp / SMS) with generated recovery link
   */
  async executeOutreach(caseRecord, customerRecord, channel = 'whatsapp') {
    const merchant = (await dbStore.getMerchant()) || { name: 'SaaSify India' };
    const customer = customerRecord || (await dbStore.getCustomer(caseRecord.customerId)) || {
      name: 'Customer',
      phone: '+919876543210',
      email: 'customer@example.com',
      preferredLanguage: 'hinglish'
    };
    
    // Run AGENT 2: Copywriting Agent

    // it sent to the aiservice.js where the actual LLM send the message
    const copy = await generateOutreachMessage({
      customerName: customer.name || 'Customer',
      merchantName: merchant.name,
      amount: caseRecord.amount,
      currency: caseRecord.currency,
      channel,
      recoveryUrl: caseRecord.recoveryLinkUrl,
      preferredLanguage: customer.preferredLanguage
    });

    // Update case counters
    caseRecord.attemptCount = (caseRecord.attemptCount || 0) + 1;
    caseRecord.messageAttempts = (caseRecord.messageAttempts || 0) + 1;
    caseRecord.status = 'CONTACTED';
    await dbStore.saveCase(caseRecord);

    // If channel is WhatsApp, attempt live Twilio WhatsApp delivery
    let twilioResult = null;
    if (channel === 'whatsapp' && customer.phone) {
      try {
        twilioResult = await twilioWhatsAppService.sendOutboundWhatsApp({
          to: customer.phone,
          messageText: copy.messageText,
          paymentLink: caseRecord.recoveryLinkUrl,
          customerName: customer.name,
          caseId: caseRecord.id
        });
      } catch (err) {
        console.warn('[RecoveryEngine] WhatsApp dispatch note:', err.message);
      }
    }

    // Record Communication Log
    // now saving the talks of customer and user in mongoDB
    const commLog = {
      id: `comm_${Date.now()}`,
      caseId: caseRecord.id,
      customerId: customer.id || caseRecord.customerId,
      channel,
      direction: 'OUTBOUND',
      recipient: channel === 'whatsapp' ? customer.phone : customer.email,
      messageText: copy.messageText,// gemeini mssg
      paymentLink: caseRecord.recoveryLinkUrl,
      status: twilioResult?.success ? 'SENT' : (twilioResult?.mode === 'simulated' ? 'SIMULATED' : 'SENT'),
      metadata: { headline: copy.headline, callToAction: copy.callToAction, twilioResult }
    };
    await dbStore.logCommunication(commLog);

    // Audit trail
    await dbStore.logAudit({
      caseId: caseRecord.id,
      merchantId: caseRecord.merchantId,
      eventType: 'OUTREACH_DISPATCHED',
      action: channel,
      actor: 'AI_OUTREACH_AGENT',
      description: `Dispatched dynamic ${channel} recovery message with 1-click Razorpay payment link.`,
      metadata: { commLog, copy }
    });

    return { channel, commLog, copy };
  }

  /**
   * Executes Hinglish AI Voice Agent call
   */
  // invoke the function send required info to the voiceService.js / aiservice.js 
  async executeHinglishVoiceCall(caseRecord, customerRecord, userResponseSimulation = null) {
    const customer = customerRecord || (await dbStore.getCustomer(caseRecord.customerId));
    
    // Delegate to voiceService.simulateVoiceConversation which dynamically uses Gemini AI
    const voiceResult = await simulateVoiceConversation({
      caseRecord,
      customerRecord: customer,
      userResponse: userResponseSimulation
    });

    return {
      voiceResult,
      promiseRecord: voiceResult.promiseRecord
    };
  }

  /**
   * Processes inbound customer replies (e.g. WhatsApp/SMS response)
   */
  async processCustomerReply(caseId, customerReplyText) {
    const caseRecord = await dbStore.getCaseById(caseId);
    if (!caseRecord) throw new Error('Recovery case not found');

    // Run AGENT 4: Promise & Intent Parser
    const parsed = await parseCustomerIntent(customerReplyText);

    // Log inbound communication
    await dbStore.logCommunication({
      id: `comm_inbound_${Date.now()}`,
      caseId,
      customerId: caseRecord.customerId,
      channel: 'whatsapp',
      direction: 'INBOUND',
      recipient: 'RecoverAI Bot',
      messageText: customerReplyText,
      status: 'RESPONDED',
      metadata: { parsed }
    });

    let promiseRecord = null;
    if (parsed.intent === 'promise_to_pay' && parsed.promisedDate) {
      promiseRecord = {
        id: `prom_${Date.now()}`,
        caseId,
        customerId: caseRecord.customerId,
        promisedDate: parsed.promisedDate,
        confidence: parsed.confidence,
        status: 'PENDING',
        sourceChannel: 'whatsapp',
        sourceText: customerReplyText,
        extractedIntent: 'promise_to_pay'
      };
      await dbStore.savePromise(promiseRecord);

      caseRecord.status = 'PROMISE_PENDING';
      caseRecord.strategyReason = `Customer committed to pay on ${parsed.promisedDate}.`;
      await dbStore.saveCase(caseRecord);
    }

    await dbStore.logAudit({
      caseId,
      merchantId: caseRecord.merchantId,
      eventType: 'CUSTOMER_REPLY_PROCESSED',
      action: 'parse_intent',
      actor: 'CUSTOMER',
      description: `Customer replied: "${customerReplyText}". Intent: ${parsed.intent}`,
      metadata: { parsed, promiseRecord }
    });

    return { parsed, promiseRecord, caseRecord };
  }

  /**
   * Attributes revenue when payment is captured
   */
  async processPaymentCaptured({ paymentId, orderId, amount }) {
    // Match to active recovery case
    let caseRecord = await dbStore.findCaseByPaymentId(paymentId);
    if (!caseRecord && orderId) {
      const allCases = await dbStore.getAllCases();
      caseRecord = allCases.find(c => c.paymentId === paymentId || c.id.includes(orderId));
    }

    if (!caseRecord) {
      // Pick first non-recovered case as fallback if demo matching
      const pendingCases = await dbStore.getAllCases({ status: 'CONTACTED' });
      caseRecord = pendingCases[0] || (await dbStore.getAllCases())[0];
    }

    if (!caseRecord) {
      return { status: 'ignored', message: 'No matching recovery case found' };
    }

    caseRecord.status = 'RECOVERED';
    caseRecord.recoveredAmount = Number(amount || caseRecord.amount);
    caseRecord.recoveredAt = new Date();
    caseRecord.winningChannel = caseRecord.voiceAttempts > 0 ? 'voice' : (caseRecord.strategyAction || 'whatsapp');
    await dbStore.saveCase(caseRecord);

    // Honor promise if active
    const promise = await dbStore.getPromiseForCase(caseRecord.id);
    if (promise) {
      promise.status = 'HONORED';
      await dbStore.savePromise(promise);
    }

    // Audit log
    await dbStore.logAudit({
      caseId: caseRecord.id,
      merchantId: caseRecord.merchantId,
      eventType: 'REVENUE_RECOVERED',
      action: 'payment_captured',
      actor: 'RAZORPAY_WEBHOOK',
      description: `Successfully recovered ₹${caseRecord.recoveredAmount} attributed to ${caseRecord.winningChannel} channel!`,
      metadata: { recoveredAmount: caseRecord.recoveredAmount, winningChannel: caseRecord.winningChannel }
    });

    return { status: 'recovered', caseRecord };
  }
}

export default new RecoveryEngine();
