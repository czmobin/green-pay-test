"""
`GET /api/pulse/` — مهرِ تغییر که فرانت هر چند ثانیه می‌پرسد.

این تست‌ها یک چیز را نگه می‌دارند: **هر تغییری که روی صفحه دیده می‌شود باید
مهر را عوض کند، و هیچ تغییرِ نامرئی نباید عوضش کند.** اگر مهر از یک تغییر
جا بماند، هیچ‌چیز نمی‌شکند — فقط کاربر تا تازه‌سازیِ دستی دادهٔ کهنه می‌بیند،
و این دقیقاً همان باگی است که pulse برای رفعش نوشته شد. پس بی‌صدا خراب
می‌شود و تست لازم دارد.

دو موردِ مهم که آسان از قلم می‌افتند:

* **حذف** — پاک‌شدن یک جلسه هیچ `updated_at`ی را بالا نمی‌برد؛ فقط تعداد را
  پایین می‌آورد. (تستِ `test_deleting_a_meeting_changes_the_stamp`.)
* **تیک‌خوردنِ مصوبه** — روی `done_at` می‌نشیند، نه `created_at`.
  (تستِ `test_toggling_an_entry_changes_the_stamp`.)
"""
from django.urls import reverse
from rest_framework.test import APITestCase

from meetings.models import Meeting, MinuteEntry

from .test_calendar_share import ShareTestBase, make_user


class PulseTests(ShareTestBase):
    def pulse(self, user):
        res = self.as_(user).get(reverse('pulse'))
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_needs_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(reverse('pulse')).status_code, 401)

    def test_shape_covers_the_four_sets_bootstrap_serves(self):
        data = self.pulse(self.owner)
        self.assertEqual(set(data), {'m', 'e', 'r', 's'})
        for key, value in data.items():
            self.assertEqual(len(value), 2, key)

    def test_creating_a_meeting_changes_the_stamp(self):
        before = self.pulse(self.owner)
        res = self.as_(self.owner).post(reverse('meeting-list'), {
            'title': 'جلسهٔ تازه',
            'category': str(self.category.pk),
            'type': Meeting.Type.IN_PERSON,
            'organizer': str(self.owner.pk),
            'date': '2026-10-05',
            'start': 10,
            'end': 11,
            'parts': [str(self.owner.pk)],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)

        after = self.pulse(self.owner)
        self.assertNotEqual(after['m'], before['m'])
        self.assertEqual(after['m'][0], before['m'][0] + 1)

    def test_editing_a_meeting_changes_the_stamp(self):
        before = self.pulse(self.owner)
        res = self.as_(self.owner).patch(
            reverse('meeting-detail', args=[self.meeting.pk]),
            {'title': 'عنوان عوض شد'}, format='json')
        self.assertIn(res.status_code, (200, 202))
        self.assertNotEqual(self.pulse(self.owner)['m'], before['m'])

    def test_deleting_a_meeting_changes_the_stamp(self):
        """حذف هیچ زمانی را بالا نمی‌برد — تعداد تنها نشانه‌اش است."""
        before = self.pulse(self.owner)
        self.meeting.delete()
        after = self.pulse(self.owner)
        self.assertNotEqual(after['m'], before['m'])
        self.assertEqual(after['m'][0], before['m'][0] - 1)

    def test_adding_a_minute_entry_changes_the_stamp(self):
        before = self.pulse(self.owner)
        self.assertEqual(self.post_entry(self.owner).status_code, 201)
        after = self.pulse(self.owner)
        self.assertNotEqual(after['e'], before['e'])
        self.assertEqual(after['m'], before['m'])   # جلسه دست‌نخورده است

    def test_toggling_an_entry_changes_the_stamp(self):
        """تیکِ مصوبه در `done_at` می‌نشیند، نه در `created_at`."""
        self.post_entry(self.owner)
        entry = MinuteEntry.objects.latest('created_at')
        before = self.pulse(self.owner)

        res = self.as_(self.owner).post(reverse('entry-toggle', args=[entry.pk]))
        self.assertEqual(res.status_code, 200)
        self.assertNotEqual(self.pulse(self.owner)['e'], before['e'])

    def test_an_invisible_meeting_does_not_move_the_stamp(self):
        """
        مهرِ هر کاربر از همان گلوگاه دیدِ bootstrap می‌گذرد.

        اگر نمی‌گذشت، `stranger` با هر تغییرِ جلسهٔ دیگران بی‌دلیل کلِ
        bootstrap را می‌گرفت — و بدتر، از حرکتِ مهر می‌فهمید جلسه‌ای که حق
        دیدنش را ندارد همین حالا عوض شد.
        """
        stranger = make_user('outsider')
        before = self.pulse(stranger)

        self.meeting.title = 'عنوانی که او نمی‌بیند'
        self.meeting.save()

        self.assertEqual(self.pulse(stranger)['m'], before['m'])
        self.assertEqual(self.pulse(stranger)['m'][0], 0)

    def test_a_share_makes_the_owners_meetings_count(self):
        """با اشتراک تقویم، تغییرِ جلسهٔ مالک باید مهرِ بیننده را هم تکان بدهد."""
        self.share()
        before = self.pulse(self.viewer)
        self.assertEqual(before['m'][0], 1)

        self.meeting.title = 'حالا دیده می‌شود'
        self.meeting.save()

        self.assertNotEqual(self.pulse(self.viewer)['m'], before['m'])

    def test_an_empty_scope_is_zeroed_not_broken(self):
        """کاربرِ بی‌جلسه هم باید پاسخ بگیرد، نه خطا از `Max` روی مجموعهٔ تهی."""
        data = self.pulse(make_user('newcomer'))
        self.assertEqual(data['m'], [0, 0])
        self.assertEqual(data['e'], [0, 0])


class PulseRemindersTests(APITestCase):
    """یادآور و اشتراک — دو مجموعهٔ دیگر که مهر پوشششان می‌دهد."""

    def setUp(self):
        self.user = make_user('reminder-owner')

    def test_a_reminder_of_my_own_changes_my_stamp(self):
        from datetime import timedelta

        from django.utils import timezone

        from meetings.models import Category, Meeting, MeetingReminder

        category = Category.objects.create(name='داخلی', color='#0a0')
        start = timezone.now() + timedelta(days=2)
        meeting = Meeting.objects.create(
            title='جلسه', category=category, meeting_type=Meeting.Type.IN_PERSON,
            status=Meeting.Status.CONFIRMED, organizer=self.user,
            start=start, end=start + timedelta(hours=1),
        )

        self.client.force_authenticate(user=self.user)
        before = self.client.get(reverse('pulse')).data
        MeetingReminder.objects.create(meeting=meeting, user=self.user, lead_minutes=30)
        self.assertNotEqual(self.client.get(reverse('pulse')).data['r'], before['r'])
