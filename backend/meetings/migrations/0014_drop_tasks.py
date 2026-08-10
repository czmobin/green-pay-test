"""
حذف کامل «تسک» از سامانه.

آیتم‌های صورت‌جلسه از نوع task و اعلان‌های مربوط به آن‌ها پاک می‌شوند و سه
ستونی که فقط برای تسک وجود داشتند (مسئول، مهلت) برداشته می‌شوند. این
مهاجرت برگشت‌پذیر نیست: دادهٔ پاک‌شده بازنمی‌گردد.
"""
from django.db import migrations, models


def drop_task_rows(apps, schema_editor):
    MinuteEntry = apps.get_model('meetings', 'MinuteEntry')
    Notification = apps.get_model('meetings', 'Notification')
    Attachment = apps.get_model('meetings', 'Attachment')

    tasks = MinuteEntry.objects.filter(entry_type='task')
    Attachment.objects.filter(entry__in=tasks).delete()
    Notification.objects.filter(entry__in=tasks).delete()
    Notification.objects.filter(kind='task').delete()
    tasks.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0013_minuteentry_edited_at'),
    ]

    operations = [
        migrations.RunPython(drop_task_rows, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='minuteentry',
            name='assignee',
        ),
        migrations.RemoveField(
            model_name='minuteentry',
            name='due_date',
        ),
        migrations.RemoveField(
            model_name='minuteentry',
            name='due_text',
        ),
        migrations.AlterField(
            model_name='minuteentry',
            name='entry_type',
            field=models.CharField(choices=[('note', 'یادداشت'), ('decision', 'تصمیم'), ('reminder', 'یادآور'), ('call', 'تماس تلفنی'), ('letter', 'نامه'), ('file', 'فایل')], max_length=12, verbose_name='نوع'),
        ),
        migrations.AlterField(
            model_name='notification',
            name='kind',
            field=models.CharField(choices=[('meeting', 'جلسه'), ('invite', 'دعوت\u200cنامه'), ('reminder', 'یادآور')], max_length=10, verbose_name='نوع'),
        ),
    ]
