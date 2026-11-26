/** sessionStorage key holding the email between /login and /verify (never put in the URL). */
export const LOGIN_EMAIL_KEY = "ss_login_email";

/** "riya@example.com" -> "r***@example.com" (A5.9). */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
