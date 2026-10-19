"""
نمای رزروِ محل‌ها — `GET /api/room-bookings/`.

این اندپوینت تنها جایی در سامانه است که عمداً از `meetings_queryset` **عبور
نمی‌کند**: ساعت و محل برای همه دیده می‌شود (وگرنه نمای رزرو بی‌فایده است) ولی
عنوان فقط برای کسی که از قبل حق دیدنش را دارد.

پس این فایل همان جنس تستی است که `test_calendar_share.py` دارد و همان‌قدر
جدی: اگر یکی‌شان قرمز شد، یعنی عنوانِ جلسه‌ای به کسی رسیده که نباید.
"""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from meetings.models import (
    CalendarShare, Category, Location, Meeting, MeetingParticipant, Organization,
    OrganizationKind, User,
)
from meetings.views import HIDDEN_TITLE

from .test_calendar_share import make_user

CEO_TITLE = 'جلسهٔ محرمانهٔ مدیرعامل'


class RoomBookingTestBase(APITestCase):
    def setUp(self):
        kind, _ = OrganizationKind.objects.get_or_create(
            slug='internal', defaults={'name': 'داخلی'})
        self.org = Organization.objects.create(name='گرین‌پی', kind=kind)
        self.category = Category.objects.create(name='داخلی', color='#0a0')

        self.member = make_user('member')
        self.admin = make_user('boss', role=User.Role.ADMIN)
        self.ceo = make_user('ceo', role=User.Role.CEO)
        self.executive = make_user('exec', role=User.Role.EXECUTIVE)

        self.room_a = Location.objects.create(name='اتاق طبقه ۳', organization=self.org)
        self.room_b = Location.objects.create(name='دفتر مدیرعامل', organization=self.org)

        self.day = timezone.localdate() + timedelta(days=2)
        # جلسهٔ مدیرعامل در دفتر خودش — چیزی که کاربر عادی نباید عنوانش را ببیند
        self.ceo_meeting = self.meeting(CEO_TITLE, self.ceo, self.room_b, 14)
        # جلسهٔ خودِ کاربر عادی — عنوانش را باید ببیند
        self.own_meeting = self.meeting('جلسهٔ خودم', self.member, self.room_a, 10)

    def meeting(self, title, organizer, room, hour, *, status=Meeting.Status.CONFIRMED):
        begins = timezone.make_aware(
            timezone.datetime(self.day.year, self.day.month, self.day.day, hour, 0))
        row = Meeting.objects.create(
            title=title, category=self.category, meeting_type=Meeting.Type.IN_PERSON,
            status=status, organizer=organizer, location=room,
            start=begins, end=begins + timedelta(hours=1),
        )
        MeetingParticipant.objects.create(meeting=row, user=organizer)
        return row

    def bookings(self, user, **params):
        self.client.force_authenticate(user=user)
        query = {'from': self.day.isoformat(), 'to': self.day.isoformat(), **params}
        res = self.client.get(reverse('room-bookings'), query)
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def row_for(self, data, meeting):
        """سطرِ این جلسه را از روی ساعت پیدا می‌کند — شناسه ممکن است پنهان باشد."""
        hour = timezone.localtime(meeting.start).hour
        found = [r for r in data if r['start'] == hour and r['room'] == str(meeting.location_id)]
        self.assertEqual(len(found), 1, f'سطرِ ساعت {hour} پیدا نشد: {data}')
        return found[0]


