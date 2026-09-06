"""
کلاینت Microsoft Graph — دسترسی app-only (client credentials).

چرا app-only و نه OAuth هر کاربر: کاربران این سامانه با کد یک‌بارمصرفِ پیامکی
وارد می‌شوند و هیچ‌وقت با حساب مایکروسافت لاگین نمی‌کنند، پس توکن کاربری‌ای در
کار نیست که بشود با آن تقویمشان را خواند. دامنهٔ دسترسی به‌جای آن در Exchange
با `New-ApplicationAccessPolicy` به یک گروه امنیتی محدود می‌شود — نگاه کنید به
DEPLOY.md.

قرارداد این فایل همان قرارداد `sms.py` است:
  • هیچ استثنایی از مرز این ماژول بیرون نمی‌رود؛ خطا با `GraphError` برمی‌گردد
    که کد وضعیت و متن قابل‌گزارش دارد.
  • نبودِ کلید یعنی «خاموش» — صفر درخواست HTTP، بدون خطا.
  • فقط کتابخانهٔ استاندارد؛ در این پروژه نه requests نصب است نه httpx.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
LOGIN_BASE = 'https://login.microsoftonline.com'
SCOPE = 'https://graph.microsoft.com/.default'


class GraphError(Exception):
    """
    خطای Graph — با کد وضعیت و مهلت پیشنهادی سرویس.

    `retry_after` فقط از هدرِ پاسخ می‌آید (`urllib` آن را روی خودِ استثنا
    نگه می‌دارد)؛ در بدنهٔ JSON نیست.
    """

    def __init__(self, status: int, detail: str = '', retry_after: int = 0, code: str = ''):
        super().__init__(f'graph {status}: {detail[:200]}')
        self.status = status
        self.detail = detail
        self.retry_after = retry_after
        self.code = code

    @property
    def is_auth(self) -> bool:
        """۴۰۱ سراسری است — با همان کلیدها هیچ صندوقی جواب نمی‌دهد."""
        return self.status == 401

    @property
    def is_forbidden(self) -> bool:
        """۴۰۳ معمولاً یعنی این صندوق زیر ApplicationAccessPolicy نیست."""
        return self.status == 403

    @property
    def is_throttled(self) -> bool:
        return self.status == 429

    @property
    def is_gone(self) -> bool:
        """۴۱۰ یعنی نشانهٔ delta منقضی شده و باید بازه را کامل خواند."""
        return self.status == 410


def enabled() -> bool:
    """
    آیا همگام‌سازی روشن است؟

    هر ورودیِ این ماژول از همین می‌پرسد. با خاموش‌بودن، هیچ درخواستی نمی‌رود و
    هیچ چیزی در دیتابیس علامتِ «برای ارسال» نمی‌خورد — نگاه کنید به
    `Meeting.mark_dirty()`، که تعمداً وقتی خاموش است کاری نمی‌کند.
    """
    return bool(settings.OUTLOOK_ENABLED
                and settings.OUTLOOK_TENANT_ID
                and settings.OUTLOOK_CLIENT_ID
                and settings.OUTLOOK_CLIENT_SECRET)


class GraphClient:
    """
    کلاینت درخواست‌ها با کش توکن.

    تنها درزِ آزمون‌پذیری این کلاس `_request` است: با `OUTLOOK_FAKE_DIR` پاسخ‌ها
    از فایل‌های JSON خوانده می‌شوند و کل منطق همگام‌سازی بدون tenant واقعی
    تست می‌شود.
    """

    def __init__(self):
        self._token = ''
        self._token_expires = 0.0
        self.calls = 0

    # ---------------------------------------------------------------- توکن

    def token(self) -> str:
        # ۶۰ ثانیه حاشیه: توکنی که وسط اجرا منقضی شود، اجرا را بی‌دلیل می‌شکند.
        if self._token and time.time() < self._token_expires - 60:
            return self._token

        url = f'{LOGIN_BASE}/{settings.OUTLOOK_TENANT_ID}/oauth2/v2.0/token'
        data = urllib.parse.urlencode({
            'client_id': settings.OUTLOOK_CLIENT_ID,
            'client_secret': settings.OUTLOOK_CLIENT_SECRET,
            'scope': SCOPE,
            'grant_type': 'client_credentials',
        }).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST', headers={
            'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with urllib.request.urlopen(req, timeout=settings.OUTLOOK_HTTP_TIMEOUT) as resp:
                body = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'ignore')[:400]
            logger.error('گرفتن توکن Graph ناموفق (%s): %s', exc.code, detail)
            raise GraphError(401, detail)
        except Exception as exc:
            logger.error('گرفتن توکن Graph ناموفق: %s', exc)
            raise GraphError(0, str(exc))

        self._token = body.get('access_token', '')
        self._token_expires = time.time() + float(body.get('expires_in') or 3600)
        if not self._token:
            raise GraphError(401, 'پاسخ توکن، access_token نداشت')
        return self._token

    # ------------------------------------------------------------- درخواست

    def _request(self, method: str, url: str, payload=None) -> dict:
        """تنها جایی که واقعاً HTTP می‌زند — و تنها جایی که برای تست جایگزین می‌شود."""
        if settings.OUTLOOK_FAKE_DIR:
            return _fake_response(method, url, payload)

        if not url.startswith('http'):
            url = GRAPH_BASE + url
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': f'Bearer {self.token()}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })
        self.calls += 1
        try:
            with urllib.request.urlopen(req, timeout=settings.OUTLOOK_HTTP_TIMEOUT) as resp:
                raw = resp.read().decode('utf-8', 'ignore')
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'ignore')[:600]
            # فقط اینجا در دسترس است — بعد از این، هدرها رفته‌اند.
            retry_after = 0
            try:
                retry_after = int(exc.headers.get('Retry-After') or 0)
            except (TypeError, ValueError):
                retry_after = 0
            code = ''
            try:
                code = ((json.loads(detail) or {}).get('error') or {}).get('code') or ''
            except Exception:
                pass
            logger.warning('Graph %s %s → %s %s', method, _safe_url(url), exc.code, code)
            raise GraphError(exc.code, detail, retry_after, code)
        except Exception as exc:
            logger.error('Graph %s %s ناموفق: %s', method, _safe_url(url), exc)
            raise GraphError(0, str(exc))

    # ------------------------------------------------------------- عملیات

    def get(self, url: str) -> dict:
        return self._request('GET', url)

    def post(self, url: str, payload: dict) -> dict:
        return self._request('POST', url, payload)

    def patch(self, url: str, payload: dict) -> dict:
        return self._request('PATCH', url, payload)

    def delete(self, url: str) -> dict:
        return self._request('DELETE', url)

    def calendar_view_delta(self, mailbox: str, start_iso: str, end_iso: str,
                            link: str = '') -> dict:
        """
        یک صفحه از تغییرات تقویم.

        بدون `link` یعنی شروع تازه با بازهٔ صریح؛ با `link` یعنی ادامهٔ همان
        دنباله (nextLink یا deltaLink).

        توجه: `calendarView/delta` نه `$select` می‌پذیرد نه `$expand`. به همین
        دلیل `singleValueExtendedProperties` (مهرِ «این را ما نوشتیم») اصلاً در
        پاسخ نمی‌آید و نمی‌تواند مکانیزم اصلی تشخیص اکو باشد — آن کار با
        `changeKey` انجام می‌شود.
        """
        if link:
            return self.get(link)
        q = urllib.parse.urlencode({'startDateTime': start_iso, 'endDateTime': end_iso})
        return self.get(f'/users/{urllib.parse.quote(mailbox)}/calendarView/delta?{q}')

    def create_event(self, mailbox: str, payload: dict) -> dict:
        return self.post(f'/users/{urllib.parse.quote(mailbox)}/events', payload)

    def update_event(self, mailbox: str, event_id: str, payload: dict) -> dict:
        return self.patch(
            f'/users/{urllib.parse.quote(mailbox)}/events/{urllib.parse.quote(event_id)}', payload)

    def cancel_event(self, mailbox: str, event_id: str) -> dict:
        """
        لغو جلسه — نه حذفِ خام.

        `/cancel` به شرکت‌کننده‌ها «Canceled:» می‌فرستد؛ `DELETE` رویداد را
        بی‌صدا برمی‌دارد و کسی خبردار نمی‌شود.
        """
        return self.post(
            f'/users/{urllib.parse.quote(mailbox)}/events/{urllib.parse.quote(event_id)}/cancel',
            {'comment': 'این جلسه در سامانهٔ جلسات لغو شد.'})

    def get_event(self, mailbox: str, event_id: str) -> dict:
        return self.get(
            f'/users/{urllib.parse.quote(mailbox)}/events/{urllib.parse.quote(event_id)}')


def _safe_url(url: str) -> str:
    """نشانی بدون توکن delta — لاگ نباید چیزی را که کلید است نگه دارد."""
    return url.split('?')[0]


# --------------------------------------------------------------- تست بدون tenant

def _fake_response(method: str, url: str, payload) -> dict:
    """
    پاسخ از فیکسچرهای JSON روی دیسک — برای تست کل منطق بدون tenant واقعی.

    نام فایل از روش و مسیر ساخته می‌شود؛ نوشتن‌ها (POST/PATCH) اگر فیکسچری
    نداشته باشند، پاسخِ کمینه‌ای می‌سازند که فقط `id` و `changeKey` دارد —
    همان دو چیزی که لایهٔ همگام‌سازی از یک نوشتن لازم دارد.
    """
    from pathlib import Path
    root = Path(settings.OUTLOOK_FAKE_DIR)
    key = _fake_key(method, url)
    path = root / f'{key}.json'
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))

    if method in ('POST', 'PATCH'):
        return {
            'id': f'fake-{abs(hash(key)) % 10**12}',
            'changeKey': f'ck-{abs(hash((key, json.dumps(payload, sort_keys=True)))) % 10**9}',
            'iCalUId': (payload or {}).get('iCalUId', f'ical-{abs(hash(key)) % 10**9}'),
        }
    if method == 'DELETE':
        return {}
    raise GraphError(404, f'فیکسچری برای {key} نیست ({path})')


def _fake_key(method: str, url: str) -> str:
    path = url.split('?')[0].replace(GRAPH_BASE, '').strip('/')
    slug = ''.join(ch if ch.isalnum() else '_' for ch in path)
    # صفحهٔ دوم و بعدترِ delta با پارامتر مشخص می‌شود، نه با مسیر
    page = ''
    if 'fakepage=' in url:
        page = '_' + url.split('fakepage=')[1].split('&')[0]
    return f'{method.lower()}_{slug}{page}'[:150]


def probe() -> list[tuple[str, str]]:
    """
    تشخیص وضعیت اتصال — خروجی‌اش قابل دادن به مدیر tenant است.

    هیچ چیزی نمی‌نویسد: فقط توکن می‌گیرد و یک صندوق را می‌خواند. تفکیک ۴۰۱ از
    ۴۰۳ همان چیزی است که وقت عیب‌یابی لازم می‌شود — اولی یعنی کلیدها/مجوز، دومی
    یعنی ApplicationAccessPolicy.
    """
    out: list[tuple[str, str]] = []
    if not settings.OUTLOOK_ENABLED:
        out.append(('OUTLOOK_ENABLED', 'خاموش — هیچ درخواستی فرستاده نمی‌شود'))
    for name in ('OUTLOOK_TENANT_ID', 'OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET'):
        out.append((name, 'تنظیم شده' if getattr(settings, name) else '— خالی —'))
    if not enabled():
        return out

    client = GraphClient()
    try:
        client.token()
        out.append(('توکن', 'گرفته شد'))
    except GraphError as exc:
        out.append(('توکن', f'ناموفق ({exc.status}) — {exc.detail[:160]}'))
        return out

    from .models import OutlookMailbox
    box = OutlookMailbox.objects.filter(is_active=True).first()
    if not box:
        out.append(('صندوق', 'هیچ صندوق فعالی ثبت نشده — اول manage.py outlook_users'))
        return out
    try:
        client.get(f'/users/{urllib.parse.quote(box.email)}/calendar')
        out.append((box.email, 'خوانده شد'))
    except GraphError as exc:
        hint = ('احتمالاً ApplicationAccessPolicy این صندوق را نمی‌پوشاند'
                if exc.is_forbidden else exc.detail[:160])
        out.append((box.email, f'ناموفق ({exc.status}) — {hint}'))
    return out
