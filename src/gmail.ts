// Google Gmail API Integration Helpers (REST-based implementation)

/**
 * Encodes string to Web-safe Base64 (RFC 4648 Section 5)
 */
function base64UrlEncode(str: string): string {
  // Convert utf-8 string to base64, then format raw output to web-safe character representation
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface SendEmailParams {
  token: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

/**
 * Sends a highly styled HTML email using the Gmail REST API
 */
export async function sendGmailMessage({
  token,
  to,
  subject,
  bodyHtml,
  bodyText = "يرجى تفعيل عرض البريد بصيغة HTML لمشاهدة محتوى نتائج المارثون.",
}: SendEmailParams): Promise<{ id: string; threadId: string }> {
  try {
    // Generate raw email conforming to SMTP MIME specs (with support for UTF-8 Subject and Arabic text)
    const boundary = "boundary_marathon_gmail_api_" + Date.now();
    
    // Construct MIME message
    const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
    const emailHeader = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      "",
      btoa(unescape(encodeURIComponent(bodyText))),
      "",
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      "",
      btoa(unescape(encodeURIComponent(bodyHtml))),
      "",
      `--${boundary}--`,
    ].join("\r\n");

    const rawMessage = base64UrlEncode(emailHeader);

    const response = await fetch("https://gmail.googleapis.com/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: rawMessage,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to send email: ${response.statusText}. Code: ${response.status}. Details: ${errText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Gmail: Error sending email:", error);
    throw error;
  }
}

/**
 * Retrieves the email address of the currently authenticated Google user.
 */
export async function getGoogleUserProfile(token: string): Promise<{ email: string; name?: string }> {
  try {
    const response = await fetch("https://gmail.googleapis.com/v1/users/me/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      email: data.emailAddress,
    };
  } catch (error) {
    console.error("Gmail: Error fetching user profile:", error);
    throw error;
  }
}