class RedactionTests(RoomBookingTestBase):
    def test_a_member_sees_the_slot_is_busy(self):
        """نکتهٔ اصلیِ این نما: اتاق پر است، حتی اگر ندانی چرا."""
        row = self.row_for(self.bookings(self.member), self.ceo_meeting)
        self.assertEqual(row['start'], 14)
        self.assertEqual(row['end'], 15)
        self.assertEqual(row['room'], str(self.room_b.pk))

    def test_but_not_the_title(self):
        row = self.row_for(self.bookings(self.member), self.ceo_meeting)
        self.assertEqual(row['title'], HIDDEN_TITLE)
        self.assertNotIn(CEO_TITLE, str(self.bookings(self.member)))

    def test_and_not_the_id_either(self):
        """شناسهٔ خالی همان چیزی است که «کلیک هیچ کاری نکند» را ساختاری می‌کند."""
        row = self.row_for(self.bookings(self.member), self.ceo_meeting)
        self.assertEqual(row['meeting'], '')

    def test_a_member_does_see_their_own_title(self):
        row = self.row_for(self.bookings(self.member), self.own_meeting)
        self.assertEqual(row['title'], 'جلسهٔ خودم')
        self.assertEqual(row['meeting'], str(self.own_meeting.pk))

    def test_admin_sees_the_ceo_title(self):
        row = self.row_for(self.bookings(self.admin), self.ceo_meeting)
        self.assertEqual(row['title'], CEO_TITLE)

    def test_the_ceo_sees_their_own_title(self):
        row = self.row_for(self.bookings(self.ceo), self.ceo_meeting)
        self.assertEqual(row['title'], CEO_TITLE)

    def test_an_executive_does_not_see_the_ceo_title(self):
        """همان قاعدهٔ `ceo_meeting_ids`؛ خواستهٔ صریحِ کارفرما بود."""
        row = self.row_for(self.bookings(self.executive), self.ceo_meeting)
        self.assertEqual(row['title'], HIDDEN_TITLE)
        self.assertEqual(row['meeting'], '')

    def test_an_executive_does_see_an_ordinary_title(self):
        """قرینه: پنهان‌سازی نباید از قاعده بیرون بزند."""
        row = self.row_for(self.bookings(self.executive), self.own_meeting)
        self.assertEqual(row['title'], 'جلسهٔ خودم')

    def test_a_calendar_share_reveals_the_title(self):
        CalendarShare.objects.create(owner=self.ceo, viewer=self.member)
        row = self.row_for(self.bookings(self.member), self.ceo_meeting)
        self.assertEqual(row['title'], CEO_TITLE)

    def test_the_response_never_carries_people(self):
        """این نما دربارهٔ اتاق است، نه آدم‌ها."""
        for row in self.bookings(self.member):
            self.assertEqual(
                set(row), {'meeting', 'title', 'room', 'date', 'start', 'end', 'status'})


class ScopeTests(RoomBookingTestBase):
    def test_a_cancelled_meeting_does_not_hold_the_room(self):
        cancelled = self.meeting('لغوشده', self.member, self.room_a, 16,
                                 status=Meeting.Status.CANCELLED)
        hours = [r['start'] for r in self.bookings(self.member)]
        self.assertNotIn(16, hours)
        self.assertEqual(cancelled.status, Meeting.Status.CANCELLED)

    def test_a_pending_meeting_does_hold_the_room(self):
        """رزروِ موقت هم رزرو است؛ وگرنه دو نفر همان ساعت را می‌گیرند."""
        self.meeting('در انتظار', self.member, self.room_a, 17,
                     status=Meeting.Status.PENDING)
        row = [r for r in self.bookings(self.member) if r['start'] == 17]
        self.assertEqual(len(row), 1)
        self.assertEqual(row[0]['status'], Meeting.Status.PENDING)

    def test_a_meeting_without_a_room_is_not_listed(self):
        begins = timezone.make_aware(
            timezone.datetime(self.day.year, self.day.month, self.day.day, 18, 0))
        Meeting.objects.create(
            title='آنلاین', category=self.category, meeting_type=Meeting.Type.ONLINE,
            status=Meeting.Status.CONFIRMED, organizer=self.member,
            start=begins, end=begins + timedelta(hours=1))
        self.assertNotIn(18, [r['start'] for r in self.bookings(self.member)])

    def test_the_room_filter_narrows_it(self):
        only_b = self.bookings(self.member, room=str(self.room_b.pk))
        self.assertEqual({r['room'] for r in only_b}, {str(self.room_b.pk)})

    def test_a_day_outside_the_range_is_not_listed(self):
        far = self.day + timedelta(days=20)
        self.meeting('دور', self.member, self.room_a, 9)
        data = self.bookings(self.member, **{'from': far.isoformat(), 'to': far.isoformat()})
        self.assertEqual(data, [])


class GuardTests(RoomBookingTestBase):
    def test_it_needs_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.get(reverse('room-bookings'),
                              {'from': self.day.isoformat(), 'to': self.day.isoformat()})
        self.assertEqual(res.status_code, 401)

    def test_a_missing_range_is_refused(self):
        self.client.force_authenticate(user=self.member)
        self.assertEqual(self.client.get(reverse('room-bookings')).status_code, 400)

    def test_a_backwards_range_is_refused(self):
        self.client.force_authenticate(user=self.member)
        res = self.client.get(reverse('room-bookings'), {
            'from': self.day.isoformat(), 'to': (self.day - timedelta(days=1)).isoformat()})
        self.assertEqual(res.status_code, 400)

    def test_an_unbounded_range_is_refused(self):
        """بازهٔ باز یعنی کوئریِ بی‌مرز روی کلِ جدول جلسات."""
        self.client.force_authenticate(user=self.member)
        res = self.client.get(reverse('room-bookings'), {
            'from': self.day.isoformat(), 'to': (self.day + timedelta(days=400)).isoformat()})
        self.assertEqual(res.status_code, 400)
