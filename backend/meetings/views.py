"""ویوهای API — یک endpoint راه‌انداز (bootstrap) به‌علاوهٔ عملیات نوشتن."""
from django.db.models import Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from .models import (
    AgendaItem, Category, GoogleCalendarConnection, Location, Meeting, MeetingParticipant,
    MinuteEntry, Organization, OrganizationKind, User,
)
from .serializers import (
    AgendaItemSerializer, CategorySerializer, GuestSerializer, LocationCreateSerializer,
    LocationSerializer, MeetingCreateSerializer, MeetingSerializer, MinuteEntryCreateSerializer,
    MinuteEntrySerializer, OrganizationCreateSerializer, OrganizationKindSerializer,
    OrganizationSerializer, PersonCreateSerializer, PersonSerializer, from_date_hour,
)


def is_manager(user) -> bool:
    """ادمین و مدیرعامل به همهٔ جلسات دسترسی کامل دارند."""
    return getattr(user, 'role', None) in (User.Role.ADMIN, User.Role.CEO) or user.is_superuser


def can_edit_meeting(user, meeting) -> bool:
    """سازندهٔ جلسه، مدیرعامل و ادمین می‌توانند جلسه و دستور جلسه را ویرایش کنند."""
    return meeting.organizer_id == user.id or is_manager(user)


def assert_can_edit(user, meeting):
    if not can_edit_meeting(user, meeting):
        raise PermissionDenied('فقط سازندهٔ جلسه، مدیرعامل یا ادمین می‌تواند این جلسه را ویرایش کند.')


class ManagerOnlyDeleteMixin:
    """حذف تعریف‌ها (افراد، محل‌ها، سازمان‌ها) فقط برای ادمین و مدیرعامل."""

    def perform_destroy(self, instance):
        if not is_manager(self.request.user):
            raise PermissionDenied('فقط مدیرعامل یا ادمین می‌تواند این مورد را حذف کند.')
        instance.delete()


def find_conflicts(start, end, user_ids, exclude_meeting_id=None):
    """
    جلسه‌های هم‌زمانِ افرادِ داده‌شده را برمی‌گرداند.

    این فقط یک هشدار است و هیچ‌جا مانع افزودن فرد یا ساخت جلسه نمی‌شود.
    بازه‌ها وقتی تداخل دارند که start < other_end و end > other_start باشد.
    """
    from .serializers import to_iso_date, to_float_hour

    user_ids = [str(u) for u in user_ids if u]
    if not user_ids:
        return []

    qs = (Meeting.objects
          .filter(meeting_participants__user_id__in=user_ids, start__lt=end, end__gt=start)
          .exclude(status=Meeting.Status.CANCELLED)
          .select_related('location')
          .prefetch_related('meeting_participants__user')
          .distinct())
    if exclude_meeting_id:
        qs = qs.exclude(pk=exclude_meeting_id)

    wanted = set(user_ids)
    conflicts = []
    for meeting in qs:
        for mp in meeting.meeting_participants.all():
            if str(mp.user_id) not in wanted:
                continue
            person = mp.user
            conflicts.append({
                'user': str(mp.user_id),
                'userName': person.get_full_name() or person.username,
                'meeting': str(meeting.pk),
                'meetingTitle': meeting.title,
                'date': to_iso_date(meeting.start),
                'start': to_float_hour(meeting.start),
                'end': to_float_hour(meeting.end),
                'room': meeting.location.name if meeting.location_id else '',
            })
    return conflicts


def to_iso(dt):
    from .serializers import to_iso_date
    return to_iso_date(dt)


def hour_of(dt):
    from .serializers import to_float_hour
    return to_float_hour(dt)


def _by_id(serializer_data):
    """لیست سریالایزشده → دیکشنری کلیددار با id (شکل موردنیاز فرانت)."""
    return {row['id']: row for row in serializer_data}


def meetings_queryset(user=None):
    """جلسات قابل مشاهده؛ کاربر عادی فقط جلسه‌های خودش را می‌بیند."""
    qs = (Meeting.objects
          .select_related('category', 'location', 'organizer')
          .prefetch_related('meeting_participants', 'agenda')
          .order_by('start'))
    if user is not None and not is_manager(user):
        qs = qs.filter(Q(organizer=user) | Q(participants=user)).distinct()
    return qs


def entries_queryset(user=None):
    qs = (MinuteEntry.objects
          .select_related('minutes', 'minutes__meeting', 'assignee')
          .prefetch_related('attachments')
          .order_by('-created_at'))
    if user is not None and not is_manager(user):
        qs = qs.filter(Q(minutes__meeting__organizer=user)
                       | Q(minutes__meeting__participants=user)).distinct()
    return qs


