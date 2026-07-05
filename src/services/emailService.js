// src/services/emailService.js
const nodemailer = require("nodemailer");

let transporter = null;

const initializeTransporter = () => {
  if (!transporter) {
    console.log("📧 Initializing email transporter...");
    console.log("📧 SMTP User:", process.env.SMTP_USER);
    console.log("📧 SMTP Password length:", process.env.SMTP_PASS?.length);
    console.log("📧 SMTP Host:", process.env.SMTP_HOST);
    console.log("📧 SMTP Port:", process.env.SMTP_PORT);

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    transporter.verify((error, success) => {
      if (error) {
        console.error("❌ Email transporter error:", error);
        console.error("❌ Error details:", error.message);
      } else {
        console.log("✅ Email transporter ready - Gmail connected");
      }
    });
  }
  return transporter;
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    console.log("📧 Sending email to:", to);
    console.log("📧 Subject:", subject);

    const transporter = initializeTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || `"IntimaCare" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || text,
      text:
        text || "Please view this email in an HTML-compatible email client.",
    };

    console.log("📧 Sending email with options:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log("✅ Message ID:", info.messageId);
    console.log("✅ Check your inbox at:", to);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email send error:", error);
    console.error("❌ Error details:", error.message);
    if (error.response) {
      console.error("❌ SMTP Response:", error.response);
    }
    throw error; // Don't wrap, throw the actual error
  }
};
