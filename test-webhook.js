// test-webhook.js
const crypto = require("crypto");
require("dotenv").config();

const secret = process.env.INTASEND_WEBHOOK_SECRET;
const payload = JSON.stringify({
  api_ref: "YOUR_ORDER_NUMBER_HERE",
  state: "COMPLETE",
  invoice_id: "INVOICE_123",
  event_id: "EVENT_456",
});

const signature = crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("hex");

console.log("--- USE THIS FOR TESTING ---");
console.log("Header: X-IntaSend-Signature:", signature);
console.log("Payload:", payload);
