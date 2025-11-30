import { Resend } from 'resend';

export const sendPasswordResetEmail = async (
  email: string,
  resetLink: string,
  resendApiKey: string
) => {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Email not sent.');
    console.log(`[DEV] Password Reset Link for ${email}: ${resetLink}`);
    return;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Money Hater <noreply@hater.money>',
      to: [email],
      subject: 'Reset your password',
      html: `
        <h1>Reset your password</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    if (error) {
      console.error('Failed to send email:', error);
      console.log(`[FALLBACK] Password Reset Link for ${email}: ${resetLink}`);
      return;
    }

    console.log('Email sent successfully to', email, 'ID:', data?.id);
  } catch (err) {
    console.error('Failed to send email:', err);
    console.log(`[FALLBACK] Password Reset Link for ${email}: ${resetLink}`);
  }
};
