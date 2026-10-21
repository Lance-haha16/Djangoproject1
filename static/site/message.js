(function () {
  var AUTO = 2;
  var BATCH = 2;

  document.querySelectorAll(".message-typebox").forEach(function (box) {
    box.addEventListener("input", function () {
      box.scrollTop = box.scrollHeight;
    });
  });

  function replyItems(box) {
    return Array.prototype.slice.call(box.children).filter(function (el) {
      return !el.classList.contains("message-more-toggle");
    });
  }

  function moreButton(box) {
    return box.querySelector(":scope > .message-more-toggle");
  }

  function syncMoreButton(box) {
    var items = replyItems(box);
    var button = moreButton(box);
    if (!button) return;

    var moreText = button.getAttribute("data-more") || "浏览更多";
    var lessText = button.getAttribute("data-less") || "收起";
    var shown = items.filter(function (item) {
      return item.classList.contains("is-shown");
    }).length;

    if (items.length <= AUTO) {
      button.classList.remove("is-shown");
      return;
    }

    button.classList.add("is-shown");
    button.textContent = shown >= items.length ? lessText : moreText;
  }

  function resetShown(box) {
    var items = replyItems(box);
    items.forEach(function (item) {
      item.classList.remove("is-shown");
      item.style.animationDelay = "";
    });
    items.slice(0, AUTO).forEach(function (item, index) {
      item.classList.add("is-shown");
      item.style.animationDelay = index * 55 + "ms";
    });
    syncMoreButton(box);
  }

  function findRepliesBox(button) {
    var id = button.getAttribute("data-replies");
    if (id) {
      return document.getElementById(id);
    }
    var card = button.closest(".message-card");
    return card ? card.querySelector(":scope > .message-replies") : null;
  }

  function findReplyForm(button) {
    var id = button.getAttribute("data-target");
    return id ? document.getElementById(id) : null;
  }

  function setExpanded(button, open) {
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");

    var form = findReplyForm(button);
    if (form) {
      if (open) {
        form.classList.remove("open");
        // 触发重绘以便再次播放弹出动画
        void form.offsetWidth;
        form.classList.add("open");
      } else {
        form.classList.remove("open");
      }
    }

    var replies = findRepliesBox(button);
    if (!replies) return;

    if (open) {
      replies.classList.remove("is-expanded");
      void replies.offsetWidth;
      replies.classList.add("is-expanded");
      resetShown(replies);
    } else {
      replies.classList.remove("is-expanded");
      replyItems(replies).forEach(function (item) {
        item.classList.remove("is-shown");
        item.style.animationDelay = "";
      });
      var btn = moreButton(replies);
      if (btn) btn.classList.remove("is-shown");
    }
  }

  document.querySelectorAll(".message-reply-toggle").forEach(function (button) {
    if (!button.hasAttribute("aria-expanded")) {
      button.setAttribute("aria-expanded", "false");
    }
    button.addEventListener("click", function () {
      var open = !button.classList.contains("is-open");
      setExpanded(button, open);
    });
  });

  // 次级默认收起，等点击评论图标再弹出
  document.querySelectorAll(".message-replies").forEach(function (box) {
    box.classList.remove("is-expanded");
    replyItems(box).forEach(function (item) {
      item.classList.remove("is-shown");
    });
    var btn = moreButton(box);
    if (btn) btn.classList.remove("is-shown");
  });

  document.querySelectorAll(".message-more-toggle").forEach(function (button) {
    if (!button.getAttribute("data-more")) {
      button.setAttribute("data-more", button.textContent.trim() || "浏览更多");
    }
    if (!button.getAttribute("data-less")) {
      button.setAttribute("data-less", "收起");
    }

    button.addEventListener("click", function () {
      var box = button.parentElement;
      if (!box || !box.classList.contains("message-replies")) return;

      var items = replyItems(box);
      var shown = items.filter(function (item) {
        return item.classList.contains("is-shown");
      }).length;

      if (shown >= items.length) {
        items.forEach(function (item) {
          item.classList.remove("is-shown");
          item.style.animationDelay = "";
        });
        items.slice(0, AUTO).forEach(function (item, index) {
          item.classList.add("is-shown");
          item.style.animationDelay = index * 55 + "ms";
        });
        syncMoreButton(box);
        return;
      }

      items.slice(shown, shown + BATCH).forEach(function (item, index) {
        item.classList.remove("is-shown");
        void item.offsetWidth;
        item.classList.add("is-shown");
        item.style.animationDelay = index * 55 + "ms";
      });
      syncMoreButton(box);
    });
  });
})();
