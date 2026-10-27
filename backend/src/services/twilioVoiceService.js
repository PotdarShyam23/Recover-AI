import twilio from 'twilio';
import { dbStore } from '../db/store.js';
import { parseCustomerIntent } from './aiService.js';

/**
 * Twilio Voice Service (Free & Trial Account Compatible)
 * -----------------------------------------------------
 * Twilio Free Trial accounts strictly enforce parameter restrictions:
 * - "Invalid or disallowed parameters provided - trial accounts have limited parameter access"
 *
 * RESTRICTED PARAMETERS COMMENTED OUT FOR FREE TRIAL:
 * 1. Voice Synthesis (TTS):
 *    - `voice: 'Polly.*'` (Amazon Polly voices are paid third-party add-ons, restricted on trial)
 *    - `voice: 'alice'` (Deprecated by Twilio; auto-maps to Polly.Aditi for Indian locales, triggering trial restriction)
 *    - `language: 'hi-IN'` (Specifying neural speech languages without Polly add-on triggers parameter error)
 *    -> Solution: Plain standard `<Say>...</Say>` using Twilio's standard built-in voice.
 *
 * 2. Input & Speech Recognition:
 *    - `input: 'speech'` or `input: 'dtmf speech'` (Speech recognition / ASR has limited access on free trial)
 *    - `language: 'hi-IN'` in `<Gather>` (Speech language model requires full ASR access)
 *    - `speechTimeout: 'auto'` (Automated silence detection is an advanced speech parameter)
 *    - `speechModel: 'default'` (Speech model selection is restricted on trial)
 *    -> Solution: Dual-friendly `input: 'dtmf'` (Keypad press 1 or 2 is 100% free and universally supported).
 *
 * 3. Call Creation API Payload (`client.calls.create`):
 *    - `statusCallbackEvent` (Granular call lifecycle webhooks are disallowed on free trial)
 *    - `record` / `recordingChannels` (Call recording is restricted on free trial accounts)
 *    - `machineDetection` / `asyncAmd` (Answering Machine Detection is a premium paid feature)
 *    - `callerId` (Caller ID spoofing is disallowed; must match assigned Twilio trial number)
 *    - `sipAuthUsername` / `sipAuthPassword` (SIP trunking disallowed on trial)
 *    -> Solution: Core minimal payload strictly with `to`, `from`, and `twiml`.
 */

/**
 * Dynamically resolves Twilio configuration from environment variables
 */
export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const serverPublicUrl = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');

  const isConfigured = Boolean(
    accountSid &&
    authToken &&
    twilioPhoneNumber &&
    !accountSid.includes('XXXX') &&
    !accountSid.includes('YOUR_') &&
    !authToken.includes('your_') &&
    !twilioPhoneNumber.includes('XXXX')
  );

  return {
    accountSid,
    authToken,
    twilioPhoneNumber,
    serverPublicUrl,
    isConfigured
  };
}

/**
 * Returns an initialized Twilio REST Client, or null if unconfigured
 */
export function getTwilioClient() {
  const config = getTwilioConfig();
  if (!config.isConfigured) return null;

  try {
    return twilio(config.accountSid, config.authToken);
  } catch (err) {
    console.warn('[TwilioVoice] Error initializing Twilio client:', err.message);
    return null;
  }
}

/**
 * Checks if Twilio voice calling is configured
 */
export function isTwilioVoiceConfigured() {
  return getTwilioConfig().isConfigured;
}

/**
 * Cleans and formats phone numbers to standard E.164 (defaulting to +91 for 10-digit Indian numbers)
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * 1. OUTBOUND CALL: Initiates an outbound phone call using standard free Twilio parameters
 */
