"""Fetch recent GitHub projects for the projects page."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from django.conf import settings
from django.core.cache import cache


CACHE_KEY = "github_projects:v4"
CACHE_SECONDS = 60 * 30


def _github_user():
    return getattr(settings, "GITHUB_PROJECTS_USER", "Lance-haha16")


def _headers():
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "fly-blog-projects",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = getattr(settings, "GITHUB_TOKEN", "") or os.environ.get("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get_json(url):
    request = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _parse_time(value):
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _cutoff():
    """最近约三个月：回溯到第三个月的月初。"""
    now = datetime.now(timezone.utc)
    month = now.month - 3
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _tech_stack(owner, name, primary=None):
    try:
        languages = _get_json(
            "https://api.github.com/repos/"
            f"{urllib.parse.quote(owner)}/{urllib.parse.quote(name)}/languages"
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError):
        languages = {}

    ordered = sorted(languages.items(), key=lambda item: item[1], reverse=True)
    stack = [lang for lang, _ in ordered[:4]]
    if primary and primary not in stack:
        stack.append(primary)
    return stack or ([primary] if primary else [])


def _normalize(repo):
    owner = (repo.get("owner") or {}).get("login") or _github_user()
    name = repo.get("name") or ""
    stack = _tech_stack(owner, name, repo.get("language"))
    description = (repo.get("description") or "").strip() or "暂无项目描述"
    return {
        "name": name,
        "full_name": repo.get("full_name") or f"{owner}/{name}",
        "url": repo.get("html_url") or f"https://github.com/{owner}/{name}",
        "description": description,
        "tech_stack": stack,
        "tech_text": " · ".join(stack) if stack else "未标注",
        "fork": bool(repo.get("fork")),
        "updated_at": repo.get("pushed_at") or repo.get("updated_at") or "",
        "created_at": repo.get("created_at") or "",
        "search_blob": " ".join(
            [
                name,
                description,
                " ".join(stack),
                "fork" if repo.get("fork") else "",
            ]
        ).lower(),
    }


def _list_user_repos(user):
    repos = []
    page = 1
    while page <= 5:
        batch = _get_json(
            f"https://api.github.com/users/{user}/repos"
            f"?sort=updated&direction=desc&per_page=100&page={page}&type=all"
        )
        if not isinstance(batch, list) or not batch:
            break
        repos.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return repos


def _recent_activity_repo_names(user, cutoff):
    """Repos that had push / create / fork activity recently."""
    names = set()
    page = 1
    while page <= 3:
        try:
            events = _get_json(
                f"https://api.github.com/users/{user}/events/public?per_page=100&page={page}"
            )
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError):
            break
        if not isinstance(events, list) or not events:
            break

        stop = False
        for event in events:
            created = _parse_time(event.get("created_at"))
            if created and created < cutoff:
                stop = True
                break
            etype = event.get("type")
            if etype not in {"PushEvent", "CreateEvent", "ForkEvent", "PullRequestEvent"}:
                continue
            repo = event.get("repo") or {}
            full_name = repo.get("name") or ""
            # events use "owner/name"
            if "/" in full_name:
                names.add(full_name.split("/", 1)[1])
            elif full_name:
                names.add(full_name)
        if stop or len(events) < 100:
            break
        page += 1
    return names


def fetch_recent_projects(force=False):
    cached = None if force else cache.get(CACHE_KEY)
    if cached is not None:
        return cached

    user = urllib.parse.quote(_github_user())
    cutoff = _cutoff()

    try:
        repos = _list_user_repos(user)
        active_names = _recent_activity_repo_names(user, cutoff)
        selected = []
        for repo in repos:
            name = repo.get("name") or ""
            updated = _parse_time(repo.get("pushed_at") or repo.get("updated_at"))
            created = _parse_time(repo.get("created_at"))
            recent_update = bool(updated and updated >= cutoff)
            recent_fork = bool(repo.get("fork") and created and created >= cutoff)
            recent_activity = name in active_names
            if recent_update or recent_fork or recent_activity:
                selected.append(repo)

        projects = [_normalize(repo) for repo in selected]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
        result = {
            "projects": [],
            "error": f"暂时无法读取 GitHub：{exc}",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "user": _github_user(),
        }
        cache.set(CACHE_KEY, result, 60)
        return result

    projects.sort(key=lambda item: item["updated_at"], reverse=True)
    result = {
        "projects": projects,
        "error": "",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "user": _github_user(),
    }
    cache.set(CACHE_KEY, result, CACHE_SECONDS)
    return result
