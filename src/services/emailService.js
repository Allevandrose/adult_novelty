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
      // ✅ Add timeouts to prevent hanging
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    // Verify connection asynchronously
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

// ✅ FIXED: sendEmail with proper error handling
exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    // Skip if no email provided
    if (!to) {
      logger.warn("⚠️ No email recipient provided, skipping email");
      return { success: false, message: "No email recipient" };
    }

    logger.info(`📧 Sending email to: ${to}`);
    logger.debug(`📧 Subject: ${subject}`);

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
    logger.debug(`✅ Message ID: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    // ✅ Don't throw - return failure object instead
    logger.error(`❌ Email send error to ${to}:`, error.message);
    return { success: false, message: error.message };
  }
};
