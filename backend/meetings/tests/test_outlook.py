"""
همگام‌سازی Outlook — با کلاینت جعلی، بدون tenant واقعی.

تست‌ها روی همان چیزهایی تمرکز دارند که اگر غلط باشند بی‌صدا خرابی می‌سازند:
اکو، جلسهٔ تکراری، سری تکرارشونده، تعارض، و مهم‌تر از همه — رفتار سامانه در
وضعیت *امروزِ* مخزن، که هیچ کاربری ایمیل ندارد.
"""
from datetime import timedelta, timezone as dt_timezone

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from meetings import graph as graph_mod
from meetings import outlook_map as omap
from meetings import outlook_sync
from meetings.models import (
    Category, Meeting, MeetingParticipant, OutlookEvent, OutlookMailbox,
    OutlookUnmappedAttendee, User,
)

OUTLOOK_ON = dict(
    OUTLOOK_ENABLED=True, OUTLOOK_TENANT_ID='t', OUTLOOK_CLIENT_ID='c',
    OUTLOOK_CLIENT_SECRET='s', OUTLOOK_MAIL_DOMAIN='greenpay360.ir',
    OUTLOOK_MAILBOX_ALLOWLIST=[],
)


class FakeGraph:
    """
    جای `GraphClient` — همان امضا، بدون شبکه.

    `pages` نگاشتِ «ایمیل صندوق → فهرست صفحه‌ها»ست تا صفحه‌بندی هم تست شود.
    `writes` هر نوشتن را ثبت می‌کند؛ تست «اکو صفر نوشتن» دقیقاً همین را می‌سنجد.
    """

    def __init__(self, pages=None):
        self.pages = pages or {}
        self.writes = []
        self._n = 0

    def calendar_view_delta(self, mailbox, start_iso, end_iso, link=''):
        queue = self.pages.get(mailbox, [])
        idx = int(link.split('page=')[1]) if link.startswith('page=') else 0
        if idx >= len(queue):
            return {'value': [], '@odata.deltaLink': 'delta=final'}
        page = queue[idx]
        out = {'value': page}
        if idx + 1 < len(queue):
            out['@odata.nextLink'] = f'page={idx + 1}'
        else:
            out['@odata.deltaLink'] = 'delta=final'
        return out

    def _write(self, kind, mailbox, payload):
        self._n += 1
        self.writes.append((kind, mailbox, payload))
        return {'id': f'remote-{self._n}', 'changeKey': f'ck-{self._n}',
                'iCalUId': f'ical-{self._n}'}

    def create_event(self, mailbox, payload):
        return self._write('create', mailbox, payload)

    def update_event(self, mailbox, event_id, payload):
        out = self._write('update', mailbox, payload)
        out['id'] = event_id            # گراف در PATCH همان شناسه را برمی‌گرداند
        return out

    def cancel_event(self, mailbox, event_id):
        return self._write('cancel', mailbox, {})


def event(uid='ical-1', subject='جلسهٔ Outlook', organizer='ali@greenpay360.ir',
          attendees=(), start=None, end=None, remote_id='r1', change_key='ck-1',
          is_organizer=True, **extra):
    start = start or (timezone.now() + timedelta(days=1)).replace(microsecond=0)
    end = end or (start + timedelta(hours=1))
    fmt = '%Y-%m-%dT%H:%M:%S.0000000'
    row = {
        'id': remote_id,
        'changeKey': change_key,
        'iCalUId': uid,
        'subject': subject,
        'isOrganizer': is_organizer,
        'isCancelled': False,
        'isAllDay': False,
        'type': 'singleInstance',
        'start': {'dateTime': start.astimezone(dt_timezone.utc).strftime(fmt), 'timeZone': 'UTC'},
        'end': {'dateTime': end.astimezone(dt_timezone.utc).strftime(fmt), 'timeZone': 'UTC'},
        'organizer': {'emailAddress': {'address': organizer, 'name': ''}},
        'attendees': [
            {'emailAddress': {'address': a, 'name': ''}, 'status': {'response': 'accepted'}}
            for a in attendees
        ],
    }
    row.update(extra)
    return row


