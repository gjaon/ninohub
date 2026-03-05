const axios = require("axios");

const sendEmailViaResend = async ({ to, subject, html }) => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();

  if (!apiKey || !from) {
    const error = new Error("Resend is not configured");
    error.status = 500;
    throw error;
  }

  const response = await axios.post(
    "https://api.resend.com/emails",
    {
      from,
      to: [to],
      subject,
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return {
    provider: "resend",
    providerMessageId: response?.data?.id || null,
    raw: response.data,
  };
};

const sendSmsViaTermii = async ({ to, message }) => {
  const apiKey = String(process.env.TERMII_API_KEY || "").trim();
  const from = String(process.env.TERMII_SENDER_ID || "NINO").trim();
  const channel = String(process.env.TERMII_CHANNEL || "generic").trim();

  if (!apiKey) {
    const error = new Error("Termii is not configured");
    error.status = 500;
    throw error;
  }

  const response = await axios.post(
    "https://api.ng.termii.com/api/sms/send",
    {
      api_key: apiKey,
      to,
      from,
      sms: message,
      type: "plain",
      channel,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return {
    provider: "termii",
    providerMessageId: response?.data?.message_id || response?.data?.messageId || null,
    raw: response.data,
  };
};

module.exports = {
  sendEmailViaResend,
  sendSmsViaTermii,
};
