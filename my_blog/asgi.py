"""
ASGI config for my_blog project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
import setuptools  # Python 3.13 需要先加载，django-notifications 才能用到 distutils

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_blog.settings')

application = get_asgi_application()