class OutlookTestBase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name='داخلی')
        self.ali = User.objects.create_user('ali', password='x', first_name='علی',
                                            email='ali@greenpay360.ir')
        self.sara = User.objects.create_user('sara', password='x', first_name='سارا',
                                             email='sara@greenpay360.ir')
        self.box_ali = OutlookMailbox.objects.create(user=self.ali, email='ali@greenpay360.ir')
        self.box_sara = OutlookMailbox.objects.create(user=self.sara, email='sara@greenpay360.ir')
        self.stats = outlook_sync.SyncStats()

    def pull(self, pages):
        client = FakeGraph(pages)
        for box in outlook_sync.active_mailboxes():
            if box.email in pages:
                outlook_sync.pull_mailbox(client, box, self.stats)
        return client


@override_settings(**OUTLOOK_ON)
class MappingTests(TestCase):
    def test_seven_digit_fraction_parses(self):
        """گراف کسر ثانیه را ۷ رقمی می‌دهد و fromisoformat پایتون ۳٫۱۰ می‌شکند."""
        dt = omap.parse_graph_dt({'dateTime': '2026-03-01T08:30:00.0000000', 'timeZone': 'UTC'})
        self.assertIsNotNone(dt)
        self.assertEqual((dt.hour, dt.minute), (8, 30))

    def test_occurrence_uid_is_distinct_per_instance(self):
        """بدون originalStart، قید یکتا کل یک سری را در یک جلسه جمع می‌کند."""
        a = omap.outlook_uid({'iCalUId': 'S', 'type': 'occurrence',
                              'originalStart': '2026-03-01T08:00:00Z'})
        b = omap.outlook_uid({'iCalUId': 'S', 'type': 'occurrence',
                              'originalStart': '2026-03-02T08:00:00Z'})
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith('S|'))

    def test_plain_event_uid_is_the_ical_uid(self):
        self.assertEqual(omap.outlook_uid({'iCalUId': 'S'}), 'S')

    def test_payload_never_asks_teams_for_a_link(self):
        """isOnlineMeeting لینک Teams می‌سازد و با meet_link کاربر می‌جنگد."""
        m = Meeting(title='ت', start=timezone.now(), end=timezone.now() + timedelta(hours=1),
                    meet_link='https://skyroom.example/x')
        payload = omap.event_payload(m, [], [])
        self.assertNotIn('isOnlineMeeting', payload)
        self.assertIn('skyroom.example', payload['body']['content'])


