from django.apps import AppConfig
from django.db.backends.signals import connection_created
from django.dispatch import receiver


@receiver(connection_created)
def _sqlite_wal(sender, connection, **kwargs):
    """
    روشن‌کردن WAL روی هر اتصال SQLite.

    با آمدن همگام‌سازی Outlook، یک پروسهٔ جدا هر دقیقه می‌نویسد در حالی که
    gunicorn دارد می‌خواند. در حالت پیش‌فرض (journal=DELETE) هر نوشتن کل
    دیتابیس را قفل می‌کند و خواننده‌ها «database is locked» می‌گیرند؛ با WAL
    خواندن و نوشتن هم‌زمان ممکن می‌شود.

    اینجا و نه در OPTIONS['init_command']: پشتیبانی SQLite از init_command
    از جنگو ۵٫۱ آمده و این پروژه روی ۵٫۰ است.
    """
    if connection.vendor != 'sqlite':
        return
    with connection.cursor() as cur:
        cur.execute('PRAGMA journal_mode=WAL;')
        cur.execute('PRAGMA synchronous=NORMAL;')


class MeetingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'meetings'
    verbose_name = 'مدیریت جلسات'
