"""
سریالایزرها — خروجی دقیقاً هم‌شکل چیزی است که فرانت‌اند مصرف می‌کند،
تا لایهٔ نمایش بدون تبدیل اضافی کار کند.

نگاشت زمان: جلسات در دیتابیس datetime واقعی دارند؛ API علاوه بر آن
`day` (اندیس روز نسبت به شنبهٔ هفتهٔ دمو) و `start`/`end` (ساعت اعشاری)
را هم می‌دهد، چون تقویم شمسی فرانت با همین قالب کار می‌کند.
"""
from datetime import date as date_cls, datetime

from django.utils import timezone
from rest_framework import serializers

from .models import (
    AgendaItem, Attachment, CalendarShare, Category, Location, Meeting, MeetingParticipant,
    MeetingReminder, MinuteEntry, Minutes, Organization, OrganizationKind, User,
)


def to_iso_date(dt) -> str:
    """datetime ذخیره‌شده → تاریخ میلادی محلی به شکل YYYY-MM-DD."""
    return timezone.localtime(dt).date().isoformat()


def to_float_hour(dt) -> float:
    local = timezone.localtime(dt)
    return local.hour + local.minute / 60


def from_date_hour(d, hour: float) -> datetime:
    """(تاریخ میلادی، ساعت اعشاری) → datetime آگاه از منطقهٔ زمانی."""
    if isinstance(d, str):
        d = date_cls.fromisoformat(d)
    h, m = int(hour), round((hour - int(hour)) * 60)
    return timezone.make_aware(datetime(d.year, d.month, d.day, h, m),
                               timezone.get_current_timezone())


class OrganizationKindSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)

    class Meta:
        model = OrganizationKind
        fields = ['id', 'slug', 'name']


class OrganizationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    kind = serializers.CharField(source='kind_id', allow_null=True, required=False)
    kindName = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'name', 'kind', 'kindName']

    def get_kindName(self, obj) -> str:
        return obj.kind.name if obj.kind_id else '—' 


class CategorySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'color']


class LocationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    cap = serializers.CharField(source='capacity', required=False, allow_blank=True)
    orgId = serializers.CharField(source='organization_id')

    hasMap = serializers.BooleanField(source='has_map', read_only=True)
    #: رزروِ این محل باید تایید شود؟ رابط با همین، پیش از ثبت به کاربر می‌گوید
    #: جلسه در انتظار تایید می‌ماند.
    needsApproval = serializers.BooleanField(source='needs_approval', read_only=True)
    #: شناسهٔ ادمین‌هایی که این محل را تایید می‌کنند — فرانت با همین، صفحه‌ی
    #: «در انتظار تایید» را فقط برای همان‌ها پر می‌کند.
    approverIds = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ['id', 'name', 'cap', 'orgId', 'is_online', 'address', 'lat', 'lng',
                  'hasMap', 'needsApproval', 'approverIds']

    def get_approverIds(self, obj) -> list:
        # prefetch_related('approvers') در bootstrap؛ values_list بدون آن هم درست است.
        return [str(pk) for pk in obj.approvers.values_list('pk', flat=True)]


class PersonSerializer(serializers.ModelSerializer):
    """عضو داخلی سازمان."""
    id = serializers.CharField(source='pk', read_only=True)
    name = serializers.SerializerMethodField()
    role = serializers.CharField(source='title', required=False, allow_blank=True)
    orgId = serializers.CharField(source='organization_id', required=False, allow_null=True)
    accessRole = serializers.CharField(source='role', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'name', 'role', 'color', 'orgId', 'accessRole']

    def get_name(self, obj) -> str:
        return obj.get_full_name() or obj.username