@override_settings(**OUTLOOK_ON)
class PullTests(OutlookTestBase):
    def test_event_becomes_a_meeting(self):
        self.pull({'ali@greenpay360.ir': [[event(attendees=['sara@greenpay360.ir'])]]})
        meeting = Meeting.objects.get()
        self.assertEqual(meeting.title, 'جلسهٔ Outlook')
        self.assertEqual(meeting.organizer, self.ali)
        self.assertTrue(meeting.outlook_synced)
        self.assertFalse(meeting.outlook_dirty)      # ورودی هرگز dirty نمی‌کند
        self.assertEqual(self.stats.created, 1)

    def test_one_event_in_two_mailboxes_makes_one_meeting(self):
        """Exchange دعوت را پخش می‌کند؛ نسخهٔ غیرمرجع نباید جلسهٔ دوم بسازد."""
        mirror = event(remote_id='r2', change_key='ck-2', is_organizer=False,
                       attendees=['sara@greenpay360.ir'])
        self.pull({
            'ali@greenpay360.ir': [[event(attendees=['sara@greenpay360.ir'])]],
            'sara@greenpay360.ir': [[mirror]],
        })
        self.assertEqual(Meeting.objects.count(), 1)
        self.assertEqual(OutlookEvent.objects.filter(is_authoritative=True).count(), 1)

    def test_echo_is_skipped(self):
        pages = {'ali@greenpay360.ir': [[event()]]}
        self.pull(pages)
        before = Meeting.objects.get().updated_at
        stats2 = outlook_sync.SyncStats()
        client = FakeGraph(pages)
        outlook_sync.pull_mailbox(client, self.box_ali, stats2)
        self.assertEqual(stats2.echoes, 1)
        self.assertEqual(stats2.updated, 0)
        self.assertEqual(Meeting.objects.get().updated_at, before)

    def test_series_becomes_distinct_readonly_meetings(self):
        day = (timezone.now() + timedelta(days=1)).replace(microsecond=0)
        rows = [
            event(uid='S', remote_id=f'r{i}', change_key=f'ck-{i}', type='occurrence',
                  originalStart=f'2026-03-0{i + 1}T08:00:00Z',
                  start=day + timedelta(days=i), end=day + timedelta(days=i, hours=1))
            for i in range(3)
        ]
        self.pull({'ali@greenpay360.ir': [rows]})
        self.assertEqual(Meeting.objects.count(), 3)
        self.assertEqual(len({m.outlook_uid for m in Meeting.objects.all()}), 3)

    def test_series_master_is_ignored(self):
        self.pull({'ali@greenpay360.ir': [[event(type='seriesMaster')]]})
        self.assertEqual(Meeting.objects.count(), 0)

    def test_all_day_event_is_not_imported(self):
        """بلوک ۲۴ساعته هشدار تداخل را بی‌اعتبار می‌کند."""
        self.pull({'ali@greenpay360.ir': [[event(isAllDay=True)]]})
        self.assertEqual(Meeting.objects.count(), 0)

    @override_settings(OUTLOOK_MAX_OCCURRENCES=2, **OUTLOOK_ON)
    def test_occurrence_cap_holds(self):
        day = (timezone.now() + timedelta(days=1)).replace(microsecond=0)
        rows = [
            event(uid='S', remote_id=f'r{i}', change_key=f'ck-{i}', type='occurrence',
                  originalStart=f'2026-04-{i + 1:02d}T08:00:00Z',
                  start=day + timedelta(days=i), end=day + timedelta(days=i, hours=1))
            for i in range(5)
        ]
        self.pull({'ali@greenpay360.ir': [rows]})
        self.assertEqual(Meeting.objects.count(), 2)

    def test_cancellation_wins(self):
        self.pull({'ali@greenpay360.ir': [[event()]]})
        stats2 = outlook_sync.SyncStats()
        outlook_sync.pull_mailbox(
            FakeGraph({'ali@greenpay360.ir': [[event(change_key='ck-9', isCancelled=True)]]}),
            self.box_ali, stats2)
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.CANCELLED)

    def test_removed_marker_cancels_but_never_deletes(self):
        """صورت‌جلسه و دستور جلسه cascade دارند؛ حذف خام تاریخچه را می‌برد."""
        self.pull({'ali@greenpay360.ir': [[event()]]})
        stats2 = outlook_sync.SyncStats()
        outlook_sync.pull_mailbox(
            FakeGraph({'ali@greenpay360.ir': [[{'id': 'r1', '@removed': {'reason': 'deleted'}}]]}),
            self.box_ali, stats2)
        self.assertEqual(Meeting.objects.count(), 1)
        self.assertEqual(Meeting.objects.get().status, Meeting.Status.CANCELLED)

    def test_pagination_is_followed(self):
        day = (timezone.now() + timedelta(days=1)).replace(microsecond=0)
        pages = [[event(uid='a', remote_id='r1', change_key='k1')],
                 [event(uid='b', remote_id='r2', change_key='k2',
                        start=day + timedelta(days=1), end=day + timedelta(days=1, hours=1))]]
        self.pull({'ali@greenpay360.ir': pages})
        self.assertEqual(Meeting.objects.count(), 2)
        self.box_ali.refresh_from_db()
        self.assertEqual(self.box_ali.delta_page_link, '')     # تمام شد، نه نیمه‌کاره
        self.assertTrue(self.box_ali.delta_link)

    def test_external_organizer_imports_readonly_via_deputy(self):
        ext = event(organizer='outside@other.com', is_organizer=False,
                    attendees=['sara@greenpay360.ir', 'ali@greenpay360.ir'])
        self.pull({'ali@greenpay360.ir': [[ext]],
                   'sara@greenpay360.ir': [[dict(ext, id='r2', changeKey='ck-2')]]})
        self.assertEqual(Meeting.objects.count(), 1)
        meeting = Meeting.objects.get()
        self.assertTrue(meeting.outlook_readonly)
        # نایب = کمترین user_id میان شرکت‌کنندگان همگام → علی
        self.assertEqual(meeting.organizer, self.ali)

    def test_deputy_is_order_independent(self):
        ext = event(organizer='outside@other.com', is_organizer=False,
                    attendees=['sara@greenpay360.ir', 'ali@greenpay360.ir'])
        # ترتیب برعکس: سارا اول خوانده می‌شود
        client = FakeGraph({'sara@greenpay360.ir': [[dict(ext, id='r2', changeKey='ck-2')]],
                            'ali@greenpay360.ir': [[ext]]})
        outlook_sync.pull_mailbox(client, self.box_sara, self.stats)
        outlook_sync.pull_mailbox(client, self.box_ali, self.stats)
        self.assertEqual(Meeting.objects.count(), 1)
        self.assertEqual(Meeting.objects.get().organizer, self.ali)

    def test_unknown_internal_address_is_recorded_not_created(self):
        self.pull({'ali@greenpay360.ir': [[event(attendees=['ghost@greenpay360.ir'])]]})
        self.assertEqual(User.objects.filter(username='ghost@greenpay360.ir').count(), 0)
        self.assertEqual(OutlookUnmappedAttendee.objects.count(), 1)

    def test_external_address_becomes_a_guest(self):
        self.pull({'ali@greenpay360.ir': [[event(attendees=['vendor@other.com'])]]})
        guest = User.objects.get(email='vendor@other.com')
        self.assertTrue(guest.is_external)
        self.assertTrue(MeetingParticipant.objects.filter(user=guest, is_guest=True).exists())

    def test_location_text_is_kept_but_no_location_is_invented(self):
        from meetings.models import Location
        before = Location.objects.count()
        self.pull({'ali@greenpay360.ir': [[
            event(location={'displayName': 'کافه پایین ساختمان'})]]})
        self.assertEqual(Location.objects.count(), before)
        self.assertEqual(Meeting.objects.get().location_text, 'کافه پایین ساختمان')


