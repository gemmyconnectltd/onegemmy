import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("email")

LOGO_URL = "https://pesaa.io/icons/icon-192x192.png"


def _preheader(text: str) -> str:
    """Hidden preview text shown next to the subject line in most inbox lists."""
    return (
        f'<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;'
        f'mso-hide:all;">{html.escape(text)}</div>'
    )


def _branded_html(title: str, body: str, preheader: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background:#f0efec;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  {_preheader(preheader) if preheader else ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0efec;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e4df;box-shadow:0 1px 3px rgba(20,16,10,0.04);">
          <tr>
            <td style="background:linear-gradient(135deg,#6f1a07 0%,#4a1205 100%);padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="{LOGO_URL}" width="30" height="30" alt="" style="display:block;border-radius:7px;" />
                  </td>
                  <td>
                    <span style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.01em;">Pesaa</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <h1 style="margin:0 0 14px;font-size:21px;font-weight:700;color:#1c1b18;letter-spacing:-0.01em;line-height:1.3;">{title}</h1>
              <div style="font-size:14.5px;line-height:1.65;color:#4a463f;">{body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eeeae5;background:#faf9f7;">
              <p style="margin:0 0 4px;font-size:12.5px;color:#8a857c;line-height:1.6;">
                <strong style="color:#6a655c;">Pesaa</strong> &middot; Kigali, Rwanda
              </p>
              <p style="margin:0;font-size:11.5px;color:#a8a39a;line-height:1.6;">
                This is a transactional email sent because of activity on your Pesaa account. If you have questions, just reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _button_html(url: str, label: str) -> str:
    safe_url = html.escape(url, quote=True)
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">'
        f'<tr><td style="border-radius:10px;background:#6f1a07;">'
        f'<a href="{safe_url}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;'
        f'color:#ffffff;text-decoration:none;border-radius:10px;">{html.escape(label)}</a>'
        f"</td></tr></table>"
        f'<p style="margin:10px 0 0;font-size:12px;color:#a8a39a;word-break:break-all;">'
        f'Or copy this link: <span style="color:#8a857c;">{safe_url}</span></p>'
    )


def _security_note(text: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;">'
        f'<tr><td style="background:#fdf6ec;border:1px solid #f0dfc2;border-radius:10px;padding:12px 16px;">'
        f'<p style="margin:0;font-size:12.5px;color:#8a6a2e;line-height:1.55;">{text}</p>'
        f"</td></tr></table>"
    )


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
        f"<p style='margin:0 0 14px;'>Hi {name},</p>"
        f"<p style='margin:0 0 14px;'>Your business account <strong>{html.escape(tenant_name)}</strong> is ready on Pesaa. "
        f"You can now record sales, manage inventory, track expenses, and run your shop from anywhere.</p>"
        f"<table role='presentation' cellpadding='0' cellspacing='0' width='100%' style='margin:18px 0;'>"
        f"<tr><td style='background:#faf9f7;border:1px solid #eeeae5;border-radius:10px;padding:12px 16px;'>"
        f"<p style='margin:0;font-size:12px;color:#a8a39a;text-transform:uppercase;letter-spacing:0.04em;'>Your business link</p>"
        f"<p style='margin:2px 0 0;font-size:14px;font-weight:600;color:#1c1b18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;'>{html.escape(tenant_slug)}</p>"
        f"</td></tr></table>"
        + _button_html(dashboard_url, "Open your dashboard")
        + _security_note(
            "For your security, never share your Pesaa password with anyone — our team will never ask for it. "
            "If you didn't create this account, reply to this email and let us know."
        )
    )


async def send_welcome_email(
    to: str,
    full_name: str,
    tenant_name: str,
    tenant_slug: str,
    dashboard_url: str | None = None,
) -> bool:
    subject = "Welcome to Pesaa — your account is ready"
    body = _welcome_body(full_name, tenant_name, tenant_slug, dashboard_url or f"{settings.FRONTEND_URL}/login")
    preheader = f"{tenant_name} is set up on Pesaa. Open your dashboard to get started."
    return await send_email(to, subject, _branded_html("Welcome to Pesaa 🎉", body, preheader), text_body=None)


def _registration_received_body(full_name: str, tenant_name: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p style='margin:0 0 14px;'>Hi {name},</p>"
        f"<p style='margin:0 0 14px;'>Thanks for registering <strong>{html.escape(tenant_name)}</strong> on Pesaa. "
        "Your account is now waiting for a quick review by our team.</p>"
        "<p style='margin:0;'>Once approved, we'll email you a password so you can sign in and get started — "
        "no action is needed from you in the meantime.</p>"
    )


async def send_registration_received_email(to: str, full_name: str, tenant_name: str) -> bool:
    subject = "We've received your Pesaa registration"
    body = _registration_received_body(full_name, tenant_name)
    preheader = f"{tenant_name} is pending a quick review before you can sign in."
    return await send_email(to, subject, _branded_html("Registration received", body, preheader), text_body=None)


def _reset_body(full_name: str, reset_link: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p style='margin:0 0 14px;'>Hi {name},</p>"
        f"<p style='margin:0 0 4px;'>We received a request to reset the password on your Pesaa account.</p>"
        f"<p style='margin:0;'>This link expires in 30 minutes and can only be used once.</p>"
        + _button_html(reset_link, "Reset your password")
        + _security_note(
            "Didn't request this? Your password is still safe — you can ignore this email and no changes will be made. "
            "If this keeps happening, reply to this email so we can help secure your account."
        )
    )


