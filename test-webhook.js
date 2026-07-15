// 1. Load environment variables FIRST
require("dotenv").config();

const crypto = require("crypto");

// 2. Check if it actually loaded
const secret = process.env.INTASEND_WEBHOOK_SECRET;

if (!secret) {
  console.error("ERROR: INTASEND_WEBHOOK_SECRET is undefined.");
  console.error(
    "Make sure your .env file is in the root directory and contains this key.",
  );
  process.exit(1);
}

const payload = JSON.stringify({
  api_ref: "WN323288361331",
  state: "COMPLETE",
  invoice_id: "e8f253f6-c322-4116-b903-7d3072a355cf",
  event_id: "test_event_postman_001",
});

const signature = crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("hex");

console.log("--- USE THIS FOR TESTING ---");
console.log("Header X-IntaSend-Signature:", signature);
console.log("Payload:", payload);
