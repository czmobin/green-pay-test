from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import auth_views, views

router = DefaultRouter()
router.register('meetings', views.MeetingViewSet, basename='meeting')
router.register('entries', views.MinuteEntryViewSet, basename='entry')
router.register('organizations', views.OrganizationViewSet, basename='organization')
router.register('people', views.PersonViewSet, basename='person')
router.register('locations', views.LocationViewSet, basename='location')

urlpatterns = [
    # ورود با کد یک‌بارمصرف
    path('auth/request-otp/', auth_views.request_otp, name='request-otp'),
    path('auth/verify-otp/', auth_views.verify_otp, name='verify-otp'),
    path('auth/me/', auth_views.me, name='me'),
    path('auth/logout/', auth_views.logout, name='logout'),

    path('bootstrap/', views.bootstrap, name='bootstrap'),
    path('settings/gcal/', views.set_gcal, name='set-gcal'),
    path('settings/sms/', views.set_sms, name='set-sms'),
    path('', include(router.urls)),
]
