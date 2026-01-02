import { Resend } from "resend";
import { config } from "dotenv";
config();

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Use Resend's onboarding sender by default for development (works without domain verification)
const emailAddress = (process.env.EMAIL_ADDRESS || "onboarding@resend.dev").trim();
const senderName = "Apostles";

/**
 * sendEmail - Sends an email using Resend
 * @param {Object} options - The email options
 * @param {Array|String} options.to - Recipient(s): can be a single email or an array of emails
 * @param {String} options.subject - The subject line
 * @param {String} options.html - The HTML content
 */
const sendEmail = async (options) => {
  try {
    // 1. Validation
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Email API key missing. Set RESEND_API_KEY in your .env.");
    }

    // 2. Normalize recipients 
    // Resend accepts: "email@example.com" OR ["a@ex.com", "b@ex.com"]
    let recipients;
    if (Array.isArray(options.to)) {
      recipients = options.to
        .map((r) => (typeof r === "string" ? r : r?.email))
        .filter(Boolean);
    } else {
      recipients = typeof options.to === "string" ? options.to : options?.to?.email;
    }
    if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
      throw new Error("Recipient 'to' is missing or invalid");
    }

    // Helper to detect unverified domain errors
    const isDomainNotVerifiedError = (err) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return msg.includes('domain is not verified') || msg.includes('not verified');
    };

    // 3. Send via Resend SDK
    const primaryFrom = `${senderName} <${emailAddress}>`;
    let { data, error } = await resend.emails.send({
      from: primaryFrom,
      to: recipients,
      subject: options.subject,
      html: options.html,
    });

    // 3a. If domain isn’t verified, fallback to onboarding sender and retry once
    if (error && isDomainNotVerifiedError(error)) {
      const fallbackFrom = `${senderName} <onboarding@resend.dev>`;
      const retry = await resend.emails.send({
        from: fallbackFrom,
        to: recipients,
        subject: options.subject,
        html: options.html,
      });
      data = retry.data;
      error = retry.error;
      if (!error) {
        console.warn('Email sent using fallback sender (onboarding@resend.dev). Configure a verified domain when ready.');
      }
    }

    if (error) {
      throw error;
    }

    // console.log("EMAIL SENT SUCCESSFULLY:", data.id);
    return { success: true, id: data.id };

  } catch (error) {
  console.error("UNABLE TO SEND EMAIL (Resend):", error.message || error);
    return { success: false, error: error.message || error };
  }
};

export default sendEmail;