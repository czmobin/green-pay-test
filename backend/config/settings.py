"""تنظیمات پروژهٔ گرین‌پی (بک‌اند مدیریت جلسات)."""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

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
    # دمو بدون ورود کار می‌کند؛ برای production به IsAuthenticated تغییر دهید.
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    # API بدون نشست کار می‌کند؛ اگر SessionAuthentication فعال بماند، کاربری که
    # هم‌زمان در /admin لاگین است کوکی نشست می‌فرستد و درخواست‌های POST به CSRF می‌خورند.
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'UNAUTHENTICATED_USER': None,
}

# در production فرانت و بک هم‌دامنه‌اند (nginx مسیر /api را پروکسی می‌کند)؛
# این تنظیم فقط برای توسعهٔ محلی روی پورت‌های جدا لازم است.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o
]