class CalendarShareSerializer(serializers.ModelSerializer):
    """
    یک ردیف اشتراک تقویم.

    `owner`/`viewer` شناسهٔ رشته‌ای‌اند تا با بقیهٔ API یکدست باشند (فرانت
    همه‌جا شناسه را رشته نگه می‌دارد). نام‌ها هم می‌آیند چون فهرست اشتراک‌ها
    در تنظیمات باید بدون جست‌وجو در `people` خوانا باشد.
    """
    id = serializers.CharField(source='pk', read_only=True)
    owner = serializers.CharField(source='owner_id', read_only=True)
    viewer = serializers.CharField(source='viewer_id', read_only=True)
    ownerName = serializers.SerializerMethodField()
    viewerName = serializers.SerializerMethodField()
    canWriteMinutes = serializers.BooleanField(source='can_write_minutes', required=False)

    class Meta:
        model = CalendarShare
        fields = ['id', 'owner', 'viewer', 'ownerName', 'viewerName', 'canWriteMinutes']

    def get_ownerName(self, obj) -> str:
        return obj.owner.get_full_name() or obj.owner.username

    def get_viewerName(self, obj) -> str:
        return obj.viewer.get_full_name() or obj.viewer.username


class CalendarShareCreateSerializer(serializers.Serializer):
    """
    ساخت اشتراک — مبدأ همیشه خودِ کاربر است و از بدنه خوانده نمی‌شود.

    اگر `owner` قابل فرستادن بود، هرکس می‌توانست تقویم دیگری را به نام او
    با خودش به اشتراک بگذارد؛ یعنی همان چیزی که این فیچر باید جلویش را بگیرد.
    """
    viewer = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_external=False))
    canWriteMinutes = serializers.BooleanField(required=False, default=False)


class GuestSerializer(serializers.ModelSerializer):
    """مهمان خارج از سازمان — نام سازمانش به‌صورت متن برگردانده می‌شود."""
    id = serializers.CharField(source='pk', read_only=True)
    name = serializers.SerializerMethodField()
    org = serializers.SerializerMethodField()
    role = serializers.CharField(source='title')

    class Meta:
        model = User
        fields = ['id', 'name', 'org', 'role']

    def get_name(self, obj) -> str:
        return obj.get_full_name() or obj.username

    def get_org(self, obj) -> str:
        return obj.organization.name if obj.organization_id else ''


class AgendaItemSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    dur = serializers.IntegerField(source='duration_minutes')
    meeting = serializers.PrimaryKeyRelatedField(queryset=Meeting.objects.all(), write_only=True, required=False)
    fileName = serializers.SerializerMethodField()

    class Meta:
        model = AgendaItem
        fields = ['id', 'meeting', 'order', 'title', 'dur', 'fileName']
        extra_kwargs = {'order': {'required': False}}

    def get_fileName(self, obj):
        att = obj.attachments.first()
        return (att.name or (att.file.name.rsplit('/', 1)[-1] if att.file else '')) if att else None


class MeetingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    category = serializers.CharField(source='category_id')
    type = serializers.CharField(source='meeting_type')
    room = serializers.CharField(source='location_id')
    organizer = serializers.CharField(source='organizer_id')
    date = serializers.SerializerMethodField()
    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()
    parts = serializers.SerializerMethodField()
    guests = serializers.SerializerMethodField()
    partStatus = serializers.SerializerMethodField()
    agenda = AgendaItemSerializer(many=True, read_only=True)

    meetLink = serializers.CharField(source='meet_link', required=False, allow_blank=True)
    cancelReason = serializers.CharField(source='cancel_reason', read_only=True)
    cancelledAt = serializers.SerializerMethodField()
    cancelledBy = serializers.CharField(source='cancelled_by_id', read_only=True)
    # رابط باید همان قاعده‌ای را ببیند که API اعمال می‌کند، وگرنه دکمهٔ ویرایشی
    # نشان می‌دهد که سرور ردش می‌کند.
    outlookSynced = serializers.BooleanField(source='outlook_synced', read_only=True)
    outlookReadonly = serializers.BooleanField(source='outlook_readonly', read_only=True)
    fileName = serializers.SerializerMethodField()
    #: اگر این انتظارِ تایید بابتِ **ویرایش** باشد، زمان و محلِ پیشین — تا صفحهٔ
    #: تایید بتواند «از این، به این» را نشان بدهد. برای جلسهٔ تازه `null` است.
    pendingEdit = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = ['id', 'title', 'category', 'type', 'status', 'priority', 'date', 'start', 'end',
                  'room', 'organizer', 'parts', 'guests', 'partStatus', 'meetLink',
                  'agenda', 'cancelReason', 'cancelledAt', 'cancelledBy',
                  'outlookSynced', 'outlookReadonly', 'series', 'fileName', 'pendingEdit']

    def get_pendingEdit(self, obj):
        was = obj.pending_revert
        if not was:
            return None
        from django.utils.dateparse import parse_datetime
        begins, ends = parse_datetime(was.get('start') or ''), parse_datetime(was.get('end') or '')
        if not begins or not ends:
            return None
        return {
            'date': to_iso_date(begins),
            'start': to_float_hour(begins),
            'end': to_float_hour(ends),
            'room': was.get('room') or None,
        }

    def get_fileName(self, obj):
        att = obj.attachments.first()
        return (att.name or (att.file.name.rsplit('/', 1)[-1] if att.file else '')) if att else None

    def get_cancelledAt(self, obj):
        return int(obj.cancelled_at.timestamp() * 1000) if obj.cancelled_at else None

    def get_date(self, obj) -> str:
        return to_iso_date(obj.start)

    def get_start(self, obj) -> float:
        return to_float_hour(obj.start)

    def get_end(self, obj) -> float:
        return to_float_hour(obj.end)

    def _participants(self, obj, guests: bool):
        return [str(p.user_id) for p in obj.meeting_participants.all() if p.is_guest is guests]

    def get_parts(self, obj):
        return self._participants(obj, guests=False)

    def get_guests(self, obj):
        return self._participants(obj, guests=True)

    def get_partStatus(self, obj):
        """پاسخ دعوت هر نفر — پایهٔ تگ «در انتظار تأیید» و فهرست دعوت‌های بی‌پاسخ."""
        return {str(p.user_id): p.response for p in obj.meeting_participants.all()}


class MinuteEntrySerializer(serializers.ModelSerializer):
    """یک آیتم صورت‌جلسه؛ `participant` از سطلِ صورت‌جلسه‌ای که در آن است می‌آید."""
    id = serializers.CharField(source='pk', read_only=True)
    type = serializers.CharField(source='entry_type')
    createdAt = serializers.SerializerMethodField()
    participant = serializers.SerializerMethodField()
    meeting = serializers.SerializerMethodField()
    done = serializers.BooleanField(source='is_done', required=False)
    when = serializers.CharField(source='remind_text', required=False, allow_blank=True)
    remindDate = serializers.SerializerMethodField()
    remindHour = serializers.SerializerMethodField()
    who = serializers.CharField(source='call_with', required=False, allow_blank=True)
    phone = serializers.CharField(source='call_phone', required=False, allow_blank=True)
    fileName = serializers.SerializerMethodField()
    doneAt = serializers.SerializerMethodField()
    agendaItem = serializers.CharField(source='agenda_item_id', read_only=True)
    editedAt = serializers.SerializerMethodField()
    # نویسندهٔ آیتم — رابط از روی همین تصمیم می‌گیرد دکمهٔ ویرایش را نشان بدهد
    # یا نه (هم‌سو با `can_edit_entry`: نویسنده همیشه می‌تواند نوشتهٔ خودش را
    # اصلاح کند، حتی وقتی اجازهٔ نوشتنِ عمومی‌اش پس گرفته شده باشد).
    createdBy = serializers.CharField(source='created_by_id', read_only=True)

    class Meta:
        model = MinuteEntry
        fields = ['id', 'meeting', 'type', 'text', 'createdAt', 'participant',
                  'done', 'doneAt', 'when', 'remindDate', 'remindHour',
                  'who', 'phone', 'fileName', 'agendaItem', 'editedAt', 'createdBy']

    def get_doneAt(self, obj):
        return int(obj.done_at.timestamp() * 1000) if obj.done_at else None

    def get_editedAt(self, obj):
        return int(obj.edited_at.timestamp() * 1000) if obj.edited_at else None

    def get_remindDate(self, obj):
        return to_iso_date(obj.remind_at) if obj.remind_at else None

    def get_remindHour(self, obj):
        return to_float_hour(obj.remind_at) if obj.remind_at else None

    def get_createdAt(self, obj) -> int:
        return int(obj.created_at.timestamp() * 1000)

    def get_participant(self, obj):
        pid = obj.minutes.participant_id
        return str(pid) if pid else None

    def get_meeting(self, obj) -> str:
        return str(obj.minutes.meeting_id)

    def get_fileName(self, obj):
        att = obj.attachments.first()
        return att.name if att else None


