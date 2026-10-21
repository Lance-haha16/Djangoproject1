from django.http import HttpResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import Message
from .forms import MessageForm


def visitor_profile(user):
    account = user.socialaccount_set.filter(provider='github').first()
    data = account.extra_data if account else {}
    name = data.get('login') or data.get('name') or user.username
    avatar = data.get('avatar_url') or ''
    if not avatar:
        profile = getattr(user, 'profile', None)
        if profile and profile.avatar:
            avatar = profile.avatar.url
    return name, avatar


def message_list(request):
    messages = (
        Message.objects.filter(parent__isnull=True)
        .select_related('author')
        .prefetch_related(
            'likes',
            'children',
            'children__author',
            'children__likes',
            'children__children',
        )
    )
    visitor_name = ''
    visitor_avatar = ''
    if request.user.is_authenticated:
        visitor_name, visitor_avatar = visitor_profile(request.user)
    context = {
        'messages': messages,
        'message_form': MessageForm(),
        'visitor_name': visitor_name,
        'visitor_avatar': visitor_avatar,
    }
    return render(request, 'message/list.html', context)


@login_required(login_url='/accounts/github/login/')
def message_post(request):
    if request.method == 'POST':
        message_form = MessageForm(request.POST)
        if message_form.is_valid():
            new_message = message_form.save(commit=False)
            new_message.author = request.user
            parent_id = request.POST.get('parent')
            if parent_id:
                new_message.parent = Message.objects.filter(id=parent_id).first()
            new_message.save()
    return redirect('message:message_list')


@login_required(login_url='/accounts/github/login/')
def message_like(request, id):
    if request.method == 'POST':
        message = get_object_or_404(Message, id=id)
        if message.likes.filter(id=request.user.id).exists():
            message.likes.remove(request.user)
        else:
            message.likes.add(request.user)
    return redirect('message:message_list')


@login_required(login_url='/accounts/github/login/')
def message_delete(request, id):
    if request.method != 'POST':
        return HttpResponse("仅允许post请求")

    message = get_object_or_404(Message, id=id)
    if request.user != message.author:
        return HttpResponse("你只能删除自己的留言。")

    message.delete()
    return redirect('message:message_list')
