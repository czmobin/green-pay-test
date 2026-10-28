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
        # بدون تاییدکنندهٔ تعیین‌شده هیچ‌کس نمی‌تواند تایید کند؛ ادمینِ پایه
        # را برای محلِ آزمون می‌گذاریم تا بقیهٔ تست‌های دروازه سالم بمانند.
        self.gated_room.approvers.add(self.admin)

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
        """ادمینِ تعیین‌شده برای محل، جلسهٔ خودش را بی‌درنگ تاییدشده می‌سازد."""
        self.create_as(self.admin, room=str(self.gated_room.pk),
                       organizer=str(self.admin.pk))
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.CONFIRMED)

    def test_ceo_still_needs_approval_for_gated_room(self):
        """مدیرعامل تاییدکننده نیست — حتی برای دفتر «مدیرعامل»."""
        self.create_as(self.ceo, room=str(self.gated_room.pk),
                       organizer=str(self.ceo.pk))
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.PENDING)

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

    def test_assigned_admin_can_approve(self):
        meeting = self.pending()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(1, 0)) as sms:
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 200)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertEqual(sms.call_count, 1)

    def test_ceo_cannot_approve(self):
        """مدیرعامل نه صفحهٔ تایید دارد نه API تایید."""
        meeting = self.pending()
        res = self.as_(self.ceo).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 403)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    def test_unassigned_admin_cannot_approve(self):
        other_admin = make_user('otherboss', role=User.Role.ADMIN, phone='09120000099')
        meeting = self.pending()
        res = self.as_(other_admin).post(reverse('meeting-approve', args=[meeting.pk]))
        self.assertEqual(res.status_code, 403)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    def test_unassigned_admin_cannot_reject(self):
        other_admin = make_user('otherboss2', role=User.Role.ADMIN, phone='09120000098')
        meeting = self.pending()
        res = self.as_(other_admin).post(
            reverse('meeting-reject', args=[meeting.pk]), {'reason': 'no'}, format='json')
        self.assertEqual(res.status_code, 403)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    def test_ceo_bootstrap_hides_approval_capability(self):
        res = self.as_(self.ceo).get(reverse('bootstrap'))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['canApproveMeetings'])

    def test_assigned_admin_bootstrap_shows_approval_capability(self):
        res = self.as_(self.admin).get(reverse('bootstrap'))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['canApproveMeetings'])
        room = res.data['rooms'][str(self.gated_room.pk)]
        self.assertIn(str(self.admin.pk), room['approverIds'])

    def test_unassigned_admin_bootstrap_hides_approval_when_no_venues(self):
        other_admin = make_user('lonelyboss', role=User.Role.ADMIN, phone='09120000097')
        res = self.as_(other_admin).get(reverse('bootstrap'))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['canApproveMeetings'])

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

    def test_biweekly_skips_every_other_week(self):
        """«یک هفته در میان»: نوبت‌ها دو هفته‌ای جلو می‌روند، نه هفتگی."""
        day = timezone.localdate() + timedelta(days=10)
        # از خودِ روزِ انتخابی فقط همان روزِ هفته را می‌خواهیم تا شمارش ساده باشد.
        weekday = (day.weekday() + 2) % 7
        res = self.create_as(
            self.member, date=day.isoformat(),
            repeatWeekdays=[weekday], repeatWeeks=3, repeatInterval=2)
        self.assertEqual(res.status_code, 201, res.data)
        rows = list(Meeting.objects.order_by('start'))
        self.assertEqual(len(rows), 3)
        dates = [timezone.localtime(r.start).date() for r in rows]
        self.assertEqual(dates[0], day)
        self.assertEqual((dates[1] - dates[0]).days, 14)
        self.assertEqual((dates[2] - dates[1]).days, 14)

    def test_weekly_interval_is_still_seven_days(self):
        """قرینه: فاصلهٔ پیش‌فرض همان هفتهٔ کامل بماند."""
        day = timezone.localdate() + timedelta(days=10)
        weekday = (day.weekday() + 2) % 7
        res = self.create_as(
            self.member, date=day.isoformat(),
            repeatWeekdays=[weekday], repeatWeeks=3, repeatInterval=1)
        self.assertEqual(res.status_code, 201, res.data)
        dates = [timezone.localtime(r.start).date()
                 for r in Meeting.objects.order_by('start')]
        self.assertEqual((dates[1] - dates[0]).days, 7)

    def test_interval_above_two_is_refused(self):
        res = self.create_as(self.member, repeatWeekdays=[0], repeatWeeks=2, repeatInterval=3)
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