@override_settings(**OUTLOOK_ON)
class ConflictTests(OutlookTestBase):
    def test_outlook_wins_scheduling_and_app_keeps_its_own(self):
        self.pull({'ali@greenpay360.ir': [[event()]]})
        meeting = Meeting.objects.get()
        meeting.priority = Meeting.Priority.CRITICAL
        meeting.title = 'عنوان محلی'
        meeting.outlook_dirty = True
        meeting.save()

        stats2 = outlook_sync.SyncStats()
        outlook_sync.pull_mailbox(
            FakeGraph({'ali@greenpay360.ir': [[event(change_key='ck-9', subject='عنوان Outlook')]]}),
            self.box_ali, stats2)

        meeting.refresh_from_db()
        self.assertEqual(meeting.title, 'عنوان Outlook')            # Outlook برد
        self.assertEqual(meeting.priority, Meeting.Priority.CRITICAL)   # مالِ ما ماند
        self.assertFalse(meeting.outlook_dirty)                     # بدون ارسال پاک شد
        self.assertIsNotNone(meeting.outlook_conflict_at)
        self.assertEqual(stats2.conflicts, 1)


@override_settings(**OUTLOOK_ON)
class PushTests(OutlookTestBase):
    def _meeting(self, organizer=None):
        start = timezone.now() + timedelta(days=2)
        m = Meeting.objects.create(
            title='جلسهٔ محلی', category=self.category, organizer=organizer or self.ali,
            start=start, end=start + timedelta(hours=1))
        MeetingParticipant.objects.create(meeting=m, user=m.organizer)
        MeetingParticipant.objects.create(meeting=m, user=self.sara)
        return m

    def test_push_creates_then_updates(self):
        m = self._meeting()
        m.outlook_dirty = True
        m.save()
        client = FakeGraph()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes[0][0], 'create')
        m.refresh_from_db()
        self.assertFalse(m.outlook_dirty)
        self.assertTrue(m.outlook_synced)

        m.outlook_dirty = True
        m.save()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes[1][0], 'update')
        # ویرایش باید همان ردیف را به‌روز کند، نه نسخهٔ مرجع دومی بسازد
        self.assertEqual(OutlookEvent.objects.filter(meeting=m).count(), 1)

    def test_push_goes_from_the_organizer_mailbox_only(self):
        """دعوتی که از فرستندهٔ اشتباه بیاید، بعداً قابل لغو هم نیست."""
        m = self._meeting()
        m.outlook_dirty = True
        m.save()
        client = FakeGraph()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes[0][1], 'ali@greenpay360.ir')

    def test_organizer_without_mailbox_is_blocked_not_rerouted(self):
        nobody = User.objects.create_user('nobody', password='x', first_name='بی‌ایمیل')
        m = self._meeting(organizer=nobody)
        m.outlook_dirty = True
        m.save()
        client = FakeGraph()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes, [])
        self.assertEqual(self.stats.blocked, 1)

    def test_readonly_meeting_is_never_pushed(self):
        m = self._meeting()
        m.outlook_readonly = True
        m.outlook_dirty = True
        m.save()
        client = FakeGraph()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes, [])
        m.refresh_from_db()
        self.assertFalse(m.outlook_dirty)

    def test_cancel_uses_cancel_not_delete(self):
        """DELETE رویداد را بی‌صدا برمی‌دارد؛ کسی خبردار نمی‌شود."""
        m = self._meeting()
        m.outlook_dirty = True
        m.save()
        client = FakeGraph()
        outlook_sync.push_meeting(client, m, self.stats)
        m.status = Meeting.Status.CANCELLED
        m.outlook_dirty = True
        m.save()
        outlook_sync.push_meeting(client, m, self.stats)
        self.assertEqual(client.writes[-1][0], 'cancel')


