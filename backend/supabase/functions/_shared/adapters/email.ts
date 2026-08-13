// Email adapter — Resend. Without RESEND_API_KEY (local/dev), logs what would have been sent
// instead of calling out, per task-4 brief.

const FROM = "karty@loyaltygo.pl";

export async function sendCardLink(to: string, url: string, programName: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const subject = `Twoja karta w programie ${programName}`;
  const text =
    `Cześć,\n\nOto link do Twojej karty lojalnościowej w programie ${programName}:\n${url}\n\n` +
    `Jeśli nie zakładałeś/aś tej karty, zignoruj tę wiadomość.`;

  if (!apiKey) {
    console.log("[email:stub] sendCardLink", { to, url, programName, from: FROM, subject, text });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`resend sendCardLink failed: ${res.status} ${await res.text()}`);
}
