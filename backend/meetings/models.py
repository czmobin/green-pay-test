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
  User ─ GoogleCalendarConnection               (calendar موازی گوگل)
"""
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    """سازمان/شرکت (داخلی گرین‌پی، بانک‌ها، رگولاتورها، شرکا)."""
    class Kind(models.TextChoices):
        INTERNAL = 'internal', 'داخلی'
        BANK = 'bank', 'بانک'
        REGULATOR = 'regulator', 'رگولاتور'
        PARTNER = 'partner', 'شریک'

    name = models.CharField('نام', max_length=120)
    kind = models.CharField('نوع', max_length=16, choices=Kind.choices, default=Kind.PARTNER)
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

    def __str__(self):
        return self.get_full_name() or self.username


class Location(models.Model):
    """محل جلسه، متصل به یک سازمان (اتاق داخلی، دفتر بانک، یا آنلاین)."""
    name = models.CharField('نام', max_length=120)
    capacity = models.CharField('ظرفیت', max_length=40, blank=True)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='locations', verbose_name='سازمان',
    )
    is_online = models.BooleanField('آنلاین', default=False)

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
        BOARD = 'board', 'هیئت مدیره'
        EXTERNAL = 'external', 'با مهمان خارجی'
        INTERNAL = 'internal', 'داخلی'
        ONLINE = 'online', 'آنلاین'

    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', 'تأییدشده'
        PENDING = 'pending', 'در انتظار'
        CANCELLED = 'cancelled', 'لغوشده'
        DONE = 'done', 'برگزارشده'

    title = models.CharField('عنوان', max_length=255)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='meetings',
        verbose_name='دسته‌بندی',
    )
    meeting_type = models.CharField('نوع', max_length=12, choices=Type.choices, default=Type.INTERNAL)
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

    google_synced = models.BooleanField('همگام با Google Calendar', default=False)
    google_event_id = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'جلسه'
        verbose_name_plural = 'جلسات'
        ordering = ['start']

    def __str__(self):
        return self.title


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
    """یک آیتم صورت‌جلسه: یادداشت/تصمیم/تسک/یادآور/تماس/نامه/فایل."""
    class Type(models.TextChoices):
        NOTE = 'note', 'یادداشت'
        DECISION = 'decision', 'تصمیم'
        TASK = 'task', 'تسک'
        REMINDER = 'reminder', 'یادآور'
        CALL = 'call', 'تماس تلفنی'
        LETTER = 'letter', 'نامه'
        FILE = 'file', 'فایل'

    minutes = models.ForeignKey(Minutes, on_delete=models.CASCADE, related_name='entries')
    entry_type = models.CharField('نوع', max_length=12, choices=Type.choices)
    text = models.TextField('متن', blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_entries',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # تسک
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='assigned_entries', verbose_name='مسئول',
    )
    due_date = models.DateField('مهلت', null=True, blank=True)
    is_done = models.BooleanField('انجام شد', default=False)

    # یادآور
    remind_at = models.DateTimeField('زمان یادآوری', null=True, blank=True)

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
    file = models.FileField('فایل', upload_to='attachments/%Y/%m/')
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


class Notification(models.Model):
    """اعلان درون‌پنل و پیامکی — یادآور ۳۰ دقیقه قبل از جلسه/تسک/یادآور."""
    class Kind(models.TextChoices):
        MEETING = 'meeting', 'جلسه'
        INVITE = 'invite', 'دعوت‌نامه'
        TASK = 'task', 'تسک'
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


class GoogleCalendarConnection(models.Model):
    """اتصال حساب Google برای ساخت calendar موازی و همگام‌سازی رویدادها."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_calendar',
    )
    is_connected = models.BooleanField('متصل', default=False)
    calendar_id = models.CharField('شناسهٔ کلندر موازی', max_length=255, blank=True)
    access_token = models.CharField(max_length=255, blank=True)
    refresh_token = models.CharField(max_length=255, blank=True)
    synced_at = models.DateTimeField('آخرین همگام‌سازی', null=True, blank=True)

    class Meta:
        verbose_name = 'اتصال Google Calendar'
        verbose_name_plural = 'اتصال‌های Google Calendar'

    def __str__(self):
        return f'Google Calendar — {self.user}'
