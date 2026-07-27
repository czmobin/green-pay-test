"""
سریالایزرها — خروجی دقیقاً هم‌شکل چیزی است که فرانت‌اند مصرف می‌کند،
تا لایهٔ نمایش بدون تبدیل اضافی کار کند.

نگاشت زمان: جلسات در دیتابیس datetime واقعی دارند؛ API علاوه بر آن
`day` (اندیس روز نسبت به شنبهٔ هفتهٔ دمو) و `start`/`end` (ساعت اعشاری)
را هم می‌دهد، چون تقویم شمسی فرانت با همین قالب کار می‌کند.
"""
from datetime import date, datetime, timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import (
    AgendaItem, Attachment, Category, Location, Meeting, MeetingParticipant,
    MinuteEntry, Minutes, Organization, User,
)

# شنبهٔ هفتهٔ دمو = ۲۱ تیر ۱۴۰۴
WEEK_ANCHOR = date(2025, 7, 12)


def to_day_index(dt) -> int:
    return (timezone.localtime(dt).date() - WEEK_ANCHOR).days


def to_float_hour(dt) -> float:
    local = timezone.localtime(dt)
    return local.hour + local.minute / 60


def from_day_hour(day: int, hour: float) -> datetime:
    """معکوس دو تابع بالا: (اندیس روز، ساعت اعشاری) → datetime آگاه از منطقهٔ زمانی."""
    d = WEEK_ANCHOR + timedelta(days=int(day))
    h, m = int(hour), round((hour - int(hour)) * 60)
    naive = datetime(d.year, d.month, d.day, h, m)
    return timezone.make_aware(naive, timezone.get_current_timezone())


class OrganizationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)

    class Meta:
        model = Organization
        fields = ['id', 'name', 'kind']


class CategorySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'color']


class LocationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    cap = serializers.CharField(source='capacity', required=False, allow_blank=True)
    orgId = serializers.CharField(source='organization_id')

    class Meta:
        model = Location
        fields = ['id', 'name', 'cap', 'orgId', 'is_online']


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
    dur = serializers.IntegerField(source='duration_minutes')

    class Meta:
        model = AgendaItem
        fields = ['title', 'dur']


class MeetingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='pk', read_only=True)
    category = serializers.CharField(source='category_id')
    type = serializers.CharField(source='meeting_type')
    room = serializers.CharField(source='location_id')
    organizer = serializers.CharField(source='organizer_id')
    synced = serializers.BooleanField(source='google_synced')
    day = serializers.SerializerMethodField()
    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()
    parts = serializers.SerializerMethodField()
    guests = serializers.SerializerMethodField()
    agenda = AgendaItemSerializer(many=True, read_only=True)

    meetLink = serializers.CharField(source='meet_link', required=False, allow_blank=True)

    class Meta:
        model = Meeting
        fields = ['id', 'title', 'category', 'type', 'status', 'priority', 'day', 'start', 'end',
                  'room', 'organizer', 'parts', 'guests', 'synced', 'meetLink', 'agenda']

    def get_day(self, obj) -> int:
        return to_day_index(obj.start)

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
    due = serializers.CharField(source='due_text', required=False, allow_blank=True)
    done = serializers.BooleanField(source='is_done', required=False)
    when = serializers.CharField(source='remind_text', required=False, allow_blank=True)
    who = serializers.CharField(source='call_with', required=False, allow_blank=True)
    phone = serializers.CharField(source='call_phone', required=False, allow_blank=True)
    fileName = serializers.SerializerMethodField()

    class Meta:
        model = MinuteEntry
        fields = ['id', 'meeting', 'type', 'text', 'createdAt', 'participant',
                  'assignee', 'due', 'done', 'when', 'who', 'phone', 'fileName']

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
    day = serializers.IntegerField(min_value=0, max_value=6)
    start = serializers.FloatField(min_value=0, max_value=24)
    end = serializers.FloatField(min_value=0, max_value=24)
    room = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    organizer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    parts = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    guests = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    synced = serializers.BooleanField(required=False, default=False)
    priority = serializers.ChoiceField(choices=Meeting.Priority.choices,
                                       required=False, default=Meeting.Priority.NORMAL)
    meetLink = serializers.CharField(required=False, allow_blank=True, default='')

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
            location=validated['room'],
            organizer=validated['organizer'],
            start=from_day_hour(validated['day'], validated['start']),
            end=from_day_hour(validated['day'], validated['end']),
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
    due = serializers.CharField(required=False, allow_blank=True, default='')
    when = serializers.CharField(required=False, allow_blank=True, default='')
    who = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='')
    fileName = serializers.CharField(required=False, allow_blank=True, default='')

    def create(self, validated):
        minutes, _ = Minutes.objects.get_or_create(
            meeting=validated['meeting'], participant=validated.get('participant'))
        entry = MinuteEntry.objects.create(
            minutes=minutes,
            entry_type=validated['type'],
            text=validated.get('text', ''),
            assignee=validated.get('assignee'),
            due_text=validated.get('due', ''),
            remind_text=validated.get('when', ''),
            call_with=validated.get('who', ''),
            call_phone=validated.get('phone', ''),
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

    def create(self, validated):
        return Location.objects.create(
            name=validated['name'], capacity=validated.get('cap', ''),
            organization=validated['orgId'],
        )


class OrganizationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    kind = serializers.ChoiceField(choices=Organization.Kind.choices)

    def create(self, validated):
        return Organization.objects.create(**validated)
