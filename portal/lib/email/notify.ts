// Optional transactional email via Resend.
// No-ops gracefully if RESEND_API_KEY is not configured, so the app works
// on the free tier without email set up.

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "SCH Portal <synergyconceptshub@gmail.com>";

  if (!apiKey) {
    // Email not configured — skip silently in dev / free tier.
    console.log(`[email skipped] to=${to} subject="${subject}"`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      console.error("[email error]", await res.text());
    }
  } catch (err) {
    console.error("[email error]", err);
  }
}

export function projectUpdateEmail(
  projectTitle: string,
  updateContent: string,
  portalUrl: string
): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1773B9;">New update on "${projectTitle}"</h2>
      <p style="color: #333; white-space: pre-wrap;">${updateContent}</p>
      <a href="${portalUrl}"
         style="display: inline-block; margin-top: 16px; background: #ED8C22;
                color: #fff; padding: 10px 18px; border-radius: 6px;
                text-decoration: none; font-weight: 600;">
        View in Portal
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Synergy Concepts Hub
      </p>
    </div>
  `;
}
