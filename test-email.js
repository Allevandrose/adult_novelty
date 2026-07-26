const { Resend } = require("resend");
require("dotenv").config();

// Initialize Resend with your API key from .env
const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  try {
    console.log("📧 Testing Resend API...");

    // Send test email using Resend's native HTTP fetch method
    const data = await resend.emails.send({
      from:
        process.env.MAIL_FROM ||
        "IntimaCare Support <support@intimacare.co.ke>",
      to: ["ibrahimmulei@gmail.com"],
      subject: "✅ Test Email from IntimaCare",
      html: `
        <h1>Test Email</h1>
        <p>If you're seeing this, Resend API with your custom domain is working correctly!</p>
        <p>Sent at: ${new Date().toLocaleString()}</p>
      `,
    });

    console.log("✅ Email sent successfully via Resend API!");
    console.log("✅ Message ID:", data.id);
  } catch (error) {
    console.error("❌ Error sending test email:", error.message);
  }
}

testEmail();