@api_view(['GET'])
def bootstrap(request):
    """همهٔ دادهٔ موردنیاز اپ در یک درخواست."""
    people = User.objects.filter(is_external=False).select_related('organization').order_by('id')
    guests = User.objects.filter(is_external=True).select_related('organization').order_by('id')
    ceo = people.filter(role=User.Role.CEO).first() or people.first()

    minutes: dict[str, list] = {}
    for row in MinuteEntrySerializer(entries_queryset(request.user), many=True).data:
        minutes.setdefault(row['meeting'], []).append(row)

    gcal = GoogleCalendarConnection.objects.filter(user=ceo).first() if ceo else None

    return Response({
        'organizations': _by_id(OrganizationSerializer(
            Organization.objects.select_related('kind'), many=True).data),
        'orgKinds': _by_id(OrganizationKindSerializer(OrganizationKind.objects.all(), many=True).data),
        'categories': _by_id(CategorySerializer(Category.objects.all(), many=True).data),
        'rooms': _by_id(LocationSerializer(Location.objects.select_related('organization'), many=True).data),
        'people': _by_id(PersonSerializer(people, many=True).data),
        'guests': _by_id(GuestSerializer(guests, many=True).data),
        'meetings': MeetingSerializer(meetings_queryset(request.user), many=True).data,
        'minutes': minutes,
        'currentUser': str(request.user.pk),
        'currentRole': request.user.role,
        'isManager': is_manager(request.user),
        'gcalConnected': bool(gcal and gcal.is_connected),
        'smsEnabled': bool(ceo and ceo.sms_enabled),
    })


