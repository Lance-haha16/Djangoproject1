from django.shortcuts import render ,redirect
from django.http import Http404, HttpResponse
from .models import ArticlePost
from .forms import ArticlePostForm
from django.contrib.auth.models import User
import markdown
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator #分页
from django.db.models import Q
from comment.models import Comment
from .models import ArticleColumn
from comment.forms import CommentForm


# Create your views here.
def home(request):
    return render(request, 'home/index.html')


def music_float(request):
    """Standalone mini-player window (keeps playing while main site navigates)."""
    return render(request, 'music/float.html')

SECTIONS = {
    'guestbook': '留言',
    'projects': '项目',
    'archive': '归档',
    'music': '音乐',
    'living': '家居',
    'ideas': '灵感',
}

def section_page(request, slug):
    title = SECTIONS.get(slug)
    if title is None:
        raise Http404
    if slug == 'projects':
        from .github_projects import fetch_recent_projects
        from workstation.models import ProjectShowcase
        payload = fetch_recent_projects()
        remote = payload.get('projects', [])
        showcases = list(ProjectShowcase.objects.filter(is_visible=True))
        if showcases:
            by_name = {p.get('name'): p for p in remote}
            projects = []
            for s in showcases:
                match = by_name.get(s.repo_name)
                if not match:
                    continue
                item = dict(match)
                if s.display_name:
                    item['name'] = s.display_name
                projects.append(item)
        else:
            projects = remote
        return render(request, 'projects/list.html', {
            'title': title,
            'projects': projects,
            'projects_error': payload.get('error', ''),
            'github_user': payload.get('user', 'Lance-haha16'),
        })
    if slug == 'music':
        return render(request, 'music/list.html', {'title': title})
    if slug == 'living':
        return render(request, 'living/list.html', {'title': title})
    if slug == 'ideas':
        from workstation.models import IdeaNote
        notes = IdeaNote.objects.filter(is_published=True)
        return render(request, 'ideas/list.html', {
            'title': title,
            'notes': notes,
        })
    if slug == 'archive':
        from .archive import build_archive_timeline
        archive = build_archive_timeline()
        return render(request, 'archive/list.html', {
            'title': title,
            'archive_events': archive['events'],
            'archive_article_count': archive['article_count'],
            'archive_total': archive['total'],
        })
    return render(request, 'section.html', {'title': title})

def article_list(request):

    search = request.GET.get('search')
    order = request.GET.get('order') or 'created'
    direction = request.GET.get('dir') or 'desc'
    column = request.GET.get('column')
    tag = request.GET.get('tag')
    article_list = ArticlePost.objects.all()

    if order not in ('created', 'total_views'):
        order = 'created'
    if direction not in ('asc', 'desc'):
        direction = 'desc'

    if search:
        article_list = article_list.filter(
            Q(title__icontains=search) |
            Q(body__icontains=search)
        )
    else:
        search = ''

    # 栏目查询集
    if column is not None and column.isdigit():
        article_list = article_list.filter(column=column)

    # 标签查询集
    if tag and tag != 'None':
        article_list = article_list.filter(tags__name__in=[tag])

    # 正序 asc / 倒序 desc；同按钮再点一次切换方向
    sort_field = 'total_views' if order == 'total_views' else 'created'
    sort_key = sort_field if direction == 'asc' else f'-{sort_field}'
    article_list = article_list.order_by(sort_key)

    article_list = article_list.select_related('column', 'author').prefetch_related('tags')
    paginator = Paginator(article_list, 12)
    page = request.GET.get('page')
    articles = paginator.get_page(page)

    # 按文章数平分到各列，列间不对齐；列内间距由 CSS 固定
    items = list(articles.object_list)
    col_count = 3
    article_columns = [[] for _ in range(col_count)]
    if items:
        base, rem = divmod(len(items), col_count)
        start = 0
        for i in range(col_count):
            size = base + (1 if i < rem else 0)
            article_columns[i] = items[start:start + size]
            start += size
        # 去掉末尾空列（文章很少时）
        article_columns = [col for col in article_columns if col]

    context = {
        'articles': articles,
        'article_columns': article_columns,
        'order': order,
        'direction': direction,
        'search': search,
        'tag': tag,
    }
    return render(request, 'article/list.html', context)
          
    

