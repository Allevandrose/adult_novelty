const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let transporter = null;

const initializeTransporter = () => {
  if (!transporter) {
    logger.info("📧 Initializing email transporter...");

    // ✅ FIX: Check for required env vars
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.error("❌ SMTP credentials not configured");
      return null;
    }

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // ✅ FIX: Only disable TLS verification in development
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });

    // Verify connection asynchronously
    transporter.verify((error, success) => {
      if (error) {
        logger.error("❌ Email transporter error:", error.message);
      } else {
        logger.info("✅ Email transporter ready");
      }
    });
  }
  return transporter;
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    logger.info(`📧 Sending email to: ${to}`);
    logger.debug(`📧 Subject: ${subject}`);

    const transporter = initializeTransporter();

    if (!transporter) {
      throw new Error("Email transporter not initialized");
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || `"IntimaCare" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html:
        html || text || "Please view this email in an HTML-compatible client.",
      text:
        text || "Please view this email in an HTML-compatible email client.",
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Email sent successfully to: ${to}`);
    logger.debug(`✅ Message ID: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`❌ Email send error to ${to}:`, error.message);
    throw error;
  }
};
