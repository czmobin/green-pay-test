"""
پر کردن دیتابیس با دادهٔ نمونهٔ گرین‌پی (همان دادهٔ دموی فرانت‌اند).

    python manage.py seed_demo          # فقط اگر خالی باشد
    python manage.py seed_demo --reset  # پاک کردن و ساخت دوباره
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from meetings.models import (
    AgendaItem, Attachment, Category, GoogleCalendarConnection, Location, Meeting,
    MeetingParticipant, MinuteEntry, Minutes, Organization, User,
)
from meetings.serializers import from_day_hour

ORGS = [
    ('gp', 'گرین‌پی', 'internal'),
    ('melat', 'بانک ملت', 'bank'),
    ('behpardakht', 'به‌پرداخت ملت', 'bank'),
    ('shaparak', 'شاپرک', 'regulator'),
    ('cbi', 'بانک مرکزی', 'regulator'),
    ('datin', 'استارتاپ داتین', 'partner'),
    ('faraboom', 'فرابوم', 'partner'),
]

CATEGORIES = [
    ('board', 'هیئت مدیره', '#7C3AED'),
    ('greenpay', 'داخلی گرین‌پی', '#0E9F6E'),
    ('bank', 'بازاریابی و فروش بانکی', '#2F7FE4'),
    ('regulator', 'رگولاتوری (شاپرک/بانک مرکزی)', '#D9930B'),
    ('partner', 'شرکا و استارتاپ‌ها', '#0891B2'),
]

ROOMS = [
    ('board', 'اتاق هیئت مدیره', '۱۴ نفر', 'gp', False),
    ('alborz', 'اتاق کنفرانس البرز', '۱۰ نفر', 'gp', False),
    ('damavand', 'اتاق دماوند', '۶ نفر', 'gp', False),
    ('sabalan', 'اتاق سبلان', '۴ نفر', 'gp', False),
    ('melat_hq', 'دفتر مرکزی بانک ملت', '۸ نفر', 'melat', False),
    ('online', 'Google Meet', 'آنلاین', 'gp', True),
]

# key, نام, نام خانوادگی, سمت, رنگ, نقش دسترسی
PEOPLE = [
    ('ceo', 'علیرضا', 'صادقی', 'مدیرعامل', '#0E9F6E,#08281E', User.Role.CEO),
    ('sara', 'سارا', 'محمدی', 'مدیر محصول', '#7C3AED,#4C1D95', User.Role.MEMBER),
    ('reza', 'رضا', 'کریمی', 'مدیر فنی (CTO)', '#2F7FE4,#153E7E', User.Role.MEMBER),
    ('negar', 'نگار', 'احمدی', 'مدیر مالی', '#D9930B,#7A4E00', User.Role.MEMBER),
    ('amir', 'امیر', 'حسینی', 'مدیر بازاریابی', '#DC4B4B,#7A1F1F', User.Role.MEMBER),
    ('maryam', 'مریم', 'رضایی', 'مدیر منابع انسانی', '#0E9F6E,#0B5B3E', User.Role.MEMBER),
    ('hossein', 'حسین', 'موسوی', 'مدیر عملیات', '#0891B2,#0E4A5A', User.Role.MEMBER),
    ('elham', 'الهام', 'نوری', 'مدیر فروش', '#DB2777,#831843', User.Role.MEMBER),
    ('jafari', 'محمد', 'جعفری', 'مدیر ریسک و تطبیق', '#4F46E5,#312E81', User.Role.MEMBER),
    ('zahra', 'زهرا', 'عباسی', 'مدیر پشتیبانی', '#059669,#064E3B', User.Role.MEMBER),
    ('kaveh', 'کاوه', 'رستمی', 'توسعهٔ کسب‌وکار', '#B45309,#78350F', User.Role.MEMBER),
]

# key, نام, نام خانوادگی, سازمان, سمت
GUESTS = [
    ('bahram', 'دکتر بهرام', 'تهرانی', 'shaparak', 'نمایندهٔ فنی'),
    ('leila', 'لیلا', 'فراهانی', 'melat', 'مدیر همکاری‌ها'),
    ('saeed', 'سعید', 'مرادی', 'datin', 'هم‌بنیان‌گذار'),
    ('kian', 'کیان', 'عزیزی', 'cbi', 'کارشناس نظارت'),
    ('nasrin', 'نسرین', 'قاسمی', 'behpardakht', 'مدیر محصول'),
    ('omid', 'امید', 'صالحی', 'faraboom', 'مدیر یکپارچه‌سازی'),
]

MEETINGS = [
    ('m1', 'جلسهٔ هیئت مدیره — بازبینی فصلی Q۲', 'board', 'board', 'confirmed', 1, 9, 11, 'board', 'ceo',
     ['ceo', 'sara', 'reza', 'negar', 'jafari'], ['kian'], True,
     [('گزارش عملکرد مالی فصل بهار', 25), ('وضعیت تراکنش‌های درگاه پرداخت', 20),
      ('برنامهٔ توسعهٔ بازار ۱۴۰۴', 30), ('مصوبات و جمع‌بندی', 20)]),
    ('m2', 'هماهنگی یکپارچه‌سازی با شاپرک', 'regulator', 'external', 'confirmed', 1, 11, 12, 'alborz', 'reza',
     ['reza', 'hossein', 'jafari'], ['bahram', 'omid'], True,
     [('بازبینی مستندات API نسخهٔ ۳', 20), ('الزامات امنیتی و PCI-DSS', 25), ('زمان‌بندی استقرار', 15)]),
    ('m3', 'بازبینی محصول — داشبورد پذیرندگان', 'greenpay', 'internal', 'confirmed', 1, 13, 14, 'damavand', 'sara',
     ['sara', 'reza', 'amir', 'zahra'], [], False,
     [('بازخورد کاربران نسخهٔ بتا', 20), ('اولویت‌بندی نقشهٔ راه', 25), ('طراحی جدید صفحهٔ تسویه', 15)]),
    ('m4', 'جلسهٔ فروش سازمانی با بانک ملت', 'bank', 'external', 'pending', 1, 15, 16, 'alborz', 'elham',
     ['elham', 'kaveh', 'ceo'], ['leila'], True,
     [('معرفی راهکار پرداخت سازمانی', 20), ('مدل قیمت‌گذاری و کارمزد', 20), ('گام‌های بعدی همکاری', 20)]),
    ('m5', 'استندآپ تیم فنی', 'greenpay', 'internal', 'confirmed', 2, 9, 9.5, 'damavand', 'reza',
     ['reza', 'sara', 'zahra'], [], True,
     [('وضعیت اسپرینت جاری', 15), ('موانع فنی', 15)]),
    ('m6', 'وبینار آنلاین با فرابوم', 'partner', 'online', 'confirmed', 2, 11, 12, 'online', 'kaveh',
     ['kaveh', 'reza'], ['omid', 'nasrin'], True,
     [('نمایش سرویس تسویهٔ آنی', 30), ('پرسش و پاسخ', 30)]),
    ('m7', 'کمیتهٔ ریسک و تطبیق', 'greenpay', 'internal', 'confirmed', 2, 14, 15.5, 'alborz', 'jafari',
     ['jafari', 'negar', 'hossein', 'ceo'], [], False,
     [('بازبینی گزارش‌های مشکوک', 30), ('به‌روزرسانی سیاست‌های KYC', 30), ('ممیزی داخلی', 30)]),
    ('m8', 'مذاکره با استارتاپ داتین', 'partner', 'external', 'pending', 3, 10, 11, 'damavand', 'kaveh',
     ['kaveh', 'ceo', 'elham'], ['saeed'], True,
     [('مدل مشارکت فنی', 25), ('اشتراک درآمد', 20), ('توافق‌نامهٔ اولیه', 15)]),
    ('m9', 'جلسهٔ منابع انسانی — جذب نیرو', 'greenpay', 'internal', 'confirmed', 3, 13, 14, 'sabalan', 'maryam',
     ['maryam', 'reza', 'sara'], [], True,
     [('بازبینی موقعیت‌های باز', 20), ('مصاحبه‌های این هفته', 20)]),
    ('m10', 'بازبینی امنیت با به‌پرداخت', 'bank', 'external', 'confirmed', 4, 9.5, 11, 'alborz', 'jafari',
     ['jafari', 'reza', 'hossein'], ['nasrin', 'bahram'], True,
     [('ممیزی امنیتی مشترک', 30), ('گزارش تست نفوذ', 30), ('برنامهٔ اصلاح', 30)]),
    ('m11', 'جمع‌بندی هفتگی مدیران', 'greenpay', 'internal', 'confirmed', 4, 16, 17, 'board', 'ceo',
     ['ceo', 'sara', 'reza', 'negar', 'amir', 'maryam', 'hossein', 'elham', 'jafari', 'zahra', 'kaveh'],
     [], True, [('گزارش هر واحد', 30), ('اهداف هفتهٔ آینده', 20)]),
]

# جلسه, شرکت‌کنندهٔ سطل (یا None=عمومی), نوع, متن, extra
ENTRIES = [
    ('m1', None, 'decision', 'بودجهٔ توسعهٔ بازار ۱۴۰۴ به مبلغ مصوب تأیید شد.', {}),
    ('m1', 'negar', 'task', 'تهیهٔ گزارش تفصیلی ریسک نقدینگی برای جلسهٔ بعد',
     {'assignee': 'negar', 'due_text': '۲۸ تیر'}),
    ('m1', None, 'reminder', 'ارسال صورت‌جلسه به اعضای هیئت مدیره', {'remind_text': 'فردا ۹:۰۰'}),
    ('m1', 'negar', 'letter', 'ابلاغ مصوبات جلسه به واحد مالی', {'file_name': 'مصوبات-Q2.pdf'}),
    ('m2', None, 'task', 'ارسال مستندات API نسخهٔ ۳ به تیم شاپرک',
     {'assignee': 'reza', 'due_text': '۲۴ تیر'}),
    ('m2', None, 'call', 'هماهنگی زمان استقرار',
     {'call_with': 'دکتر تهرانی', 'call_phone': '۰۲۱۸۸۰۰۰۰۰۰'}),
    ('m4', None, 'task', 'ارسال پیش‌فاکتور راهکار پرداخت سازمانی',
     {'assignee': 'elham', 'due_text': '۲۶ تیر'}),
    ('m4', None, 'reminder', 'پیگیری پاسخ بانک ملت دربارهٔ همکاری', {'remind_text': 'سه‌شنبه ۱۰:۰۰'}),
    ('m7', None, 'task', 'به‌روزرسانی سیاست‌های KYC طبق مصوبه',
     {'assignee': 'jafari', 'due_text': '۳۰ تیر'}),
]


class Command(BaseCommand):
    help = 'وارد کردن دادهٔ نمونهٔ گرین‌پی'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='حذف دادهٔ قبلی و ساخت دوباره')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            Attachment.objects.all().delete()
            MinuteEntry.objects.all().delete()
            Minutes.objects.all().delete()
            AgendaItem.objects.all().delete()
            MeetingParticipant.objects.all().delete()
            Meeting.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            Location.objects.all().delete()
            Category.objects.all().delete()
            Organization.objects.all().delete()
            self.stdout.write('دادهٔ قبلی پاک شد.')
        elif Meeting.objects.exists():
            self.stdout.write(self.style.WARNING('دیتابیس از قبل داده دارد؛ برای بازسازی از --reset استفاده کنید.'))
            return

        orgs = {k: Organization.objects.create(name=n, kind=kind) for k, n, kind in ORGS}
        cats = {k: Category.objects.create(name=n, color=c) for k, n, c in CATEGORIES}
        rooms = {k: Location.objects.create(name=n, capacity=cap, organization=orgs[o], is_online=online)
                 for k, n, cap, o, online in ROOMS}

        users = {}
        for key, first, last, title, color, role in PEOPLE:
            users[key] = User.objects.create(
                username=key, first_name=first, last_name=last, title=title,
                color=color, role=role, organization=orgs['gp'], is_external=False,
            )
        for key, first, last, org, title in GUESTS:
            users[key] = User.objects.create(
                username=key, first_name=first, last_name=last, title=title,
                organization=orgs[org], is_external=True, role=User.Role.MEMBER,
            )

        meetings = {}
        for (key, title, cat, mtype, mstatus, day, start, end,
             room, organizer, parts, guests, synced, agenda) in MEETINGS:
            meeting = Meeting.objects.create(
                title=title, category=cats[cat], meeting_type=mtype, status=mstatus,
                location=rooms[room], organizer=users[organizer],
                start=from_day_hour(day, start), end=from_day_hour(day, end),
                google_synced=synced,
            )
            meetings[key] = meeting
            for order, (a_title, dur) in enumerate(agenda, start=1):
                AgendaItem.objects.create(meeting=meeting, order=order, title=a_title, duration_minutes=dur)
            for uid in parts:
                MeetingParticipant.objects.create(
                    meeting=meeting, user=users[uid], is_guest=False,
                    response=(MeetingParticipant.Response.PENDING if mstatus == 'pending'
                              else MeetingParticipant.Response.ACCEPTED),
                )
            for uid in guests:
                MeetingParticipant.objects.create(
                    meeting=meeting, user=users[uid], is_guest=True,
                    response=MeetingParticipant.Response.PENDING,
                )

        for m_key, participant, etype, text, extra in ENTRIES:
            minutes, _ = Minutes.objects.get_or_create(
                meeting=meetings[m_key],
                participant=users[participant] if participant else None,
                defaults={'created_by': meetings[m_key].organizer},
            )
            entry = MinuteEntry.objects.create(
                minutes=minutes, entry_type=etype, text=text,
                created_by=meetings[m_key].organizer,
                assignee=users[extra['assignee']] if extra.get('assignee') else None,
                due_text=extra.get('due_text', ''),
                remind_text=extra.get('remind_text', ''),
                call_with=extra.get('call_with', ''),
                call_phone=extra.get('call_phone', ''),
            )
            if extra.get('file_name'):
                Attachment.objects.create(
                    minutes=minutes, entry=entry, name=extra['file_name'],
                    kind=Attachment.Kind.LETTER if etype == 'letter' else Attachment.Kind.FILE,
                )

        GoogleCalendarConnection.objects.get_or_create(user=users['ceo'])

        self.stdout.write(self.style.SUCCESS(
            f'✓ {Organization.objects.count()} سازمان، {User.objects.filter(is_external=False).count()} عضو، '
            f'{User.objects.filter(is_external=True).count()} مهمان، {Location.objects.count()} محل، '
            f'{Meeting.objects.count()} جلسه، {MinuteEntry.objects.count()} آیتم صورت‌جلسه ساخته شد.'
        ))
