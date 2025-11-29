import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

export const sendPasswordResetEmail = async (
  email: string,
  resetLink: string,
  sendEmailBinding: any // SendEmail from "cloudflare:email",
) => {
  if (!sendEmailBinding) {
    console.warn('MONEY_HATER_MAILER binding is not set. Email not sent.');
    console.log(`[DEV] Password Reset Link for ${email}: ${resetLink}`);
    return;
  }

  const msg = createMimeMessage();
  msg.setSender({ name: "Money Hater", addr: "noreply@hater.money" });
  msg.setRecipient(email);
  msg.setSubject("Reset your password");
  msg.addMessage({
    contentType: 'text/html',
    data: `
      <h1>Reset your password</h1>
      <p>Click the link below to reset your password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });

  const message = new EmailMessage(
    "noreply@hater.money",
    email,
    msg.asRaw()
  );

  try {
    await sendEmailBinding.send(message);
    console.log('Email sent successfully to', email);
  } catch (err) {
    console.error('Failed to send email:', err);
    // In dev/demo, we might want to log the link anyway if email fails
    console.log(`[FALLBACK] Password Reset Link for ${email}: ${resetLink}`);
  }
};