class EditRegateTests(GateTestBase):
    """ویرایشی که جلسهٔ تاییدشده را دوباره به انتظار تایید می‌برد.

    دروازهٔ تایید تا امروز فقط سرِ **ساخت** بود. یعنی راهِ دور زدنش یک `PATCH`
    بود: جلسه را در اتاق آزاد بساز، تایید بگیر (یا نگیر، چون لازم نبود)، بعد
    محلش را به دفتر مدیرعامل عوض کن. همین‌طور جابه‌جایی ساعتِ جلسه‌ای که در
    محلِ تاییدی است — تاییدکننده آن ساعت را ندیده بود که تاییدش کرده باشد.

    نکتهٔ ظریفِ این تست‌ها `test_rejecting_an_edit_reverts_instead_of_cancelling`
    است: این جلسه قبلاً تاییدشده بوده و در تقویمِ همه نشسته. رد شدنِ یک ویرایش
    نباید جلسه را از بین ببرد.
    """

    def confirmed(self, room=None, **over):
        """یک جلسهٔ تاییدشده در محلِ آزاد (یا هر محلی که داده شود)."""
        res = self.create_as(self.member, room=str((room or self.free_room).pk), **over)
        self.assertEqual(res.status_code, 201, msg=res.data)
        meeting = Meeting.objects.order_by('start').first()
        # محلِ تاییدی سرِ ساخت در انتظار می‌ماند؛ این تست‌ها از جلسهٔ **تاییدشده**
        # شروع می‌کنند، پس بی‌صدا تاییدش می‌کنیم (مسیرِ `approve` موضوعِ این‌ها
        # نیست و پیامک و Outlook را هم درگیر می‌کرد).
        if meeting.status == Meeting.Status.PENDING:
            Meeting.objects.filter(pk=meeting.pk).update(status=Meeting.Status.CONFIRMED)
            meeting.refresh_from_db()
        return meeting

    def patch(self, user, meeting, **body):
        return self.as_(user).patch(
            reverse('meeting-detail', args=[meeting.pk]), body, format='json')

    def quiet_patch(self, user, meeting, **body):
        """ویرایش با پیامک‌های خفه‌شده — برای تستی که موضوعش پیامک نیست."""
        with mock.patch('meetings.views.notify_changed', return_value=(0, 0)):
            return self.patch(user, meeting, **body)

    # ---------- مورد ۱: محل به محلی که تایید لازم دارد عوض شود ----------

    def test_moving_into_a_gated_room_needs_approval_again(self):
        meeting = self.confirmed()
        res = self.quiet_patch(self.member, meeting, room=str(self.gated_room.pk))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], Meeting.Status.PENDING)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)
        self.assertEqual(meeting.location_id, self.gated_room.pk)

    def test_the_previous_room_and_time_are_kept_for_the_revert(self):
        meeting = self.confirmed()
        was_start, was_end = meeting.start, meeting.end
        self.quiet_patch(self.member, meeting, room=str(self.gated_room.pk))

        meeting.refresh_from_db()
        self.assertEqual(meeting.pending_revert['room'], str(self.free_room.pk))
        self.assertEqual(meeting.pending_revert['start'], was_start.isoformat())
        self.assertEqual(meeting.pending_revert['end'], was_end.isoformat())

    def test_moving_out_of_a_gated_room_does_not_need_approval(self):
        """دروازه مالِ محلِ **تازه** است: رفتن به اتاق آزاد تایید نمی‌خواهد."""
        meeting = self.confirmed(room=self.gated_room)
        self.quiet_patch(self.member, meeting, room=str(self.free_room.pk))

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertIsNone(meeting.pending_revert)

    # ---------- مورد ۲: زمان یا تاریخِ جلسه‌ای در محلِ تاییدی عوض شود ----------

    def test_moving_the_hour_inside_a_gated_room_needs_approval_again(self):
        meeting = self.confirmed(room=self.gated_room)
        res = self.quiet_patch(self.member, meeting, start=14, end=15)

        self.assertEqual(res.data['status'], Meeting.Status.PENDING)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)
        self.assertEqual(timezone.localtime(meeting.start).hour, 14)

    def test_moving_the_day_inside_a_gated_room_needs_approval_again(self):
        meeting = self.confirmed(room=self.gated_room)
        later = (timezone.localdate() + timedelta(days=9)).isoformat()
        self.quiet_patch(self.member, meeting, date=later)

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)
        self.assertEqual(timezone.localdate(meeting.start).isoformat(), later)

    def test_moving_the_hour_inside_a_free_room_stays_confirmed(self):
        meeting = self.confirmed()
        self.quiet_patch(self.member, meeting, start=14, end=15)

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertIsNone(meeting.pending_revert)

    # ---------- چه چیزی دروازه ندارد ----------

    def test_editing_only_the_title_in_a_gated_room_stays_confirmed(self):
        """عنوان رزروِ محل را جابه‌جا نمی‌کند، پس تاییدِ تازه لازم ندارد."""
        meeting = self.confirmed(room=self.gated_room)
        self.quiet_patch(self.member, meeting, title='عنوانِ تازه')

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertEqual(meeting.title, 'عنوانِ تازه')

    def test_editing_participants_in_a_gated_room_stays_confirmed(self):
        meeting = self.confirmed(room=self.gated_room)
        self.quiet_patch(self.member, meeting,
                         parts=[str(self.member.pk), str(self.executive.pk)])

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)

    def test_an_approver_moving_it_does_not_need_approval(self):
        """همان قاعدهٔ مسیرِ ساخت: تاییدکنندهٔ محل جلسهٔ خودش را تایید نمی‌کند."""
        meeting = self.confirmed()
        Meeting.objects.filter(pk=meeting.pk).update(
            status=Meeting.Status.CONFIRMED, location=self.free_room, pending_revert=None)
        meeting.refresh_from_db()
        self.quiet_patch(self.admin, meeting, room=str(self.gated_room.pk))
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)

    def test_ceo_moving_into_gated_room_still_needs_approval(self):
        meeting = self.confirmed()
        self.quiet_patch(self.ceo, meeting, room=str(self.gated_room.pk))
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    def test_an_executive_moving_it_still_needs_approval(self):
        """مدیر اجرایی تاییدکننده نیست — `can_approve_meeting` تنگ‌تر از `is_manager`."""
        meeting = self.confirmed()
        self.quiet_patch(self.executive, meeting, room=str(self.gated_room.pk))

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)

    # ---------- در پنجرهٔ انتظار هیچ خبری بیرون نمی‌رود ----------

    def test_no_change_sms_goes_out_while_it_waits(self):
        """«زمان جلسه عوض شد» پیش از تایید، خبرِ چیزی است که ممکن است پس بخورد."""
        meeting = self.confirmed()
        with mock.patch('meetings.views.notify_changed') as sms:
            res = self.patch(self.member, meeting, room=str(self.gated_room.pk))

        sms.assert_not_called()
        self.assertEqual(res.data['smsSent'], 0)

    def test_the_regated_edit_stays_out_of_outlook(self):
        """بدترین نشتی: دعوت‌نامهٔ Exchange برای تغییری که تایید نشده."""
        meeting = self.confirmed()
        Meeting.objects.filter(pk=meeting.pk).update(outlook_dirty=False)
        with mock.patch('meetings.graph.enabled', return_value=True):
            self.quiet_patch(self.member, meeting, room=str(self.gated_room.pk))

        meeting.refresh_from_db()
        self.assertFalse(meeting.outlook_dirty)

    def test_an_ordinary_edit_still_reaches_outlook(self):
        meeting = self.confirmed()
        Meeting.objects.filter(pk=meeting.pk).update(outlook_dirty=False)
        with mock.patch('meetings.graph.enabled', return_value=True):
            self.quiet_patch(self.member, meeting, start=14, end=15)

        meeting.refresh_from_db()
        self.assertTrue(meeting.outlook_dirty)

    # ---------- تایید کردنِ یک ویرایش ----------

    def regated(self, **body):
        meeting = self.confirmed()
        self.quiet_patch(self.member, meeting, **(body or {'room': str(self.gated_room.pk)}))
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.PENDING)
        return meeting

    def test_approving_an_edit_sends_the_change_sms_not_the_creation_one(self):
        """شرکت‌کننده‌ها این جلسه را می‌شناسند؛ «جلسه ایجاد شد» برایشان غلط است."""
        meeting = self.regated()
        with mock.patch('meetings.views.notify_approval_result', return_value=(1, 0)), \
             mock.patch('meetings.views.notify_created') as created, \
             mock.patch('meetings.views.notify_changed', return_value=(2, 0)) as changed:
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))

        self.assertEqual(res.status_code, 200)
        created.assert_not_called()
        changed.assert_called_once()
        self.assertEqual(changed.call_args.args[2], ['محل'])
        self.assertEqual(res.data['smsSent'], 3)

    def test_the_change_sms_names_the_time_when_the_hour_moved(self):
        meeting = self.regated(room=str(self.gated_room.pk))
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))
        meeting.refresh_from_db()

        self.quiet_patch(self.member, meeting, start=16, end=17)
        meeting.refresh_from_db()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_changed', return_value=(0, 0)) as changed:
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))

        self.assertEqual(changed.call_args.args[2], ['زمان'])

    def test_approving_clears_the_snapshot_and_confirms(self):
        meeting = self.regated()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_changed', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertIsNone(meeting.pending_revert)
        self.assertEqual(meeting.location_id, self.gated_room.pk)

    def test_approving_an_edit_releases_it_to_outlook(self):
        meeting = self.regated()
        with mock.patch('meetings.graph.enabled', return_value=True), \
             mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_changed', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-approve', args=[meeting.pk]))

        meeting.refresh_from_db()
        self.assertTrue(meeting.outlook_dirty)

    # ---------- رد کردنِ یک ویرایش ----------

    def test_rejecting_an_edit_reverts_instead_of_cancelling(self):
        """جلسهٔ تاییدشده بابتِ یک ویرایشِ نپذیرفته از بین نمی‌رود."""
        meeting = self.confirmed()
        was_start, was_end = meeting.start, meeting.end
        self.quiet_patch(self.member, meeting, room=str(self.gated_room.pk), start=18, end=19)

        with mock.patch('meetings.views.notify_approval_result', return_value=(1, 0)):
            res = self.as_(self.admin).post(
                reverse('meeting-reject', args=[meeting.pk]), {'reason': 'نه'}, format='json')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['reverted'])
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertEqual(meeting.location_id, self.free_room.pk)
        self.assertEqual(meeting.start, was_start)
        self.assertEqual(meeting.end, was_end)
        self.assertIsNone(meeting.pending_revert)
        self.assertIsNone(meeting.cancelled_at)

    def test_rejecting_an_edit_keeps_the_ungated_part_of_it(self):
        """عنوان دروازه نداشت، پس رد شدنِ جابه‌جایی آن را هم پس نمی‌گیرد."""
        meeting = self.confirmed()
        self.quiet_patch(self.member, meeting,
                         room=str(self.gated_room.pk), title='عنوانِ تازه')

        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-reject', args=[meeting.pk]))

        meeting.refresh_from_db()
        self.assertEqual(meeting.title, 'عنوانِ تازه')
        self.assertEqual(meeting.location_id, self.free_room.pk)

    def test_rejecting_an_edit_tells_the_creator_it_went_back(self):
        meeting = self.regated()
        with mock.patch('meetings.views.notify_approval_result', return_value=(1, 0)) as decision:
            self.as_(self.admin).post(reverse('meeting-reject', args=[meeting.pk]))

        decision.assert_called_once()
        self.assertFalse(decision.call_args.kwargs['approved'])
        self.assertTrue(decision.call_args.kwargs['reverted'])

    def test_rejecting_an_edit_sends_no_cancellation_sms(self):
        """جلسه لغو نشده؛ شرکت‌کننده نباید خبرِ لغو بگیرد."""
        meeting = self.regated()
        with mock.patch('meetings.views.notify_cancelled') as cancel_sms, \
             mock.patch('meetings.views.notify_changed') as change_sms, \
             mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)):
            self.as_(self.admin).post(reverse('meeting-reject', args=[meeting.pk]))

        cancel_sms.assert_not_called()
        change_sms.assert_not_called()

    def test_rejecting_a_newly_created_pending_still_cancels(self):
        """رفتارِ قبلی دست‌نخورده: جلسهٔ تازه‌ای که رد شود، لغو می‌شود."""
        self.create_as(self.member, room=str(self.gated_room.pk))
        meeting = Meeting.objects.get()
        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)):
            res = self.as_(self.admin).post(reverse('meeting-reject', args=[meeting.pk]))

        self.assertFalse(res.data.get('reverted', False))
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CANCELLED)

    def test_a_broken_snapshot_does_not_move_the_meeting_to_nowhere(self):
        """اگر عکس خوانده نشود، انتظار تمام می‌شود ولی زمان دست نمی‌خورد."""
        meeting = self.regated()
        Meeting.objects.filter(pk=meeting.pk).update(pending_revert={'room': None})
        meeting.refresh_from_db()
        was_start = meeting.start

        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)):
            res = self.as_(self.admin).post(reverse('meeting-reject', args=[meeting.pk]))

        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['reverted'])
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)
        self.assertEqual(meeting.start, was_start)
        self.assertIsNone(meeting.pending_revert)

    # ---------- سلسلهٔ تکرار ----------

    def test_a_regated_occurrence_is_approved_on_its_own(self):
        """ویرایش روی یک نوبت بود؛ تاییدش نباید خواهرهایش را هم تایید کند."""
        self.create_as(self.member, room=str(self.free_room.pk),
                       repeatWeekdays=[0, 3], repeatWeeks=2)
        rows = list(Meeting.objects.order_by('start'))
        self.assertGreater(len(rows), 1)
        target = rows[0]
        self.quiet_patch(self.member, target, room=str(self.gated_room.pk))
        target.refresh_from_db()
        self.assertEqual(target.status, Meeting.Status.PENDING)

        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_changed', return_value=(0, 0)):
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[target.pk]))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['occurrences'], [str(target.pk)])
        # خواهرها دست‌نخورده و در محلِ آزادِ خودشان
        for row in rows[1:]:
            row.refresh_from_db()
            self.assertEqual(row.location_id, self.free_room.pk)

    def test_approving_a_fresh_series_skips_occurrences_waiting_on_an_edit(self):
        """نوبتی که ویرایشش در انتظار است، در تاییدِ یک‌جای سلسله نمی‌افتد."""
        self.create_as(self.member, room=str(self.gated_room.pk),
                       repeatWeekdays=[0, 3], repeatWeeks=2)
        rows = list(Meeting.objects.order_by('start'))
        self.assertGreater(len(rows), 2)
        # نوبتِ دوم را تاییدشده و بعد ویرایش‌شده می‌کنیم
        edited = rows[1]
        Meeting.objects.filter(pk=edited.pk).update(status=Meeting.Status.CONFIRMED)
        edited.refresh_from_db()
        self.quiet_patch(self.member, edited, start=20, end=21)
        edited.refresh_from_db()
        self.assertIsNotNone(edited.pending_revert)

        with mock.patch('meetings.views.notify_approval_result', return_value=(0, 0)), \
             mock.patch('meetings.views.notify_created', return_value=(0, 0)):
            res = self.as_(self.admin).post(reverse('meeting-approve', args=[rows[0].pk]))

        self.assertEqual(res.status_code, 200)
        self.assertNotIn(str(edited.pk), res.data['occurrences'])
        edited.refresh_from_db()
        self.assertEqual(edited.status, Meeting.Status.PENDING)
        self.assertIsNotNone(edited.pending_revert)

    # ---------- لغو، و آنچه رابط می‌بیند ----------

    def test_cancelling_clears_a_waiting_edit(self):
        """وگرنه جلسهٔ لغوشده در فهرستِ «در انتظار تایید» می‌ماند."""
        meeting = self.regated()
        with mock.patch('meetings.views.notify_cancelled', return_value=(0, 0)):
            res = self.as_(self.admin).post(
                reverse('meeting-cancel', args=[meeting.pk]), {'reason': 'لازم نشد'},
                format='json')

        self.assertEqual(res.status_code, 200)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CANCELLED)
        self.assertIsNone(meeting.pending_revert)

    def test_the_api_says_which_pending_meetings_are_edits(self):
        """صفحهٔ تایید باید «درخواست تغییر» را از «جلسهٔ تازه» تشخیص بدهد."""
        meeting = self.regated()
        res = self.as_(self.admin).get(reverse('meeting-detail', args=[meeting.pk]))
        self.assertEqual(res.status_code, 200)
        was = res.data['pendingEdit']
        self.assertIsNotNone(was)
        self.assertEqual(was['room'], str(self.free_room.pk))
        self.assertEqual(was['start'], 10.0)
        self.assertEqual(was['end'], 11.0)

    def test_a_freshly_created_pending_meeting_has_no_pending_edit(self):
        self.create_as(self.member, room=str(self.gated_room.pk))
        meeting = Meeting.objects.get()
        res = self.as_(self.admin).get(reverse('meeting-detail', args=[meeting.pk]))
        self.assertIsNone(res.data['pendingEdit'])
