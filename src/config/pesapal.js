const axios = require("axios");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");
const logger = require("../utils/logger");

// PesaPal environments
const PESAPAL_URLS = {
  sandbox: {
    auth: "https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken",
    submit:
      "https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest",
    status:
      "https://cybqa.pesapal.com/pesapalv3/api/Transactions/GetTransactionStatus",
    ipn: "https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN",
  },
  production: {
    auth: "https://pay.pesapal.com/v3/api/Auth/RequestToken",
    submit: "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest",
    status: "https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus",
    ipn: "https://pay.pesapal.com/v3/api/URLSetup/RegisterIPN",
  },
};

const getPesapalConfig = () => {
  const environment = process.env.PESAPAL_ENVIRONMENT || "sandbox";
  return {
    urls: PESAPAL_URLS[environment],
    consumerKey: process.env.PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
    ipnUrl: process.env.PESAPAL_IPN_URL,
  };
};

// OAuth 1.0a for PesaPal
const getOAuthInstance = () => {
  const config = getPesapalConfig();
  return OAuth({
    consumer: {
      key: config.consumerKey,
      secret: config.consumerSecret,
    },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha1", key)
        .update(base_string)
        .digest("base64");
    },
  });
};

module.exports = {
  getPesapalConfig,
  getOAuthInstance,
  PESAPAL_URLS,
};
