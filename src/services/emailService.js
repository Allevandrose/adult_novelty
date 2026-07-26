const { Resend } = require("resend");
const logger = require("../utils/logger");

// Initialize Resend client using your API key environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!to) return { success: false, message: "No email recipient" };

    logger.info(`📧 Sending email to ${to} via Resend API...`);

    const data = await resend.emails.send({
      from:
        process.env.MAIL_FROM ||
        "IntimaCare Support <support@intimacare.co.ke>",
      to: [to],
      subject: subject || "Notification",
      html: html || text,
      text: text,
    });

    logger.info(`✅ Email sent successfully! Message ID: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    logger.error(`❌ Email send error to ${to}:`, error.message);
    return { success: false, message: error.message };
  }
};
