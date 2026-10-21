export const sent = [];
export async function sendEmail(msg) {
  sent.push(msg);
  return { status: "sent" };
}
