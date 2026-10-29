(function () {
  if (window.__homeHeroBooted) return;
  window.__homeHeroBooted = true;

  var typedInstance = null;
  var rafId = 0;
  var resizeHandler = null;
  var running = false;

  function stopHero() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (typedInstance && typedInstance.destroy) {
      try {
        typedInstance.destroy();
      } catch (e) {}
      typedInstance = null;
    }
  }

  function initHero() {
    var hero = document.getElementById("hero");
    var canvas = document.getElementById("star-canvas");
    if (!hero || !canvas) {
      stopHero();
      return;
    }

    stopHero();
    running = true;

    var scrollDown = document.getElementById("hero-scroll-down");
    var mainContent = document.getElementById("main-content");
    function scrollToWidgets(e) {
      if (!mainContent) return;
      if (e) e.preventDefault();
      var top = mainContent.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    if (scrollDown && scrollDown.dataset.bound !== "1") {
      scrollDown.dataset.bound = "1";
      scrollDown.addEventListener("click", scrollToWidgets);
    }
    if (location.hash === "#main-content") {
      requestAnimationFrame(function () {
        scrollToWidgets();
      });
    }

    var typedEl = document.getElementById("typed");
    if (typedEl && window.Typed) {
      typedEl.textContent = "";
      typedInstance = new Typed("#typed", {
        strings: ["远行没有目的", "距离不是问题", "不爱了是你的谜底"],
        typeSpeed: 60,
        backSpeed: 30,
        backDelay: 1800,
        startDelay: 500,
        loop: true,
        showCursor: true,
        cursorChar: "|"
      });
    }

    var ctx = canvas.getContext("2d");
    var w = 0;
    var h = 0;
    var STAR_LAYERS = [
      { num: 120, size: [0.5, 1.2], speed: 0.04, alpha: [0.5, 1] },
      { num: 30, size: [1, 2], speed: 0.1, alpha: [0.7, 1] },
      { num: 10, size: [1.5, 2.5], speed: 0.16, alpha: [0.8, 1] }
    ];
    var stars = [];
    var meteors = [];
    var meteorTimer = 0;
    var gradientAngle = 90;

    function resizeCanvas() {
      w = canvas.width = hero.offsetWidth;
      h = canvas.height = hero.offsetHeight;
    }

    function createStars() {
      stars = [];
      STAR_LAYERS.forEach(function (layer) {
        for (var i = 0; i < layer.num; i++) {
          stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * (layer.size[1] - layer.size[0]) + layer.size[0],
            alpha: Math.random() * (layer.alpha[1] - layer.alpha[0]) + layer.alpha[0],
            vx: layer.speed * (Math.random() * 2.4 + 2.8),
            vy: layer.speed * (Math.random() * 1.2 + 1.4)
          });
        }
      });
    }

    function createMeteor() {
      var minAngle = Math.PI / 9;
      var maxAngle = Math.PI / 5;
      var angle = minAngle + Math.random() * (maxAngle - minAngle);
      meteors.push({
        x: Math.random() * w * 0.8 + w * 0.1,
        y: Math.random() * h * 0.3,
        len: Math.random() * 120 + 120,
        speed: Math.random() * 2 + 2.4,
        angle: angle,
        alpha: 1,
        life: 0
      });
    }

    resizeCanvas();
    createStars();
    resizeHandler = function () {
      resizeCanvas();
      createStars();
    };
    window.addEventListener("resize", resizeHandler);

    function draw() {
      if (!running || !document.getElementById("star-canvas")) {
        rafId = 0;
        return;
      }
      var rad = (gradientAngle * Math.PI) / 180;
      var x1 = w / 2 + Math.cos(rad) * w;
      var y1 = h / 2 + Math.sin(rad) * h;
      var x2 = w / 2 - Math.cos(rad) * w;
      var y2 = h / 2 - Math.sin(rad) * h;
      var gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(1, "#432E54");
      gradient.addColorStop(0.55, "#69648C");
      gradient.addColorStop(0.3, "#B66077");
      gradient.addColorStop(0.15, "#B66077");
      gradient.addColorStop(0, "#E9CBE0");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      for (var si = 0; si < stars.length; si++) {
        var s = stars[si];
        ctx.save();
        ctx.globalAlpha = s.alpha;
        var drawR = s.r;
        if (s.x < w / 2) {
          var ratio = s.x / (w / 2);
          drawR = s.r * (0.4 + 0.6 * ratio);
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, drawR, 0, 2 * Math.PI);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
        s.x += s.vx;
        if (s.x > w) s.x = 0;
        s.alpha += (Math.random() - 0.5) * 0.02;
        if (s.alpha < 0.3) s.alpha = 0.3;
        if (s.alpha > 1) s.alpha = 1;
        s.y += s.vy;
        if (s.y > h) s.y = 0;
      }

      for (var i = meteors.length - 1; i >= 0; i--) {
        var m = meteors[i];
        ctx.save();
        var meteorGrad = ctx.createLinearGradient(
          m.x,
          m.y,
          m.x - m.len * Math.cos(m.angle),
          m.y - m.len * Math.sin(m.angle)
        );
        meteorGrad.addColorStop(0, "rgba(255,255,255,1)");
        meteorGrad.addColorStop(0.2, "rgba(255,255,255,0.6)");
        meteorGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = meteorGrad;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.len * Math.cos(m.angle), m.y - m.len * Math.sin(m.angle));
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 16;
        ctx.globalAlpha = m.alpha;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 16;
        ctx.globalAlpha = m.alpha;
        ctx.fill();
        ctx.restore();

        m.x += m.speed * Math.cos(m.angle);
        m.y += m.speed * Math.sin(m.angle);
        m.alpha -= 0.012;
        m.life++;
        if (m.alpha <= 0 || m.x < -200 || m.y > h + 200 || m.life > 120) {
          meteors.splice(i, 1);
        }
      }

      meteorTimer++;
      if (meteorTimer > 120 + Math.random() * 120) {
        createMeteor();
        meteorTimer = 0;
      }

      rafId = requestAnimationFrame(draw);
    }

    draw();
  }

  document.addEventListener("turbo:load", initHero);
  document.addEventListener("turbo:before-cache", stopHero);
  document.addEventListener("turbo:before-render", stopHero);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (!window.Turbo) initHero();
    });
  } else if (!window.Turbo) {
    initHero();
  }
})();
