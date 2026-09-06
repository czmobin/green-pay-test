"""
مدل‌های دامنهٔ گرین‌پی — مدیریت جلسات سازمانی.

ساختار کلی:
  Organization ─< Location
  Organization ─< User (افراد داخلی و مهمانان خارجی)
  Meeting >─ Category, Location, organizer(User)
  Meeting ─< MeetingParticipant >─ User         (شرکت‌کنندگان + مهمانان + پاسخ دعوت)
  Meeting ─< AgendaItem                         (دستور جلسه)
  Meeting ─< Minutes (به‌ازای هر شرکت‌کننده/عمومی) ─< MinuteEntry ─< Attachment
  User ─< Notification                          (اعلان ۳۰ دقیقه قبل + پیامک)
"""
import re
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class OrganizationKind(models.Model):
    """نوع سازمان — از پنل ادمین قابل ایجاد و ویرایش است."""
    slug = models.SlugField('شناسه', max_length=40, unique=True)
    name = models.CharField('نام', max_length=60)
    order = models.PositiveSmallIntegerField('ترتیب', default=0)

    class Meta:
        verbose_name = 'نوع سازمان'
        verbose_name_plural = 'انواع سازمان'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class Organization(models.Model):
    """سازمان/شرکت (داخلی گرین‌پی، بانک‌ها، رگولاتورها، شرکا)."""
    name = models.CharField('نام', max_length=120)
    kind = models.ForeignKey(
        OrganizationKind, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='organizations', verbose_name='نوع',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'سازمان'
        verbose_name_plural = 'سازمان‌ها'
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    """کاربر/فرد — هم کارکنان داخلی (با ورود) و هم مهمانان خارجی (is_external)."""
    class Role(models.TextChoices):
        ADMIN = 'admin', 'ادمین'
        CEO = 'ceo', 'مدیرعامل'
        EXECUTIVE = 'executive', 'مدیر اجرایی'
        MEMBER = 'member', 'کاربر عادی'

    role = models.CharField('سطح دسترسی', max_length=10, choices=Role.choices, default=Role.MEMBER)
    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name='members',
        verbose_name='سازمان',
    )
    title = models.CharField('سمت', max_length=120, blank=True)
    phone = models.CharField('شمارهٔ تماس', max_length=20, blank=True)
    color = models.CharField('رنگ آواتار', max_length=40, blank=True, help_text='گرادیان "start,end"')
    is_external = models.BooleanField('مهمان خارجی', default=False)
    sms_enabled = models.BooleanField('ارسال پیامک', default=False)

    class Meta:
        verbose_name = 'کاربر/فرد'
        verbose_name_plural = 'کاربران/افراد'
        constraints = [
            # صندوق Outlook با ایمیل شناخته می‌شود، پس دو کاربر با یک ایمیل
            # یعنی دو نفر که یک تقویم دارند — و همگام‌سازی دیگر نمی‌داند جلسه
            # را به کدامشان نسبت بدهد. خالی از قید مستثناست چون امروز ایمیلِ
            # هیچ‌کس پر نیست و `AbstractUser.email` هم blank را مجاز می‌داند.
            models.UniqueConstraint(
                Lower('email'), condition=~models.Q(email=''), name='uniq_user_email_ci'),
        ]

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def has_mailbox(self) -> bool:
        return bool((self.email or '').strip())


class Location(models.Model):
    """محل جلسه، متصل به یک سازمان (اتاق داخلی، دفتر بانک، یا آنلاین)."""
    name = models.CharField('نام', max_length=120)
    capacity = models.CharField('ظرفیت', max_length=40, blank=True)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='locations', verbose_name='سازمان',
    )
    is_online = models.BooleanField('آنلاین', default=False)
    address = models.TextField('نشانی کامل', blank=True)
    lat = models.FloatField('عرض جغرافیایی', null=True, blank=True)
    lng = models.FloatField('طول جغرافیایی', null=True, blank=True)

    @property
    def has_map(self) -> bool:
        return self.lat is not None and self.lng is not None

    class Meta:
        verbose_name = 'محل جلسه'
        verbose_name_plural = 'محل‌های جلسه'
        ordering = ['name']

    def __str__(self):
        return self.name


