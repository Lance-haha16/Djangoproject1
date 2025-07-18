from django.http import JsonResponse, HttpResponse
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.shortcuts import get_object_or_404, render, redirect
from django.contrib.auth.decorators import login_required
from article.models import ArticlePost
from .models import Comment
from .forms import CommentForm
from django.template.loader import render_to_string
from notifications.signals import notify
from django.contrib.auth.models import User


@xframe_options_sameorigin
@login_required(login_url='/userprofile/login/')
def post_comment(request, article_id, parent_comment_id=None):
    article = get_object_or_404(ArticlePost, id=article_id)

    if request.method == 'POST':
        comment_form = CommentForm(request.POST)
        if comment_form.is_valid():
            new_comment = comment_form.save(commit=False)
            new_comment.article = article
            new_comment.user = request.user

            if parent_comment_id:
                try:
                    parent_comment = Comment.objects.get(id=parent_comment_id)
                except Comment.DoesNotExist:
                    return HttpResponse("父评论不存在。", status=404)

                new_comment.parent_id = parent_comment.id
                new_comment.reply_to = parent_comment.user
                new_comment.save()

                # 给父评论的用户发送通知
                if not parent_comment.user.is_superuser:
                    notify.send(
                        request.user,
                        recipient=parent_comment.user,
                        verb='回复了你',
                        target=article,
                        action_object=new_comment,
                    )

                # 给管理员发送通知
                if not request.user.is_superuser:
                    notify.send(
                        request.user,
                        recipient=User.objects.filter(is_superuser=1),
                        verb='回复了你',
                        target=article,
                        action_object=new_comment,
                    )

                # 返回成功响应
                return JsonResponse({'code': '200 OK', 'message': '评论成功'})

            new_comment.save()

            # 给管理员发送通知（第一次评论）
            if not request.user.is_superuser:
                notify.send(
                    request.user,
                    recipient=User.objects.filter(is_superuser=1),
                    verb='回复了你',
                    target=article,
                    action_object=new_comment,
                )

            return redirect(article)  # 替换为文章详情页面的 URL 名称
        else:
            return HttpResponse(f"表单内容有误：{comment_form.errors}", status=400)

    elif request.method == 'GET':
        comment_form = CommentForm()
        context = {
            'comment_form': comment_form,
            'article_id': article_id,
            'parent_comment_id': parent_comment_id
        }
        return render(request, 'comment/reply.html', context)

    else:
        return HttpResponse("仅接受GET/POST请求。", status=405)