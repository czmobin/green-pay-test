# Generated manually for venue-scoped approval admins.

from django.conf import settings
from django.db import migrations, models


def assign_existing_admins(apps, schema_editor):
    """محل‌هایی که از قبل `needs_approval` داشتند، همهٔ ادمین‌های فعلی را بگیرند.

    بدون این، بعد از استقرار هیچ‌کس نمی‌توانست جلسه‌های در انتظار را تایید کند
    تا کسی دستی در پنل ادمین انتخاب کند.
    """
    Location = apps.get_model('meetings', 'Location')
    User = apps.get_model('meetings', 'User')
    admins = list(User.objects.filter(role='admin'))
    if not admins:
        return
    for loc in Location.objects.filter(needs_approval=True):
        loc.approvers.add(*admins)


def unassign_approvers(apps, schema_editor):
    Location = apps.get_model('meetings', 'Location')
    for loc in Location.objects.all():
        loc.approvers.clear()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('meetings', '0022_meeting_pending_revert'),
    ]

    operations = [
        migrations.AlterField(
            model_name='location',
            name='needs_approval',
            field=models.BooleanField(
                default=False,
                help_text='برای محل‌هایی مثل دفتر مدیرعامل که رزروشان باید تایید شود.',
                verbose_name='نیاز به تایید ادمین',
            ),
        ),
        migrations.AddField(
            model_name='location',
            name='approvers',
            field=models.ManyToManyField(
                blank=True,
                help_text='فقط ادمین‌هایی که این‌جا انتخاب شوند، رزروِ این محل را '
                          'در صفحه‌ی تایید می‌بینند و می‌توانند تایید یا رد کنند.',
                limit_choices_to={'role': 'admin'},
                related_name='approvable_locations',
                to=settings.AUTH_USER_MODEL,
                verbose_name='ادمین‌های تاییدکننده',
            ),
        ),
        migrations.RunPython(assign_existing_admins, unassign_approvers),
    ]
