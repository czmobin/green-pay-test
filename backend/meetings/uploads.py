"""محدودیت حجم آپلود — جلسه، صورت‌جلسه، و دستورجلسه.

سقفِ مشترک ۱۰ مگابایت است. درون‌ریزیِ افراد از اکسل سقفِ جداگانه‌ای دارد
(۴ مگابایت) چون آن یکی فهرست است نه پیوستِ جلسه.
"""
from django.conf import settings
from rest_framework.exceptions import ValidationError

MAX_UPLOAD_BYTES = getattr(settings, 'MAX_UPLOAD_BYTES', 10 * 1024 * 1024)
MAX_UPLOAD_LABEL = '۱۰ مگابایت'


def assert_upload_size(upload, *, limit: int | None = None) -> None:
    """اگر حجم از سقف بیشتر باشد ValidationError می‌دهد."""
    cap = limit if limit is not None else MAX_UPLOAD_BYTES
    size = getattr(upload, 'size', None)
    if size is None:
        return
    if size > cap:
        if cap == MAX_UPLOAD_BYTES:
            label = MAX_UPLOAD_LABEL
        elif cap == 4 * 1024 * 1024:
            label = '۴ مگابایت'
        else:
            label = f'{cap // (1024 * 1024)} مگابایت'
        raise ValidationError({'file': f'حجم فایل نباید از {label} بیشتر باشد.'})
