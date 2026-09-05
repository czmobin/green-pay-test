"""
اشتراک تقویم و دروازهٔ نوشتن صورت‌جلسه.

مهم‌ترین تست‌های این فایل آن‌هایی‌اند که «نباید بشود» را می‌سنجند: پیش از این
فیچر، `POST /api/entries/` و `entries/<id>/toggle/` هیچ کنترل دسترسی نداشتند.
یعنی این‌ها هم‌زمان تست فیچر و تستِ رگرسیونِ یک باگ امنیتی‌اند.
"""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from meetings.models import (
    CalendarShare, Category, Meeting, MeetingParticipant, MinuteEntry, Minutes, User,
)


def make_user(username, role=User.Role.MEMBER, **kw):
    return User.objects.create_user(
        username=username, password='x', role=role, first_name=username, **kw)


class ShareTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user('owner')
        self.viewer = make_user('viewer')
        self.stranger = make_user('stranger')
        self.category = Category.objects.create(name='داخلی', color='#0a0')

        start = timezone.now() + timedelta(days=1)
        self.meeting = Meeting.objects.create(
            title='جلسهٔ مبدأ', category=self.category, meeting_type=Meeting.Type.IN_PERSON,
            status=Meeting.Status.CONFIRMED, organizer=self.owner,
            start=start, end=start + timedelta(hours=1),
        )
        MeetingParticipant.objects.create(meeting=self.meeting, user=self.owner)

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def share(self, **kw):
        return CalendarShare.objects.create(owner=self.owner, viewer=self.viewer, **kw)

    def post_entry(self, user, meeting=None):
        return self.as_(user).post(reverse('entry-list'), {
            'meeting': str((meeting or self.meeting).pk),
            'type': MinuteEntry.Type.NOTE,
            'text': 'یادداشت',
        }, format='json')


class VisibilityTests(ShareTestBase):
    def test_without_share_meeting_is_invisible(self):
        res = self.as_(self.viewer).get(reverse('bootstrap'))
        self.assertEqual([m['id'] for m in res.data['meetings']], [])

    def test_share_makes_owner_meetings_visible(self):
        self.share()
        res = self.as_(self.viewer).get(reverse('bootstrap'))
        self.assertEqual([m['id'] for m in res.data['meetings']], [str(self.meeting.pk)])

    def test_share_does_not_leak_to_third_party(self):
        self.share()
        res = self.as_(self.stranger).get(reverse('bootstrap'))
        self.assertEqual(res.data['meetings'], [])

    def test_meetings_owner_only_attends_are_shared_too(self):
        """«تقویم مبدأ» یعنی هرچه خودش می‌بیند — نه فقط جلساتی که ساخته."""
        other = make_user('other')
        start = timezone.now() + timedelta(days=2)
        m = Meeting.objects.create(
            title='جلسهٔ دیگری', category=self.category, meeting_type=Meeting.Type.IN_PERSON,
            status=Meeting.Status.CONFIRMED, organizer=other,
            start=start, end=start + timedelta(hours=1))
        MeetingParticipant.objects.create(meeting=m, user=other)
        MeetingParticipant.objects.create(meeting=m, user=self.owner)

        self.share()
        res = self.as_(self.viewer).get(reverse('bootstrap'))
        self.assertIn(str(m.pk), [row['id'] for row in res.data['meetings']])

    def test_bootstrap_reports_both_directions(self):
        self.share()
        owner_view = self.as_(self.owner).get(reverse('bootstrap')).data
        self.assertEqual([s['viewer'] for s in owner_view['sharedByMe']], [str(self.viewer.pk)])
        self.assertEqual(owner_view['sharedWithMe'], [])

        viewer_view = self.as_(self.viewer).get(reverse('bootstrap')).data
        self.assertEqual([s['owner'] for s in viewer_view['sharedWithMe']], [str(self.owner.pk)])
        self.assertEqual(viewer_view['sharedByMe'], [])


