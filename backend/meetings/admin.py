from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    MeetingReminder,
    Organization, OrganizationKind, User, Location, Category, Meeting, MeetingParticipant,
    AgendaItem, Minutes, MinuteEntry, Attachment, Notification, CalendarShare,
    OutlookMailbox, OutlookEvent, OutlookUnmappedAttendee,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'get_full_name', 'role', 'organization', 'is_external',
                    'can_create_meetings', 'title')
    list_filter = ('role', 'is_external', 'organization')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('گرین‌پی', {'fields': ('role', 'organization', 'title', 'phone', 'color', 'is_external', 'sms_enabled', 'can_create_meetings')}),
    )


class MeetingParticipantInline(admin.TabularInline):
    model = MeetingParticipant
    extra = 1


class AgendaItemInline(admin.TabularInline):
    model = AgendaItem
    extra = 1


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'meeting_type', 'priority', 'status', 'start', 'organizer')
    list_filter = ('meeting_type', 'status', 'priority', 'category')
    search_fields = ('title',)
    inlines = [AgendaItemInline, MeetingParticipantInline]
    date_hierarchy = 'start'


class MinuteEntryInline(admin.TabularInline):
    model = MinuteEntry
    extra = 0


@admin.register(Minutes)
class MinutesAdmin(admin.ModelAdmin):
    list_display = ('meeting', 'participant', 'created_by', 'created_at')
    inlines = [MinuteEntryInline]


@admin.register(OrganizationKind)
class OrganizationKindAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'order')
    list_editable = ('slug', 'order')
    ordering = ('order', 'name')


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind')
    list_filter = ('kind',)
    search_fields = ('name',)


@admin.register(MinuteEntry)
class MinuteEntryAdmin(admin.ModelAdmin):
    list_display = ('entry_type', 'text', 'is_done', 'done_at')
    list_filter = ('entry_type', 'is_done')

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'capacity', 'has_map', 'needs_approval')
    list_filter = ('organization', 'is_online', 'needs_approval')
    search_fields = ('name', 'address')
    filter_horizontal = ('approvers',)
    # `needs_approval` باید در `fieldsets` هم باشد، نه فقط در `list_display`:
    # این کلاس fieldsets صریح دارد و هر فیلدی که در آن نباشد در فرمِ ویرایش
    # **رندر نمی‌شود** — یعنی ستونش در فهرست دیده می‌شود ولی تیکش را نمی‌شود زد.
    fieldsets = (
        (None, {'fields': ('name', 'organization', 'capacity', 'is_online')}),
        ('تایید رزرو', {
            'fields': ('needs_approval', 'approvers'),
            'description': 'با روشن‌کردن این گزینه، هر جلسه‌ای که این محل را بگیرد در '
                           'وضعیت «در انتظار» می‌ماند تا یکی از ادمین‌های انتخاب‌شده '
                           'تاییدش کند. فقط همان ادمین‌ها صفحه‌ی «در انتظار تایید» را '
                           'برای این محل می‌بینند. مدیرعامل به این صفحه دسترسی ندارد. '
                           'تا تایید نشود هیچ پیامکی برای شرکت‌کنندگان نمی‌رود و جلسه '
                           'به تقویم Outlook هم فرستاده نمی‌شود.',
        }),
        ('نشانی و نقشه', {
            'fields': ('address', 'lat', 'lng'),
            'description': 'مختصات را از نشان یا گوگل‌مپ کپی کنید؛ با داشتن آن، '
                           'دکمهٔ مسیریابی در صفحهٔ جلسه فعال می‌شود.',
        }),
    )

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        # فقط ادمین‌ها در ویجت انتخاب ظاهر شوند — مدیرعامل و بقیه نه.
        if db_field.name == 'approvers':
            kwargs['queryset'] = User.objects.filter(role=User.Role.ADMIN).order_by(
                'first_name', 'username')
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    @admin.display(boolean=True, description='روی نقشه')
    def has_map(self, obj):
        return obj.has_map

admin.site.register(Category)
admin.site.register(Attachment)
admin.site.register(Notification)


@admin.register(MeetingReminder)
class MeetingReminderAdmin(admin.ModelAdmin):
    list_display = ('meeting', 'user', 'lead_minutes', 'enabled', 'sent_at',
                    'provider_msg_id', 'delivery_code', 'send_error')
    list_filter = ('enabled', 'lead_minutes')
    search_fields = ('meeting__title', 'user__first_name', 'user__last_name', 'user__phone')
    autocomplete_fields = ()


@admin.register(CalendarShare)
class CalendarShareAdmin(admin.ModelAdmin):
    list_display = ('owner', 'viewer', 'can_write_minutes', 'created_at')
    list_filter = ('can_write_minutes',)
    search_fields = ('owner__first_name', 'owner__last_name', 'owner__username',
                     'viewer__first_name', 'viewer__last_name', 'viewer__username')
    autocomplete_fields = ('owner', 'viewer')


@admin.register(OutlookMailbox)
class OutlookMailboxAdmin(admin.ModelAdmin):
    list_display = ('email', 'user', 'is_active', 'synced_at', 'consecutive_failures',
                    'retry_after', 'last_error')
    list_filter = ('is_active',)
    search_fields = ('email', 'user__first_name', 'user__last_name')
    readonly_fields = ('delta_link', 'delta_page_link', 'synced_at')


@admin.register(OutlookEvent)
class OutlookEventAdmin(admin.ModelAdmin):
    list_display = ('mailbox', 'meeting', 'is_authoritative', 'response', 'synced_at')
    list_filter = ('is_authoritative',)
    search_fields = ('ical_uid', 'meeting__title', 'mailbox__email')


@admin.register(OutlookUnmappedAttendee)
class OutlookUnmappedAttendeeAdmin(admin.ModelAdmin):
    """نشانی‌هایی که به کاربری نخوردند — اینجا دیده می‌شوند تا بی‌صدا گم نشوند."""
    list_display = ('email', 'display_name', 'seen_count', 'last_seen')
    search_fields = ('email', 'display_name')


admin.site.site_header = 'مدیریت جلسات گرین‌پی'
admin.site.site_title = 'گرین‌پی'
