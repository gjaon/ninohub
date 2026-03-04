const axios = require("axios");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is required for marketplace checkout");
  }
  return secret;
};

const mapPaystackError = (error, phase) => {
  const status = error?.response?.status;
  const payload = error?.response?.data;
  const providerMessage =
    payload?.message || payload?.error || error?.message || "Paystack request failed";

  console.error(`[paystack:${phase}] request failed`, {
    status,
    message: providerMessage,
    payload,
  });

  const mappedError = new Error(providerMessage);
  mappedError.statusCode = status && status >= 400 ? status : 502;
  mappedError.details = payload || null;
  return mappedError;
};

const initializeRedirectTransaction = async ({ amount, email, metadata }) => {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Invalid payment amount for Paystack initialization");
  }

  const amountInKobo = Math.round(normalizedAmount * 100);
  if (amountInKobo < 100) {
    throw new Error("Amount is too low to process payment");
  }

  if (!email) {
    throw new Error("Customer email is required for Paystack initialization");
  }

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        amount: amountInKobo,
        email,
        metadata,
        callback_url: process.env.MARKETPLACE_CHECKOUT_RETURN_URL || undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${getSecret()}`,
        },
      }
    );

    return response.data?.data;
  } catch (error) {
    throw mapPaystackError(error, "initialize");
  }
};

const verifyTransaction = async (reference) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${getSecret()}`,
        },
      }
    );

    return response.data?.data;
  } catch (error) {
    throw mapPaystackError(error, "verify");
  }
};

module.exports = {
  initializeRedirectTransaction,
  verifyTransaction,
};
