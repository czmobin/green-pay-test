"""تنظیمات پروژهٔ گرین‌پی (بک‌اند مدیریت جلسات)."""
from datetime import timedelta
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: str) -> None:
    """
    خواندن فایل KEY=VALUE (مثل /etc/greenpay.env) اگر وجود داشته باشد.

    تا کسی مجبور نباشد پیش از هر `manage.py` روی سرور دستی `set -a; . file` بزند —
    فراموش‌شدنش باعث می‌شود کلیدها خالی دیده شوند. مقادیری که از قبل در محیط
    هستند دست‌نخورده می‌مانند، پس EnvironmentFile سرویس systemd همچنان اولویت دارد.
    """
    try:
        with open(path, encoding='utf-8') as fh:
            lines = fh.readlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        if key.startswith('export '):
            key = key[len('export '):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        os.environ.setdefault(key, value)


_load_env_file(os.environ.get('GREENPAY_ENV_FILE', '/etc/greenpay.env'))

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-insecure-change-me')
DEBUG = os.environ.get('DEBUG', '1') == '1'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # کتابخانه‌ها
    'rest_framework',
    'corsheaders',
    # اپ دامنه
    'meetings',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': [
            'django.template.context_processors.debug',
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ]},
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# دیتابیس: پیش‌فرض SQLite برای توسعه؛ برای production از PostgreSQL استفاده کنید.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
# نمونهٔ PostgreSQL:
# DATABASES['default'] = {
#     'ENGINE': 'django.db.backends.postgresql',
#     'NAME': os.environ.get('DB_NAME', 'greenpay'),
#     'USER': os.environ.get('DB_USER', 'greenpay'),
#     'PASSWORD': os.environ.get('DB_PASSWORD', ''),
#     'HOST': os.environ.get('DB_HOST', 'localhost'),
#     'PORT': os.environ.get('DB_PORT', '5432'),
# }

AUTH_USER_MODEL = 'meetings.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'fa'
TIME_ZONE = 'Asia/Tehran'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- API ---
REST_FRAMEWORK = {
    # هیچ endpointی بدون ورود در دسترس نیست (به‌جز آن‌هایی که صراحتاً AllowAny دارند).
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    # فقط JWT: اگر SessionAuthentication فعال بماند، کاربری که هم‌زمان در /admin
    # لاگین است کوکی نشست می‌فرستد و درخواست‌های POST به CSRF می‌خورند.
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# --- ورود با کد یک‌بارمصرف (کاوه‌نگار) ---
KAVENEGAR_API_KEY = os.environ.get('KAVENEGAR_API_KEY', '')
KAVENEGAR_OTP_TEMPLATE = os.environ.get('KAVENEGAR_OTP_TEMPLATE', 'contractOtpLogin')

# پیشگام رایان — پیامک متن‌آزاد برای یادآور جلسه (توکن فقط از محیط، هرگز در مخزن)
PISHGAM_SMS_TOKEN = os.environ.get('PISHGAM_SMS_TOKEN', '')
PISHGAM_SMS_SENDER = os.environ.get('PISHGAM_SMS_SENDER', '5000391009557')

# فاصلهٔ پیش‌فرض یادآور جلسه (دقیقه پیش از شروع) — هر کاربر می‌تواند برای هر جلسه عوضش کند
MEETING_REMINDER_LEAD_MINUTES = int(os.environ.get('MEETING_REMINDER_LEAD_MINUTES', '60'))
OTP_TTL_SECONDS = int(os.environ.get('OTP_TTL_SECONDS', '120'))
OTP_RESEND_SECONDS = int(os.environ.get('OTP_RESEND_SECONDS', '60'))
# وقتی پیامک ارسال نشود (کلید تنظیم نشده)، کد در پاسخ برگردانده می‌شود تا
# جریان ورود در محیط توسعه قابل تست باشد. در production خاموش بماند.
OTP_ECHO_WHEN_SMS_OFF = os.environ.get('OTP_ECHO_WHEN_SMS_OFF', '1') == '1'

# در production فرانت و بک هم‌دامنه‌اند (nginx مسیر /api را پروکسی می‌کند)؛
# این تنظیم فقط برای توسعهٔ محلی روی پورت‌های جدا لازم است.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o
]