class MeetingViewSet(viewsets.ModelViewSet):
    queryset = meetings_queryset()
    serializer_class = MeetingSerializer

    def get_queryset(self):
        return meetings_queryset(self.request.user)

    def create(self, request, *args, **kwargs):
        write = MeetingCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        meeting = write.save()

        # جلسه‌ای که ادمین یا مدیرعامل می‌سازد، برای بقیه خودکار پذیرفته است
        if is_manager(request.user):
            meeting.meeting_participants.filter(is_guest=False).update(
                response=MeetingParticipant.Response.ACCEPTED)

        # هشدار تداخل: جلسه ساخته شده و افراد اضافه شده‌اند؛ این فقط اطلاع‌رسانی است.
        attendees = [str(p.user_id) for p in meeting.meeting_participants.all()]
        data = MeetingSerializer(meeting).data
        data['conflicts'] = find_conflicts(
            meeting.start, meeting.end, attendees, exclude_meeting_id=meeting.pk)
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return self._edit(request, partial=kwargs.get('partial', False))

    def partial_update(self, request, *args, **kwargs):
        return self._edit(request, partial=True)

    def _edit(self, request, partial):
        """ویرایش جلسه — فقط سازنده، مدیرعامل یا ادمین."""
        meeting = self.get_object()
        assert_can_edit(request.user, meeting)
        d = request.data

        simple = {'title': 'title', 'priority': 'priority', 'status': 'status'}
        for src, field in simple.items():
            if src in d:
                setattr(meeting, field, d[src])
        if 'type' in d:
            meeting.meeting_type = d['type']
        if 'category' in d:
            meeting.category_id = d['category'] or None
        if 'room' in d:
            meeting.location_id = d['room'] or None
        if 'meetLink' in d:
            meeting.meet_link = Meeting.normalize_meet(d['meetLink'])
        if {'date', 'start', 'end'} & set(d):
            day = d.get('date') or to_iso(meeting.start)
            meeting.start = from_date_hour(day, float(d.get('start', hour_of(meeting.start))))
            meeting.end = from_date_hour(day, float(d.get('end', hour_of(meeting.end))))
        meeting.save()

        if 'parts' in d:
            wanted = {str(x) for x in d['parts']}
            meeting.meeting_participants.filter(is_guest=False).exclude(user_id__in=wanted).delete()
            existing = {str(p.user_id) for p in meeting.meeting_participants.filter(is_guest=False)}
            auto = MeetingParticipant.Response.ACCEPTED if is_manager(request.user) \
                else MeetingParticipant.Response.PENDING
            for uid in wanted - existing:
                MeetingParticipant.objects.get_or_create(
                    meeting=meeting, user_id=uid,
                    defaults={'is_guest': False, 'response': auto})

        meeting.refresh_from_db()
        data = MeetingSerializer(meeting).data
        data['conflicts'] = find_conflicts(
            meeting.start, meeting.end,
            [str(p.user_id) for p in meeting.meeting_participants.all()],
            exclude_meeting_id=meeting.pk)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='check-conflicts')
    def check_conflicts(self, request):
        """بررسی زنده هنگام پر کردن فرم — بدون ساخت جلسه."""
        try:
            date = str(request.data.get('date', ''))
            start = float(request.data.get('start', 0))
            end = float(request.data.get('end', 0))
            begins, ends = from_date_hour(date, start), from_date_hour(date, end)
        except (TypeError, ValueError):
            return Response({'detail': 'تاریخ یا ساعت نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
        users = list(request.data.get('parts', [])) + list(request.data.get('guests', []))
        conflicts = find_conflicts(begins, ends, users,
                                   exclude_meeting_id=request.data.get('exclude'))
        return Response({'conflicts': conflicts})

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """پاسخ به دعوت‌نامه: پذیرش یا رد."""
        meeting = self.get_object()
        accept = bool(request.data.get('accept'))
        meeting.status = Meeting.Status.CONFIRMED if accept else Meeting.Status.CANCELLED
        meeting.save(update_fields=['status'])
        return Response(MeetingSerializer(meeting).data)

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        """همگام‌سازی با Google Calendar."""
        meeting = self.get_object()
        meeting.google_synced = True
        meeting.save(update_fields=['google_synced'])
        return Response(MeetingSerializer(meeting).data)


class MinuteEntryViewSet(viewsets.ModelViewSet):
    queryset = entries_queryset()
    serializer_class = MinuteEntrySerializer

    def get_queryset(self):
        return entries_queryset(self.request.user)

    def create(self, request, *args, **kwargs):
        write = MinuteEntryCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        entry = write.save()
        return Response(MinuteEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """تیک انجام‌شدن — برای تسک، یادآور و تماس تلفنی."""
        entry = self.get_object()
        entry.is_done = not entry.is_done
        entry.done_at = timezone.now() if entry.is_done else None
        entry.save(update_fields=['is_done', 'done_at'])
        return Response(MinuteEntrySerializer(entry).data)


class AgendaItemViewSet(viewsets.ModelViewSet):
    """دستور جلسه — ایجاد/ویرایش/حذف فقط توسط سازندهٔ جلسه، مدیرعامل یا ادمین."""
    queryset = AgendaItem.objects.select_related('meeting').order_by('order')
    serializer_class = AgendaItemSerializer

    def perform_create(self, serializer):
        meeting = serializer.validated_data.get('meeting')
        assert_can_edit(self.request.user, meeting)
        last = meeting.agenda.order_by('-order').first()
        serializer.save(created_by=self.request.user,
                        order=serializer.validated_data.get('order') or ((last.order if last else 0) + 1))

    def perform_update(self, serializer):
        assert_can_edit(self.request.user, serializer.instance.meeting)
        serializer.save()

    def perform_destroy(self, instance):
        assert_can_edit(self.request.user, instance.meeting)
        instance.delete()


class OrganizationKindViewSet(viewsets.ReadOnlyModelViewSet):
    """انواع سازمان — در پنل ادمین جنگو مدیریت می‌شوند."""
    queryset = OrganizationKind.objects.all()
    serializer_class = OrganizationKindSerializer


class OrganizationViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = Organization.objects.select_related('kind')
    serializer_class = OrganizationSerializer

    def create(self, request, *args, **kwargs):
        write = OrganizationCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(OrganizationSerializer(write.save()).data, status=status.HTTP_201_CREATED)


class PersonViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = User.objects.filter(is_external=False).select_related('organization')
    serializer_class = PersonSerializer

    def create(self, request, *args, **kwargs):
        write = PersonCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(PersonSerializer(write.save()).data, status=status.HTTP_201_CREATED)


class LocationViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = Location.objects.select_related('organization')
    serializer_class = LocationSerializer

    def create(self, request, *args, **kwargs):
        write = LocationCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(LocationSerializer(write.save()).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def set_gcal(request):
    """اتصال/قطع اتصال Google Calendar برای کاربر جاری (دمو: مدیرعامل)."""
    connected = bool(request.data.get('connected', True))
    user = User.objects.filter(role=User.Role.CEO).first() or User.objects.filter(is_external=False).first()
    conn, _ = GoogleCalendarConnection.objects.get_or_create(user=user)
    conn.is_connected = connected
    conn.calendar_id = 'greenpay-meetings' if connected else ''
    conn.save(update_fields=['is_connected', 'calendar_id'])
    if connected:
        Meeting.objects.filter(google_synced=False).update(google_synced=True)
    return Response({'gcalConnected': connected})


@api_view(['POST'])
def set_sms(request):
    """فعال/غیرفعال کردن ارسال پیامک اعلان‌ها."""
    enabled = bool(request.data.get('enabled', True))
    user = User.objects.filter(role=User.Role.CEO).first() or User.objects.filter(is_external=False).first()
    if user:
        user.sms_enabled = enabled
        user.save(update_fields=['sms_enabled'])
    return Response({'smsEnabled': enabled})
