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
        (item, idx) =>
          `<tr>
            <td style="padding: 14px 12px; border-bottom: 1px solid #EDE7D9; font-family: 'Work Sans', Arial, sans-serif; font-size: 14px; color: #14120F; ${idx % 2 === 0 ? "background-color:#FFFFFF;" : "background-color:#FCFAF4;"}">${item.name}</td>
            <td style="padding: 14px 12px; border-bottom: 1px solid #EDE7D9; text-align: center; font-family: 'Work Sans', Arial, sans-serif; font-size: 14px; color: #5C5348; ${idx % 2 === 0 ? "background-color:#FFFFFF;" : "background-color:#FCFAF4;"}">${item.quantity}</td>
            <td style="padding: 14px 12px; border-bottom: 1px solid #EDE7D9; text-align: right; font-family: 'Work Sans', Arial, sans-serif; font-size: 14px; color: #5C5348; ${idx % 2 === 0 ? "background-color:#FFFFFF;" : "background-color:#FCFAF4;"}">Ksh ${item.price.toLocaleString()}</td>
            <td style="padding: 14px 12px; border-bottom: 1px solid #EDE7D9; text-align: right; font-family: 'Work Sans', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #14120F; ${idx % 2 === 0 ? "background-color:#FFFFFF;" : "background-color:#FCFAF4;"}">Ksh ${(item.price * item.quantity).toLocaleString()}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Confirmed</title>
      </head>
      <body style="margin:0; padding:0; background-color:#F0EBDD; font-family:'Work Sans', Arial, sans-serif;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
          Your payment for order #${order.orderNumber} was successful — here's your receipt.
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0EBDD; padding: 32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; box-shadow: 0 2px 24px rgba(20,18,15,0.08);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1F3D33 0%, #14261F 100%); background-color:#1F3D33; padding: 42px 40px 36px; text-align:center;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:56px; height:56px; border-radius:50%; background-color:rgba(255,255,255,0.12); margin-bottom:18px; line-height:56px; font-size:26px;">✓</div>
                    <h1 style="margin:0; font-family:'Fraunces', Georgia, serif; color:#FFFFFF; font-size:26px; font-weight:600; letter-spacing:0.2px;">Payment Confirmed</h1>
                    <p style="margin:10px 0 0; color:#CFE0D8; font-size:14px; letter-spacing:0.3px;">Thank you for shopping with IntimaCare</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 36px 40px 8px;">

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#FBF9F4; border:1px solid #E6DFD1; border-radius:8px; padding:16px 20px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:13px; color:#8C7B6B; text-transform:uppercase; letter-spacing:0.06em; padding-bottom:4px;">Order Number</td>
                              <td align="right" style="font-size:13px; color:#8C7B6B; text-transform:uppercase; letter-spacing:0.06em; padding-bottom:4px;">Status</td>
                            </tr>
                            <tr>
                              <td style="font-size:18px; font-weight:700; color:#14120F; font-family:'Fraunces', Georgia, serif;">#${order.orderNumber}</td>
                              <td align="right">
                                <span style="display:inline-block; background-color:#1F3D33; color:#FFFFFF; padding:5px 16px; border-radius:20px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Paid</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#3F3A32; font-size:15px; line-height:1.6; margin:26px 0 8px;">
                      Great news — your payment has gone through successfully and your order is now being prepared for shipping. We'll let you know the moment it's on its way.
                    </p>

                  </td>
                </tr>

                <!-- Order summary -->
                <tr>
                  <td style="padding: 20px 40px 0;">
                    <h3 style="font-family:'Fraunces', Georgia, serif; color:#14120F; font-size:17px; font-weight:600; margin:0 0 14px;">Order Summary</h3>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-radius:8px; overflow:hidden; border:1px solid #EDE7D9;">
                      <thead>
                        <tr>
                          <th align="left" style="background-color:#14120F; color:#F7F3EA; padding:12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Product</th>
                          <th align="center" style="background-color:#14120F; color:#F7F3EA; padding:12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Qty</th>
                          <th align="right" style="background-color:#14120F; color:#F7F3EA; padding:12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Price</th>
                          <th align="right" style="background-color:#14120F; color:#F7F3EA; padding:12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsList}
                        <tr>
                          <td colspan="3" style="padding:12px; text-align:right; font-size:13px; color:#5C5348; background-color:#FFFFFF;">Subtotal</td>
                          <td style="padding:12px; text-align:right; font-size:13px; color:#14120F; background-color:#FFFFFF;">Ksh ${order.subtotal?.toLocaleString() || "0"}</td>
                        </tr>
                        <tr>
                          <td colspan="3" style="padding:10px 12px; text-align:right; font-size:13px; color:#5C5348; background-color:#FFFFFF;">Shipping</td>
                          <td style="padding:10px 12px; text-align:right; font-size:13px; color:#14120F; background-color:#FFFFFF;">${order.shippingCost === 0 ? "Free" : "Ksh " + order.shippingCost?.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td colspan="3" style="padding:16px 12px; text-align:right; font-size:15px; font-weight:600; color:#14120F; background-color:#FBF9F4; border-top:2px solid #B08D4F;">Total</td>
                          <td style="padding:16px 12px; text-align:right; font-size:19px; font-weight:700; color:#B08D4F; background-color:#FBF9F4; border-top:2px solid #B08D4F; font-family:'Fraunces', Georgia, serif;">Ksh ${order.totalAmount?.toLocaleString() || "0"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- Shipping info -->
                <tr>
                  <td style="padding: 24px 40px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF9F4; border:1px solid #E6DFD1; border-radius:8px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <p style="margin:0 0 8px; font-size:13px; font-weight:600; color:#14120F; text-transform:uppercase; letter-spacing:0.05em;">📦 Shipping Address</p>
                          <p style="margin:0; font-size:14px; color:#5C5348; line-height:1.6;">
                            ${order.shippingAddress?.street || ""}<br>
                            ${order.shippingAddress?.city || ""} ${order.shippingAddress?.county || ""}<br>
                            Phone: ${order.shippingAddress?.phone || "N/A"}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="font-size:14px; color:#5C5348; line-height:1.6; margin:22px 0 0;">
                      You'll receive a separate shipping confirmation email as soon as your order is dispatched.
                    </p>
                  </td>
                </tr>

                <!-- Help box -->
                <tr>
                  <td style="padding: 22px 40px 8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF9F4; border-radius:8px; border-left:3px solid #B08D4F;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0; font-size:13px; color:#5C5348; line-height:1.6;">
                            <strong style="color:#14120F;">💚 Need help?</strong> Reach us anytime at
                            <a href="mailto:support@intimacare.co.ke" style="color:#B08D4F; text-decoration:none; font-weight:600;">support@intimacare.co.ke</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 28px 40px 36px; text-align:center; border-top:1px solid #EDE7D9; margin-top:10px;">
                    <p style="margin:0; font-size:13px; color:#8C7B6B;">© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
                    <p style="margin:6px 0 0; font-size:11px; color:#B7AC98;">This is a transactional email regarding your recent purchase.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
      </head>
      <body style="margin:0; padding:0; background-color:#F0EBDD; font-family:'Work Sans', Arial, sans-serif;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
          We couldn't process the payment for order #${order.orderNumber}.
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0EBDD; padding: 32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; box-shadow: 0 2px 24px rgba(20,18,15,0.08);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #8C4B3A 0%, #6E3A2C 100%); background-color:#8C4B3A; padding: 42px 40px 36px; text-align:center;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:56px; height:56px; border-radius:50%; background-color:rgba(255,255,255,0.14); margin-bottom:18px; line-height:56px; font-size:26px;">✕</div>
                    <h1 style="margin:0; font-family:'Fraunces', Georgia, serif; color:#FFFFFF; font-size:26px; font-weight:600; letter-spacing:0.2px;">Payment Failed</h1>
                    <p style="margin:10px 0 0; color:#F2DCD3; font-size:14px; letter-spacing:0.3px;">We ran into a problem with your order</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 36px 40px 8px;">

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#FBF9F4; border:1px solid #E6DFD1; border-radius:8px; padding:16px 20px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:13px; color:#8C7B6B; text-transform:uppercase; letter-spacing:0.06em; padding-bottom:4px;">Order Number</td>
                              <td align="right" style="font-size:13px; color:#8C7B6B; text-transform:uppercase; letter-spacing:0.06em; padding-bottom:4px;">Status</td>
                            </tr>
                            <tr>
                              <td style="font-size:18px; font-weight:700; color:#14120F; font-family:'Fraunces', Georgia, serif;">#${order.orderNumber}</td>
                              <td align="right">
                                <span style="display:inline-block; background-color:#8C4B3A; color:#FFFFFF; padding:5px 16px; border-radius:20px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Failed</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#3F3A32; font-size:15px; line-height:1.6; margin:26px 0 0;">
                      We were unable to process the payment for your order. Don't worry — no charge was completed, and you can try again at any time.
                    </p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                      <tr>
                        <td style="background-color:#FBF4F1; border:1px solid #EAD9D2; border-left:3px solid #8C4B3A; border-radius:8px; padding:16px 20px;">
                          <p style="margin:0; font-size:13px; color:#8C7B6B; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">Reason</p>
                          <p style="margin:6px 0 0; font-size:14px; color:#5C3A30; line-height:1.5;">${reason || "Payment processing failed"}</p>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#5C5348; font-size:14px; line-height:1.6; margin:22px 0 0;">
                      Please try again, or reach out to our support team if you continue to run into issues — we're happy to help.
                    </p>

                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding: 26px 40px 8px; text-align:center;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="border-radius:6px; background-color:#14120F;">
                          <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/orders"
                             style="display:inline-block; padding:14px 36px; font-size:14px; font-weight:600; color:#F7F3EA; text-decoration:none; letter-spacing:0.03em;">
                            Try Again
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Help box -->
                <tr>
                  <td style="padding: 26px 40px 8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF9F4; border-radius:8px; border-left:3px solid #B08D4F;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0; font-size:13px; color:#5C5348; line-height:1.6;">
                            <strong style="color:#14120F;">💚 Need help?</strong> Reach us anytime at
                            <a href="mailto:support@intimacare.co.ke" style="color:#B08D4F; text-decoration:none; font-weight:600;">support@intimacare.co.ke</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 28px 40px 36px; text-align:center; border-top:1px solid #EDE7D9; margin-top:10px;">
                    <p style="margin:0; font-size:13px; color:#8C7B6B;">© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
                    <p style="margin:6px 0 0; font-size:11px; color:#B7AC98;">This is a transactional email regarding your recent purchase.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
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