def article_detail(request, id):
    article = ArticlePost.objects.get(id=id)
    comments = Comment.objects.filter(article=id)

    article.total_views += 1
    article.save(update_fields=['total_views'])


    
    md = markdown.Markdown(
        extensions=[
            'markdown.extensions.extra',
            'markdown.extensions.codehilite',
            'markdown.extensions.toc',
        ]
    )
    article.body = md.convert(article.body)

    comment_form = CommentForm()

    context = { 'article': article,'toc': md.toc ,'comments': comments
               ,'comment_form': comment_form,}
    return render(request, 'article/detail.html', context)

@login_required(login_url='/userprofile/login/')
def article_create(request):
    # 判断用户是否提交数据
    if request.method == "POST":
        # 将提交的数据赋值到表单实例中
        article_post_form = ArticlePostForm(request.POST,request.FILES)
        # 判断提交的数据是否满足模型的要求
        if article_post_form.is_valid():
            # 保存数据，但暂时不提交到数据库中
            new_article = article_post_form.save(commit=False)
            # 指定数据库中 id=1 的用户为作者
            # 如果你进行过删除数据表的操作，可能会找不到id=1的用户
            # 此时请重新创建用户，并传入此用户的id
            new_article.author = User.objects.get(id=request.user.id)
            
            if request.POST.get('column') and request.POST['column'] != 'none':
                new_article.column = ArticleColumn.objects.get(id=request.POST['column'])
            new_article.save()
            article_post_form.save_m2m()

            raw_tags = (request.POST.get('tags') or '').strip()
            if raw_tags:
                tag_names = [t.strip() for t in raw_tags.split(',') if t.strip()]
                new_article.tags.set(tag_names, clear=True)

            return redirect("article:article_list")
        return HttpResponse("表单内容有误，请重新填写。")
    # 如果用户请求获取数据
    else:
        # 创建表单类实例
        article_post_form = ArticlePostForm()
        # 赋值上下文
        columns = ArticleColumn.objects.all()
        context = { 'article_post_form': article_post_form, 'columns': columns }

        # 返回模板
        return render(request, 'article/create.html', context)


@login_required(login_url='/userprofile/login/')
def article_safe_delete(request, id):
    if request.method == 'POST':
        article = ArticlePost.objects.get(id=id)
        article.delete()
        return redirect("article:article_list")
    else:
        return HttpResponse("仅允许post请求")
    
def article_update(request, id):
    """
    更新文章的视图函数
    通过POST方法提交表单，更新titile、body字段
    GET方法进入初始表单页面
    id： 文章的 id
    """

    # 获取需要修改的具体文章对象
    article = ArticlePost.objects.get(id=id)
    
    if request.user != article.author:
        return HttpResponse("抱歉，你无权修改这篇文章。")
    
    # 判断用户是否为 POST 提交表单数据

    if request.method == "POST":
        # 必须带上 FILES，否则封面上传无法进入表单
        article_post_form = ArticlePostForm(request.POST, request.FILES, instance=article)
        if article_post_form.is_valid():
            updated = article_post_form.save(commit=False)
            if request.POST.get('column') and request.POST['column'] != 'none':
                updated.column = ArticleColumn.objects.get(id=request.POST['column'])
            else:
                updated.column = None
            updated.save()
            article_post_form.save_m2m()

            raw_tags = (request.POST.get('tags') or '').strip()
            if raw_tags:
                tag_names = [t.strip() for t in raw_tags.split(',') if t.strip()]
                updated.tags.set(tag_names, clear=True)
            else:
                updated.tags.clear()

            return redirect("article:article_detail", id=id)
        return HttpResponse("表单内容有误，请重新填写。")

    # 如果用户 GET 请求获取数据
    else:
        # 创建表单类实例
        article_post_form = ArticlePostForm()
        columns = ArticleColumn.objects.all()
        context = { 
            'article': article, 
            'article_post_form': article_post_form,
            'columns': columns,
            'tags': ','.join([x for x in article.tags.names()]),
        }

        # 赋值上下文，将 article 文章对象也传递进去，以便提取旧的内容

        # 将响应返回到模板中
        return render(request, 'article/update.html', context)