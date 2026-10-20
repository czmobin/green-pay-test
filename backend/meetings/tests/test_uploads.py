"""سقف ۱۰ مگابایتی پیوستِ جلسه / صورت‌جلسه / دستورجلسه."""
from datetime import timedelta
from io import BytesIO
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from meetings.models import AgendaItem, Attachment, Category, Meeting, MeetingParticipant, User
from meetings.uploads import MAX_UPLOAD_BYTES, assert_upload_size


def make_user(username, **kw):
    return User.objects.create_user(
        username=username, password='x', role=User.Role.MEMBER, first_name=username, **kw)


class UploadLimitTests(APITestCase):
    def setUp(self):
        self.user = make_user('uploader', phone='09121111111')
        self.category = Category.objects.create(name='داخلی', color='#0a0')
        begins = timezone.now() + timedelta(days=1)
        self.meeting = Meeting.objects.create(
            title='با پیوست', category=self.category, meeting_type=Meeting.Type.IN_PERSON,
            status=Meeting.Status.CONFIRMED, organizer=self.user,
            start=begins, end=begins + timedelta(hours=1),
        )
        MeetingParticipant.objects.create(meeting=self.meeting, user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_helper_rejects_over_ten_mb(self):
        big = mock.Mock(size=MAX_UPLOAD_BYTES + 1)
        with self.assertRaises(Exception) as ctx:
            assert_upload_size(big)
        self.assertIn('۱۰', str(ctx.exception.detail['file']))

    def test_meeting_attach_accepts_small_file(self):
        upload = SimpleUploadedFile('note.pdf', b'%PDF-1.4 tiny', content_type='application/pdf')
        res = self.client.post(reverse('meeting-attach', args=[self.meeting.pk]),
                               {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['fileName'], 'note.pdf')
        self.assertEqual(Attachment.objects.filter(meeting=self.meeting).count(), 1)

    def test_meeting_attach_rejects_oversize(self):
        upload = SimpleUploadedFile(
            'huge.bin', b'x' * (MAX_UPLOAD_BYTES + 1), content_type='application/octet-stream')
        res = self.client.post(reverse('meeting-attach', args=[self.meeting.pk]),
                               {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Attachment.objects.count(), 0)

    def test_agenda_create_with_file(self):
        upload = SimpleUploadedFile('agenda.docx', b'PK\x03\x04', content_type='application/octet-stream')
        res = self.client.post(reverse('agenda-list'), {
            'meeting': str(self.meeting.pk), 'title': 'بند ۱', 'dur': 15, 'file': upload,
        }, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['fileName'], 'agenda.docx')
        item = AgendaItem.objects.get()
        self.assertEqual(item.attachments.count(), 1)

    def test_minute_entry_with_file(self):
        upload = SimpleUploadedFile('letter.pdf', b'%PDF', content_type='application/pdf')
        res = self.client.post(reverse('entry-list'), {
            'meeting': str(self.meeting.pk), 'type': 'file', 'text': '',
            'file': upload, 'fileName': 'letter.pdf',
        }, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['fileName'], 'letter.pdf')
