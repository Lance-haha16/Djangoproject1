from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.urls import reverse
from taggit.managers import TaggableManager
from PIL import Image



# Create your models here.
    
class ArticleColumn(models.Model):
    title = models.CharField(max_length=100, blank=True)
    created = models.DateTimeField(default=timezone.now)
    def __str__(self):
        return self.title
    

class ArticlePost(models.Model):
    author=models.ForeignKey(User,on_delete=models.CASCADE)
    title=models.CharField(max_length=100)
    body=models.TextField()
    created=models.DateTimeField(default=timezone.now)
    updated=models.DateTimeField(auto_now=True)
   
    total_views = models.PositiveIntegerField(default=0)
    tags = TaggableManager(blank=True)
    avatar = models.ImageField(upload_to='article/%Y%m%d/', blank=True)

    column = models.ForeignKey(
        ArticleColumn,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='article')
    class Meta:
        ordering=('-created',)

    def save(self, *args, **kwargs):
        article = super(ArticlePost, self).save(*args, **kwargs)

        # 固定宽度缩放封面（Pillow 10+ 已移除 ANTIALIAS）
        if self.avatar and not kwargs.get('update_fields'):
            try:
                image = Image.open(self.avatar)
                if image.mode not in ('RGB', 'L'):
                    image = image.convert('RGB')
                x, y = image.size
                if x > 0 and y > 0:
                    new_x = 800
                    new_y = max(1, int(new_x * (y / float(x))))
                    resample = getattr(getattr(Image, 'Resampling', Image), 'LANCZOS', Image.BICUBIC)
                    resized_image = image.resize((new_x, new_y), resample)
                    resized_image.save(self.avatar.path, quality=88)
            except Exception:
                # 缩放失败时保留原图，不阻断保存
                pass

        return article

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('article:article_detail', args=[self.id])
