// test-webhook.js
const crypto = require("crypto");

const webhookSecret = "intimacare@2026";
const body = JSON.stringify({
  api_ref: "WN323288361331", // Replace with your actual order number
  invoice_id: "edbb3cea-0b66-44d7-95f1-52736863a18d",
  state: "COMPLETE",
  provider: "MPESA",
  value: 3000,
  currency: "KES",
  first_name: "Test",
  last_name: "User",
  email: "test@example.com",
});

const signature = crypto
  .createHmac("sha256", webhookSecret)
  .update(body)
  .digest("hex");

console.log("=== COPY THESE VALUES TO POSTMAN ===\n");
console.log("HEADER: X-IntaSend-Signature");
console.log("VALUE:", signature);
console.log("\nBODY (raw JSON):");
console.log(body);
console.log("\n=== END ===");
