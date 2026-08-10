"""
درون‌ریزی گروهی افراد از فایل اکسل یا CSV.

سرصفحه‌ها بر پایهٔ نام ستون تشخیص داده می‌شوند، نه ترتیبشان — چون فایلی که
از واحد منابع انسانی می‌آید هر بار ترتیب متفاوتی دارد. سرصفحه‌های فارسی و
انگلیسی هر دو پذیرفته می‌شوند.

اکسل بدون وابستگی خارجی خوانده می‌شود: xlsx یک فایل zip است و ما فقط دو
عضوش را لازم داریم (sharedStrings و برگهٔ اول).
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from xml.etree import ElementTree as ET

from .jalali import fa_digits
from .models import Organization, User
from .sms import is_valid_phone, normalize_phone

# نام ستون‌ها → فیلد داخلی. کلیدها پس از عادی‌سازی مقایسه می‌شوند.
COLUMNS = {
    'name': {'نام', 'نامونامخانوادگی', 'نامخانوادگی', 'نامکامل', 'fullname', 'name'},
    'role': {'سمت', 'عنوان', 'شغل', 'نقش', 'title', 'role', 'position'},
    'phone': {'شماره', 'موبایل', 'تلفن', 'شمارهموبایل', 'شمارهتماس', 'phone', 'mobile'},
    'org': {'سازمان', 'شرکت', 'واحد', 'organization', 'company', 'org'},
}

AVATAR_COLORS = [
    '#2563EB,#1E3A8A', '#3B82F6,#1D4ED8', '#7C3AED,#5B21B6',
    '#D9930B,#A16207', '#DC4B4B,#B91C1C', '#0891B2,#0E7490',
]

MAX_ROWS = 500


def _norm(text) -> str:
    """برای مقایسهٔ سرصفحه‌ها: بدون فاصله، نیم‌فاصله و حروف بزرگ."""
    return re.sub(r'[\s‌_\-\.]+', '', str(text or '')).strip().lower()


def _read_csv(raw: bytes) -> list[list[str]]:
    for encoding in ('utf-8-sig', 'utf-8', 'cp1256'):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError('کدگذاری فایل CSV قابل تشخیص نیست.')
    sample = text[:2000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in row)]


_NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def _read_xlsx(raw: bytes) -> list[list[str]]:
    """برگهٔ اول فایل xlsx را به شکل جدول متنی برمی‌گرداند."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise ValueError('فایل اکسل سالم نیست.')

    shared: list[str] = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in root.findall(f'{_NS}si'):
            shared.append(''.join(t.text or '' for t in si.iter(f'{_NS}t')))

    sheets = sorted(n for n in zf.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', n))
    if not sheets:
        raise ValueError('برگه‌ای در فایل اکسل پیدا نشد.')

    rows: list[list[str]] = []
    root = ET.fromstring(zf.read(sheets[0]))
    for row in root.iter(f'{_NS}row'):
        cells: dict[int, str] = {}
        for cell in row.findall(f'{_NS}c'):
            ref = cell.get('r') or ''
            col = 0
            for ch in re.match(r'[A-Z]*', ref).group(0):
                col = col * 26 + (ord(ch) - 64)
            col = max(col - 1, 0)

            if cell.get('t') == 'inlineStr':
                value = ''.join(t.text or '' for t in cell.iter(f'{_NS}t'))
            else:
                v = cell.find(f'{_NS}v')
                value = v.text if v is not None and v.text else ''
                if cell.get('t') == 's' and value.isdigit():
                    idx = int(value)
                    value = shared[idx] if idx < len(shared) else ''
            if value:
                cells[col] = value
        if cells:
            rows.append([cells.get(i, '') for i in range(max(cells) + 1)])
    return rows


def _map_columns(header: list[str]) -> dict[str, int]:
    found: dict[str, int] = {}
    for i, cell in enumerate(header):
        key = _norm(cell)
        for field, names in COLUMNS.items():
            if field not in found and key in names:
                found[field] = i
    return found


def import_people(upload, default_org: Organization | None = None) -> dict:
    """
    فایل را می‌خواند و افراد را می‌سازد.

    خروجی: تعداد ساخته‌شده، تعداد ردشده (تکراری یا بی‌نام) و شرح خطاهای هر سطر
    تا کاربر بداند کدام سطرِ فایلش مشکل داشته.
    """
    raw = upload.read()
    name = (getattr(upload, 'name', '') or '').lower()
    rows = _read_xlsx(raw) if name.endswith(('.xlsx', '.xlsm')) else _read_csv(raw)

    if not rows:
        raise ValueError('فایل خالی است.')
    if len(rows) - 1 > MAX_ROWS:
        raise ValueError(f'حداکثر {fa_digits(MAX_ROWS)} سطر در هر بار درون‌ریزی پذیرفته می‌شود.')

    cols = _map_columns(rows[0])
    if 'name' not in cols:
        raise ValueError('ستون «نام» پیدا نشد. سرصفحهٔ فایل باید ستون نام داشته باشد.')

    orgs = {o.name.strip(): o for o in Organization.objects.all()}
    created_ids: list[int] = []
    skipped: list[str] = []
    color_at = User.objects.count()

    def cell(row: list[str], field: str) -> str:
        i = cols.get(field)
        return str(row[i]).strip() if i is not None and i < len(row) else ''

    for n, row in enumerate(rows[1:], start=2):
        full = cell(row, 'name')
        if not full:
            continue

        phone = normalize_phone(cell(row, 'phone')) if cell(row, 'phone') else ''
        if phone and not is_valid_phone(phone):
            skipped.append(f'سطر {fa_digits(n)}: شمارهٔ «{cell(row, "phone")}» معتبر نیست.')
            continue
        if phone and User.objects.filter(phone=phone).exists():
            skipped.append(f'سطر {fa_digits(n)}: شمارهٔ {fa_digits(phone)} از قبل ثبت شده است.')
            continue

        first, _, last = full.partition(' ')
        if User.objects.filter(first_name=first, last_name=last, is_external=False).exists():
            skipped.append(f'سطر {fa_digits(n)}: «{full}» از قبل در فهرست هست.')
            continue

        org = orgs.get(cell(row, 'org')) or default_org
        base = f'imp{User.objects.count() + 1}'
        username, i = base, 1
        while User.objects.filter(username=username).exists():
            i += 1
            username = f'{base}_{i}'

        user = User.objects.create(
            username=username, first_name=first, last_name=last,
            title=cell(row, 'role') or 'عضو',
            phone=phone, organization=org,
            color=AVATAR_COLORS[color_at % len(AVATAR_COLORS)],
            role=User.Role.MEMBER,
        )
        user.set_unusable_password()
        user.save(update_fields=['password'])
        created_ids.append(user.pk)
        color_at += 1

    return {
        'created': len(created_ids),
        'skipped': len(skipped),
        'messages': skipped[:20],
        'created_ids': created_ids,
    }
