// services/emailService.js

const { Resend } = require("resend");
const logger = require("../utils/logger");

// Initialize Resend client using your API key environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

// Base email sending function
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

/**
 * ✅ NEW: Send payment confirmation email
 */
exports.sendPaymentConfirmationEmail = async (order) => {
  try {
    const userEmail = order.user?.email;
    if (!userEmail) {
      logger.warn(`⚠️ No email found for order ${order.orderNumber}`);
      return { success: false, message: "No email found" };
    }

    const itemsList = order.items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E6DFD1;">${item.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E6DFD1; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E6DFD1; text-align: right;">Ksh ${item.price.toLocaleString()}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E6DFD1; text-align: right;">Ksh ${(item.price * item.quantity).toLocaleString()}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; background-color: #F7F3EA; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; padding: 40px 30px; border-radius: 4px; border: 1px solid #E6DFD1; }
          .header { text-align: center; border-bottom: 2px solid #B08D4F; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { font-family: 'Fraunces', serif; color: #14120F; font-size: 28px; margin: 0; }
          .header p { color: #8C7B6B; margin: 5px 0 0; font-size: 14px; }
          .order-number { background: #FBF9F4; padding: 12px 20px; border-radius: 4px; text-align: center; margin-bottom: 25px; border: 1px solid #E6DFD1; }
          .order-number span { font-weight: 600; color: #B08D4F; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
          table th { background-color: #14120F; color: #F7F3EA; padding: 10px 12px; text-align: left; font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
          .total-row { background-color: #FBF9F4; font-weight: 600; }
          .total-row td { padding: 12px; border-top: 2px solid #B08D4F; }
          .status-badge { display: inline-block; background-color: #1F3D33; color: #FFFFFF; padding: 4px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
          .footer { text-align: center; padding-top: 25px; border-top: 1px solid #E6DFD1; margin-top: 30px; color: #8C7B6B; font-size: 13px; }
          .footer a { color: #B08D4F; text-decoration: none; }
          .shipping-info { background: #FBF9F4; padding: 15px 20px; border-radius: 4px; margin: 15px 0; border: 1px solid #E6DFD1; font-size: 14px; }
          .shipping-info strong { color: #14120F; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ Payment Confirmed!</h1>
            <p>Thank you for your order at IntimaCare</p>
          </div>

          <div class="order-number">
            Order #<span>${order.orderNumber}</span>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span class="status-badge">✅ Paid</span>
          </div>

          <p style="color: #14120F; font-size: 15px; margin-bottom: 10px;">
            Your payment has been successfully processed. We're now preparing your order for shipping.
          </p>

          <h3 style="font-family: 'Fraunces', serif; color: #14120F; margin: 25px 0 15px;">Order Summary</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
              <tr>
                <td colspan="3" style="padding: 10px 12px; text-align: right; font-weight: 500;">Subtotal</td>
                <td style="padding: 10px 12px; text-align: right;">Ksh ${order.subtotal?.toLocaleString() || "0"}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 8px 12px; text-align: right; font-weight: 500;">Shipping</td>
                <td style="padding: 8px 12px; text-align: right;">${order.shippingCost === 0 ? "Free" : "Ksh " + order.shippingCost?.toLocaleString()}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="text-align: right; font-size: 16px;">Total</td>
                <td style="text-align: right; font-size: 18px; color: #B08D4F; font-weight: 600;">Ksh ${order.totalAmount?.toLocaleString() || "0"}</td>
              </tr>
            </tbody>
          </table>

          <div class="shipping-info">
            <strong>📦 Shipping Address</strong><br>
            ${order.shippingAddress?.street || ""}<br>
            ${order.shippingAddress?.city || ""} ${order.shippingAddress?.county || ""}<br>
            Phone: ${order.shippingAddress?.phone || "N/A"}
          </div>

          <p style="font-size: 14px; color: #5C5348; margin: 20px 0;">
            You will receive a shipping confirmation email once your order is dispatched.
          </p>

          <div style="background: #FBF9F4; border-radius: 4px; padding: 15px 20px; margin: 20px 0; border-left: 3px solid #B08D4F;">
            <p style="margin: 0; font-size: 13px; color: #5C5348;">
              <strong>💚 Need help?</strong> Contact us at <a href="mailto:support@intimacare.co.ke">support@intimacare.co.ke</a>
            </p>
          </div>

          <div class="footer">
            <p>© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
            <p style="font-size: 12px; color: #B7AC98;">
              This is a transactional email regarding your recent purchase.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Payment Confirmed! Order #${order.orderNumber}

      Thank you for your order at IntimaCare.

      Your payment has been successfully processed.

      Order Summary:
      ${order.items.map((item) => `${item.name} x ${item.quantity} - Ksh ${(item.price * item.quantity).toLocaleString()}`).join("\n")}

      Subtotal: Ksh ${order.subtotal?.toLocaleString() || "0"}
      Shipping: ${order.shippingCost === 0 ? "Free" : "Ksh " + order.shippingCost?.toLocaleString()}
      Total: Ksh ${order.totalAmount?.toLocaleString() || "0"}

      Shipping Address:
      ${order.shippingAddress?.street || ""}
      ${order.shippingAddress?.city || ""} ${order.shippingAddress?.county || ""}
      Phone: ${order.shippingAddress?.phone || "N/A"}

      Thank you for shopping with IntimaCare!

      Need help? Contact us at support@intimacare.co.ke
    `;

    const result = await this.sendEmail({
      to: userEmail,
      subject: `✅ Payment Confirmed - Order #${order.orderNumber}`,
      html,
      text,
    });

    logger.info(`📧 Payment confirmation email sent to ${userEmail}`);
    return result;
  } catch (error) {
    logger.error("❌ Payment confirmation email error:", error);
    return { success: false, message: error.message };
  }
};

/**
 * ✅ NEW: Send payment failed email
 */
exports.sendPaymentFailedEmail = async (order, reason) => {
  try {
    const userEmail = order.user?.email;
    if (!userEmail) {
      logger.warn(`⚠️ No email found for order ${order.orderNumber}`);
      return { success: false, message: "No email found" };
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; background-color: #F7F3EA; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; padding: 40px 30px; border-radius: 4px; border: 1px solid #E6DFD1; }
          .header { text-align: center; border-bottom: 2px solid #8C4B3A; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { font-family: 'Fraunces', serif; color: #8C4B3A; font-size: 28px; margin: 0; }
          .footer { text-align: center; padding-top: 25px; border-top: 1px solid #E6DFD1; margin-top: 30px; color: #8C7B6B; font-size: 13px; }
          .button { display: inline-block; background: #14120F; color: #F7F3EA; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 14px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Payment Failed</h1>
          </div>

          <p style="color: #14120F; font-size: 15px;">
            We were unable to process the payment for your order #${order.orderNumber}.
          </p>

          <p style="color: #5C5348; font-size: 14px;">
            Reason: ${reason || "Payment processing failed"}
          </p>

          <p style="color: #5C5348; font-size: 14px;">
            Please try again or contact support if you need assistance.
          </p>

          <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/orders" class="button">
            Try Again
          </a>

          <div class="footer">
            <p>© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await this.sendEmail({
      to: userEmail,
      subject: `❌ Payment Failed - Order #${order.orderNumber}`,
      html,
      text: `Payment failed for order ${order.orderNumber}. Reason: ${reason || "Payment processing failed"}`,
    });

    logger.info(`📧 Payment failed email sent to ${userEmail}`);
    return result;
  } catch (error) {
    logger.error("❌ Payment failed email error:", error);
    return { success: false, message: error.message };
  }
};