class Category(models.Model):
    """دسته‌بندی جلسه (هیئت مدیره، داخلی، بانکی، رگولاتوری، شرکا)."""
    name = models.CharField('نام', max_length=120)
    color = models.CharField('رنگ', max_length=20, default='#0E9F6E')

    class Meta:
        verbose_name = 'دستهٔ جلسه'
        verbose_name_plural = 'دسته‌های جلسه'
        ordering = ['name']

    def __str__(self):
        return self.name


class Meeting(models.Model):
    """جلسه."""
    class Type(models.TextChoices):
        IN_PERSON = 'in_person', 'حضوری'
        ONLINE = 'online', 'آنلاین'

    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', 'تأییدشده'
        PENDING = 'pending', 'در انتظار'
        CANCELLED = 'cancelled', 'لغوشده'
        DONE = 'done', 'برگزارشده'

    class Priority(models.TextChoices):
        LOW = 'low', 'کم'
        NORMAL = 'normal', 'عادی'
        HIGH = 'high', 'زیاد'
        CRITICAL = 'critical', 'خیلی زیاد'

    title = models.CharField('عنوان', max_length=255)
    priority = models.CharField('اولویت', max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    meet_link = models.CharField('لینک جلسهٔ آنلاین', max_length=500, blank=True,
                                 help_text='نشانی کامل هر سرویسی — Google Meet، اسکای‌روم، Zoom، Adobe Connect و…')
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='meetings',
        verbose_name='دسته‌بندی',
    )
    meeting_type = models.CharField('نوع', max_length=12, choices=Type.choices, default=Type.IN_PERSON)
    status = models.CharField('وضعیت', max_length=12, choices=Status.choices, default=Status.CONFIRMED)
    location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.SET_NULL, related_name='meetings',
        verbose_name='محل',
    )
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='organized_meetings',
        verbose_name='برگزارکننده',
    )
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through='MeetingParticipant', related_name='meetings',
        verbose_name='شرکت‌کنندگان',
    )
    start = models.DateTimeField('شروع')
    end = models.DateTimeField('پایان')

    # محل به‌صورت متن آزاد — فقط برای جلسه‌هایی که از Outlook می‌آیند و محلشان
    # با هیچ `Location` تعریف‌شده‌ای جور نیست. عمداً `Location` خودکار ساخته
    # نمی‌شود: متن آزادِ Outlook یک picklist کوتاه را — که تشخیص تداخل اتاق
    # رویش بنا شده — ظرف یک هفته بی‌ارزش می‌کند.
    location_text = models.CharField('محل (متن آزاد)', max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # آخرین تغییرِ *انسانی* از داخل اپ. جدا از `updated_at` است چون آن یکی
    # `auto_now` دارد و با نوشتنِ خودِ همگام‌سازی هم بالا می‌رود؛ اگر تشخیص
    # تعارض به آن تکیه کند، هر واکشی تعارض به نظر می‌رسد.
    local_changed_at = models.DateTimeField('آخرین تغییر محلی', null=True, blank=True)

    # --- همگام‌سازی Outlook ---
    # شناسهٔ یکتای رویداد در Outlook. برای occurrenceهای یک سری تکرارشونده
    # به شکل «iCalUId|originalStart» است، وگرنه قید یکتا کل سری را در یک
    # جلسه جمع می‌کند.
    outlook_uid = models.CharField('شناسهٔ Outlook', max_length=512, blank=True, db_index=True)
    outlook_synced = models.BooleanField('همگام با Outlook', default=False)
    # جلسه‌ای که برگزارکننده‌اش بیرون از سازمان است: در اپ فقط خوانده می‌شود و
    # هیچ‌وقت به Outlook فرستاده نمی‌شود.
    outlook_readonly = models.BooleanField('فقط‌خواندنی (برگزارکنندهٔ بیرونی)', default=False)
    # «تغییر محلی هست که هنوز نرفته». تنها نویسنده‌اش `mark_dirty()` است — که
    # فقط از مسیر API انسانی صدا زده می‌شود. اعمال‌کنندهٔ تغییراتِ ورودی هرگز
    # لمسش نمی‌کند، و ping-pong به‌خاطر همین ساختار ناممکن است، نه به‌خاطر یک
    # حدسِ هوشمندانه.
    outlook_dirty = models.BooleanField('در صف ارسال به Outlook', default=False)
    outlook_conflict_at = models.DateTimeField('زمان تعارض', null=True, blank=True)
    outlook_conflict_note = models.CharField('شرح تعارض', max_length=255, blank=True)

    cancel_reason = models.TextField('دلیل لغو', blank=True)
    cancelled_at = models.DateTimeField('زمان لغو', null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='cancelled_meetings', verbose_name='لغوکننده',
    )

    class Meta:
        verbose_name = 'جلسه'
        verbose_name_plural = 'جلسات'
        ordering = ['start']
        constraints = [
            # یک رویداد Outlook = یک جلسه. جلسه‌های محلی (که هنوز شناسه ندارند)
            # از قید بیرون‌اند، وگرنه دومین جلسهٔ داخلی ساخته نمی‌شد.
            models.UniqueConstraint(fields=['outlook_uid'], condition=~models.Q(outlook_uid=''),
                                    name='uniq_meeting_outlook_uid'),
        ]

    def __str__(self):
        return self.title

    def mark_dirty(self, *, when=None):
        """
        این جلسه از داخل اپ عوض شد؛ در اجرای بعدیِ همگام‌سازی به Outlook برود.

        دو رفتار که عمدی‌اند:

        • **وقتی همگام‌سازی خاموش است، هیچ کاری نمی‌کند.** بدون این، جلسه‌های
          امروز کم‌کم `outlook_dirty` می‌شدند و روزی که کلید روشن شود، انبوهی
          دعوت‌نامهٔ ماه‌ها پیش یک‌جا برای همه شلیک می‌شد. قرار همین بود:
          «فقط از این پس» — انتقال عمدیِ جلسه‌های قدیمی فقط با
          `outlook_sync --backfill --since`.

        • **جلسهٔ فقط‌خواندنی هرگز dirty نمی‌شود** — برگزارکننده‌اش بیرون از
          سازمان است و ما اجازهٔ نوشتن روی رویدادش را نداریم.

        ارسال هم اینجا انجام نمی‌شود، فقط علامت می‌خورد: مسیر ساخت/ویرایش جلسه
        همین حالا چند تماس پیامکی همزمان دارد؛ افزودن دو وابستگی شبکهٔ بیست‌ثانیه‌ای
        به مسیر کاربر بدترش می‌کند. تایمر هر دقیقه صف را خالی می‌کند، و چند
        ویرایش پشت‌سرهم در یک ایمیلِ «Updated:» جمع می‌شوند.
        """
        from django.utils import timezone

        from . import graph
        fields = ['local_changed_at']
        self.local_changed_at = when or timezone.now()
        if graph.enabled() and not self.outlook_readonly:
            self.outlook_dirty = True
            fields.append('outlook_dirty')
        if self.pk:
            self.save(update_fields=fields + ['updated_at'])

    @staticmethod
    def normalize_meet(value: str) -> str:
        """
        لینک جلسهٔ آنلاین را همان‌طور که هست نگه می‌دارد.

        هر سازمانی سرویس خودش را دارد (Google Meet، اسکای‌روم، Zoom، Adobe Connect و…)
        پس هیچ دامنه‌ای حدس زده نمی‌شود؛ فقط اگر کاربر نشانی را بدون //:https نوشته
        باشد، همان را کامل می‌کنیم تا لینک قابل کلیک بماند.
        """
        value = (value or '').strip()
        if not value:
            return ''
        if value.startswith(('http://', 'https://')):
            return value
        if re.match(r'^[\w.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]|$)', value):
            return 'https://' + value
        return value                      # شناسه یا کد اتاق — بدون تغییر ذخیره می‌شود


class MeetingParticipant(models.Model):
    """جدول واسط شرکت‌کنندگان — شامل مهمانان و پاسخ دعوت‌نامه."""
    class Response(models.TextChoices):
        ACCEPTED = 'accepted', 'پذیرفته'
        PENDING = 'pending', 'در انتظار'
        DECLINED = 'declined', 'رد شده'

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='meeting_participants')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='participations')
    is_guest = models.BooleanField('مهمان خارجی', default=False)
    response = models.CharField('پاسخ دعوت', max_length=10, choices=Response.choices, default=Response.PENDING)

    class Meta:
        verbose_name = 'شرکت‌کنندهٔ جلسه'
        verbose_name_plural = 'شرکت‌کنندگان جلسه'
        unique_together = ('meeting', 'user')

    def __str__(self):
        return f'{self.user} @ {self.meeting}'


