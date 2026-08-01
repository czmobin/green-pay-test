"""
ارسال پیامک — دو سرویس برای دو کار:

* کد یک‌بارمصرفِ ورود  → کاوه‌نگار (سرویس Lookup با قالب تأییدشده)
* یادآور جلسه و اعلان‌ها → پیشگام رایان (متن آزاد)

کلیدها فقط از متغیرهای محیطی خوانده می‌شوند — هرگز داخل کد یا مخزن قرار نگیرند.
اگر کلیدی تنظیم نشده باشد پیامکی ارسال نمی‌شود و تابع «حالت توسعه» را گزارش
می‌کند تا جریان کار در محیط محلی هم قابل تست باشد.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = 'https://api.kavenegar.com/v1'
PISHGAM_URL = 'https://api.pishgamrayan.com/send'
TIMEOUT = 12

# پیام‌های شناخته‌شدهٔ پیشگام رایان → توضیح فارسیِ قابل‌فهم برای کاربر پنل
PISHGAM_ERRORS = {
    'IpNotValid': 'IP سرور در پنل پیشگام رایان مجاز نیست — آن را در فهرست IPهای مجاز اضافه کنید.',
    'TokenNotValid': 'توکن پیامک نامعتبر است.',
    'SenderNotValid': 'شمارهٔ فرستنده در پنل تأیید نشده است.',
    'InsufficientCredit': 'اعتبار پنل پیامک کافی نیست.',
    'RecipientNotValid': 'شمارهٔ گیرنده نامعتبر است.',
}


def _pishgam_error(body: str) -> str:
    """پیام خطای سرویس را از بدنهٔ پاسخ درمی‌آورد و در صورت امکان فارسی می‌کند."""
    try:
        code = (json.loads(body) or {}).get('message') or ''
    except Exception:
        code = ''
    if not code:
        return ''
    return PISHGAM_ERRORS.get(code, code)


class SmsResult:
    def __init__(self, sent: bool, detail: str = ''):
        self.sent = sent
        self.detail = detail


def normalize_phone(raw: str) -> str:
    """شماره‌های ایرانی را به قالب 09xxxxxxxxx تبدیل می‌کند."""
    digits = ''.join(ch for ch in str(raw) if ch.isdigit())
    # ارقام فارسی/عربی
    trans = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
    digits = str(raw).translate(trans)
    digits = ''.join(ch for ch in digits if ch.isdigit())

    if digits.startswith('0098'):
        digits = digits[4:]
    elif digits.startswith('98') and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith('0'):
        digits = digits[1:]
    if len(digits) == 10 and digits.startswith('9'):
        return '0' + digits
    return digits


def is_valid_phone(phone: str) -> bool:
    return len(phone) == 11 and phone.startswith('09')


def send_otp(phone: str, code: str) -> SmsResult:
    """کد ورود را با قالب تعریف‌شده در پنل کاوه‌نگار می‌فرستد."""
    api_key = settings.KAVENEGAR_API_KEY
    if not api_key:
        logger.warning('KAVENEGAR_API_KEY تنظیم نشده — پیامک ارسال نشد (حالت توسعه).')
        return SmsResult(False, 'sms-disabled')

    params = urllib.parse.urlencode({
        'receptor': phone,
        'token': code,
        'template': settings.KAVENEGAR_OTP_TEMPLATE,
    })
    url = f'{API_BASE}/{api_key}/verify/lookup.json?{params}'
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'ignore')[:300]
        logger.error('کاوه‌نگار خطا داد (%s): %s', exc.code, detail)
        return SmsResult(False, f'http-{exc.code}')
    except Exception as exc:                      # شبکه/تایم‌اوت
        logger.error('ارسال پیامک ناموفق: %s', exc)
        return SmsResult(False, 'network-error')

    status = (body.get('return') or {}).get('status')
    if status == 200:
        return SmsResult(True, 'sent')
    message = (body.get('return') or {}).get('message', '')
    logger.error('کاوه‌نگار پیامک را نپذیرفت (%s): %s', status, message)
    return SmsResult(False, message or f'status-{status}')


def send_text(phone: str, text: str, tag: str = 'greenpay') -> SmsResult:
    """
    پیامک متن‌آزاد از طریق پیشگام رایان — برای یادآور جلسه و اعلان‌ها.

    برخلاف کد ورود، اینجا قالب از پیش تعریف‌شده لازم نیست و متن کامل فرستاده می‌شود.
    """
    token = settings.PISHGAM_SMS_TOKEN
    sender = settings.PISHGAM_SMS_SENDER
    if not token or not sender:
        logger.warning('PISHGAM_SMS_TOKEN تنظیم نشده — پیامک ارسال نشد (حالت توسعه).')
        return SmsResult(False, 'sms-disabled')

    phone = normalize_phone(phone)
    if not is_valid_phone(phone):
        return SmsResult(False, 'bad-number')

    payload = json.dumps({
        'messageBodies': [text],
        'recipientNumbers': [phone],
        'userTag': tag,
        'senderNumber': sender,
    }).encode('utf-8')
    req = urllib.request.Request(PISHGAM_URL, data=payload, method='POST', headers={
        'Authorization': token,
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode('utf-8', 'ignore')[:300]
            code = resp.status
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'ignore')[:300]
        reason = _pishgam_error(detail)
        logger.error('پیشگام رایان خطا داد (%s): %s', exc.code, detail)
        return SmsResult(False, reason or f'http-{exc.code}')
    except Exception as exc:                      # شبکه/تایم‌اوت
        logger.error('ارسال پیامک ناموفق: %s', exc)
        return SmsResult(False, 'network-error')

    if 200 <= code < 300:
        return SmsResult(True, 'sent')
    reason = _pishgam_error(body)
    logger.error('پیشگام رایان پیامک را نپذیرفت (%s): %s', code, body)
    return SmsResult(False, reason or f'status-{code}')


def probe(phone: str = '09121234567') -> list[tuple[str, int, str]]:
    """
    تشخیص علت رد شدن پیامک — با مقایسهٔ پاسخِ توکن درست و توکن الکی.

    سرویس اول احراز هویت می‌کند و بعد IP را بررسی می‌کند؛ پس اگر توکنِ الکی
    «۴۰۱ Unauthorized» بگیرد و توکنِ ما «۴۲۸ IpNotValid»، یعنی توکن سالم است و
    مشکل فقط فهرست IPهای مجاز در پنل است. این خروجی را می‌شود به پشتیبانی داد.
    """
    payload = json.dumps({
        'messageBodies': ['probe'],
        'recipientNumbers': [normalize_phone(phone)],
        'userTag': 'greenpay-probe',
        'senderNumber': settings.PISHGAM_SMS_SENDER,
    }).encode('utf-8')

    out = []
    for label, token in (('توکن پیکربندی‌شده', settings.PISHGAM_SMS_TOKEN),
                         ('توکن عمداً نامعتبر', 'DEADBEEF00000000')):
        req = urllib.request.Request(PISHGAM_URL, data=payload, method='POST', headers={
            'Authorization': token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                out.append((label, resp.status, resp.read().decode('utf-8', 'ignore')[:160]))
        except urllib.error.HTTPError as exc:
            out.append((label, exc.code, exc.read().decode('utf-8', 'ignore')[:160]))
        except Exception as exc:
            out.append((label, 0, str(exc)[:160]))
    return out