class MinutesGateTests(ShareTestBase):
    def test_writing_is_off_by_default_for_a_shared_calendar(self):
        self.share()                                   # can_write_minutes=False
        self.assertEqual(self.post_entry(self.viewer).status_code, 403)
        self.assertEqual(MinuteEntry.objects.count(), 0)

    def test_owner_can_turn_writing_on(self):
        share = self.share()
        url = reverse('calendar-share-detail', args=[share.pk])
        res = self.as_(self.owner).patch(url, {'canWriteMinutes': True}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.post_entry(self.viewer).status_code, 201)

    def test_viewer_cannot_turn_writing_on_for_itself(self):
        share = self.share()
        url = reverse('calendar-share-detail', args=[share.pk])
        res = self.as_(self.viewer).patch(url, {'canWriteMinutes': True}, format='json')
        self.assertEqual(res.status_code, 403)
        share.refresh_from_db()
        self.assertFalse(share.can_write_minutes)

    def test_stranger_cannot_write_minutes(self):
        """رگرسیون: پیش از این، هر کاربر احرازشده می‌توانست در هر صورت‌جلسه بنویسد."""
        res = self.post_entry(self.stranger)
        self.assertEqual(res.status_code, 400)         # جلسه اصلاً برایش قابل حل نیست
        self.assertEqual(MinuteEntry.objects.count(), 0)

    def test_participant_can_write_without_any_share(self):
        member = make_user('member')
        MeetingParticipant.objects.create(meeting=self.meeting, user=member)
        self.assertEqual(self.post_entry(member).status_code, 201)

    def test_organizer_can_write(self):
        self.assertEqual(self.post_entry(self.owner).status_code, 201)

    def test_toggle_is_gated(self):
        """رگرسیون: `toggle` هم هیچ کنترلی نداشت."""
        minutes = Minutes.objects.create(meeting=self.meeting, participant=None)
        entry = MinuteEntry.objects.create(
            minutes=minutes, entry_type=MinuteEntry.Type.REMINDER,
            text='کاری', created_by=self.owner)
        self.share()
        url = reverse('entry-toggle', args=[entry.pk])
        self.assertEqual(self.as_(self.viewer).post(url).status_code, 403)
        entry.refresh_from_db()
        self.assertFalse(entry.is_done)

    def test_toggle_allowed_once_writing_is_on(self):
        minutes = Minutes.objects.create(meeting=self.meeting, participant=None)
        entry = MinuteEntry.objects.create(
            minutes=minutes, entry_type=MinuteEntry.Type.REMINDER,
            text='کاری', created_by=self.owner)
        self.share(can_write_minutes=True)
        url = reverse('entry-toggle', args=[entry.pk])
        self.assertEqual(self.as_(self.viewer).post(url).status_code, 200)
        entry.refresh_from_db()
        self.assertTrue(entry.is_done)

    def test_author_keeps_editing_own_entry_after_writing_is_turned_off(self):
        """نویسنده باید بتواند نوشتهٔ خودش را اصلاح کند، حتی وقتی اجازه پس گرفته شد."""
        share = self.share(can_write_minutes=True)
        self.assertEqual(self.post_entry(self.viewer).status_code, 201)
        entry = MinuteEntry.objects.get()

        share.can_write_minutes = False
        share.save(update_fields=['can_write_minutes'])

        res = self.as_(self.viewer).patch(
            reverse('entry-detail', args=[entry.pk]), {'text': 'اصلاح'}, format='json')
        self.assertEqual(res.status_code, 200)
        # ولی آیتم تازه دیگر نمی‌تواند بسازد
        self.assertEqual(self.post_entry(self.viewer).status_code, 403)

    def test_revoking_the_share_hides_the_meeting_and_its_minutes(self):
        share = self.share(can_write_minutes=True)
        self.assertEqual(self.post_entry(self.viewer).status_code, 201)
        entry = MinuteEntry.objects.get()
        share.delete()
        # جلسه دیگر دیده نمی‌شود، پس آیتمش هم نه — حتی آیتمی که خودش نوشته.
        res = self.as_(self.viewer).patch(
            reverse('entry-detail', args=[entry.pk]), {'text': 'اصلاح'}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.as_(self.viewer).get(reverse('bootstrap')).data['meetings'], [])


class ShareApiTests(ShareTestBase):
    def test_owner_is_taken_from_the_request_not_the_body(self):
        """کسی نتواند به نام دیگری اشتراک بسازد."""
        res = self.as_(self.viewer).post(reverse('calendar-share-list'), {
            'owner': str(self.owner.pk), 'viewer': str(self.stranger.pk),
        }, format='json')
        self.assertEqual(res.status_code, 201)
        share = CalendarShare.objects.get()
        self.assertEqual(share.owner_id, self.viewer.pk)     # نه self.owner

    def test_sharing_with_self_is_rejected(self):
        res = self.as_(self.owner).post(
            reverse('calendar-share-list'), {'viewer': str(self.owner.pk)}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_duplicate_share_is_idempotent(self):
        url = reverse('calendar-share-list')
        first = self.as_(self.owner).post(url, {'viewer': str(self.viewer.pk)}, format='json')
        second = self.as_(self.owner).post(url, {'viewer': str(self.viewer.pk)}, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(CalendarShare.objects.count(), 1)

    def test_viewer_may_remove_a_share_from_its_own_view(self):
        share = self.share()
        res = self.as_(self.viewer).delete(reverse('calendar-share-detail', args=[share.pk]))
        self.assertEqual(res.status_code, 204)
        self.assertEqual(CalendarShare.objects.count(), 0)

    def test_third_party_cannot_see_or_delete_a_share(self):
        share = self.share()
        res = self.as_(self.stranger).delete(reverse('calendar-share-detail', args=[share.pk]))
        self.assertEqual(res.status_code, 404)
        self.assertEqual(CalendarShare.objects.count(), 1)

    def test_list_shows_both_directions_only(self):
        self.share()
        CalendarShare.objects.create(owner=self.stranger, viewer=make_user('nobody'))
        res = self.as_(self.viewer).get(reverse('calendar-share-list'))
        self.assertEqual(len(res.data), 1)
