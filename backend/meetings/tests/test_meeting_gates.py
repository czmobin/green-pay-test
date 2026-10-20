"""
دروازه‌های ساختِ جلسه: اجازهٔ ایجاد، تاییدِ محل، و تکرار.

هر تستِ این فایل یک **نشتیِ بی‌صدا** را نگه می‌دارد. جلسه‌ای که تایید نشده و
پیامکش رفته، یا کاربری که اجازهٔ ساخت ندارد و ساخته، هیچ خطایی تولید نمی‌کند —
فقط کاری می‌کند که قرار نبود بکند. پس این‌ها تنها چیزی هستند که این قواعد را
سر جایشان نگه می‌دارد.

مهم‌ترینشان `test_pending_meeting_stays_out_of_outlook` است: دعوت‌نامهٔ Exchange
به تقویم و موبایل همهٔ شرکت‌کننده‌ها می‌رسد و هیچ پیامکی جلویش را نمی‌گیرد. اگر
آن تست قرمز شد، دروازهٔ تایید عملاً باز است.
"""
from datetime import timedelta
from unittest import mock

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from meetings.models import (
    Category, Location, Meeting, MeetingParticipant, Organization, OrganizationKind, User,
)


def make_user(username, role=User.Role.MEMBER, **kw):
    return User.objects.create_user(
        username=username, password='x', role=role, first_name=username, **kw)


class GateTestBase(APITestCase):
    def setUp(self):
        # `get_or_create`: مهاجرتِ `0005` انواع سازمان را می‌کارد و `slug` یکتاست.
        kind, _ = OrganizationKind.objects.get_or_create(
            slug='internal', defaults={'name': 'داخلی'})
        self.org = Organization.objects.create(name='گرین‌پی', kind=kind)
        self.category = Category.objects.create(name='داخلی', color='#0a0')

        self.member = make_user('member', phone='09120000001')
        self.admin = make_user('boss', role=User.Role.ADMIN, phone='09120000002')
        self.ceo = make_user('ceo', role=User.Role.CEO, phone='09120000003')
        self.executive = make_user('exec', role=User.Role.EXECUTIVE, phone='09120000004')
        self.other = make_user('other', phone='09120000005')

        self.free_room = Location.objects.create(name='اتاق طبقه ۳', organization=self.org)
        self.gated_room = Location.objects.create(
            name='دفتر مدیرعامل', organization=self.org, needs_approval=True)

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def payload(self, **over):
        day = (timezone.localdate() + timedelta(days=3)).isoformat()
        body = {
            'title': 'جلسهٔ آزمون',
            'category': str(self.category.pk),
            'type': Meeting.Type.IN_PERSON,
            'organizer': str(self.member.pk),
            'date': day,
            'start': 10,
            'end': 11,
            'parts': [str(self.member.pk), str(self.other.pk)],
        }
        body.update(over)
        return body

    def create_as(self, user, **over):
        return self.as_(user).post(reverse('meeting-list'), self.payload(**over), format='json')


class CanCreateMeetingsTests(GateTestBase):
    def test_default_is_on_so_nothing_changes_for_existing_users(self):
        self.assertTrue(make_user('newcomer').can_create_meetings)

    def test_a_user_with_the_flag_off_is_refused(self):
        self.member.can_create_meetings = False
        self.member.save(update_fields=['can_create_meetings'])

        res = self.create_as(self.member)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(Meeting.objects.count(), 0)

    def test_with_the_flag_on_it_works(self):
        self.assertEqual(self.create_as(self.member).status_code, 201)


