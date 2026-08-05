"""
تبدیل تاریخ میلادی به شمسی — برای متن پیامک‌ها.

دیتابیس تاریخ‌ها را میلادی نگه می‌دارد (که برای محاسبه و مرتب‌سازی درست است)
ولی پیامکی که به دست کاربر می‌رسد باید شمسی باشد. الگوریتم همان jalaali-js
است که در فرانت هم استفاده می‌شود، تا دو طرف هرگز یک روز اختلاف پیدا نکنند.
"""
from datetime import date as _date

MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
          'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']

_FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')

BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060,
          2097, 2192, 2262, 2324, 2394, 2456, 3178]


def fa_digits(text) -> str:
    return str(text).translate(_FA)


def _div(a: int, b: int) -> int:
    """تقسیم با کوتاه‌سازی به‌سمت صفر — همان رفتار Math.trunc در نسخهٔ فرانت."""
    return int(a / b) if (a < 0) != (b < 0) else a // b


def _mod(a: int, b: int) -> int:
    return a - _div(a, b) * b


def _jal_cal(jy: int) -> dict:
    gy = jy + 621
    leap_j = -14
    jp = BREAKS[0]
    jm = jump = 0
    for jm in BREAKS[1:]:
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + _div(jump + 4, 33) * 33
    leap = _mod(_mod(n + 1, 33) - 1, 4)
    if leap == -1:
        leap = 4
    return {'leap': leap, 'gy': gy, 'march': march}


def _g2d(gy: int, gm: int, gd: int) -> int:
    d = (_div((gy + _div(gm - 8, 6) + 100100) * 1461, 4)
         + _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408)
    return d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752


def _d2g(jdn: int) -> int:
    j = 4 * jdn + 139361631
    j += _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    i = _div(_mod(j, 1461), 4) * 5 + 308
    gm = _mod(_div(i, 153), 12) + 1
    return _div(j, 1461) - 100100 + _div(8 - gm, 6)


def to_jalali(d: _date) -> tuple[int, int, int]:
    """تاریخ میلادی → (سال، ماه، روز) شمسی."""
    jdn = _g2d(d.year, d.month, d.day)
    gy = _d2g(jdn)
    jy = gy - 621
    r = _jal_cal(jy)
    k = jdn - _g2d(gy, 3, r['march'])
    if k >= 0:
        if k <= 185:
            return jy, 1 + _div(k, 31), _mod(k, 31) + 1
        k -= 186
    else:
        jy -= 1
        k += 179
        if r['leap'] == 1:
            k += 1
    return jy, 7 + _div(k, 30), _mod(k, 30) + 1


def fa_date(d: _date, with_year: bool = False) -> str:
    """«۱۲ مرداد» یا «۱۲ مرداد ۱۴۰۵»."""
    jy, jm, jd = to_jalali(d)
    out = f'{fa_digits(jd)} {MONTHS[jm - 1]}'
    return f'{out} {fa_digits(jy)}' if with_year else out


def fa_weekday(d: _date) -> str:
    """نام روز هفته به فارسی — شنبه تا جمعه."""
    # weekday(): دوشنبه=۰ … یک‌شنبه=۶  →  شنبه=۰ … جمعه=۶
    return WEEKDAYS[(d.weekday() + 2) % 7]
