from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    MeetingReminder,
    Organization, OrganizationKind, User, Location, Category, Meeting, MeetingParticipant,
    AgendaItem, Minutes, MinuteEntry, Attachment, Notification, GoogleCalendarConnection,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'get_full_name', 'role', 'organization', 'is_external', 'title')
    list_filter = ('role', 'is_external', 'organization')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('گرین‌پی', {'fields': ('role', 'organization', 'title', 'phone', 'color', 'is_external', 'sms_enabled')}),
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
    list_display = ('name', 'organization', 'capacity', 'has_map')
    list_filter = ('organization', 'is_online')
    search_fields = ('name', 'address')
    fieldsets = (
        (None, {'fields': ('name', 'organization', 'capacity', 'is_online')}),
        ('نشانی و نقشه', {
            'fields': ('address', 'lat', 'lng'),
            'description': 'مختصات را از نشان یا گوگل‌مپ کپی کنید؛ با داشتن آن، '
                           'دکمهٔ مسیریابی در صفحهٔ جلسه فعال می‌شود.',
        }),
    )

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
admin.site.register(GoogleCalendarConnection)

admin.site.site_header = 'مدیریت جلسات گرین‌پی'
admin.site.site_title = 'گرین‌پی'