class ApprovalGateTests(GateTestBase):
    def test_a_free_room_is_confirmed_at_once(self):
        res = self.create_as(self.member, room=str(self.free_room.pk))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.CONFIRMED)

    def test_a_gated_room_lands_in_pending(self):
        res = self.create_as(self.member, room=str(self.gated_room.pk))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['status'], Meeting.Status.PENDING)
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.PENDING)

    def test_an_approver_does_not_need_to_approve_their_own(self):
        """وگرنه مدیرعامل باید جلسهٔ دفتر خودش را تایید کند."""
        for user in (self.admin, self.ceo):
            Meeting.objects.all().delete()
            self.create_as(user, room=str(self.gated_room.pk), organizer=str(user.pk))
            self.assertEqual(Meeting.objects.get().status,
                             Meeting.Status.CONFIRMED, msg=user.username)

    def test_an_executive_still_needs_approval(self):
        """`is_manager` شامل مدیر اجرایی است؛ قاعدهٔ تایید نباید باشد."""
        self.create_as(self.executive, room=str(self.gated_room.pk),
                       organizer=str(self.executive.pk))
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.PENDING)

    def test_no_sms_goes_out_while_pending(self):
        with mock.patch('meetings.views.notify_created') as sms:
            self.create_as(self.member, room=str(self.gated_room.pk))
        sms.assert_not_called()

    def test_pending_meeting_stays_out_of_outlook(self):
        """دعوت‌نامهٔ Exchange هیچ پیامکی جلویش را نمی‌گیرد — این تست می‌گیرد."""
        with mock.patch('meetings.graph.enabled', return_value=True):
            self.create_as(self.member, room=str(self.gated_room.pk))
        self.assertFalse(Meeting.objects.get().outlook_dirty)

    def test_a_confirmed_meeting_does_reach_outlook(self):
        """قرینهٔ تستِ بالا: نگهبانِ تازه نباید مسیر سالم را هم ببندد."""
        with mock.patch('meetings.graph.enabled', return_value=True):
            self.create_as(self.member, room=str(self.free_room.pk))
        self.assertTrue(Meeting.objects.get().outlook_dirty)

    def test_the_creator_cannot_self_approve_with_a_patch(self):
        """`PATCH {"status": …}` راهِ دورزدنِ دروازه بود."""
        self.create_as(self.member, room=str(self.gated_room.pk))
        meeting = Meeting.objects.get()

        res = self.as_(self.member).patch(
            reverse('meeting-detail', args=[meeting.pk]),
            {'status': Meeting.Status.CONFIRMED}, format='json')
        self.assertIn(res.status_code, (200, 202))
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    def test_an_arbitrary_status_string_is_not_persisted_either(self):
        self.create_as(self.member, room=str(self.free_room.pk))
        meeting = Meeting.objects.get()
        self.as_(self.member).patch(reverse('meeting-detail', args=[meeting.pk]),
                                    {'status': 'whatever'}, format='json')
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)


class ApproveRejectTests(GateTestBase):
    def pending(self, **over):
        self.create_as(self.member, room=str(self.gated_room.pk), **over)
        return Meeting.objects.order_by('start').first()

    def test_a_member_cannot_approve(self):
        meeting = self.pending()
        res = self.as_(self.other).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 403)

    def test_an_executive_cannot_approve(self):
        meeting = self.pending()
        res = self.as_(self.executive).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 403)

    def test_admin_and_ceo_can_approve(self):
        for user in (self.admin, self.ceo):
            Meeting.objects.all().delete()
            meeting = self.pending()
            with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
                 mock.patch('meetings.views.notify_created', return_value=(1, 0)) as sms:
                res = self.as_(user).post(reverse('meeting-approve', args=[meeting.pk]))
            self.assertEqual(res.status_code, 200, msg=user.username)
            meeting.refresh_from_db()
            self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
            self.assertEqual(sms.call_count, 1)

    def test_approving_sends_the_creation_sms_that_was_held_back(self):
        meeting = self.pending()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(2, 0)) as sms:
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.data['smsSent'], 2)
        sms.assert_called_once()

    def test_approving_releases_it_to_outlook(self):
        meeting = self.pending()
        with mock.patch('meetings.graph.enabled', return_value=True), \
             mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        meeting.refresh_from_db()
        self.assertTrue(meeting.outlook_dirty)

    def test_rejecting_cancels_and_sms_goes_only_to_the_creator(self):
        """شرکت‌کنندگان خبر ایجاد نگرفته‌اند؛ فقط سازنده از رد باخبر می‌شود."""
        meeting = self.pending()
        with mock.patch('meetings.views.notify_cancelled') as cancel_sms, \
             mock.patch('meetings.views.notify_created') as create_sms, \
             mock.patch('meetings.views.notify_approval_result', return_value=(1, 0)) as decision:
            res = self.as_(self.admin).post(
                reverse('meeting-reject', args=[meeting.pk]), {'reason': 'اتاق لازم است'},
                format='json')
        self.assertEqual(res.status_code, 200)
        cancel_sms.assert_not_called()
        create_sms.assert_not_called()
        decision.assert_called_once()
        self.assertFalse(decision.call_args.kwargs['approved'])
        self.assertEqual(res.data['smsSent'], 1)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CANCELLED)
        self.assertEqual(meeting.cancel_reason, 'اتاق لازم است')

    def test_approving_also_smses_the_creator(self):
        meeting = self.pending()
        with mock.patch('meetings.views.notify_approval_result', return_value=(1, 0)) as decision, \
             mock.patch('meetings.views.notify_created', return_value=(2, 0)) as create_sms:
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 200)
        decision.assert_called_once()
        self.assertTrue(decision.call_args.kwargs['approved'])
        create_sms.assert_called_once()
        self.assertEqual(res.data['smsSent'], 3)

    def test_approving_twice_is_refused(self):
        meeting = self.pending()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        res = self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 400)

    def test_a_whole_series_is_approved_at_once(self):
        self.pending(repeatWeekdays=[0, 3], repeatWeeks=2)
        total = Meeting.objects.count()
        self.assertGreater(total, 1)
        first = Meeting.objects.order_by('start').first()

        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(1, 0)) as sms:
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[first.pk]))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            Meeting.objects.filter(status=Meeting.Status.CONFIRMED).count(), total)
        # یک پیامک برای کلِ سلسله، نه یکی به‌ازای هر نوبت
        self.assertEqual(sms.call_count, 1)