# ---------------------------------------------------------------- ورودی‌ها

class MeetingCreateSerializer(serializers.Serializer):
    """ساخت جلسه از فرم فرانت (روز + ساعت اعشاری)."""
    title = serializers.CharField(max_length=255)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    type = serializers.ChoiceField(choices=Meeting.Type.choices)
    date = serializers.DateField()
    start = serializers.FloatField(min_value=0, max_value=24)
    end = serializers.FloatField(min_value=0, max_value=24)
    room = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all(), required=False, allow_null=True)
    organizer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    parts = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    guests = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    priority = serializers.ChoiceField(choices=Meeting.Priority.choices,
                                       required=False, default=Meeting.Priority.NORMAL)
    meetLink = serializers.CharField(required=False, allow_blank=True, default='')
    # فاصلهٔ یادآور که سازندهٔ جلسه برای همه تعیین می‌کند؛ بعداً هرکس می‌تواند
    # مالِ خودش را عوض کند. صفر یعنی یادآور برای این جلسه خاموش باشد.
    reminderLead = serializers.IntegerField(required=False, allow_null=True, default=None,
                                            min_value=0, max_value=10080)
    # تکرار: کدام روزهای هفته (۰=شنبه … ۶=جمعه)، چند نوبت، و فاصلهٔ نوبت‌ها.
    #
    # سقف چهار نوبت خواستهٔ کارفرماست و این‌جا بسته می‌شود نه در رابط: رابط
    # چیپ‌هایش را محدود می‌کند ولی درخواست خام هم باید رد شود.
    # `repeatInterval`=۲ یعنی «یک هفته در میان» — نوبت‌ها دو هفته‌ای جلو می‌روند.
    repeatWeekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False, default=list)
    repeatWeeks = serializers.IntegerField(required=False, default=1, min_value=1, max_value=4)
    repeatInterval = serializers.IntegerField(required=False, default=1, min_value=1, max_value=2)

    def validate(self, attrs):
        if attrs['end'] <= attrs['start']:
            raise serializers.ValidationError({'end': 'ساعت پایان باید بعد از شروع باشد.'})
        return attrs

    def occurrence_dates(self, validated) -> list:
        """تاریخ‌های این سلسله — نزدیک‌ترین اول.

        قاعدهٔ روزِ هفته همان قاعدهٔ موجودِ سامانه است: `jalali.fa_weekday` با
        `(weekday()+2) % 7`، یعنی ۰=شنبه. از شنبهٔ همان هفتهٔ تاریخِ انتخابی
        شروع می‌کنیم و `repeatWeeks` نوبت جلو می‌رویم؛ فاصلهٔ نوبت‌ها
        `repeatInterval` هفته است (۱=هر هفته، ۲=یک هفته در میان).

        فقط تاریخ‌های **از خودِ تاریخِ انتخابی به بعد** می‌مانند؛ وگرنه
        انتخابِ چهارشنبه با تیکِ شنبه، جلسه‌ای در گذشته می‌ساخت.
        """
        from datetime import timedelta

        base = validated['date']
        weeks = validated.get('repeatWeeks') or 1
        interval = validated.get('repeatInterval') or 1
        days = sorted(set(validated.get('repeatWeekdays') or []))
        if weeks <= 1 and not days:
            return [base]
        if not days:
            days = [(base.weekday() + 2) % 7]

        saturday = base - timedelta(days=(base.weekday() + 2) % 7)
        out = [saturday + timedelta(days=7 * (w * interval) + d)
               for w in range(weeks) for d in days]
        return sorted(d for d in out if d >= base)

    def create(self, validated):
        """نزدیک‌ترین تکرار را برمی‌گرداند؛ کلِ سلسله در `self.occurrences` است.

        ویو به `occurrences` نیاز دارد تا بداند پیامک را برای کدام بفرستد و
        کدام‌ها را از هشدار تداخل کنار بگذارد.
        """
        import uuid

        from django.db import transaction

        dates = self.occurrence_dates(validated)
        # یک تراکنش برای کلِ سلسله: پیش از این هیچ `atomic`ی در مسیر ساخت نبود،
        # و با چند سطر، شکستِ وسطِ کار سلسلهٔ نیمه‌ساخته به‌جا می‌گذاشت.
        with transaction.atomic():
            series = uuid.uuid4() if len(dates) > 1 else None
            self.occurrences = [self._one(validated, day, series) for day in dates]
        return self.occurrences[0]

    def _one(self, validated, day, series):
        # واردکردنِ تأخیری، مثل `get_fields` پایین‌تر: `views` خودش این فایل را
        # وارد می‌کند و واردکردنِ سطح‌بالا حلقه می‌سازد.
        from .views import can_approve_location

        room = validated.get('room')
        # محل‌هایی مثل دفتر مدیرعامل تا تایید ادمینِ تعیین‌شده در انتظار
        # می‌مانند. سازنده‌ای که خودش برای همین محل تاییدکننده است، نیازی به
        # تاییدِ خودش ندارد.
        creator = self.context.get('creator')
        needs = bool(room and room.needs_approval) and not can_approve_location(creator, room)
        meeting = Meeting.objects.create(
            title=validated['title'],
            category=validated['category'],
            meeting_type=validated['type'],
            status=Meeting.Status.PENDING if needs else Meeting.Status.CONFIRMED,
            priority=validated.get('priority', Meeting.Priority.NORMAL),
            meet_link=Meeting.normalize_meet(validated.get('meetLink', '')),
            location=room,
            organizer=validated['organizer'],
            start=from_date_hour(day, validated['start']),
            end=from_date_hour(day, validated['end']),
            series=series,
        )
        # برگزارکننده خودش پذیرفته حساب می‌شود؛ بقیه دعوت‌اند و باید پاسخ بدهند
        # — بدون این، فهرست «دعوت‌های در انتظار پاسخ» هیچ‌وقت چیزی نشان نمی‌دهد.
        organizer_id = str(validated['organizer'].pk)
        for uid in set(validated.get('parts', [])) | {organizer_id}:
            MeetingParticipant.objects.get_or_create(
                meeting=meeting, user_id=uid,
                defaults={
                    'is_guest': False,
                    'response': MeetingParticipant.Response.ACCEPTED
                    if str(uid) == organizer_id else MeetingParticipant.Response.PENDING,
                },
            )
        for uid in validated.get('guests', []):
            MeetingParticipant.objects.get_or_create(
                meeting=meeting, user_id=uid,
                defaults={'is_guest': True, 'response': MeetingParticipant.Response.PENDING},
            )

        lead = validated.get('reminderLead')
        if lead is not None:
            # تنظیم سازنده برای همهٔ شرکت‌کنندگان ثبت می‌شود تا از همان ابتدا
            # معلوم باشد چه‌وقت پیامک می‌رود؛ هرکس بعداً می‌تواند عوضش کند.
            MeetingReminder.objects.bulk_create([
                MeetingReminder(meeting=meeting, user_id=p.user_id,
                                lead_minutes=max(lead, 1), enabled=lead > 0)
                for p in meeting.meeting_participants.filter(is_guest=False)
            ], ignore_conflicts=True)
        return meeting


