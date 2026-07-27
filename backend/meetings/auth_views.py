"""ورود با شمارهٔ موبایل و کد یک‌بارمصرف (OTP)."""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import OtpCode, User
from .serializers import PersonSerializer
from .sms import is_valid_phone, normalize_phone, send_otp


def _generate_code() -> str:
    return f'{secrets.randbelow(100000):05d}'


def _resolve_user(phone: str) -> User:
    """
    کاربر متناظر با شماره را برمی‌گرداند.

    اگر شماره ثبت نشده باشد: نخستین ورود به حساب مدیرعاملِ دمو وصل می‌شود
    (تا ارائه‌دهنده کل اپ را ببیند) و ورودهای بعدی کاربر عادی می‌سازند.
    """
    user = User.objects.filter(phone=phone).first()
    if user:
        return user

    ceo = User.objects.filter(role=User.Role.CEO).first()
    if ceo and not ceo.phone:
        ceo.phone = phone
        ceo.save(update_fields=['phone'])
        return ceo

    return User.objects.create(
        username=f'u{phone}',
        first_name='کاربر',
        last_name=phone[-4:],
        phone=phone,
        title='عضو',
        role=User.Role.MEMBER,
        organization=(ceo.organization if ceo else None),
        color='#0891B2,#0E4A5A',
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def request_otp(request):
    phone = normalize_phone(request.data.get('phone', ''))
    if not is_valid_phone(phone):
        return Response({'detail': 'شمارهٔ موبایل معتبر نیست.'}, status=status.HTTP_400_BAD_REQUEST)

    # جلوگیری از ارسال پشت‌سرهم
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
    }
    if not result.sent:
        if settings.KAVENEGAR_API_KEY:
            # کلید هست ولی ارسال نشد → خطای واقعی سرویس پیامک
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

    user = _resolve_user(phone)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': PersonSerializer(user).data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(PersonSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({'ok': True})