class AgendaItem(models.Model):
    """دستور جلسه — فهرست موضوعات به‌ترتیب."""
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='agenda')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='created_agenda_items',
    )
    order = models.PositiveIntegerField('ترتیب', default=0)
    title = models.CharField('موضوع', max_length=255)
    duration_minutes = models.PositiveIntegerField('مدت (دقیقه)', default=15)

    class Meta:
        verbose_name = 'بند دستور جلسه'
        verbose_name_plural = 'دستور جلسه'
        ordering = ['order']

    def __str__(self):
        return self.title


class Minutes(models.Model):
    """صورت‌جلسه — به‌ازای هر شرکت‌کننده یک صورت‌جلسه، یا صورت‌جلسهٔ عمومی (participant=NULL)."""
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='minutes_set')
    participant = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='participant_minutes', verbose_name='شرکت‌کننده (خالی = عمومی)',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_minutes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'صورت‌جلسه'
        verbose_name_plural = 'صورت‌جلسه‌ها'
        unique_together = ('meeting', 'participant')

    def __str__(self):
        who = self.participant if self.participant_id else 'عمومی'
        return f'صورت‌جلسهٔ {self.meeting} — {who}'


class MinuteEntry(models.Model):
    """یک آیتم صورت‌جلسه: یادداشت/تصمیم/یادآور/تماس/نامه/فایل."""
    class Type(models.TextChoices):
        NOTE = 'note', 'یادداشت'
        DECISION = 'decision', 'تصمیم'
        REMINDER = 'reminder', 'یادآور'
        CALL = 'call', 'تماس تلفنی'
        LETTER = 'letter', 'نامه'
        FILE = 'file', 'فایل'

    minutes = models.ForeignKey(Minutes, on_delete=models.CASCADE, related_name='entries')
    agenda_item = models.ForeignKey(
        'AgendaItem', null=True, blank=True, on_delete=models.SET_NULL, related_name='entries',
        verbose_name='بند دستور جلسه', help_text='اختیاری — این آیتم ذیل کدام بند مطرح شد',
    )
    entry_type = models.CharField('نوع', max_length=12, choices=Type.choices)
    text = models.TextField('متن', blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_entries',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField('آخرین ویرایش', null=True, blank=True)

    # وضعیت انجام برای یادآور و تماس تلفنی
    is_done = models.BooleanField('انجام شد', default=False)
    done_at = models.DateTimeField('زمان انجام', null=True, blank=True)

    # یادآور
    remind_at = models.DateTimeField('زمان یادآوری', null=True, blank=True)
    remind_text = models.CharField('زمان یادآوری (متن واردشده)', max_length=60, blank=True)

    # تماس تلفنی
    call_with = models.CharField('با چه کسی', max_length=120, blank=True)
    call_phone = models.CharField('شمارهٔ تماس', max_length=20, blank=True)

    class Meta:
        verbose_name = 'آیتم صورت‌جلسه'
        verbose_name_plural = 'آیتم‌های صورت‌جلسه'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_entry_type_display()}: {self.text[:40]}'


