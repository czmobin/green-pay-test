from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
    # مسیرهای API در گام بعد اینجا اضافه می‌شوند (path('api/', include('meetings.urls')))
]
