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

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.error("❌ SMTP credentials not configured");
      isInitializing = false;
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
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    // Don't await verification - let it happen in background
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

// ✅ FIX: Don't throw errors - return failure object
exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!to) {
      logger.warn("⚠️ No email recipient provided");
      return { success: false, message: "No email recipient" };
    }

    logger.info(`📧 Sending email to: ${to}`);

    const transporter = initializeTransporter();

    if (!transporter) {
      logger.error("❌ Email transporter not initialized");
      return { success: false, message: "Transporter not initialized" };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || `"IntimaCare" <${process.env.SMTP_USER}>`,
      to,
      subject: subject || "IntimaCare Notification",
      html: html || text || "Thank you for your order.",
      text: text || "Thank you for your order.",
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Email sent successfully to: ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // ✅ DON'T THROW - just log and return failure
    logger.error(`❌ Email send error to ${to}:`, error.message);
    return { success: false, message: error.message };
  }
};