async def send_password_reset_email(
    to: str,
    full_name: str,
    reset_link: str,
) -> bool:
    subject = "Reset your Pesaa password"
    body = _reset_body(full_name, reset_link)
    preheader = "This password reset link expires in 30 minutes."
    return await send_email(to, subject, _branded_html("Reset your password", body, preheader), text_body=None)


def _pending_signup_body(tenant_name: str, tenant_slug: str, review_url: str) -> str:
    return (
        "<p style='margin:0 0 14px;'>A new business just registered on Pesaa and is waiting for approval.</p>"
        "<table role='presentation' cellpadding='0' cellspacing='0' width='100%' style='margin:18px 0;'>"
        "<tr><td style='background:#faf9f7;border:1px solid #eeeae5;border-radius:10px;padding:12px 16px;'>"
        "<p style='margin:0;font-size:12px;color:#a8a39a;text-transform:uppercase;letter-spacing:0.04em;'>Business</p>"
        f"<p style='margin:2px 0 0;font-size:14px;font-weight:600;color:#1c1b18;'>{html.escape(tenant_name)} "
        f"<span style='color:#a8a39a;font-weight:400;'>({html.escape(tenant_slug)})</span></p>"
        "</td></tr></table>"
        + _button_html(review_url, "Review in admin portal")
    )


async def send_pending_signup_email(to: str, tenant_name: str, tenant_slug: str, review_url: str) -> bool:
    subject = f"New signup pending approval: {tenant_name}"
    body = _pending_signup_body(tenant_name, tenant_slug, review_url)
    preheader = f"{tenant_name} is waiting for approval."
    return await send_email(to, subject, _branded_html("New signup pending approval", body, preheader), text_body=None)


def _account_approved_body(full_name: str, tenant_name: str, login_email: str, temp_password: str, dashboard_url: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p style='margin:0 0 14px;'>Hi {name},</p>"
        f"<p style='margin:0 0 14px;'>Good news — your business account <strong>{html.escape(tenant_name)}</strong> "
        "has been approved and is ready to use. Sign in with the password below.</p>"
        f"<table role='presentation' cellpadding='0' cellspacing='0' width='100%' style='margin:18px 0;'>"
        f"<tr><td style='background:#faf9f7;border:1px solid #eeeae5;border-radius:10px;padding:14px 16px;'>"
        f"<p style='margin:0;font-size:12px;color:#a8a39a;text-transform:uppercase;letter-spacing:0.04em;'>Email</p>"
        f"<p style='margin:2px 0 10px;font-size:14px;font-weight:600;color:#1c1b18;'>{html.escape(login_email)}</p>"
        f"<p style='margin:0;font-size:12px;color:#a8a39a;text-transform:uppercase;letter-spacing:0.04em;'>Password</p>"
        f"<p style='margin:4px 0 0;font-size:17px;font-weight:700;color:#1c1b18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.02em;'>{html.escape(temp_password)}</p>"
        f"</td></tr></table>"
        + _button_html(dashboard_url, "Log in now")
        + _security_note("For your security, change this password after your first sign-in (Settings &rarr; Security).")
    )


async def send_account_approved_email(to: str, full_name: str, tenant_name: str, dashboard_url: str, temp_password: str) -> bool:
    subject = "Your Pesaa account is approved"
    body = _account_approved_body(full_name, tenant_name, to, temp_password, dashboard_url)
    preheader = f"{tenant_name} is approved and ready on Pesaa."
    return await send_email(to, subject, _branded_html("You're approved!", body, preheader), text_body=None)


def _invite_body(full_name: str, tenant_name: str, temp_password: str, login_url: str) -> str:
    name = html.escape(full_name or "there")
    return (
        f"<p style='margin:0 0 14px;'>Hi {name},</p>"
        f"<p style='margin:0 0 14px;'>You've been added to <strong>{html.escape(tenant_name)}</strong> on Pesaa. "
        f"Use the temporary password below to sign in for the first time.</p>"
        f"<table role='presentation' cellpadding='0' cellspacing='0' width='100%' style='margin:18px 0;'>"
        f"<tr><td style='background:#faf9f7;border:1px solid #eeeae5;border-radius:10px;padding:14px 16px;'>"
        f"<p style='margin:0;font-size:12px;color:#a8a39a;text-transform:uppercase;letter-spacing:0.04em;'>Temporary password</p>"
        f"<p style='margin:4px 0 0;font-size:17px;font-weight:700;color:#1c1b18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.02em;'>{html.escape(temp_password)}</p>"
        f"</td></tr></table>"
        + _button_html(login_url, "Log in to Pesaa")
        + _security_note(
            "This password is temporary and known to whoever invited you — for your security, "
            "<strong>change it immediately after your first sign-in</strong> (Settings &rarr; Security). "
            "If you didn't expect this invitation, you can safely ignore this email."
        )
    )


async def send_invite_email(
    to: str,
    full_name: str,
    tenant_name: str,
    temp_password: str,
    login_url: str | None = None,
) -> bool:
    subject = f"You've been invited to {tenant_name} on Pesaa"
    body = _invite_body(full_name, tenant_name, temp_password, login_url or f"{settings.FRONTEND_URL}/login")
    preheader = f"Join {tenant_name} on Pesaa — your temporary password is inside."
    return await send_email(to, subject, _branded_html(f"You're invited to {tenant_name} 🎉", body, preheader), text_body=None)