class MinuteEntryCreateSerializer(serializers.Serializer):
    """افزودن آیتم به صورت‌جلسه؛ سطلِ (جلسه، شرکت‌کننده) در صورت نبود ساخته می‌شود."""
    meeting = serializers.PrimaryKeyRelatedField(queryset=Meeting.objects.all())

    def get_fields(self):
        """
        جلسه فقط از میان جلسه‌های قابل‌دیدِ همین کاربر حل می‌شود.

        پیش‌تر روی `Meeting.objects.all()` حل می‌شد؛ یعنی شناسهٔ جلسه‌ای که
        کاربر حق دیدنش را نداشت هم معتبر شمرده می‌شد. حالا چنین شناسه‌ای
        پیش از هر بررسی دیگری «نامعتبر» است — و وجود/نبودِ جلسه هم لو نمی‌رود.
        """
        fields = super().get_fields()
        request = self.context.get('request')
        if request is not None:
            from .views import meetings_queryset
            fields['meeting'].queryset = meetings_queryset(request.user)
        return fields
    participant = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True)
    type = serializers.ChoiceField(choices=MinuteEntry.Type.choices)
    text = serializers.CharField(allow_blank=True, required=False, default='')
    remindDate = serializers.DateField(required=False, allow_null=True, default=None)
    remindHour = serializers.FloatField(required=False, allow_null=True, default=None)
    when = serializers.CharField(required=False, allow_blank=True, default='')
    who = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='')
    fileName = serializers.CharField(required=False, allow_blank=True, default='')
    agendaItem = serializers.PrimaryKeyRelatedField(
        queryset=AgendaItem.objects.all(), required=False, allow_null=True, default=None)

    def create(self, validated):
        from .uploads import assert_upload_size

        minutes, _ = Minutes.objects.get_or_create(
            meeting=validated['meeting'], participant=validated.get('participant'))
        remind_at = None
        if validated.get('remindDate') is not None:
            remind_at = from_date_hour(validated['remindDate'], validated.get('remindHour') or 9)
        entry = MinuteEntry.objects.create(
            minutes=minutes,
            entry_type=validated['type'],
            text=validated.get('text', ''),
            remind_at=remind_at,
            remind_text=validated.get('when', ''),
            call_with=validated.get('who', ''),
            call_phone=validated.get('phone', ''),
            agenda_item=validated.get('agendaItem'),
            is_done=False,
        )
        upload = self.context.get('upload')
        name = validated.get('fileName', '') or (getattr(upload, 'name', '') if upload else '')
        if upload:
            assert_upload_size(upload)
        if name or upload:
            Attachment.objects.create(
                minutes=minutes, entry=entry, name=name or '',
                file=upload if upload else '',
                kind=Attachment.Kind.LETTER if validated['type'] == 'letter' else Attachment.Kind.FILE,
                uploaded_by=self.context.get('uploader'),
            )
        return entry


class PersonCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    role = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    orgId = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(), required=False, allow_null=True)
    color = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')

    def create(self, validated):
        name = validated['name'].strip()
        first, _, last = name.partition(' ')
        base = f'user{User.objects.count() + 1}'
        username = base
        i = 1
        while User.objects.filter(username=username).exists():
            i += 1
            username = f'{base}_{i}'
        return User.objects.create(
            username=username, first_name=first, last_name=last,
            title=validated.get('role') or 'عضو',
            organization=validated.get('orgId'),
            color=validated.get('color') or '#0E9F6E,#0B5B3E',
            role=User.Role.MEMBER,
        )


class LocationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    cap = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    orgId = serializers.PrimaryKeyRelatedField(queryset=Organization.objects.all())
    address = serializers.CharField(required=False, allow_blank=True, default='')
    lat = serializers.FloatField(required=False, allow_null=True, default=None)
    lng = serializers.FloatField(required=False, allow_null=True, default=None)

    def create(self, validated):
        return Location.objects.create(
            name=validated['name'], capacity=validated.get('cap', ''),
            organization=validated['orgId'],
            address=validated.get('address', ''),
            lat=validated.get('lat'), lng=validated.get('lng'),
        )


class OrganizationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    kind = serializers.PrimaryKeyRelatedField(
        queryset=OrganizationKind.objects.all(), required=False, allow_null=True)

    def create(self, validated):
        return Organization.objects.create(
            name=validated['name'], kind=validated.get('kind'))