class DisabledTests(APITestCase):
    """
    وضعیت *امروزِ* مخزن: کلیدی تنظیم نشده و هیچ کاربری ایمیل ندارد.

    این باید امن‌ترین حالت باشد — نه استثنا، نه نوشتن، نه صف.
    """

    def setUp(self):
        self.user = User.objects.create_user('u', password='x', first_name='کاربر',
                                             role=User.Role.ADMIN)
        self.category = Category.objects.create(name='داخلی')

    def test_graph_is_disabled_without_keys(self):
        self.assertFalse(graph_mod.enabled())

    def test_run_is_a_clean_no_op(self):
        stats = outlook_sync.run()
        self.assertEqual(stats.errors, ['outlook-disabled'])
        self.assertEqual(stats.pushed, 0)
        self.assertEqual(stats.pulled, 0)

    def test_mark_dirty_does_nothing_while_disabled(self):
        """
        مهم‌ترین بند: وگرنه روزی که کلید روشن شود، انبوه جلسه‌های انباشته
        یک‌جا شلیک می‌شود و برای همه دعوت‌نامهٔ ماه‌ها پیش می‌رود.
        """
        start = timezone.now() + timedelta(days=1)
        m = Meeting.objects.create(title='ت', category=self.category, organizer=self.user,
                                   start=start, end=start + timedelta(hours=1))
        m.mark_dirty()
        m.refresh_from_db()
        self.assertFalse(m.outlook_dirty)
        self.assertIsNotNone(m.local_changed_at)     # ردیابی محلی همچنان کار می‌کند

    def test_creating_a_meeting_through_the_api_queues_nothing(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.post(reverse('meeting-list'), {
            'title': 'جلسهٔ تازه', 'category': str(self.category.pk), 'type': 'in_person',
            'date': (timezone.localtime() + timedelta(days=1)).date().isoformat(),
            'start': 10, 'end': 11, 'organizer': str(self.user.pk), 'parts': [str(self.user.pk)],
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Meeting.objects.filter(outlook_dirty=True).count(), 0)

    def test_command_exits_cleanly(self):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        call_command('outlook_sync', stdout=out)
        self.assertIn('خاموش', out.getvalue())
