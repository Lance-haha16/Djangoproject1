(function () {
  if (window.__cyberCatBooted) return;
  window.__cyberCatBooted = true;

  function csrfToken() {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  var EDGE_PAD = 8;
  var inited = false;

  function initCat() {
    if (window.matchMedia && window.matchMedia("(max-width: 899px)").matches) return;

    var root = document.getElementById("cyber-cat");
    if (!root) return;

    // 已初始化且节点还在：只保证可见
    if (inited && root.dataset.ready === "1") {
      root.classList.add("is-ready");
      return;
    }

    root.className = "cyber-cat";
    root.innerHTML =
      '<div class="cyber-cat-bubble" hidden></div>' +
      '<div class="cyber-cat-row">' +
      '  <div class="cyber-cat-actions">' +
      '    <button type="button" class="cyber-cat-btn" data-act="chat" title="聊天">💬</button>' +
      '    <button type="button" class="cyber-cat-btn" data-act="feed" title="喂小鱼干">🐟</button>' +
      "  </div>" +
      '  <div class="cyber-cat-sprite-wrap" title="摸一摸">' +
      '    <div class="cyber-cat-sprite cyber-cat-idle"></div>' +
      "  </div>" +
      "</div>" +
      '<form class="cyber-cat-form" hidden>' +
      '  <input type="text" placeholder="跟煤球说点啥喵..." maxlength="200">' +
      '  <button type="submit" aria-label="发送">➤</button>' +
      "</form>";

    var bubble = root.querySelector(".cyber-cat-bubble");
    var sprite = root.querySelector(".cyber-cat-sprite");
    var wrap = root.querySelector(".cyber-cat-sprite-wrap");
    var form = root.querySelector(".cyber-cat-form");
    var input = form.querySelector("input");
    var chatBtn = root.querySelector('[data-act="chat"]');
    var feedBtn = root.querySelector('[data-act="feed"]');

    var speechTimer = 0;
    var petted = false;
    var thinking = false;
    var drag = null;

    function speak(text, ms) {
      bubble.hidden = false;
      bubble.textContent = text;
      clearTimeout(speechTimer);
      speechTimer = setTimeout(function () {
        bubble.hidden = true;
      }, ms || 5000);
    }

    function setSprite(mode) {
      sprite.className = "cyber-cat-sprite cyber-cat-" + mode;
    }

    function setThinking(on) {
      thinking = on;
      chatBtn.disabled = on;
      feedBtn.disabled = on;
      if (!petted) setSprite(on ? "thinking" : "idle");
    }

    async function ask(message) {
      setThinking(true);
      speak("让本喵想想喵...", 10000);
      try {
        var res = await fetch("/workstation/api/chat/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken(),
          },
          body: JSON.stringify({ message: message }),
        });
        var data = await res.json();
        if (!res.ok || !data.reply) throw new Error(data.error || "fail");
        speak(data.reply, 8000);
      } catch (e) {
        speak("铲屎官的网线被老鼠咬断了吧？喵！", 4000);
      } finally {
        setThinking(false);
      }
    }

    wrap.addEventListener("click", function () {
      if (petted || thinking) return;
      petted = true;
      setSprite("petted");
      speak("呼噜噜... 摸得本喵很舒服喵~", 2000);
      setTimeout(function () {
        petted = false;
        if (!thinking) setSprite("idle");
      }, 2000);
    });

    chatBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      form.hidden = !form.hidden;
      if (!form.hidden) input.focus();
    });

    feedBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (thinking) return;
      form.hidden = true;
      ask("我刚刚喂了你一条美味的小鱼干！你有什么表示？");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = input.value.trim();
      if (!msg || thinking) return;
      input.value = "";
      form.hidden = true;
      ask(msg);
    });

    function clampToViewport(left, top) {
      var w = root.offsetWidth || 168;
      var h = root.offsetHeight || 160;
      var maxL = Math.max(EDGE_PAD, window.innerWidth - w - EDGE_PAD);
      var maxT = Math.max(EDGE_PAD, window.innerHeight - h - EDGE_PAD);
      return {
        left: Math.min(maxL, Math.max(EDGE_PAD, left)),
        top: Math.min(maxT, Math.max(EDGE_PAD, top)),
      };
    }

    function placeCat(left, top) {
      var p = clampToViewport(left, top);
      root.style.left = p.left + "px";
      root.style.top = p.top + "px";
      root.style.right = "auto";
      root.style.bottom = "auto";
      return p;
    }

    wrap.addEventListener("pointerdown", function (e) {
      var rect = root.getBoundingClientRect();
      drag = {
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      placeCat(drag.left + dx, drag.top + dy);
    });
    wrap.addEventListener("pointerup", function () {
      if (drag && drag.moved) {
        var rect = root.getBoundingClientRect();
        placeCat(rect.left, rect.top);
        petted = true;
        setTimeout(function () {
          petted = false;
        }, 100);
      }
      drag = null;
    });

    window.addEventListener("resize", function () {
      var rect = root.getBoundingClientRect();
      if (root.style.left || root.style.top) {
        placeCat(rect.left, rect.top);
      }
    });

    var barks = [
      "喵呜~ 今天天气真不错喵~",
      "好困哦，想睡觉喵...",
      "铲屎官，快去敲代码！",
      "我的小鱼干藏哪里去了？",
      "怎么没人理本喵...",
    ];
    setInterval(function () {
      if (thinking || !bubble.hidden || !form.hidden) return;
      if (Math.random() > 0.82) {
        speak(barks[Math.floor(Math.random() * barks.length)], 4000);
      }
    }, 20000);

    inited = true;
    root.dataset.ready = "1";
    requestAnimationFrame(function () {
      root.classList.add("is-ready");
    });
  }

  document.addEventListener("turbo:load", initCat);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCat);
  } else {
    initCat();
  }
})();
