const nodemailer = require("nodemailer");
require("dotenv").config();

async function testEmail() {
  try {
    console.log("📧 Testing Resend SMTP...");

    const transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465, // Use 465 for SSL/TLS
      secure: true, // Must be true for port 465
      auth: {
        user: "resend", // Always use "resend" as the username
        pass: process.env.SMTP_PASS, // Your new API key
      },
    });

    // Verify connection
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!");

    // Send test email
    const info = await transporter.sendMail({
      from: "onboarding@resend.dev", // Use this if you haven't verified a domain yet
      to: "ibrahimmulei@gmail.com",
      subject: "✅ Test Email from IntimaCare",
      html: `
        <h1>Test Email</h1>
        <p>If you're seeing this, Resend SMTP is working correctly!</p>
        <p>Sent at: ${new Date().toLocaleString()}</p>
      `,
    });

    console.log("✅ Email sent successfully!");
    console.log("✅ Message ID:", info.messageId);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testEmail();
