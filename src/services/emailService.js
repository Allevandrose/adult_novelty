const nodemailer = require('nodemailer');

// Email configuration
let transporter = null;

const initializeTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.log('📧 Email not configured. Would have sent:', { to, subject });
      // Log email content for development
      console.log('Email content:', html || text);
      return { success: true, message: 'Email would be sent (SMTP not configured)' };
    }

    const transporter = initializeTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || `"IntimaCare" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || 'Please view this email in an HTML-compatible email client.'
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error('Failed to send email');
  }
};
