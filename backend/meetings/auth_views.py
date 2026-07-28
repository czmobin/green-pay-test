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
    '#0E9F6E,#0B5B3E', '#2F7FE4,#153E7E', '#7C3AED,#4C1D95', '#D9930B,#7A4E00',
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
