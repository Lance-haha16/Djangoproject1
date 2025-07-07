from django.urls import path,include
from django.contrib import admin
from myapp  import views

app_name = 'article'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('myapp/', include('myapp.urls', namespace='myapp')),
]