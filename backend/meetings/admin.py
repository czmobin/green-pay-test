from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Organization, User, Location, Category, Meeting, MeetingParticipant,
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
    list_display = ('title', 'category', 'meeting_type', 'status', 'start', 'organizer', 'google_synced')
    list_filter = ('meeting_type', 'status', 'category')
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


admin.site.register(Organization)
admin.site.register(Location)
admin.site.register(Category)
admin.site.register(Attachment)
admin.site.register(Notification)
admin.site.register(GoogleCalendarConnection)

admin.site.site_header = 'مدیریت جلسات گرین‌پی'
admin.site.site_title = 'گرین‌پی'
