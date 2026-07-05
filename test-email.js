const nodemailer = require("nodemailer");
require("dotenv").config();

async function testEmail() {
  try {
    console.log("📧 Testing Gmail SMTP...");
    console.log("📧 Email:", process.env.SMTP_USER);
    console.log("📧 Password length:", process.env.SMTP_PASS?.length);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Verify connection
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!");

    // Send test email
    const info = await transporter.sendMail({
      from: `"IntimaCare Test" <${process.env.SMTP_USER}>`,
      to: "ibrahimmulei@gmail.com", // Your email
      subject: "✅ Test Email from IntimaCare",
      html: `
        <h1>Test Email</h1>
        <p>If you're seeing this, Gmail SMTP is working correctly!</p>
        <p>Sent at: ${new Date().toLocaleString()}</p>
      `,
    });

    console.log("✅ Email sent successfully!");
    console.log("✅ Message ID:", info.messageId);
    console.log("✅ Check your inbox!");
  } catch (error) {
    console.error("❌ Error:", error);
    console.error("❌ Error details:", error.message);
  }
}

testEmail();
