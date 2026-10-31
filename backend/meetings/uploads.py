"""محدودیت حجم آپلود — جلسه، صورت‌جلسه، و دستورجلسه.

سقفِ مشترک ۱۰ مگابایت است. درون‌ریزیِ افراد از اکسل سقفِ جداگانه‌ای دارد
(۴ مگابایت) چون آن یکی فهرست است نه پیوستِ جلسه.
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
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


def attachment_response(attachment) -> FileResponse:
    """پاسخِ دانلود/بازکردن یک ردیف Attachment — یا ۴۰۴ اگر فایلی نباشد.

    `inline` تا PDF و تصویر در مرورگر باز شوند؛ بقیه معمولاً دانلود می‌شوند.
    """
    if not attachment or not getattr(attachment, 'file', None):
        raise Http404('پیوستی برای دانلود نیست.')
    stored = attachment.file
    if not stored.name:
        raise Http404('پیوستی برای دانلود نیست.')
    name = (attachment.name or Path(stored.name).name or 'file').strip() or 'file'
    content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    return FileResponse(
        stored.open('rb'),
        as_attachment=False,
        filename=name,
        content_type=content_type,
    )
