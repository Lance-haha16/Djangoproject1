"""
WSGI config for my_blog project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os
import setuptools  # Python 3.13 需要先加载，django-notifications 才能用到 distutils

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_blog.settings')

application = get_wsgi_application()
