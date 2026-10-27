import twilio from 'twilio';
import { dbStore } from '../db/store.js';
import { parseCustomerIntent } from './aiService.js';

/**
 * Twilio WhatsApp Service
 * -----------------------
 * Handles real WhatsApp messaging via Twilio Programmable Messaging API:
 * 1. Outbound WhatsApp: Sends personalized recovery copy with 1-click payment links.
 * 2. Inbound WhatsApp: Receives customer replies, parses promise-to-pay dates via Gemini AI,
 *    and responds immediately with WhatsApp Messaging TwiML.
 */

/**
 * Dynamically resolves Twilio WhatsApp configuration from environment variables
 */
export function getWhatsAppConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  const serverPublicUrl = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');

  if (whatsappNumber && !whatsappNumber.startsWith('whatsapp:')) {
    whatsappNumber = `whatsapp:${whatsappNumber}`;
  }

  const isConfigured = Boolean(
    accountSid &&
    authToken &&
    !accountSid.includes('XXXX') &&
    !accountSid.includes('YOUR_') &&
    !authToken.includes('your_')
  );

  return {
    accountSid,
    authToken,
    whatsappNumber,
    serverPublicUrl,
    isConfigured
  };
}

/**
 * Returns an initialized Twilio client, or null if unconfigured
 */
export function getTwilioClient() {
  const config = getWhatsAppConfig();
  if (!config.isConfigured) return null;

  try {
    return twilio(config.accountSid, config.authToken);
  } catch (err) {
    console.warn('[TwilioWhatsApp] Error initializing Twilio client:', err.message);
    return null;
  }
}

/**
 * Checks if Twilio WhatsApp service is configured
 */
export function isWhatsAppConfigured() {
  return getWhatsAppConfig().isConfigured;
}

/**
 * Cleans and formats phone numbers to standard WhatsApp format (whatsapp:+919876543210)
 */
export function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');

  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  if (!cleaned.startsWith('whatsapp:')) {
    cleaned = `whatsapp:${cleaned}`;
  }

  return cleaned;
}

/**
 * 1. OUTBOUND: Sends a real WhatsApp message to customer via Twilio
 */
export async function sendOutboundWhatsApp({
  to,
  messageText,
  paymentLink = null,
  customerName = 'Customer',
  caseId = null
}) {
  const config = getWhatsAppConfig();
  const formattedTo = formatWhatsAppNumber(to);

  // Construct full message body with payment link if not already included
  let fullBody = messageText || `Hi ${customerName}! We noticed your payment was interrupted. Complete it securely in 1-click here: ${paymentLink || 'https://rzp.io/l/demo'}`;
  if (paymentLink && !fullBody.includes(paymentLink)) {
    fullBody = `${fullBody}\n\n👉 Complete payment in 1-click: ${paymentLink}`;
  }

  // Fallback to simulation mode if credentials not configured
  if (!config.isConfigured) {
    console.warn('[TwilioWhatsApp] Twilio credentials missing in .env. Falling back to simulation mode.');
    return {
      success: false,
      mode: 'simulated',
      message: 'Twilio credentials not configured in .env. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to send real WhatsApp messages.',
      to: formattedTo,
      from: config.whatsappNumber,
      body: fullBody
    };
  }

  const client = getTwilioClient();
  if (!client) {
    return {
      success: false,
      mode: 'error',
      message: 'Failed to initialize Twilio client with current credentials.',
      to: formattedTo
    };
  }

  try {
    console.log(`[TwilioWhatsApp] 💬 Dispatching WhatsApp message to ${formattedTo} from ${config.whatsappNumber}...`);

    const msgPayload = {
      from: config.whatsappNumber,
      to: formattedTo,
      body: fullBody
    };

    if (config.serverPublicUrl && !config.serverPublicUrl.includes('localhost')) {
      msgPayload.statusCallback = `${config.serverPublicUrl}/api/twilio/whatsapp/status`;
    }

    const message = await client.messages.create(msgPayload);

    console.log(`[TwilioWhatsApp] ✅ WhatsApp sent successfully! SID: ${message.sid}, Status: ${message.status}`);

    return {
      success: true,
      mode: 'live_twilio',
      messageSid: message.sid,
      status: message.status,
      to: formattedTo,
      from: config.whatsappNumber,
      body: fullBody
    };
  } catch (err) {
    console.error('[TwilioWhatsApp] ❌ Error sending WhatsApp message:', err.message);
    return {
      success: false,
      mode: 'error',
      error: err.message,
      to: formattedTo
    };
  }
}

/**
 * 2. INBOUND: Handles incoming customer WhatsApp replies from Twilio Webhook
 */
