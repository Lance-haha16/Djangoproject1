from django.urls import path
from . import views

app_name = 'message'

urlpatterns = [
    path('message-list/', views.message_list, name='message_list'),
    path('message-post/', views.message_post, name='message_post'),
    path('message-like/<int:id>/', views.message_like, name='message_like'),
    path('message-delete/<int:id>/', views.message_delete, name='message_delete'),
]
