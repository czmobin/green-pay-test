"""
ورود و ثبت‌نام با شمارهٔ موبایل و کد یک‌بارمصرف (OTP) + توکن JWT.

جریان:
  ۱) request-otp  → کد پیامک می‌شود
  ۲) verify-otp   → کد بررسی و توکن access/refresh صادر می‌شود.
                    اگر شماره تازه باشد کاربر ساخته می‌شود و `isNew` برمی‌گردد.
  ۳) profile      → کاربر تازه نام و نام خانوادگی‌اش را ثبت می‌کند.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OtpCode, Organization, User
from .serializers import PersonSerializer
from .sms import is_valid_phone, normalize_phone, send_otp

AVATAR_COLORS = [
    '#2563EB,#1E3A8A', '#0891B2,#0E5A70', '#7C3AED,#4C1D95', '#D9930B,#7A4E00',
    '#DB2777,#831843', '#0891B2,#0E4A5A', '#B45309,#78350F', '#059669,#064E3B',
]


def _generate_code() -> str:
    return f'{secrets.randbelow(100000):05d}'


def _issue_tokens(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def _profile_complete(user: User) -> bool:
    return bool(user.first_name.strip() or user.last_name.strip())


def _get_or_create_user(phone: str):
    """کاربر متناظر با شماره را برمی‌گرداند؛ اگر نبود می‌سازد (ثبت‌نام)."""
    user = User.objects.filter(phone=phone).first()
    if user:
        return user, False

    color = AVATAR_COLORS[User.objects.count() % len(AVATAR_COLORS)]
    user = User.objects.create(
        username=f'u{phone}',
        phone=phone,
        first_name='',
        last_name='',
        title='',
        role=User.Role.MEMBER,
        organization=Organization.objects.filter(kind__slug='internal').first(),
        color=color,
    )
    # بدون این، رمز رشتهٔ خالی می‌ماند و جنگو آن را «رمز دارد» می‌شمارد؛
    # آن‌وقت کاربر برای تعیین رمز، رمز فعلیِ ناموجود از او خواسته می‌شود.
    user.set_unusable_password()
    user.save(update_fields=['password'])
    return user, True


@api_view(['POST'])
@permission_classes([AllowAny])
def request_otp(request):
    phone = normalize_phone(request.data.get('phone', ''))
    if not is_valid_phone(phone):
        return Response({'detail': 'شمارهٔ موبایل معتبر نیست.'}, status=status.HTTP_400_BAD_REQUEST)

    last = OtpCode.objects.filter(phone=phone).first()
    if last and not last.is_used:
        elapsed = (timezone.now() - last.created_at).total_seconds()
        remaining = settings.OTP_RESEND_SECONDS - elapsed
        if remaining > 0:
            return Response(
                {'detail': 'کد قبلی هنوز معتبر است.', 'retryAfter': int(remaining)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    code = _generate_code()
    OtpCode.objects.create(
        phone=phone, code=code,
        expires_at=timezone.now() + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )

    result = send_otp(phone, code)
    payload = {
        'ok': True,
        'phone': phone,
        'expiresIn': settings.OTP_TTL_SECONDS,
        'resendAfter': settings.OTP_RESEND_SECONDS,
        'smsSent': result.sent,
        'isKnown': User.objects.filter(phone=phone).exists(),
    }
    if not result.sent:
        if settings.KAVENEGAR_API_KEY:
            return Response({'detail': f'ارسال پیامک ناموفق بود: {result.detail}'},
                            status=status.HTTP_502_BAD_GATEWAY)
        if settings.OTP_ECHO_WHEN_SMS_OFF:
            payload['devCode'] = code       # فقط حالت توسعه (بدون کلید پیامک)
    return Response(payload)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_otp(request):
    phone = normalize_phone(request.data.get('phone', ''))
    code = str(request.data.get('code', '')).strip()
    if not is_valid_phone(phone) or not code:
        return Response({'detail': 'شماره یا کد نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

    otp = OtpCode.objects.filter(phone=phone, is_used=False).first()
    if not otp or otp.is_expired:
        return Response({'detail': 'کد منقضی شده است؛ دوباره درخواست دهید.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if otp.attempts >= OtpCode.MAX_ATTEMPTS:
        return Response({'detail': 'تعداد تلاش‌ها بیش از حد مجاز است؛ کد جدید بگیرید.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)

    otp.attempts += 1
    if otp.code != code:
        otp.save(update_fields=['attempts'])
        left = OtpCode.MAX_ATTEMPTS - otp.attempts
        return Response({'detail': f'کد نادرست است. {left} تلاش باقی مانده.'},
                        status=status.HTTP_400_BAD_REQUEST)

    otp.is_used = True
    otp.save(update_fields=['attempts', 'is_used'])

    user, created = _get_or_create_user(phone)
    return Response({
        **_issue_tokens(user),
        'user': PersonSerializer(user).data,
        'isNew': created or not _profile_complete(user),
    })


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile(request):
    """خواندن کاربر جاری و تکمیل نام و نام خانوادگی هنگام ثبت‌نام."""
    user = request.user
    if request.method == 'PATCH':
        first = str(request.data.get('firstName', '')).strip()
        last = str(request.data.get('lastName', '')).strip()
        if not first:
            return Response({'detail': 'نام را وارد کنید.'}, status=status.HTTP_400_BAD_REQUEST)
        user.first_name = first[:150]
        user.last_name = last[:150]
        title = str(request.data.get('title', '')).strip()
        if title:
            user.title = title[:120]
        user.save(update_fields=['first_name', 'last_name', 'title'])
    data = PersonSerializer(user).data
    data['isNew'] = not _profile_complete(user)
    data['phone'] = user.phone
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """با JWT بدون blacklist، خروج سمت کلاینت انجام می‌شود؛ این فقط تأیید است."""
    return Response({'ok': True})


# ---------------------------------------------------------------- رمز عبور

MIN_PASSWORD = 8


def has_password(user) -> bool:
    """رمز واقعی دارد؟ (رشتهٔ خالی هم یعنی ندارد، هرچند جنگو آن را قابل‌استفاده می‌داند)"""
    return bool(user.password) and user.has_usable_password()


def _password_ok(pw: str) -> str:
    """پیام خطا برمی‌گرداند، یا رشتهٔ خالی اگر رمز قابل قبول باشد."""
    from .jalali import fa_digits

    if len(pw) < MIN_PASSWORD:
        return f'رمز عبور باید دست‌کم {fa_digits(MIN_PASSWORD)} نویسه باشد.'
    if pw.isdigit():
        return 'رمز عبور نباید فقط از رقم تشکیل شده باشد.'
    return ''


@api_view(['POST'])
@permission_classes([AllowAny])
def login_password(request):
    """ورود با شمارهٔ موبایل و رمز عبور — جایگزینِ اختیاری کد یک‌بارمصرف."""
    phone = normalize_phone(request.data.get('phone', ''))
    password = str(request.data.get('password', ''))
    if not is_valid_phone(phone) or not password:
        return Response({'detail': 'شماره یا رمز عبور نامعتبر است.'},
                        status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(phone=phone).first()
    # پیام یکسان برای «کاربر نیست» و «رمز غلط» تا شماره‌های ثبت‌شده لو نروند
    if not user or not has_password(user) or not user.check_password(password):
        return Response({'detail': 'شماره یا رمز عبور درست نیست.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if not user.is_active:
        return Response({'detail': 'این حساب غیرفعال است.'}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        **_issue_tokens(user),
        'user': PersonSerializer(user).data,
        'isNew': not _profile_complete(user),
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def password(request):
    """
    وضعیت رمز عبور کاربر جاری، و تعیین یا تغییر آن.

    اگر کاربر رمزی داشته باشد، برای تغییر باید رمز فعلی را هم بفرستد؛ کسی که
    فقط با کد یک‌بارمصرف وارد شده و هنوز رمزی ندارد، بدون رمز فعلی می‌تواند
    یکی تعیین کند.
    """
    user = request.user
    if request.method == 'GET':
        return Response({'hasPassword': has_password(user)})

    new = str(request.data.get('newPassword', ''))
    err = _password_ok(new)
    if err:
        return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

    if has_password(user):
        current = str(request.data.get('currentPassword', ''))
        if not user.check_password(current):
            return Response({'detail': 'رمز عبور فعلی درست نیست.'},
                            status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new)
    user.save(update_fields=['password'])
    return Response({'hasPassword': True, 'ok': True})


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """
    فراموشی رمز — با همان کد یک‌بارمصرفی که به شماره فرستاده شده.

    جریان کار: کاربر /auth/request-otp/ را صدا می‌زند، کد را می‌گیرد، و اینجا
    کد و رمز تازه را می‌فرستد. پس از موفقیت مستقیم وارد حساب می‌شود.
    """
    phone = normalize_phone(request.data.get('phone', ''))
    code = str(request.data.get('code', '')).strip()
    new = str(request.data.get('newPassword', ''))
    if not is_valid_phone(phone) or not code:
        return Response({'detail': 'شماره یا کد نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
    err = _password_ok(new)
    if err:
        return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(phone=phone).first()
    if not user:
        return Response({'detail': 'حسابی با این شماره ثبت نشده است.'},
                        status=status.HTTP_400_BAD_REQUEST)

    otp = OtpCode.objects.filter(phone=phone, is_used=False).first()
    if not otp or otp.is_expired:
        return Response({'detail': 'کد منقضی شده است؛ دوباره درخواست دهید.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if otp.attempts >= OtpCode.MAX_ATTEMPTS:
        return Response({'detail': 'تعداد تلاش‌ها بیش از حد مجاز است؛ کد جدید بگیرید.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)

    otp.attempts += 1
    if otp.code != code:
        otp.save(update_fields=['attempts'])
        left = OtpCode.MAX_ATTEMPTS - otp.attempts
        return Response({'detail': f'کد نادرست است. {left} تلاش باقی مانده.'},
                        status=status.HTTP_400_BAD_REQUEST)

    otp.is_used = True
    otp.save(update_fields=['attempts', 'is_used'])
    user.set_password(new)
    user.save(update_fields=['password'])

    return Response({
        **_issue_tokens(user),
        'user': PersonSerializer(user).data,
        'isNew': not _profile_complete(user),
    })
