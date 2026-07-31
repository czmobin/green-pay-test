from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import auth_views, reports, views

router = DefaultRouter()
router.register('meetings', views.MeetingViewSet, basename='meeting')
router.register('entries', views.MinuteEntryViewSet, basename='entry')
router.register('agenda', views.AgendaItemViewSet, basename='agenda')
router.register('org-kinds', views.OrganizationKindViewSet, basename='org-kind')
router.register('organizations', views.OrganizationViewSet, basename='organization')
router.register('people', views.PersonViewSet, basename='person')
router.register('locations', views.LocationViewSet, basename='location')

urlpatterns = [
    # ورود با کد یک‌بارمصرف
    path('auth/request-otp/', auth_views.request_otp, name='request-otp'),
    path('auth/verify-otp/', auth_views.verify_otp, name='verify-otp'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('auth/me/', auth_views.profile, name='me'),          # GET و PATCH
    path('auth/logout/', auth_views.logout, name='logout'),

    path('bootstrap/', views.bootstrap, name='bootstrap'),
    path('reports/full/', reports.full_report, name='full-report'),
    path('settings/gcal/', views.set_gcal, name='set-gcal'),
    path('settings/sms/', views.set_sms, name='set-sms'),
    path('', include(router.urls)),
]
