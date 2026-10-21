(function () {
  var ageBar = document.getElementById("home-agebar");
  var daysNode = document.getElementById("site-days-num");
  var hoursNode = document.getElementById("site-hours-num");
  var minsNode = document.getElementById("site-mins-num");
  var secsNode = document.getElementById("site-secs-num");
  if (!ageBar || !daysNode || !hoursNode || !minsNode || !secsNode) return;
  if (ageBar.dataset.ageBound === "1") return;
  ageBar.dataset.ageBound = "1";

  var since = new Date((ageBar.getAttribute("data-since") || "2025-07-01") + "T00:00:00");
  if (isNaN(since.getTime())) return;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function render() {
    var diff = Math.max(0, Date.now() - since.getTime());
    var totalSec = Math.floor(diff / 1000);
    var days = Math.floor(totalSec / 86400);
    var hours = Math.floor((totalSec % 86400) / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;
    daysNode.textContent = String(days);
    hoursNode.textContent = pad(hours);
    minsNode.textContent = pad(mins);
    secsNode.textContent = pad(secs);
  }

  render();
  setInterval(render, 1000);
})();

(function () {
  var cloud = document.getElementById("home-cloud");
  var lyricBar = document.getElementById("home-lyricbar");
  if (!cloud || !lyricBar || cloud.dataset.wired === "1") return;
  cloud.dataset.wired = "1";

  var disc = document.getElementById("home-cloud-disc");
  var coverImg = document.getElementById("home-cloud-cover");
  var titleEl = document.getElementById("home-cloud-title");
  var artistEl = document.getElementById("home-cloud-artist");
  var lineEl = document.getElementById("home-cloud-line");
  var lyricText = document.getElementById("home-lyric-text");
  var legacyAudio = document.getElementById("home-audio");
  var playBtn = document.getElementById("home-cloud-play");

  var track = null;
  var lyrics = [];
  var typingTimer = 0;
  var currentLyric = "";

  if (legacyAudio) {
    legacyAudio.removeAttribute("src");
    legacyAudio.pause();
  }

  function typeLyric(text) {
    clearInterval(typingTimer);
    var i = 0;
    lyricText.textContent = "";
    if (!text) return;
    typingTimer = setInterval(function () {
      i += 1;
      lyricText.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typingTimer);
    }, 45);
  }

  function setPlaying(on) {
    disc.classList.toggle("is-playing", on);
    lyricBar.classList.toggle("is-playing", on);
    if (playBtn) {
      playBtn.innerHTML = on ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }
  }

  function syncLyric(time) {
    if (!lyrics.length) return;
    var t = time || 0;
    var active = null;
    for (var i = 0; i < lyrics.length; i++) {
      if (t >= lyrics[i].t) active = lyrics[i];
      else break;
    }
    var text = active ? active.text : "";
    if (text !== currentLyric) {
      currentLyric = text;
      typeLyric(text);
      if (lineEl) lineEl.textContent = text || "点击播放，歌词会在这里跳动";
    }
  }

  function applyTrack(t) {
    track = t;
    if (!t) return;
    titleEl.textContent = t.title || "未命名";
    artistEl.textContent = t.artist || "未知艺术家";
    lyrics = Array.isArray(t.lyrics) ? t.lyrics.slice().sort(function (a, b) { return a.t - b.t; }) : [];
    if (t.cover) {
      coverImg.src = t.cover;
      coverImg.hidden = false;
    } else {
      coverImg.hidden = true;
    }
    if (lineEl) lineEl.textContent = "点播放听歌 · 右下角可拖动迷你播放器";
    if (!currentLyric) lyricText.textContent = "等待旋律…";
  }

  function wire(sm) {
    applyTrack(sm.getTrack());
    setPlaying(!sm.isPaused());

    if (window.__homeMusicUnsubs) {
      window.__homeMusicUnsubs.forEach(function (off) {
        try {
          off();
        } catch (e) {}
      });
    }
    window.__homeMusicUnsubs = [
      sm.on("track", function (t) {
        if (!document.getElementById("home-cloud")) return;
        applyTrack(t);
        setPlaying(!sm.isPaused());
      }),
      sm.on("playstate", function (p) {
        if (!document.getElementById("home-cloud")) return;
        setPlaying(!!p.playing);
      }),
      sm.on("timeupdate", function (p) {
        if (!document.getElementById("home-lyricbar")) return;
        syncLyric(p.currentTime || 0);
      })
    ];

    if (playBtn && playBtn.dataset.bound !== "1") {
      playBtn.dataset.bound = "1";
      playBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        sm.toggle();
      });
    }
  }

  function waitSiteMusic() {
    if (window.SiteMusic) {
      wire(window.SiteMusic);
      return;
    }
    setTimeout(waitSiteMusic, 80);
  }

  waitSiteMusic();
})();
