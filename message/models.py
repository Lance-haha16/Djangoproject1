from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Message(models.Model):
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    body = models.TextField()
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children'
    )
    likes = models.ManyToManyField(
        User,
        blank=True,
        related_name='liked_messages'
    )
    created = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ('-created',)

    def __str__(self):
        return self.body[:20]

    def _github_data(self):
        account = self.author.socialaccount_set.filter(provider='github').first()
        if not account:
            return {}
        return account.extra_data or {}

    def author_name(self):
        data = self._github_data()
        return data.get('login') or data.get('name') or self.author.username

    def reply_list(self):
        return self.children.all().order_by('created')

    def author_avatar(self):
        data = self._github_data()
        if data.get('avatar_url'):
            return data['avatar_url']
        profile = getattr(self.author, 'profile', None)
        if profile and profile.avatar:
            return profile.avatar.url
        return ''
