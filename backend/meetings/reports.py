"""
گزارش کامل — تحلیل تصمیم‌یار برای ادمین و مدیرعامل.

هدف این گزارش «شمردن جلسه» نیست؛ پیدا کردن جاهایی است که فرایند می‌لنگد:
جلسه‌ای که صورت‌جلسه ندارد، جلسه‌ای که هیچ اقدامی از دلش بیرون نیامده،
تسکی که از مهلتش گذشته، و کسانی که جلسه می‌گیرند ولی چیزی ثبت نمی‌کنند.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import Meeting, MinuteEntry
from .serializers import to_float_hour, to_iso_date

# آیتم‌هایی که «اقدام» به حساب می‌آیند — جلسه‌ای که هیچ‌کدام را ندارد، خروجی عملی نداشته
ACTION_TYPES = {MinuteEntry.Type.TASK, MinuteEntry.Type.REMINDER, MinuteEntry.Type.CALL}

MIN_MEETINGS_FOR_RATE = 3   # زیر این تعداد، درصدها گمراه‌کننده‌اند


def _pct(part: int, whole: int) -> int:
    return round(part * 100 / whole) if whole else 0


_FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def fa(n) -> str:
    """ارقام لاتین → فارسی؛ متن هشدارها در سرور ساخته می‌شود پس همین‌جا فارسی می‌شود."""
    return str(n).translate(_FA_DIGITS)


def _person(user):
    return {
        'id': str(user.pk),
        'name': user.get_full_name() or user.username,
        'role': user.title or '',
        'color': user.color or '',
    }


@api_view(['GET'])
def full_report(request):
    from .views import is_manager   # واردکردن تنبل برای پرهیز از حلقهٔ import

    if not is_manager(request.user):
        raise PermissionDenied('گزارش کامل فقط برای مدیرعامل و ادمین در دسترس است.')

    try:
        days = int(request.query_params.get('days') or 90)
    except ValueError:
        days = 90
    days = max(7, min(days, 365))

    now = timezone.localtime()
    today = now.date()
    since = now - timedelta(days=days)

    meetings = (Meeting.objects
                .filter(start__gte=since)
                .exclude(status=Meeting.Status.CANCELLED)
                .select_related('category', 'organizer', 'location')
                .prefetch_related('meeting_participants__user',
                                  'minutes_set__entries__assignee')
                .order_by('start'))

    # ---------- انباره‌های تجمیع ----------
    totals = dict(meetings=0, past=0, hours=0.0, action_hours=0.0,
                  with_minutes=0, with_action=0,
                  tasks=0, tasks_done=0, tasks_overdue=0,
                  reminders=0, reminders_stale=0)

    people = {}                       # id -> سطر تحلیل هر فرد
    cats = {}                         # id -> سطر تحلیل هر دسته
    dead_meetings = []                # گذشته و بدون هیچ آیتم صورت‌جلسه
    no_action_meetings = []           # صورت‌جلسه دارد ولی هیچ تسک/یادآور/تماس
    overdue = []                      # تسک‌های گذشته از مهلت
    stale_reminders = []              # یادآورهایی که زمانشان گذشته و انجام نشده‌اند
    unanswered = []                   # دعوت‌های بی‌پاسخِ جلساتی که شروع شده‌اند

    def person_row(user):
        pid = str(user.pk)
        if pid not in people:
            people[pid] = {**_person(user), 'meetings': 0, 'hours': 0.0,
                           'organized': 0, 'organizedPast': 0, 'organizedWithMinutes': 0,
                           'tasksOpen': 0, 'tasksOverdue': 0, 'tasksDone': 0,
                           'pendingInvites': 0, 'entriesWritten': 0}
        return people[pid]

    for m in meetings:
        entries = [e for ms in m.minutes_set.all() for e in ms.entries.all()]
        actions = [e for e in entries if e.entry_type in ACTION_TYPES]
        hours = max((m.end - m.start).total_seconds() / 3600, 0)
        is_past = m.end < now
        attendees = [mp for mp in m.meeting_participants.all() if not mp.is_guest]

        totals['meetings'] += 1
        totals['hours'] += hours
        if is_past:
            totals['past'] += 1
            if entries:
                totals['with_minutes'] += 1
            if actions:
                totals['with_action'] += 1
                totals['action_hours'] += hours

        # ---- دسته‌بندی ----
        cid = str(m.category_id) if m.category_id else 'none'
        cat = cats.setdefault(cid, {
            'id': cid,
            'name': m.category.name if m.category_id else 'بدون دسته',
            'color': m.category.color if m.category_id else '#94a3b8',
            'meetings': 0, 'past': 0, 'hours': 0.0, 'withAction': 0, 'tasks': 0,
        })
        cat['meetings'] += 1
        cat['hours'] += hours
        if is_past:
            cat['past'] += 1
            if actions:
                cat['withAction'] += 1

        # ---- سازنده ----
        org_row = person_row(m.organizer)
        org_row['organized'] += 1
        if is_past:
            org_row['organizedPast'] += 1
            if entries:
                org_row['organizedWithMinutes'] += 1

        # ---- شرکت‌کنندگان ----
        for mp in attendees:
            row = person_row(mp.user)
            row['meetings'] += 1
            row['hours'] += hours
            if is_past and mp.response == mp.Response.PENDING:
                row['pendingInvites'] += 1
                unanswered.append({
                    'user': str(mp.user_id),
                    'userName': row['name'],
                    'meeting': str(m.pk),
                    'meetingTitle': m.title,
                    'date': to_iso_date(m.start),
                })

        # ---- آیتم‌های صورت‌جلسه ----
        for e in entries:
            if e.created_by_id:
                person_row(e.created_by)['entriesWritten'] += 1
            if e.entry_type == MinuteEntry.Type.TASK:
                totals['tasks'] += 1
                cat['tasks'] += 1
                if e.is_done:
                    totals['tasks_done'] += 1
                if e.assignee_id:
                    arow = person_row(e.assignee)
                    if e.is_done:
                        arow['tasksDone'] += 1
                    else:
                        arow['tasksOpen'] += 1
                if not e.is_done and e.due_date and e.due_date < today:
                    totals['tasks_overdue'] += 1
                    if e.assignee_id:
                        person_row(e.assignee)['tasksOverdue'] += 1
                    overdue.append({
                        'id': str(e.pk),
                        'text': e.text,
                        'due': e.due_date.isoformat(),
                        'daysLate': (today - e.due_date).days,
                        'assignee': str(e.assignee_id) if e.assignee_id else None,
                        'assigneeName': (e.assignee.get_full_name() or e.assignee.username)
                                        if e.assignee_id else 'بدون مسئول',
                        'meeting': str(m.pk),
                        'meetingTitle': m.title,
                    })
            elif e.entry_type == MinuteEntry.Type.REMINDER:
                totals['reminders'] += 1
                if not e.is_done and e.remind_at and e.remind_at < now:
                    totals['reminders_stale'] += 1
                    stale_reminders.append({
                        'id': str(e.pk),
                        'text': e.text,
                        'when': e.remind_text or to_iso_date(e.remind_at),
                        'meeting': str(m.pk),
                        'meetingTitle': m.title,
                    })

        # ---- جلسه‌های مشکل‌دار ----
        if is_past:
            card = {
                'id': str(m.pk),
                'title': m.title,
                'date': to_iso_date(m.start),
                'start': to_float_hour(m.start),
                'hours': round(hours, 2),
                'organizer': str(m.organizer_id),
                'organizerName': m.organizer.get_full_name() or m.organizer.username,
                'people': len(attendees),
                'category': cat['name'],
                'categoryColor': cat['color'],
            }
            if not entries:
                dead_meetings.append(card)
            elif not actions:
                no_action_meetings.append({**card, 'entries': len(entries)})

    # ---------- مرتب‌سازی و نرخ‌ها ----------
    for row in people.values():
        row['hours'] = round(row['hours'], 1)
        row['minuteRate'] = _pct(row['organizedWithMinutes'], row['organizedPast'])
        row['taskDoneRate'] = _pct(row['tasksDone'], row['tasksDone'] + row['tasksOpen'])
    for row in cats.values():
        row['hours'] = round(row['hours'], 1)
        row['actionRate'] = _pct(row['withAction'], row['past'])

    dead_meetings.sort(key=lambda x: x['date'], reverse=True)
    no_action_meetings.sort(key=lambda x: x['date'], reverse=True)
    overdue.sort(key=lambda x: x['daysLate'], reverse=True)
    unanswered.sort(key=lambda x: x['date'], reverse=True)

    people_list = sorted(people.values(), key=lambda x: x['hours'], reverse=True)
    cats_list = sorted(cats.values(), key=lambda x: x['hours'], reverse=True)

    # کسانی که جلسه می‌گیرند ولی صورت‌جلسه نمی‌نویسند
    silent = sorted(
        (p for p in people_list
         if p['organizedPast'] >= MIN_MEETINGS_FOR_RATE and p['minuteRate'] < 60),
        key=lambda x: (x['minuteRate'], -x['organizedPast']))

    # پرمشغله‌ترین‌ها — کسی که هفته‌ای بیش از ۸ ساعت در جلسه است
    weeks = max(days / 7, 1)
    overloaded = [p for p in people_list if p['hours'] / weeks >= 8][:5]

    # ---------- هشدارها ----------
    alerts = []

    def add(level, kind, title, detail, count, hint):
        alerts.append({'level': level, 'kind': kind, 'title': title,
                       'detail': detail, 'count': count, 'hint': hint})

    if dead_meetings:
        add('high', 'no-minutes', 'جلسه‌های بدون صورت‌جلسه',
            f'{fa(len(dead_meetings))} جلسهٔ برگزارشده هیچ آیتمی در صورت‌جلسه ندارد.',
            len(dead_meetings),
            'برای این جلسه‌ها معلوم نیست چه تصمیمی گرفته شده — از سازنده‌شان بخواهید ثبت کند.')
    if no_action_meetings:
        add('high', 'no-action', 'جلسه‌های بی‌خروجی',
            f'{fa(len(no_action_meetings))} جلسه صورت‌جلسه دارد ولی هیچ یادآور یا تماسی از آن بیرون نیامده.',
            len(no_action_meetings),
            'جلسهٔ بدون اقدام معمولاً می‌توانست یک پیام باشد؛ تکرارشونده‌هایشان را بازبینی کنید.')
    # «تسک» از اپ برداشته شده؛ هشدار و کارتش هم نباید بماند
    if silent:
        names = '، '.join(p['name'] for p in silent[:3])
        add('mid', 'silent', 'افرادی که صورت‌جلسه نمی‌نویسند',
            f'{fa(len(silent))} نفر برای کمتر از ۶۰٪ جلسه‌هایی که خودشان گرفته‌اند صورت‌جلسه ثبت کرده‌اند ({names}).',
            len(silent), 'نوشتن صورت‌جلسه را به سازندهٔ جلسه بسپارید و همان‌جا یادآوری بگذارید.')
    if stale_reminders:
        add('mid', 'stale-reminder', 'یادآورهای رهاشده',
            f"{fa(len(stale_reminders))} یادآور زمانش گذشته و هیچ‌وقت بسته نشده.",
            len(stale_reminders), 'یا انجام شده و ثبت نشده، یا فراموش شده — هر دو باید پاک شود.')
    if unanswered:
        add('mid', 'no-response', 'دعوت‌های بی‌پاسخ',
            f'{fa(len(unanswered))} دعوت تا زمان برگزاری جلسه بی‌پاسخ مانده.',
            len(unanswered), 'وقتی پاسخ دعوت‌ها معلوم نیست، حضور و ظرفیت اتاق قابل برنامه‌ریزی نیست.')
    if overloaded:
        names = '، '.join(p['name'] for p in overloaded[:3])
        add('low', 'overload', 'بار جلسات بالا',
            f'{fa(len(overloaded))} نفر به‌طور میانگین بیش از ۸ ساعت در هفته در جلسه‌اند ({names}).',
            len(overloaded), 'ساعت‌های جلسه وقت اجرا را می‌خورد؛ حضور اختیاری را برایشان علامت بزنید.')

    low_action_cats = [c for c in cats_list
                       if c['past'] >= MIN_MEETINGS_FOR_RATE and c['actionRate'] < 40]
    if low_action_cats:
        c = low_action_cats[0]
        add('low', 'weak-category', 'دسته‌بندی کم‌بازده',
            f"«{c['name']}» با {fa(c['past'])} جلسه فقط {fa(c['actionRate'])}٪ خروجی عملی داشته.",
            len(low_action_cats), 'فرمت این دسته را تغییر دهید — کوتاه‌تر، کم‌نفرتر، یا حذفش کنید.')

    order = {'high': 0, 'mid': 1, 'low': 2}
    alerts.sort(key=lambda a: (order[a['level']], -a['count']))

    return Response({
        'days': days,
        'from': (since).date().isoformat(),
        'to': today.isoformat(),
        'totals': {
            'meetings': totals['meetings'],
            'past': totals['past'],
            'hours': round(totals['hours'], 1),
            'avgLength': round(totals['hours'] / totals['meetings'], 2) if totals['meetings'] else 0,
            'minuteRate': _pct(totals['with_minutes'], totals['past']),
            'actionRate': _pct(totals['with_action'], totals['past']),
            'tasks': totals['tasks'],
            'tasksDone': totals['tasks_done'],
            'taskDoneRate': _pct(totals['tasks_done'], totals['tasks']),
            'tasksOverdue': totals['tasks_overdue'],
            'reminders': totals['reminders'],
            'remindersStale': totals['reminders_stale'],
            'wastedHours': round(totals['hours'] - totals['action_hours'], 1),
        },
        'alerts': alerts,
        'deadMeetings': dead_meetings[:20],
        'noActionMeetings': no_action_meetings[:20],
        'overdueTasks': overdue[:20],
        'staleReminders': stale_reminders[:20],
        'unanswered': unanswered[:20],
        'silentOrganizers': silent[:10],
        'people': people_list[:20],
        'categories': cats_list,
    })