class RecurrenceTests(GateTestBase):
    def test_one_row_per_occurrence_sharing_a_series(self):
        res = self.create_as(self.member, repeatWeekdays=[0, 2], repeatWeeks=3)
        self.assertEqual(res.status_code, 201)
        rows = list(Meeting.objects.order_by('start'))
        self.assertEqual(len(rows), len(res.data['occurrences']))
        self.assertGreater(len(rows), 1)
        self.assertEqual(len({r.series for r in rows}), 1)
        self.assertIsNotNone(rows[0].series)

    def test_no_occurrence_lands_before_the_chosen_day(self):
        """انتخابِ چهارشنبه با تیکِ شنبه نباید جلسه‌ای در گذشته بسازد."""
        day = timezone.localdate() + timedelta(days=10)
        res = self.create_as(self.member, date=day.isoformat(),
                             repeatWeekdays=[0, 1, 2, 3, 4, 5, 6], repeatWeeks=1)
        self.assertEqual(res.status_code, 201)
        for row in Meeting.objects.all():
            self.assertGreaterEqual(timezone.localtime(row.start).date(), day)

    def test_only_the_nearest_occurrence_sends_an_sms(self):
        with mock.patch('meetings.views.notify_created', return_value=(1, 0)) as sms:
            self.create_as(self.member, repeatWeekdays=[0, 2, 4], repeatWeeks=4)
        self.assertGreater(Meeting.objects.count(), 1)
        sms.assert_called_once()
        sent_for = sms.call_args.args[0]
        self.assertEqual(sent_for.pk, Meeting.objects.order_by('start').first().pk)

    def test_the_sms_mentions_that_it_repeats(self):
        with mock.patch('meetings.sms.send_text') as send:
            send.return_value = mock.Mock(sent=True)
            self.create_as(self.member, repeatWeekdays=[0, 2], repeatWeeks=2)
        body = send.call_args.args[1]
        self.assertIn('تکرار', body)

    def test_a_single_meeting_has_no_series_and_says_nothing_about_repeats(self):
        with mock.patch('meetings.sms.send_text') as send:
            send.return_value = mock.Mock(sent=True)
            self.create_as(self.member)
        self.assertIsNone(Meeting.objects.get().series)
        self.assertNotIn('تکرار', send.call_args.args[1])

    def test_more_than_four_weeks_is_refused(self):
        res = self.create_as(self.member, repeatWeekdays=[0], repeatWeeks=5)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Meeting.objects.count(), 0)

    def test_siblings_do_not_report_each_other_as_conflicts(self):
        """`exclude_meeting_id` مفرد است؛ بی این کنارگذاری، هر نوبت خواهرهایش را هشدار می‌داد."""
        res = self.create_as(self.member, room=str(self.free_room.pk),
                             repeatWeekdays=[0, 2], repeatWeeks=2)
        ours = set(res.data['occurrences'])
        for hit in res.data['conflicts'] + res.data['roomConflicts']:
            self.assertNotIn(hit['meeting'], ours)

    def test_participants_are_attached_to_every_occurrence(self):
        self.create_as(self.member, repeatWeekdays=[0, 2], repeatWeeks=2)
        for row in Meeting.objects.all():
            self.assertEqual(
                row.meeting_participants.filter(is_guest=False).count(), 2, msg=str(row.pk))

    def test_reminders_stay_per_occurrence(self):
        """پیامکِ ایجاد یکی است، ولی یادآورِ هر نوبت سر جای خودش."""
        self.create_as(self.member, repeatWeekdays=[0, 2], repeatWeeks=2, reminderLead=60)
        for row in Meeting.objects.all():
            self.assertEqual(row.reminders.count(), 2, msg=str(row.pk))


class PendingRemindersTests(GateTestBase):
    def test_send_reminders_skips_a_pending_meeting(self):
        """صافیِ این دستور فقط `CANCELLED` را کنار می‌گذاشت و خودش یادآور می‌سازد."""
        from django.core.management import call_command

        soon = timezone.now() + timedelta(minutes=90)
        meeting = Meeting.objects.create(
            title='در انتظار', category=self.category, meeting_type=Meeting.Type.IN_PERSON,
            status=Meeting.Status.PENDING, organizer=self.member,
            location=self.gated_room, start=soon, end=soon + timedelta(hours=1),
        )
        MeetingParticipant.objects.create(meeting=meeting, user=self.other)

        with mock.patch('meetings.sms.send_text') as send:
            send.return_value = mock.Mock(sent=True)
            call_command('send_reminders', verbosity=0)
        send.assert_not_called()
