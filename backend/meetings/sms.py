"""
ارسال پیامک از طریق کاوه‌نگار (سرویس Lookup برای کد یک‌بارمصرف).

کلید API فقط از متغیر محیطی خوانده می‌شود — هرگز داخل کد یا مخزن قرار نگیرد.
اگر کلید تنظیم نشده باشد، پیامکی ارسال نمی‌شود و تابع «حالت توسعه» را گزارش
می‌کند تا جریان ورود در محیط محلی هم قابل تست باشد.
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
TIMEOUT = 12


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
