"""
نوع سازمان از فیلد متنی به مدل مستقل (قابل ویرایش در پنل ادمین) تبدیل می‌شود.
مقادیر قبلی (internal/bank/…) به رکوردهای متناظر نگاشت می‌شوند تا داده‌ای از دست نرود.
"""
from django.db import migrations, models
import django.db.models.deletion
import django.conf


LEGACY_KINDS = [
    ('internal', 'داخلی', 1),
    ('bank', 'بانک', 2),
    ('regulator', 'رگولاتور', 3),
    ('partner', 'شریک', 4),
]


def forwards(apps, schema_editor):
    Kind = apps.get_model('meetings', 'OrganizationKind')
    Organization = apps.get_model('meetings', 'Organization')
    mapping = {}
    for slug, name, order in LEGACY_KINDS:
        obj, _ = Kind.objects.get_or_create(slug=slug, defaults={'name': name, 'order': order})
        mapping[slug] = obj
    for org in Organization.objects.all():
        kind = mapping.get(org.kind)
        if kind:
            org.kind_fk = kind
            org.save(update_fields=['kind_fk'])


def backwards(apps, schema_editor):
    Organization = apps.get_model('meetings', 'Organization')
    for org in Organization.objects.select_related('kind_fk'):
        org.kind = org.kind_fk.slug if org.kind_fk_id else 'partner'
        org.save(update_fields=['kind'])


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0004_meeting_meet_link_meeting_priority'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrganizationKind',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True,
                                           serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=40, unique=True, verbose_name='شناسه')),
                ('name', models.CharField(max_length=60, verbose_name='نام')),
                ('order', models.PositiveSmallIntegerField(default=0, verbose_name='ترتیب')),
            ],
            options={
                'verbose_name': 'نوع سازمان',
                'verbose_name_plural': 'انواع سازمان',
                'ordering': ['order', 'name'],
            },
        ),
        migrations.AddField(
            model_name='organization',
            name='kind_fk',
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='organizations',
                                    to='meetings.organizationkind', verbose_name='نوع'),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(model_name='organization', name='kind'),
        migrations.RenameField(model_name='organization', old_name='kind_fk', new_name='kind'),

        migrations.AddField(
            model_name='agendaitem',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='created_agenda_items',
                                    to=django.conf.settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='minuteentry',
            name='done_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='زمان انجام'),
        ),
    ]