class Attachment(models.Model):
    """پیوست نامه/فایل متصل به یک صورت‌جلسه (و به‌صورت اختیاری یک آیتم)."""
    class Kind(models.TextChoices):
        LETTER = 'letter', 'نامه'
        FILE = 'file', 'فایل'

    minutes = models.ForeignKey(Minutes, on_delete=models.CASCADE, related_name='attachments')
    entry = models.ForeignKey(
        MinuteEntry, null=True, blank=True, on_delete=models.CASCADE, related_name='attachments',
    )
    kind = models.CharField('نوع', max_length=10, choices=Kind.choices, default=Kind.FILE)
    # تا پیش از آپلود واقعی، رکورد فقط نام فایل انتخاب‌شده را نگه می‌دارد
    file = models.FileField('فایل', upload_to='attachments/%Y/%m/', blank=True)
    name = models.CharField('نام نمایشی', max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='uploaded_attachments',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'پیوست'
        verbose_name_plural = 'پیوست‌ها'

    def __str__(self):
        return self.name or self.file.name


class MeetingReminder(models.Model):
    """
    یادآور پیامکی جلسه — برای هر شرکت‌کننده به‌صورت جداگانه.

    پیش‌فرض یک ساعت پیش از شروع است، ولی هر کاربر می‌تواند این فاصله را برای
    هر جلسه جداگانه عوض کند یا یادآور را برای همان جلسه خاموش کند.
    ردیف تا وقتی کاربر تنظیمی ندهد ساخته نمی‌شود؛ فرمان ارسال خودش می‌سازدش
    تا «فرستاده شد» هم همان‌جا ثبت شود.
    """
    LEAD_CHOICES = [15, 30, 60, 120, 180, 1440]

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='reminders')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='meeting_reminders')
    lead_minutes = models.PositiveIntegerField(
        'فاصله تا شروع (دقیقه)', default=60,
        help_text='چند دقیقه پیش از شروع جلسه پیامک برود')
    enabled = models.BooleanField('فعال', default=True)

    sent_at = models.DateTimeField('زمان ارسال', null=True, blank=True)
    send_error = models.CharField('خطای ارسال', max_length=200, blank=True)
    provider_msg_id = models.CharField(
        'شناسهٔ پیام نزد سرویس', max_length=40, blank=True,
        help_text='برای پیگیری گزارش تحویل در پنل پیامک')
    delivery_code = models.IntegerField('کد تحویل', null=True, blank=True)
    delivery_checked_at = models.DateTimeField('آخرین بررسی تحویل', null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'یادآور جلسه'
        verbose_name_plural = 'یادآورهای جلسه'
        constraints = [
            models.UniqueConstraint(fields=['meeting', 'user'], name='uniq_reminder_per_user'),
        ]
        indexes = [models.Index(fields=['sent_at'])]

    def __str__(self):
        return f'{self.user} — {self.meeting}'

    @property
    def send_at(self):
        """لحظه‌ای که پیامک باید برود."""
        return self.meeting.start - timedelta(minutes=self.lead_minutes)


class Notification(models.Model):
    """اعلان درون‌پنل و پیامکی — یادآور ۳۰ دقیقه قبل از جلسه یا یادآور."""
    class Kind(models.TextChoices):
        MEETING = 'meeting', 'جلسه'
        INVITE = 'invite', 'دعوت‌نامه'
        REMINDER = 'reminder', 'یادآور'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField('نوع', max_length=10, choices=Kind.choices)
    title = models.CharField('عنوان', max_length=255)
    body = models.CharField('متن', max_length=255, blank=True)
    meeting = models.ForeignKey(
        Meeting, null=True, blank=True, on_delete=models.SET_NULL, related_name='notifications',
    )
    entry = models.ForeignKey(
        MinuteEntry, null=True, blank=True, on_delete=models.SET_NULL, related_name='notifications',
    )
    remind_at = models.DateTimeField('زمان اعلان (۳۰ دقیقه قبل)')
    delivered_in_app = models.BooleanField('نمایش در پنل', default=False)
    delivered_sms = models.BooleanField('ارسال پیامک', default=False)
    is_read = models.BooleanField('خوانده‌شده', default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'اعلان'
        verbose_name_plural = 'اعلان‌ها'
        ordering = ['remind_at']

    def __str__(self):
        return self.title


class OtpCode(models.Model):
    """کد یک‌بارمصرف ورود با شمارهٔ موبایل."""
    MAX_ATTEMPTS = 5

    phone = models.CharField('شمارهٔ موبایل', max_length=15, db_index=True)
    code = models.CharField('کد', max_length=8)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField('انقضا')
    attempts = models.PositiveSmallIntegerField('تعداد تلاش', default=0)
    is_used = models.BooleanField('استفاده‌شده', default=False)

    class Meta:
        verbose_name = 'کد ورود'
        verbose_name_plural = 'کدهای ورود'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.phone} — {self.created_at:%Y-%m-%d %H:%M}'

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired and self.attempts < self.MAX_ATTEMPTS


class CalendarShare(models.Model):
    """
    اشتراک تقویم — «مبدأ» (owner) تقویم جلساتش را به «مقصد» (viewer) نشان می‌دهد.

    دو چیز جدا از هم‌اند و همین‌جا از هم جدا نگه داشته می‌شوند:

      • دیدن — با وجودِ همین ردیف. مقصد هر جلسه‌ای را که مبدأ می‌بیند (سازنده
        یا شرکت‌کننده‌اش باشد) در فهرست و تقویم می‌بیند.
      • نوشتنِ صورت‌جلسه — پیش‌فرض خاموش، و فقط مبدأ می‌تواند روشنش کند.
        `default=False` عمداً در سطح دیتابیس است، نه در فرم؛ هر مسیر دیگری
        هم که ردیف بسازد، خاموش می‌سازد.

    حذف اشتراک از هر دو طرف ممکن است: مبدأ دسترسی را پس می‌گیرد، مقصد تقویمی
    را که نمی‌خواهد از دید خودش برمی‌دارد.
    """
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='calendar_shares_out',
        verbose_name='صاحب تقویم',
    )
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='calendar_shares_in',
        verbose_name='بیننده',
    )
    can_write_minutes = models.BooleanField(
        'اجازهٔ نوشتن صورت‌جلسه', default=False,
        help_text='پیش‌فرض خاموش؛ فقط صاحب تقویم می‌تواند روشنش کند.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'اشتراک تقویم'
        verbose_name_plural = 'اشتراک‌های تقویم'
        ordering = ['owner_id', 'viewer_id']
        constraints = [
            models.UniqueConstraint(fields=['owner', 'viewer'], name='uniq_calendar_share'),
            models.CheckConstraint(check=~models.Q(owner=models.F('viewer')),
                                   name='calendar_share_not_self'),
        ]

    def __str__(self):
        return f'{self.owner} → {self.viewer}'


class OutlookMailbox(models.Model):
    """
    یک صندوق Outlook که همگام‌سازی می‌شود — یک ردیف به‌ازای هر کاربرِ دارای ایمیل.

    نشانهٔ delta (`delta_link`) گران‌ترین دارایی این جدول است: بدون آن هر اجرا
    باید کل بازه را بخواند. نشانه بازهٔ زمانی را در خودش رمز می‌کند، پس بازهٔ
    غلتان (مثلاً «۳۰ روز گذشته از امروز») هر روز نشانه را باطل می‌کند — به همین
    دلیل `window_start`/`window_end` ذخیره می‌شوند و ثابت می‌مانند تا وقتی
    خودمان عمداً عوضشان کنیم.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='outlook_mailbox',
        verbose_name='کاربر',
    )
    email = models.EmailField('نشانی صندوق', unique=True)
    is_active = models.BooleanField('فعال', default=True)

    delta_link = models.TextField('نشانهٔ delta', blank=True)
    # صفحهٔ نیمه‌کارهٔ یک واکشی — اگر اجرا وسط صفحه‌بندی قطع شود، اجرای بعدی از
    # همین‌جا ادامه می‌دهد نه از اول.
    delta_page_link = models.TextField('صفحهٔ ناتمام', blank=True)
    window_start = models.DateTimeField('شروع بازه', null=True, blank=True)
    window_end = models.DateTimeField('پایان بازه', null=True, blank=True)

    synced_at = models.DateTimeField('آخرین واکشی موفق', null=True, blank=True)
    # تا این لحظه به این صندوق دست نمی‌زنیم — از Retry-After یا backoff نمایی.
    retry_after = models.DateTimeField('تلاش دوباره پس از', null=True, blank=True)
    consecutive_failures = models.PositiveSmallIntegerField('خطاهای پیاپی', default=0)
    last_error = models.CharField('آخرین خطا', max_length=300, blank=True)

    class Meta:
        verbose_name = 'صندوق Outlook'
        verbose_name_plural = 'صندوق‌های Outlook'
        ordering = ['email']

    def __str__(self):
        return self.email


class OutlookEvent(models.Model):
    """
    همبستگیِ «جلسهٔ ما ↔ رویداد در یک صندوق مشخص».

    یک جلسه در N صندوق نسخه دارد (Exchange خودش دعوت را پخش می‌کند)، ولی فقط
    **یکی** از آن‌ها مرجع است: همان که `isOrganizer` دارد. بقیه آینه‌اند و تنها
    چیزی که از خودشان می‌آورند پاسخ دعوتشان است. اگر ما هم به N نسخه بنویسیم،
    نتیجه جلسهٔ تکراری و اکوی بی‌پایان است.

    `remote_change_key` قلبِ تشخیص اکوست: هر نوشتنِ ما `changeKey` تازه‌ای
    برمی‌گرداند؛ ذخیره‌اش می‌کنیم و در واکشی بعدی همان مقدار یعنی «این
    نوشتهٔ خودمان است، ردش کن».
    """
    meeting = models.ForeignKey(
        Meeting, on_delete=models.CASCADE, related_name='outlook_events', verbose_name='جلسه')
    mailbox = models.ForeignKey(
        OutlookMailbox, on_delete=models.CASCADE, related_name='events', verbose_name='صندوق')

    # TextField و نه CharField: شناسهٔ occurrence در Graph به‌راحتی از ۳۰۰ نویسه
    # رد می‌شود و یک max_length خوش‌بینانه بعداً به شکل «رویداد گم شد» درمی‌آید.
    remote_id = models.TextField('شناسهٔ رویداد')
    remote_change_key = models.CharField('changeKey', max_length=255, blank=True)
    ical_uid = models.CharField('iCalUId', max_length=512, blank=True, db_index=True)
    is_authoritative = models.BooleanField('نسخهٔ مرجع', default=False)
    response = models.CharField('پاسخ دعوت', max_length=20, blank=True)
    synced_at = models.DateTimeField('آخرین همگام‌سازی', null=True, blank=True)

    class Meta:
        verbose_name = 'رویداد Outlook'
        verbose_name_plural = 'رویدادهای Outlook'
        constraints = [
            models.UniqueConstraint(fields=['mailbox', 'remote_id'], name='uniq_outlook_event'),
            # حداکثر یک نسخهٔ مرجع برای هر جلسه — این همان چیزی است که «جلسهٔ
            # تکراری» را از «بعید» به «ساختاراً ناممکن» می‌برد.
            models.UniqueConstraint(fields=['meeting'], condition=models.Q(is_authoritative=True),
                                    name='uniq_outlook_authoritative'),
        ]

    def __str__(self):
        return f'{self.mailbox.email} — {self.meeting_id}'


class OutlookUnmappedAttendee(models.Model):
    """
    نشانی‌ای که در دعوت آمد ولی به هیچ کاربری نمی‌خورد.

    عمداً کاربر ساخته نمی‌شود: کاربرِ ایمیلی نه لاگین با کد یک‌بارمصرف دارد
    (چون شماره ندارد) نه پیامک می‌گیرد، و فقط انتخابگر افراد را شلوغ می‌کند.
    این جدول برای این است که چنین نشانی‌هایی بی‌صدا گم نشوند — ادمین می‌بیند و
    اگر لازم بود، ایمیل را دستی به کاربرِ درست وصل می‌کند.
    """
    email = models.EmailField('نشانی')
    display_name = models.CharField('نام نمایشی', max_length=200, blank=True)
    seen_count = models.PositiveIntegerField('دفعات دیده‌شدن', default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'نشانی ناشناخته'
        verbose_name_plural = 'نشانی‌های ناشناخته'
        ordering = ['-seen_count']
        constraints = [
            models.UniqueConstraint(Lower('email'), name='uniq_unmapped_email_ci'),
        ]

    def __str__(self):
        return self.email
