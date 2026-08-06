import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("email")


def _branded_html(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f2;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e4df;">
          <tr>
            <td style="background:#6f1a07;padding:22px 28px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">OneGemmy</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1c1b18;letter-spacing:-0.01em;">{title}</h1>
              <div style="font-size:14px;line-height:1.6;color:#4a463f;">{body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #eeeae5;background:#faf9f7;">
              <span style="font-size:12px;color:#8a857c;">OneGemmy · Gemmy Connect Ltd · Sent by your business dashboard</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _button_html(url: str, label: str) -> str:
    return f'<p style="margin:20px 0 0;"><a href="{html.escape(url, quote=True)}" style="display:inline-block;background:#6f1a07;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;">{html.escape(label)}</a></p>'


async def send_email(to: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    """Send an email via Gmail SMTP. Fails soft — email must never break a request."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        log.warning("email.disabled", extra={"_extra_fields": {"to": to, "subject": subject}})
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to, msg.as_string())
        log.info("email.sent", extra={"_extra_fields": {"to": to, "subject": subject}})
        return True
    except Exception:
        log.exception("email.send_error", extra={"_extra_fields": {"to": to, "subject": subject}})
        return False


def _welcome_body(full_name: str, tenant_name: str, tenant_slug: str, dashboard_url: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p>Hi {name},</p>"
        f"<p>Your business account <strong>{html.escape(tenant_name)}</strong> has been created "
        f"on OneGemmy. You can now record sales, manage inventory, and run your shop "
        f"from anywhere.</p>"
        f"<p>Your business link is <strong>{html.escape(tenant_slug)}</strong> — keep it handy "
        f"for your team to sign in.</p>"
        + _button_html(dashboard_url, "Open your dashboard")
        + '<p style="margin-top:20px;color:#8a857c;font-size:13px;">Need help? Reply to this email and we\'ll get back to you.</p>'
    )


async def send_welcome_email(
    to: str,
    full_name: str,
    tenant_name: str,
    tenant_slug: str,
    dashboard_url: str | None = None,
) -> bool:
    subject = "Welcome to OneGemmy"
    body = _welcome_body(full_name, tenant_name, tenant_slug, dashboard_url or f"{settings.FRONTEND_URL}/login")
    return await send_email(to, subject, _branded_html("Welcome to OneGemmy 🎉", body), text_body=None)


def _reset_body(full_name: str, reset_link: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p>Hi {name},</p>"
        f"<p>We received a request to reset your OneGemmy password. "
        f"This link expires in 30 minutes.</p>"
        + _button_html(reset_link, "Reset your password")
        + '<p style="margin-top:20px;color:#8a857c;font-size:13px;">If you didn\'t request this, you can safely ignore this email.</p>'
    )


async def send_password_reset_email(
    to: str,
    full_name: str,
    reset_link: str,
) -> bool:
    subject = "Reset your OneGemmy password"
    body = _reset_body(full_name, reset_link)
    return await send_email(to, subject, _branded_html("Reset your password", body), text_body=None)


def _invite_body(full_name: str, tenant_name: str, temp_password: str, login_url: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p>Hi {name},</p>"
        f"<p>You have been invited to join <strong>{html.escape(tenant_name)}</strong> on OneGemmy.</p>"
        f"<p>Your temporary password is: <strong>{html.escape(temp_password)}</strong></p>"
        f"<p>Please log in and change your password immediately.</p>"
        + _button_html(login_url, "Log in to OneGemmy")
        + '<p style="margin-top:20px;color:#8a857c;font-size:13px;">If you did not expect this invitation, you can safely ignore this email.</p>'
    )


async def send_invite_email(
    to: str,
    full_name: str,
    tenant_name: str,
    temp_password: str,
    login_url: str | None = None,
) -> bool:
    subject = f"You've been invited to {tenant_name} on OneGemmy"
    body = _invite_body(full_name, tenant_name, temp_password, login_url or f"{settings.FRONTEND_URL}/login")
    return await send_email(to, subject, _branded_html(f"You're invited to {tenant_name} 🎉", body), text_body=None)
