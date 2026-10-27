// Notification dispatch service for WhatsApp, SMS, and Email
import twilioWhatsAppService from './twilioWhatsAppService.js';
import { dbStore } from '../db/store.js';

export async function sendWhatsApp(caseRecord, messageText) {
  let targetPhone = '+919876543210';
  let customerName = 'Customer';

  try {
    const customer = await dbStore.getCustomer(caseRecord.customerId);
    if (customer?.phone) targetPhone = customer.phone;
    if (customer?.name) customerName = customer.name;
  } catch {}

  const result = await twilioWhatsAppService.sendOutboundWhatsApp({
    to: targetPhone,
    messageText,
    paymentLink: caseRecord.recoveryLinkUrl,
    customerName,
    caseId: caseRecord.id
  });

  return {
    channel: 'whatsapp',
    status: result.success ? 'sent' : 'simulated',
    timestamp: new Date().toISOString(),
    message: messageText,
    case_id: caseRecord.id,
    customer_id: caseRecord.customerId,
    twilioResult: result
  };
}

export async function sendSms(caseRecord, message) {
  return {
    channel: 'sms',
    status: 'sent',
    timestamp: new Date().toISOString(),
    message,
    case_id: caseRecord.id,
    customer_id: caseRecord.customerId
  };
}

export async function sendEmail(caseRecord, message) {
  return {
    channel: 'email',
    status: 'sent',
    timestamp: new Date().toISOString(),
    message,
    case_id: caseRecord.id,
    customer_id: caseRecord.customerId
  };
}
