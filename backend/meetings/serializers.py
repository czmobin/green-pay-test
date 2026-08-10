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
    AgendaItem, Attachment, Category, Location, Meeting, MeetingParticipant,
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

    class Meta:
        model = Location
        fields = ['id', 'name', 'cap', 'orgId', 'is_online', 'address', 'lat', 'lng', 'hasMap']


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

    class Meta:
        model = AgendaItem
        fields = ['id', 'meeting', 'order', 'title', 'dur']
        extra_kwargs = {'order': {'required': False}}


class MeetingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    category = serializers.CharField(source='category_id')
    type = serializers.CharField(source='meeting_type')
    room = serializers.CharField(source='location_id')
    organizer = serializers.CharField(source='organizer_id')
    synced = serializers.BooleanField(source='google_synced')
    date = serializers.SerializerMethodField()
    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()
    parts = serializers.SerializerMethodField()
    guests = serializers.SerializerMethodField()
    agenda = AgendaItemSerializer(many=True, read_only=True)

    meetLink = serializers.CharField(source='meet_link', required=False, allow_blank=True)
    cancelReason = serializers.CharField(source='cancel_reason', read_only=True)
    cancelledAt = serializers.SerializerMethodField()
    cancelledBy = serializers.CharField(source='cancelled_by_id', read_only=True)

    class Meta:
        model = Meeting
        fields = ['id', 'title', 'category', 'type', 'status', 'priority', 'date', 'start', 'end',
                  'room', 'organizer', 'parts', 'guests', 'synced', 'meetLink', 'agenda',
                  'cancelReason', 'cancelledAt', 'cancelledBy']

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


class MinuteEntrySerializer(serializers.ModelSerializer):
    """یک آیتم صورت‌جلسه؛ `participant` از سطلِ صورت‌جلسه‌ای که در آن است می‌آید."""
    id = serializers.CharField(source='pk', read_only=True)
    type = serializers.CharField(source='entry_type')
    createdAt = serializers.SerializerMethodField()
    participant = serializers.SerializerMethodField()
    meeting = serializers.SerializerMethodField()
    assignee = serializers.CharField(source='assignee_id', required=False, allow_null=True)
    due = serializers.DateField(source='due_date', required=False, allow_null=True)
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

    class Meta:
        model = MinuteEntry
        fields = ['id', 'meeting', 'type', 'text', 'createdAt', 'participant',
                  'assignee', 'due', 'done', 'doneAt', 'when', 'remindDate', 'remindHour',
                  'who', 'phone', 'fileName', 'agendaItem', 'editedAt']

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
    synced = serializers.BooleanField(required=False, default=False)
    priority = serializers.ChoiceField(choices=Meeting.Priority.choices,
                                       required=False, default=Meeting.Priority.NORMAL)
    meetLink = serializers.CharField(required=False, allow_blank=True, default='')
    # فاصلهٔ یادآور که سازندهٔ جلسه برای همه تعیین می‌کند؛ بعداً هرکس می‌تواند
    # مالِ خودش را عوض کند. صفر یعنی یادآور برای این جلسه خاموش باشد.
    reminderLead = serializers.IntegerField(required=False, allow_null=True, default=None,
                                            min_value=0, max_value=10080)

    def validate(self, attrs):
        if attrs['end'] <= attrs['start']:
            raise serializers.ValidationError({'end': 'ساعت پایان باید بعد از شروع باشد.'})
        return attrs

    def create(self, validated):
        meeting = Meeting.objects.create(
            title=validated['title'],
            category=validated['category'],
            meeting_type=validated['type'],
            status=Meeting.Status.CONFIRMED,
            priority=validated.get('priority', Meeting.Priority.NORMAL),
            meet_link=Meeting.normalize_meet(validated.get('meetLink', '')),
            location=validated.get('room'),
            organizer=validated['organizer'],
            start=from_date_hour(validated['date'], validated['start']),
            end=from_date_hour(validated['date'], validated['end']),
            google_synced=validated.get('synced', False),
        )
        for uid in set(validated.get('parts', [])) | {str(validated['organizer'].pk)}:
            MeetingParticipant.objects.get_or_create(
                meeting=meeting, user_id=uid,
                defaults={'is_guest': False, 'response': MeetingParticipant.Response.ACCEPTED},
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
    participant = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True)
    type = serializers.ChoiceField(choices=MinuteEntry.Type.choices)
    text = serializers.CharField(allow_blank=True, required=False, default='')
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True)
    due = serializers.DateField(required=False, allow_null=True, default=None)
    remindDate = serializers.DateField(required=False, allow_null=True, default=None)
    remindHour = serializers.FloatField(required=False, allow_null=True, default=None)
    when = serializers.CharField(required=False, allow_blank=True, default='')
    who = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='')
    fileName = serializers.CharField(required=False, allow_blank=True, default='')
    agendaItem = serializers.PrimaryKeyRelatedField(
        queryset=AgendaItem.objects.all(), required=False, allow_null=True, default=None)

    def create(self, validated):
        minutes, _ = Minutes.objects.get_or_create(
            meeting=validated['meeting'], participant=validated.get('participant'))
        remind_at = None
        if validated.get('remindDate') is not None:
            remind_at = from_date_hour(validated['remindDate'], validated.get('remindHour') or 9)
        entry = MinuteEntry.objects.create(
            minutes=minutes,
            entry_type=validated['type'],
            text=validated.get('text', ''),
            assignee=validated.get('assignee'),
            due_date=validated.get('due'),
            remind_at=remind_at,
            remind_text=validated.get('when', ''),
            call_with=validated.get('who', ''),
            call_phone=validated.get('phone', ''),
            agenda_item=validated.get('agendaItem'),
            is_done=False,
        )
        name = validated.get('fileName', '')
        if name:
            Attachment.objects.create(
                minutes=minutes, entry=entry, name=name,
                kind=Attachment.Kind.LETTER if validated['type'] == 'letter' else Attachment.Kind.FILE,
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
