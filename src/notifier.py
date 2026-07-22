# src/notifier.py
"""Gmail SMTP sender for the nightly summary / test / error emails.

Pure stdlib (smtplib + email.message). Settings come from
src/notify_store.py (data/notify_settings.json — local, gitignored).
The app password is used for login only and never logged or returned.
Report shape: see tests/test_notifier.py::rep — produced by
scripts/nightly_report.py.
"""
import html
import smtplib
from email.message import EmailMessage

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
SITE_URL = "https://aqmar.pages.dev"
ADMIN_URL = "http://localhost:8000/webui/"


def should_send(report: dict) -> bool:
    """Email only for: new people, rows stuck for a human, or errors."""
    return bool(report.get("new_people") or report.get("stuck")
                or report.get("errors"))


def _configured(settings: dict) -> bool:
    return bool(settings.get("enabled") and settings.get("sender_email")
                and str(settings.get("app_password") or "").strip()
                and settings.get("recipients"))


def build_subject(report: dict) -> str:
    if report.get("errors"):
        return "أقمار الطوفان — فشل النشر الليلي"
    n = len(report.get("new_people") or [])
    if n:
        v = report.get("version")
        tail = f" (نشرة v{v})" if v else ""
        return f"أقمار الطوفان — {n} شهيد جديد{tail}"
    return "أقمار الطوفان — سجلات بحاجة لمراجعتك"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def build_html(report: dict) -> str:
    parts = ['<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;'
             'line-height:1.8;color:#222;max-width:640px">']
    parts.append(f"<h2>ملخّص التشغيل الليلي — {_esc(report.get('run_start'))}</h2>")

    if report.get("published"):
        parts.append(f"<p>نُشرت النسخة v{_esc(report.get('version'))} — "
                     f"{_esc(report.get('row_count', 0))} سجلاً منشوراً.</p>")

    if report.get("errors"):
        parts.append('<h3 style="color:#a30000">أخطاء</h3><ul>')
        for e in report["errors"]:
            parts.append(f"<li><b>{_esc(e.get('stage'))}</b>: {_esc(e.get('detail'))}</li>")
        parts.append("</ul>")

    new = report.get("new_people") or []
    if new:
        v = report.get("version")
        parts.append(f"<h3>شهداء جدد ({len(new)})"
                     + (f" — نشرة v{_esc(v)}" if v else "") + "</h3><ul>")
        for p in new:
            link = _esc(p.get("message_link") or "")
            parts.append(
                f"<li><b>{_esc(p.get('name'))}</b> — "
                f"الميلاد: {_esc(p.get('birth_date') or '—')} · "
                f"الشهادة: {_esc(p.get('martyrdom_date') or '—')}"
                + (f' · <a href="{link}">المصدر</a>' if link else "") + "</li>")
        parts.append("</ul>")

    stuck = report.get("stuck") or []
    if stuck:
        parts.append(f"<h3>بحاجة لقرارك ({len(stuck)})</h3><ul>")
        for s in stuck:
            parts.append(f"<li><b>{_esc(s.get('name'))}</b> "
                         f"(msg {_esc(s.get('msg_id'))}) — {_esc(s.get('ai_note'))}</li>")
        parts.append("</ul>")

    parts.append("<p>تدقيقات هذه الليلة: "
                 f"{_esc(report.get('ai_total', 0))} سجل — "
                 f"منها {_esc(report.get('fixed_count', 0))} تصحيح تاريخ، "
                 f"{_esc(report.get('covers_count', 0))} صورة غلاف.</p>")
    parts.append(f'<p><a href="{SITE_URL}">الموقع</a> · '
                 f'<a href="{ADMIN_URL}">لوحة التحرير (محلية)</a></p></div>')
    return "".join(parts)


def build_text(report: dict) -> str:
    lines = [f"AQMAR nightly run {report.get('run_start')}"]
    if report.get("published"):
        lines.append(f"published v{report.get('version')} - {report.get('row_count', 0)} rows")
    for e in report.get("errors") or []:
        lines.append(f"ERROR [{e.get('stage')}]: {e.get('detail')}")
    for p in report.get("new_people") or []:
        lines.append(f"NEW: {p.get('name')} ({p.get('birth_date')} - "
                     f"{p.get('martyrdom_date')}) {p.get('message_link') or ''}")
    for s in report.get("stuck") or []:
        lines.append(f"NEEDS-HUMAN: {s.get('name')} (msg {s.get('msg_id')}): {s.get('ai_note')}")
    lines.append(f"verified tonight: {report.get('ai_total', 0)} "
                 f"(fixed {report.get('fixed_count', 0)}, covers {report.get('covers_count', 0)})")
    return "\n".join(lines)


def _send(settings: dict, subject: str, html_body: str, text_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings["sender_email"]
    msg["To"] = ", ".join(settings["recipients"])
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.login(settings["sender_email"], settings["app_password"])
        smtp.send_message(msg)


def send_summary(settings: dict, report: dict) -> bool:
    """Send the nightly summary. False = intentionally not sent
    (disabled/unconfigured, or nothing email-worthy)."""
    if not _configured(settings) or not should_send(report):
        return False
    _send(settings, build_subject(report), build_html(report), build_text(report))
    return True


def send_test(settings: dict) -> None:
    """Minimal test mail; raises smtplib/OS errors for the caller to show."""
    _send(settings, "أقمار الطوفان — رسالة تجريبية ✓",
          '<div dir="rtl">إعدادات البريد تعمل بنجاح.</div>',
          "AQMAR email settings OK.")


def send_error(settings: dict, stage: str, detail: str) -> bool:
    if not _configured(settings):
        return False
    report = {"run_start": "", "errors": [{"stage": stage, "detail": detail}]}
    _send(settings, build_subject(report), build_html(report), build_text(report))
    return True
