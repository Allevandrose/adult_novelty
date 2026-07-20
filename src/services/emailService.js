const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let transporter = null;
let isInitializing = false;

const initializeTransporter = () => {
  if (transporter) return transporter;
  if (isInitializing) return transporter;

  isInitializing = true;

  try {
    logger.info("📧 Initializing email transporter...");

    // Resend requires these specific settings
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.resend.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // Must be false for port 587
      auth: {
        user: process.env.SMTP_USER || "resend",
        pass: process.env.SMTP_PASS, // Your new API key
      },
      connectionTimeout: 10000,
    });

    transporter.verify((error, success) => {
      if (error) {
        logger.error("❌ Email transporter error:", error.message);
        transporter = null;
      } else {
        logger.info("✅ Email transporter ready");
      }
      isInitializing = false;
    });

    return transporter;
  } catch (error) {
    logger.error("❌ Email initialization error:", error.message);
    isInitializing = false;
    return null;
  }
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!to) return { success: false, message: "No email recipient" };

    const transporter = initializeTransporter();
    if (!transporter)
      return { success: false, message: "Transporter not initialized" };

    const mailOptions = {
      // Must use your verified Resend email address here
      from: process.env.SMTP_FROM || "onboarding@resend.dev",
      to,
      subject: subject || "Notification",
      html: html || text,
      text: text,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`❌ Email send error to ${to}:`, error.message);
    return { success: false, message: error.message };
  }
};