export async function handleIncomingWhatsApp({ from, body, messageSid, to }) {
  const rawPhone = String(from || '').replace('whatsapp:', '').trim();
  console.log(`[TwilioWhatsApp] 📩 Incoming WhatsApp reply from ${rawPhone}: "${body}"`);

  // Parse intent & promise date with AI
  const parsed = await parseCustomerIntent(body);

  // Look up customer and case
  let matchedCase = null;
  let customerName = 'Customer';
  let customerId = `CUST_${Date.now()}`;

  try {
    const allCustomers = await dbStore.getAllCustomers();
    const customer = allCustomers.find(c => {
      const cClean = String(c.phone || '').replace(/[^\d+]/g, '');
      const rawClean = rawPhone.replace(/[^\d+]/g, '');
      return cClean && rawClean && (cClean === rawClean || cClean.slice(-10) === rawClean.slice(-10));
    });

    if (customer) {
      customerName = customer.name || 'Customer';
      customerId = customer.id;
      const allCases = await dbStore.getAllCases();
      matchedCase = allCases.find(c => c.customerId === customer.id && c.status !== 'RECOVERED');
    }
  } catch (err) {
    console.warn('[TwilioWhatsApp] Customer lookup notice:', err.message);
  }

  // If no existing case found, generate a linked case so the customer promise is tracked
  if (!matchedCase) {
    matchedCase = {
      id: `RC_wa_${Date.now()}`,
      merchantId: 'mer_default_101',
      customerId,
      paymentId: `pay_wa_${Date.now()}`,
      initialEventId: `evt_wa_${Date.now()}`,
      amount: 0,
      currency: 'INR',
      status: 'CONTACTED',
      createdAt: new Date()
    };
    await dbStore.saveCase(matchedCase);
  }

  let replyText = '';
  let promiseRecord = null;

  if (parsed.intent === 'promise_to_pay') {
    const promisedDate = parsed.promisedDate || 'your convenient date';
    const linkText = matchedCase?.recoveryLinkUrl ? `\n\nDirect 1-Click Link: ${matchedCase.recoveryLinkUrl}` : '';
    replyText = `Namaste ${customerName} ji! 🙏\n\nHumne aapka commitment note kar liya hai ki aap ${promisedDate} ko payment complete karenge.${linkText}\n\nDhanyawaad for choosing us! Have a wonderful day.`;

    if (matchedCase) {
      promiseRecord = {
        id: `prom_wa_${Date.now()}`,
        caseId: matchedCase.id,
        customerId: matchedCase.customerId,
        promisedDate: parsed.promisedDate || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        confidence: parsed.confidence || 0.94,
        status: 'PENDING',
        sourceChannel: 'whatsapp',
        sourceText: body,
        extractedIntent: 'promise_to_pay'
      };

      await dbStore.savePromise(promiseRecord);

      matchedCase.status = 'PROMISE_PENDING';
      matchedCase.strategyReason = `Customer committed via WhatsApp reply to pay on ${promiseRecord.promisedDate}`;
      await dbStore.saveCase(matchedCase);

      await dbStore.logCommunication({
        id: `comm_wa_in_${Date.now()}`,
        caseId: matchedCase.id,
        customerId: matchedCase.customerId,
        channel: 'whatsapp',
        direction: 'INBOUND',
        recipient: 'RecoverAI Bot',
        messageText: body,
        status: 'RESPONDED',
        metadata: { messageSid, parsed, promiseRecord }
      });

      await dbStore.logAudit({
        caseId: matchedCase.id,
        merchantId: matchedCase.merchantId,
        eventType: 'WHATSAPP_PROMISE_CAPTURED',
        action: 'whatsapp_reply',
        actor: 'CUSTOMER',
        description: `Customer replied on WhatsApp: "${body}". Commitment logged for ${promiseRecord.promisedDate}.`,
        metadata: { messageSid, parsed, promiseRecord }
      });
    }
  } else if (parsed.intent === 'cancel_subscription') {
    replyText = `Namaste ${customerName} ji. Humne aapka cancellation request note kar liya hai aur humari team aapse further sampark nahi karegi. Dhanyawaad!`;

    if (matchedCase) {
      matchedCase.status = 'STOPPED';
      matchedCase.stopReason = 'Customer requested cancellation via WhatsApp';
      await dbStore.saveCase(matchedCase);
    }
  } else {
    const linkText = matchedCase?.recoveryLinkUrl ? `\n\nAap apna payment yahan se complete kar sakte hain: ${matchedCase.recoveryLinkUrl}` : '';
    replyText = `Namaste ${customerName} ji! 🙏\n\nHumne aapka message receive kar liya hai.${linkText}\n\nAgar aap kisi specific date par pay karna chahte hain, to bas date reply kar dein. Dhanyawaad!`;
  }

  // Build Twilio Messaging TwiML XML
  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();
  twiml.message(replyText);

  return {
    twiml: twiml.toString(),
    parsed,
    promiseRecord,
    replyText
  };
}

export default {
  getWhatsAppConfig,
  getTwilioClient,
  isWhatsAppConfigured,
  formatWhatsAppNumber,
  sendOutboundWhatsApp,
  handleIncomingWhatsApp
};
