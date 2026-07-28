"""
مقداردهی اولیهٔ داده‌های پایه (نه دادهٔ نمونه/ماک).

فقط چیزهایی ساخته می‌شوند که سامانه برای کار کردن به آن‌ها نیاز دارد:
انواع سازمان و دسته‌بندی جلسات. بقیهٔ داده‌ها را کاربران خودشان می‌سازند.

    python manage.py init_data
    python manage.py init_data --wipe   # پاک کردن همهٔ دادهٔ عملیاتی (به‌جز کاربران ادمین)
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from meetings.models import (
    AgendaItem, Attachment, Category, GoogleCalendarConnection, Location, Meeting,
    MeetingParticipant, MinuteEntry, Minutes, Notification, Organization,
    OrganizationKind, User,
)

ORG_KINDS = [
    ('internal', 'داخلی', 1),
    ('bank', 'بانک', 2),
    ('regulator', 'رگولاتور', 3),
    ('partner', 'شریک', 4),
    ('vendor', 'تأمین‌کننده', 5),
]

CATEGORIES = [
    ('هیئت مدیره', '#7C3AED'),
    ('داخلی', '#0E9F6E'),
    ('بازاریابی و فروش', '#2F7FE4'),
    ('رگولاتوری', '#D9930B'),
    ('شرکا', '#0891B2'),
]


class Command(BaseCommand):
    help = 'ساخت داده‌های پایه (انواع سازمان و دسته‌بندی جلسات)'

    def add_arguments(self, parser):
        parser.add_argument('--wipe', action='store_true',
                            help='حذف کامل دادهٔ عملیاتی پیش از مقداردهی')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['wipe']:
            Attachment.objects.all().delete()
            MinuteEntry.objects.all().delete()
            Minutes.objects.all().delete()
            AgendaItem.objects.all().delete()
            MeetingParticipant.objects.all().delete()
            Notification.objects.all().delete()
            Meeting.objects.all().delete()
            GoogleCalendarConnection.objects.all().delete()
            Location.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            Organization.objects.all().delete()
            Category.objects.all().delete()
            self.stdout.write(self.style.WARNING('دادهٔ عملیاتی پاک شد.'))

        for slug, name, order in ORG_KINDS:
            OrganizationKind.objects.get_or_create(
                slug=slug, defaults={'name': name, 'order': order})
        for name, color in CATEGORIES:
            Category.objects.get_or_create(name=name, defaults={'color': color})

        self.stdout.write(self.style.SUCCESS(
            f'✓ {OrganizationKind.objects.count()} نوع سازمان و '
            f'{Category.objects.count()} دستهٔ جلسه آماده است.'
        ))
