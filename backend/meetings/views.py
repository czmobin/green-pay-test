"""ویوهای API — یک endpoint راه‌انداز (bootstrap) به‌علاوهٔ عملیات نوشتن."""
from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import (
    Category, GoogleCalendarConnection, Location, Meeting, MinuteEntry, Organization, User,
)
from .serializers import (
    CategorySerializer, GuestSerializer, LocationCreateSerializer, LocationSerializer,
    MeetingCreateSerializer, MeetingSerializer, MinuteEntryCreateSerializer,
    MinuteEntrySerializer, OrganizationCreateSerializer, OrganizationSerializer,
    PersonCreateSerializer, PersonSerializer,
)


def find_conflicts(start, end, user_ids, exclude_meeting_id=None):
    """
    جلسه‌های هم‌زمانِ افرادِ داده‌شده را برمی‌گرداند.

    این فقط یک هشدار است و هیچ‌جا مانع افزودن فرد یا ساخت جلسه نمی‌شود.
    بازه‌ها وقتی تداخل دارند که start < other_end و end > other_start باشد.
    """
    from .serializers import to_day_index, to_float_hour

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
                'day': to_day_index(meeting.start),
                'start': to_float_hour(meeting.start),
                'end': to_float_hour(meeting.end),
                'room': meeting.location.name if meeting.location_id else '',
            })
    return conflicts


def _by_id(serializer_data):
    """لیست سریالایزشده → دیکشنری کلیددار با id (شکل موردنیاز فرانت)."""
    return {row['id']: row for row in serializer_data}


def meetings_queryset():
    return (Meeting.objects
            .select_related('category', 'location', 'organizer')
            .prefetch_related('meeting_participants', 'agenda')
            .order_by('start'))


def entries_queryset():
    return (MinuteEntry.objects
            .select_related('minutes', 'minutes__meeting', 'assignee')
            .prefetch_related('attachments')
            .order_by('-created_at'))


@api_view(['GET'])
def bootstrap(request):
    """همهٔ دادهٔ موردنیاز اپ در یک درخواست."""
    people = User.objects.filter(is_external=False).select_related('organization').order_by('id')
    guests = User.objects.filter(is_external=True).select_related('organization').order_by('id')
    ceo = people.filter(role=User.Role.CEO).first() or people.first()

    minutes: dict[str, list] = {}
    for row in MinuteEntrySerializer(entries_queryset(), many=True).data:
        minutes.setdefault(row['meeting'], []).append(row)

    gcal = GoogleCalendarConnection.objects.filter(user=ceo).first() if ceo else None

    return Response({
        'organizations': _by_id(OrganizationSerializer(Organization.objects.all(), many=True).data),
        'categories': _by_id(CategorySerializer(Category.objects.all(), many=True).data),
        'rooms': _by_id(LocationSerializer(Location.objects.select_related('organization'), many=True).data),
        'people': _by_id(PersonSerializer(people, many=True).data),
        'guests': _by_id(GuestSerializer(guests, many=True).data),
        'meetings': MeetingSerializer(meetings_queryset(), many=True).data,
        'minutes': minutes,
        'currentUser': str(ceo.pk) if ceo else None,
        'gcalConnected': bool(gcal and gcal.is_connected),
        'smsEnabled': bool(ceo and ceo.sms_enabled),
    })


class MeetingViewSet(viewsets.ModelViewSet):
    queryset = meetings_queryset()
    serializer_class = MeetingSerializer

    def create(self, request, *args, **kwargs):
        write = MeetingCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        meeting = write.save()

        # هشدار تداخل: جلسه ساخته شده و افراد اضافه شده‌اند؛ این فقط اطلاع‌رسانی است.
        attendees = [str(p.user_id) for p in meeting.meeting_participants.all()]
        data = MeetingSerializer(meeting).data
        data['conflicts'] = find_conflicts(
            meeting.start, meeting.end, attendees, exclude_meeting_id=meeting.pk)
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='check-conflicts')
    def check_conflicts(self, request):
        """بررسی زنده هنگام پر کردن فرم — بدون ساخت جلسه."""
        from .serializers import from_day_hour
        try:
            day = int(request.data.get('day', 0))
            start = float(request.data.get('start', 0))
            end = float(request.data.get('end', 0))
        except (TypeError, ValueError):
            return Response({'detail': 'زمان نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
        users = list(request.data.get('parts', [])) + list(request.data.get('guests', []))
        conflicts = find_conflicts(from_day_hour(day, start), from_day_hour(day, end), users,
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

    def create(self, request, *args, **kwargs):
        write = MinuteEntryCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        entry = write.save()
        return Response(MinuteEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """تیک انجام‌شدن تسک."""
        entry = self.get_object()
        entry.is_done = not entry.is_done
        entry.save(update_fields=['is_done'])
        return Response(MinuteEntrySerializer(entry).data)


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

    def create(self, request, *args, **kwargs):
        write = OrganizationCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(OrganizationSerializer(write.save()).data, status=status.HTTP_201_CREATED)


class PersonViewSet(viewsets.ModelViewSet):
    queryset = User.objects.filter(is_external=False).select_related('organization')
    serializer_class = PersonSerializer

    def create(self, request, *args, **kwargs):
        write = PersonCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(PersonSerializer(write.save()).data, status=status.HTTP_201_CREATED)


class LocationViewSet(viewsets.ModelViewSet):
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