export async function makeOutboundVoiceCall({
  to,
  customerName = 'Customer',
  merchantName = 'SaaSify India',
  amount = 0,
  currency = 'INR',
  caseId = null,
  callbackUrl = null
}) {
  const config = getTwilioConfig();
  const formattedNumber = formatPhoneNumber(to);

  // Fallback when Twilio credentials are not yet added
  if (!config.isConfigured) {
    console.warn('[TwilioVoice] Twilio credentials missing in .env. Falling back to simulation mode.');
    return {
      success: false,
      mode: 'simulated',
      message: 'Twilio credentials not configured in .env. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.',
      to: formattedNumber,
      customerName,
      amount
    };
  }

  const client = getTwilioClient();
  if (!client) {
    return {
      success: false,
      mode: 'error',
      message: 'Failed to initialize Twilio client with current credentials.',
      to: formattedNumber
    };
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Natural Indian English & Hinglish opening
  const currencySymbol = currency === 'INR' ? '₹' : currency;
  const greeting = `Namaste ${customerName} ji! Main ${merchantName} recovery support se bol raha hoon. Aapka ${currencySymbol} ${amount} ka payment complete nahi ho paya tha. Agar aap Friday ko salary aane par pay karna chahte hain to 1 dabayein ya Friday bolein. Agar aap abhi WhatsApp link chahte hain to 2 dabayein.`;

  // Determine public webhook URL for DTMF keypad recognition
  const publicBase = callbackUrl || config.serverPublicUrl;
  const hasWebhook = Boolean(publicBase && !publicBase.includes('localhost'));

  if (hasWebhook) {
    const gatherUrl = `${publicBase}/api/twilio/voice/gather?caseId=${encodeURIComponent(caseId || '')}&customerName=${encodeURIComponent(customerName)}&amount=${encodeURIComponent(amount)}`;
    
    // -----------------------------------------------------------------------------------
    // <Gather> configuration:
    // RESTRICTED TRIAL PARAMETERS COMMENTED OUT:
    // - input: 'speech' or 'dtmf speech' (Speech recognition / ASR is restricted on trial)
    // - language: 'hi-IN' (Speech language models trigger disallowed parameter errors on trial)
    // - speechTimeout: 'auto' (Restricted on free trial)
    // - speechModel: 'default' (Restricted on free trial)
    // ALLOWED FREE TRIAL PARAMETER: input: 'dtmf' (Keypad 0-9 entry is 100% free)
    // -----------------------------------------------------------------------------------
    const gather = twiml.gather({
      input: 'dtmf',
      // input: 'dtmf speech', // RESTRICTED ON FREE TRIAL: ASR speech recognition restricted on trial tier
      // language: 'hi-IN',   // RESTRICTED ON FREE TRIAL: Speech language models restricted on trial tier
      // speechTimeout: 'auto', // RESTRICTED ON FREE TRIAL: Speech timeout requires paid account
      // speechModel: 'default', // RESTRICTED ON FREE TRIAL: Speech model requires paid account
      action: gatherUrl,
      method: 'POST',
      timeout: 5,
      numDigits: 1
    });

    // -----------------------------------------------------------------------------------
    // <Say> configuration:
    // RESTRICTED TRIAL PARAMETERS COMMENTED OUT:
    // - voice: 'Polly.Aditi' (Paid Amazon Polly add-on, restricted on trial)
    // - voice: 'alice' (Deprecated by Twilio, auto-maps to Polly for hi-IN/en-IN)
    // - language: 'hi-IN' (Forces neural TTS which triggers trial parameter error)
    // ALLOWED FREE TRIAL PARAMETER: Standard default <Say> without voice/language overrides
    // -----------------------------------------------------------------------------------
    gather.say(
      // {
      //   voice: 'Polly.Aditi', // RESTRICTED ON FREE TRIAL: Amazon Polly add-on required
      //   voice: 'alice',       // RESTRICTED ON FREE TRIAL: Maps to Polly.Aditi for Indian locales
      //   language: 'hi-IN'     // RESTRICTED ON FREE TRIAL: Neural language mapping triggers trial error
      // },
      greeting
    );

    // If customer doesn't respond
    twiml.say(
      // {
      //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
      //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
      // },
      'Humne aapka response nahi suna. Payment recovery link aapke WhatsApp par share kar rahe hain. Shukriya!'
    );
    twiml.hangup();
  } else {
    // Direct announcement mode (if no public ngrok/domain is configured yet)
    twiml.say(
      // {
      //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
      //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
      // },
      greeting
    );
    twiml.pause({ length: 2 });
    twiml.say(
      // {
      //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
      //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
      // },
      'Aapke number par payment recovery link WhatsApp bhej diya gaya hai. Thank you and have a nice day!'
    );
    twiml.hangup();
  }

  try {
    console.log(`[TwilioVoice] 📞 Placing live outbound call to: ${formattedNumber} from: ${config.twilioPhoneNumber}`);

    // -----------------------------------------------------------------------------------
    // Core parameters accepted on free trial accounts:
    // RESTRICTED CALL CREATION PARAMETERS COMMENTED OUT FOR FREE TRIAL:
    // - statusCallbackEvent: Granular call lifecycle events (initiated, ringing, answered)
    // - record: Call recording requires funded account balance
    // - recordingChannels: Dual-channel recording is a paid feature
    // - machineDetection: Answering Machine Detection (AMD) is a paid add-on
    // - asyncAmd: Asynchronous AMD is restricted on trial accounts
    // - callerId: Custom caller ID spoofing is disallowed on trial (must use assigned number)
    // - sipAuthUsername / sipAuthPassword: SIP trunking is disabled on trial
    // -----------------------------------------------------------------------------------
    const callPayload = {
      to: formattedNumber,
      from: config.twilioPhoneNumber,
      twiml: twiml.toString(),
      // statusCallback: `${publicBase}/api/twilio/voice/status`, // RESTRICTED ON TRIAL: Custom webhook callbacks can be blocked
      // statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'], // RESTRICTED ON TRIAL: Granular call events trigger parameter error
      // statusCallbackMethod: 'POST', // RESTRICTED ON TRIAL
      // record: true, // RESTRICTED ON TRIAL: Call recording is restricted on free trial accounts
      // recordingChannels: 'dual', // RESTRICTED ON TRIAL: Dual recording requires paid account
      // machineDetection: 'Enable', // RESTRICTED ON TRIAL: Answering Machine Detection is a paid feature
      // asyncAmd: 'true', // RESTRICTED ON TRIAL: Async AMD is restricted on free trial
      // callerId: '+919999999999', // RESTRICTED ON TRIAL: Caller ID override disallowed on trial
      // sendDigits: '1234', // RESTRICTED ON TRIAL: Automated post-connect DTMF disallowed on trial
      // sipAuthUsername: 'user', // RESTRICTED ON TRIAL: SIP trunk authentication disabled on trial
      // trim: 'trim-silence' // RESTRICTED ON TRIAL: Audio trimming restricted on trial
    };

    const call = await client.calls.create(callPayload);

    console.log(`[TwilioVoice] ✅ Outbound call initiated successfully! Call SID: ${call.sid}`);

    return {
      success: true,
      mode: 'live_twilio',
      callSid: call.sid,
      status: call.status,
      to: formattedNumber,
      from: config.twilioPhoneNumber
    };
  } catch (err) {
    console.error('[TwilioVoice] ❌ Error making Twilio voice call:', err.message);

    let friendlyError = err.message;
    if (err.message?.includes('unverified') || err.message?.includes('21216') || err.message?.includes('21608') || err.code === 21216) {
      friendlyError = `Twilio Free Trial Notice: The phone number (${formattedNumber}) must be verified first in your Twilio Console -> Phone Numbers -> Manage -> Verified Caller IDs before Twilio allows placing calls to it.`;
    }

    return {
      success: false,
      mode: 'error',
      error: friendlyError,
      rawError: err.message,
      to: formattedNumber
    };
  }
}

/**
 * 2. INCOMING CALL: Generates standard free TwiML when a customer calls the Twilio number
 */
export async function buildIncomingCallTwiml({ fromNumber, serverPublicUrl = null }) {
  const config = getTwilioConfig();
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const formattedFrom = formatPhoneNumber(fromNumber);

  // Look up customer and active recovery case in database
  let customerName = 'ji';
  let pendingAmount = 0;
  let caseId = null;

  try {
    const allCustomers = await dbStore.getAllCustomers();
    const customer = allCustomers.find(c => {
      const cPhone = formatPhoneNumber(c.phone);
      return cPhone && formattedFrom && (cPhone === formattedFrom || cPhone.slice(-10) === formattedFrom.slice(-10));
    });

    if (customer) {
      customerName = customer.name || 'ji';
      const allCases = await dbStore.getAllCases();
      const activeCase = allCases.find(c => c.customerId === customer.id && c.status !== 'RECOVERED');
      if (activeCase) {
        caseId = activeCase.id;
        pendingAmount = activeCase.amount;
      }
    }
  } catch (err) {
    console.warn('[TwilioVoice] Lookup error on incoming call:', err.message);
  }

  const merchant = (await dbStore.getMerchant()) || { name: 'RecoverAI Support' };

  let greeting = '';
  if (pendingAmount > 0) {
    greeting = `Namaste ${customerName}! ${merchant.name} payment support me aapka swaagat hai. Aapka ₹${pendingAmount} ka payment pending hai. Agar aap Friday ko schedule karna chahte hain to 1 dabayein ya Friday bolein, ya WhatsApp link ke liye 2 dabayein.`;
  } else {
    greeting = `Namaste! ${merchant.name} payment support me aapka swaagat hai. Kripya batayein hum aapki kya sahayata kar sakte hain?`;
  }

  const publicBase = serverPublicUrl || config.serverPublicUrl;
  const gatherUrl = `${publicBase}/api/twilio/voice/gather?caseId=${encodeURIComponent(caseId || '')}&from=${encodeURIComponent(formattedFrom)}&inbound=true`;

  // -----------------------------------------------------------------------------------
  // Inbound <Gather> configuration (Free Trial Safe: DTMF Keypad 1 or 2):
  // RESTRICTED TRIAL PARAMETERS COMMENTED OUT:
  // - input: 'speech' (Restricted on free trial)
  // - language: 'hi-IN' (Speech model restricted on free trial)
  // -----------------------------------------------------------------------------------
  const gather = twiml.gather({
    input: 'dtmf',
    // input: 'dtmf speech', // RESTRICTED ON FREE TRIAL: Speech recognition requires paid account
    // language: 'hi-IN',   // RESTRICTED ON FREE TRIAL: Speech language models restricted on trial tier
    // speechTimeout: 'auto', // RESTRICTED ON FREE TRIAL
    // speechModel: 'default', // RESTRICTED ON FREE TRIAL
    action: gatherUrl,
    method: 'POST',
    timeout: 5,
    numDigits: 1
  });

  gather.say(
    // {
    //   voice: 'Polly.Aditi', // RESTRICTED ON FREE TRIAL: Amazon Polly add-on required
    //   voice: 'alice',       // RESTRICTED ON FREE TRIAL: Maps to Polly.Aditi for Indian locales
    //   language: 'hi-IN'     // RESTRICTED ON FREE TRIAL
    // },
    greeting
  );

  // Fallback if no input detected
  twiml.say(
    // {
    //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
    //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
    // },
    'Humne aapka response nahi suna. Kripya hamare WhatsApp support par sampark karein. Dhanyawaad!'
  );
  twiml.hangup();

  return twiml.toString();
}

/**
 * 3. GATHER HANDLER: Processes keypad (DTMF) or speech results from customer
 */
export async function handleSpeechGather({ speechResult, digits, callSid, fromNumber, caseId = null, customerName = 'Customer', amount = 0 }) {
  console.log(`[TwilioVoice] 🎙️ Gather received (Digits: "${digits}", Speech: "${speechResult}") from ${fromNumber || callSid}`);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // If user pressed '1' (schedule Friday) or '2' (WhatsApp link), or spoke
  let effectiveText = speechResult;
  if (!effectiveText || effectiveText.trim().length === 0) {
    if (digits === '1') {
      effectiveText = 'Friday ko salary aayegi tab kar dunga';
    } else if (digits === '2') {
      effectiveText = 'WhatsApp par payment link bhej do';
    }
  }

  if (!effectiveText || effectiveText.trim().length === 0) {
    twiml.say(
      // {
      //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
      //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
      // },
      'Humne aapki awaaz nahi suni. Payment link aapke WhatsApp par share kiya ja raha hai. Shukriya!'
    );
    twiml.hangup();
    return { twiml: twiml.toString(), intent: 'unknown' };
  }

  // Run AI Intent & Promise Parser on the input
  const parsed = await parseCustomerIntent(effectiveText);

  let replyText = '';
  let promiseRecord = null;

  // Resolve caseRecord if caseId was passed or look up by phone
  let caseRecord = null;
  if (caseId) {
    caseRecord = await dbStore.getCaseById(caseId);
  }
  if (!caseRecord && fromNumber) {
    const formatted = formatPhoneNumber(fromNumber);
    const allCustomers = await dbStore.getAllCustomers();
    const cust = allCustomers.find(c => formatPhoneNumber(c.phone) === formatted);
    if (cust) {
      const allCases = await dbStore.getAllCases();
      caseRecord = allCases.find(c => c.customerId === cust.id && c.status !== 'RECOVERED');
    }
  }

  if (parsed.intent === 'promise_to_pay') {
    const promisedDate = parsed.promisedDate || 'convenient date';
    replyText = `Dhanyawaad ${customerName} ji! Humne aapka commitment note kar liya hai ki aap ${promisedDate} ko payment karenge. Payment recovery link aapke WhatsApp par bhej diya gaya hai. Thank you!`;

    // Save promise record
    if (caseRecord) {
      promiseRecord = {
        id: `prom_tw_${Date.now()}`,
        caseId: caseRecord.id,
        customerId: caseRecord.customerId,
        promisedDate: parsed.promisedDate || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        confidence: parsed.confidence || 0.92,
        status: 'PENDING',
        sourceChannel: 'voice',
        sourceText: effectiveText,
        extractedIntent: 'promise_to_pay'
      };

      await dbStore.savePromise(promiseRecord);

      caseRecord.status = 'PROMISE_PENDING';
      caseRecord.strategyReason = `Customer committed via live Twilio call to pay on ${promiseRecord.promisedDate}`;
      caseRecord.voiceAttempts = (caseRecord.voiceAttempts || 0) + 1;
      await dbStore.saveCase(caseRecord);

      await dbStore.logCommunication({
        id: `comm_tw_${Date.now()}`,
        caseId: caseRecord.id,
        customerId: caseRecord.customerId,
        channel: 'voice',
        direction: 'INBOUND',
        recipient: fromNumber || caseRecord.customerId,
        messageText: effectiveText,
        status: 'COMPLETED',
        metadata: { callSid, effectiveText, parsed, promiseRecord }
      });

      await dbStore.logAudit({
        caseId: caseRecord.id,
        merchantId: caseRecord.merchantId,
        eventType: 'TWILIO_VOICE_PROMISE_CAPTURED',
        action: 'voice_gather',
        actor: 'AI_VOICE_AGENT',
        description: `Customer committed on Twilio call: "${effectiveText}". Promise recorded for ${promiseRecord.promisedDate}.`,
        metadata: { callSid, effectiveText, parsed, promiseRecord }
      });
    }
  } else if (parsed.intent === 'cancel_subscription') {
    replyText = `Hum samajh sakte hain. Humne aapka feedback note kar liya hai aur aapse further sampark nahi karegi team. Dhanyawaad!`;

    if (caseRecord) {
      caseRecord.status = 'STOPPED';
      caseRecord.stopReason = 'Customer verbally requested cancellation during voice call';
      await dbStore.saveCase(caseRecord);
    }
  } else {
    replyText = `Shukriya! Humne aapka response note kar liya hai. Hum payment recovery details aapke WhatsApp par bhej rahe hain. Thank you!`;
  }

  twiml.say(
    // {
    //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
    //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
    // },
    replyText
  );

  twiml.hangup();

  return {
    twiml: twiml.toString(),
    parsed,
    promiseRecord,
    replyText
  };
}

/**
 * 4. Build standard follow-up TwiML
 */
export function buildFollowUpTwiml({ speechResult, customerName = 'Customer', customReply = null }) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const replyText = customReply ||
    `Dhanyawaad ${customerName} ji! Humne aapka response note kar liya hai. Payment link aapke WhatsApp par bhej diya gaya hai. Have a great day!`;

  twiml.say(
    // {
    //   voice: 'alice',   // RESTRICTED ON FREE TRIAL
    //   language: 'hi-IN' // RESTRICTED ON FREE TRIAL
    // },
    replyText
  );

  twiml.hangup();

  return twiml.toString();
}

export default {
  getTwilioConfig,
  getTwilioClient,
  isTwilioVoiceConfigured,
  formatPhoneNumber,
  makeOutboundVoiceCall,
  buildIncomingCallTwiml,
  handleSpeechGather,
  buildFollowUpTwiml
};
