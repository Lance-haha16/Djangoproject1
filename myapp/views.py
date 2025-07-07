from django.http import HttpResponse
from django.shortcuts import render ,redirect
from .forms import ArticlePostForm
from .models import ArticlePost
from django.contrib.auth.models import User
import markdown



def article_list(request):
    articles=ArticlePost.objects.all()
    context={'articles':articles}
    return render(request,'article/list.html',context)

def mainpage(request):
    return render(request,'base.html')

def article_detail(request,id):
    article=ArticlePost.objects.get(id=id)
    article.body = markdown.markdown(article.body,
        extensions=['markdown.extensions.extra', 'markdown.extensions.codehilite',
        ])
    context = { 'article': article }
    return render(request,'article/detail.html',context)

def article_create(request):
    if request.method=="POST":
        article_post_form=ArticlePostForm(data=request.POST)

        if article_post_form.is_valid():
            new_article=article_post_form.save(commit=False)
            # 指定数据库中 id=1 的用户为作者
            # 如果你进行过删除数据表的操作，可能会找不到id=1的用户
            # 此时请重新创建用户，并传入此用户的id
            new_article.author = User.objects.get(id=1)
            # 将新文章保存到数据库中
            new_article.save()
            # 完成后返回到文章列表
            return redirect("myapp:article_list")
        # 如果数据不合法，返回错误信息
        else:
            return HttpResponse("表单内容有误，请重新填写。")
    # 如果用户请求获取数据
    else:
        # 创建表单类实例
        article_post_form = ArticlePostForm()
        # 赋值上下文
        context = { 'article_post_form': article_post_form }
        # 返回模板
        return render(request, 'article/create.html', context)
