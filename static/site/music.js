(function () {
  var root = document.getElementById("music-app");
  if (!root || root.dataset.musicBound === "1") return;
  root.dataset.musicBound = "1";

  var dataUrl = root.getAttribute("data-playlists") || "/static/music/playlists.json";
  var localAudio = document.getElementById("music-audio");
  var vinyl = document.getElementById("music-vinyl");
  var cover = document.getElementById("music-cover");
  var titleNode = document.getElementById("music-title");
  var artistNode = document.getElementById("music-artist");
  var playBtn = document.getElementById("music-play");
  var prevBtn = document.getElementById("music-prev");
  var nextBtn = document.getElementById("music-next");
  var modeBtn = document.getElementById("music-mode");
  var progress = document.getElementById("music-progress");
  var volume = document.getElementById("music-volume");
  var timeCurrent = document.getElementById("music-time-current");
  var timeTotal = document.getElementById("music-time-total");
  var lyricsBox = document.getElementById("music-lyrics");
  var playlistView = document.getElementById("music-playlist-view");
  var scrollUpBtn = document.getElementById("music-scroll-up");
  var scrollDownBtn = document.getElementById("music-scroll-down");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".music-tab"));
  var panelLyrics = document.getElementById("music-panel-lyrics");
  var panelPlaylist = document.getElementById("music-panel-playlist");
  var searchInput = document.getElementById("music-search");
  var searchQuery = "";
  var collapsedPlaylists = {};
  var lastLyricIndex = -1;
  var userScrollingLyrics = false;
  var lyricScrollTimer = 0;

  var MODES = [
    { id: "order", title: "顺序播放", icon: "fas fa-arrows-rotate" },
    { id: "loop", title: "单曲循环", icon: "fas fa-repeat" },
    { id: "shuffle", title: "随机播放", icon: "fas fa-shuffle" }
  ];

  var playlists = [];
  var playlistIndex = 0;
  var trackIndex = 0;
  var modeIndex = 0;
  var seeking = false;

  function sm() {
    return window.SiteMusic || null;
  }

  function audioEl() {
    var s = sm();
    return (s && s.getAudio()) || localAudio;
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function currentPlaylist() {
    return playlists[playlistIndex] || null;
  }

  function currentTrack() {
    var list = currentPlaylist();
    if (!list || !list.tracks || !list.tracks.length) return null;
    return list.tracks[trackIndex] || list.tracks[0];
  }

  function setPlayingUi(playing) {
    if (vinyl) vinyl.classList.toggle("is-playing", playing);
    playBtn.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  }

  function renderMode() {
    var mode = MODES[modeIndex];
    modeBtn.title = "播放模式：" + mode.title;
    modeBtn.innerHTML = '<i class="' + mode.icon + '"></i>';
  }

  var lyricScrollAnim = 0;

  function scrollLyricToCenter(active) {
    if (!active || !lyricsBox || userScrollingLyrics) return;
    var boxH = lyricsBox.clientHeight;
    var target = Math.max(
      0,
      active.offsetTop - boxH / 2 + active.offsetHeight / 2
    );
    var startTop = lyricsBox.scrollTop;
    var delta = target - startTop;
    if (Math.abs(delta) < 2) return;

    cancelAnimationFrame(lyricScrollAnim);
    var duration = 900;
    var startAt = 0;
    function step(now) {
      if (!startAt) startAt = now;
      var p = Math.min(1, (now - startAt) / duration);
      var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      lyricsBox.scrollTop = startTop + delta * eased;
      if (p < 1) lyricScrollAnim = requestAnimationFrame(step);
    }
    lyricScrollAnim = requestAnimationFrame(step);
  }

  function renderLyrics(activeIndex) {
    var track = currentTrack();
    lyricsBox.innerHTML = "";
    lastLyricIndex = -1;
    if (!track || !track.lyrics || !track.lyrics.length) {
      lyricsBox.innerHTML = '<p class="music-empty">暂无歌词</p>';
      return;
    }
    track.lyrics.forEach(function (line, index) {
      var p = document.createElement("p");
      p.className = "music-lyric-line" + (index === activeIndex ? " is-active" : "");
      p.textContent = line.text;
      p.addEventListener("click", function () {
        var a = audioEl();
        if (a && isFinite(line.t)) {
          a.currentTime = line.t;
          updateActiveLyric(index, true);
        }
      });
      lyricsBox.appendChild(p);
    });
    if (activeIndex >= 0) {
      lastLyricIndex = activeIndex;
      var active = lyricsBox.querySelector(".music-lyric-line.is-active");
      scrollLyricToCenter(active);
    }
  }

  function updateActiveLyric(index, forceScroll) {
    if (index < 0) return;
    if (index === lastLyricIndex && !forceScroll) return;
    lastLyricIndex = index;
    var lines = lyricsBox.querySelectorAll(".music-lyric-line");
    var active = null;
    lines.forEach(function (line, i) {
      var on = i === index;
      line.classList.toggle("is-active", on);
      if (on) active = line;
    });
    if (active) scrollLyricToCenter(active);
  }

  function syncIndicesFromSiteTrack(track) {
    if (!track) return;
    if (typeof track.playlistIndex === "number") playlistIndex = track.playlistIndex;
    if (typeof track.trackIndex === "number") trackIndex = track.trackIndex;
  }

  function renderPlaylistView() {
    playlistView.innerHTML = "";
    if (!playlists.length) {
      playlistView.innerHTML = '<p class="music-empty">还没有播放列表</p>';
      return;
    }
    var q = (searchQuery || "").trim().toLowerCase();
    var any = false;

    playlists.forEach(function (playlist, pIndex) {
      var tracks = (playlist.tracks || []).filter(function (track) {
        if (!q) return true;
        var blob = ((track.title || "") + " " + (track.artist || "")).toLowerCase();
        return blob.indexOf(q) !== -1;
      });
      if (!tracks.length) return;
      any = true;

      var key = playlist.id || String(pIndex);
      if (typeof collapsedPlaylists[key] === "undefined") {
        collapsedPlaylists[key] = false;
      }
      var collapsed = !!collapsedPlaylists[key] && !q;

      var group = document.createElement("div");
      group.className = "music-pl-group" + (collapsed ? " is-collapsed" : "");

      var head = document.createElement("button");
      head.type = "button";
      head.className = "music-pl-name";
      head.innerHTML =
        '<span class="music-pl-toggle"><i class="fas fa-chevron-down"></i></span>' +
        '<span class="music-pl-title-text"></span>' +
        '<span class="music-pl-count">' + tracks.length + "</span>";
      head.querySelector(".music-pl-title-text").textContent = playlist.name || "歌单";
      head.addEventListener("click", function () {
        collapsedPlaylists[key] = !collapsedPlaylists[key];
        renderPlaylistView();
      });
      group.appendChild(head);

      var list = document.createElement("div");
      list.className = "music-pl-tracks";
      if (collapsed) list.hidden = true;

      tracks.forEach(function (track) {
        var tIndex = (playlist.tracks || []).indexOf(track);
        var item = document.createElement("div");
        item.className =
          "music-pl-track" +
          (pIndex === playlistIndex && tIndex === trackIndex ? " is-active" : "");
        var coverHtml = track.cover
          ? '<img class="music-pl-cover" src="' + track.cover + '" alt="">'
          : '<div class="music-pl-cover is-ph"><i class="fi fi-rs-music-alt"></i></div>';
        var num = String(tIndex + 1).padStart(2, "0");
        item.innerHTML =
          '<span class="music-pl-index">' +
          num +
          "</span>" +
          coverHtml +
          "<div><p class=\"music-pl-title\">" +
          (track.title || "未命名") +
          '</p><p class="music-pl-artist">' +
          (track.artist || "") +
          "</p></div>";
        item.addEventListener("click", function () {
          playlistIndex = pIndex;
          trackIndex = tIndex;
          collapsedPlaylists[key] = false;
          loadTrack(true);
          renderPlaylistView();
        });
        list.appendChild(item);
      });

      group.appendChild(list);
      playlistView.appendChild(group);
    });

    if (!any) playlistView.innerHTML = '<p class="music-empty">没有匹配的曲目</p>';
    updateScrollButtons();
  }

  function updateScrollButtons() {
    if (!playlistView || !scrollUpBtn || !scrollDownBtn) return;
    var max = playlistView.scrollHeight - playlistView.clientHeight;
    var top = playlistView.scrollTop;
    scrollUpBtn.hidden = max <= 4 || top <= 4;
    scrollDownBtn.hidden = max <= 4 || top >= max - 4;
  }

  function scrollPlaylist(dir) {
    if (!playlistView) return;
    var step = Math.max(140, Math.round(playlistView.clientHeight * 0.72));
    playlistView.scrollBy({ top: dir * step, behavior: "smooth" });
  }

  function activeLyricIndex(time) {
    var track = currentTrack();
    if (!track || !track.lyrics || !track.lyrics.length) return -1;
    var index = 0;
    for (var i = 0; i < track.lyrics.length; i += 1) {
      if (time >= (track.lyrics[i].t || 0)) index = i;
      else break;
    }
    return index;
  }

  function flatIndexForCurrent() {
    var s = sm();
    var track = currentTrack();
    if (!s || !track) return -1;
    var tracks = s.getTracks();
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].playlistIndex === playlistIndex && tracks[i].trackIndex === trackIndex) {
        return i;
      }
    }
    return s.findIndexBySrc(track.src);
  }

  function paintUiFromTrack(track) {
    if (!track) return;
    titleNode.textContent = track.title || "未命名";
    artistNode.textContent = track.artist || "未知艺术家";
    if (track.cover) {
      cover.innerHTML = '<img src="' + track.cover + '" alt="">';
    } else {
      cover.innerHTML = '<i class="fi fi-rs-music-alt"></i>';
    }
    renderLyrics(0);
    renderPlaylistView();
  }

  function loadTrack(autoplay) {
    var track = currentTrack();
    if (!track) return;
    paintUiFromTrack(track);
    progress.value = 0;
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";
    paintProgress();
    setPlayingUi(false);

    var s = sm();
    if (s) {
      var i = flatIndexForCurrent();
      if (i >= 0) {
        s.playAt(i, !!autoplay);
        return;
      }
      var audioNode = s.getAudio && s.getAudio();
      if (audioNode && track.src) {
        audioNode.src = track.src;
        audioNode.setAttribute("data-src", track.src);
        if (typeof s.reload === "function") s.reload(false);
        if (autoplay) {
          audioNode.play().then(function () {
            setPlayingUi(true);
          }).catch(function () {
            setPlayingUi(false);
          });
        }
      }
      return;
    }

    localAudio.src = track.src || "";
    if (autoplay && track.src) {
      localAudio.play().then(function () {
        setPlayingUi(true);
      }).catch(function () {
        setPlayingUi(false);
      });
    }
  }

  function nextIndex(delta) {
    var list = currentPlaylist();
    if (!list || !list.tracks.length) return;
    var mode = MODES[modeIndex].id;
    var s = sm();

    if (mode === "loop" && delta === 1) {
      var a = audioEl();
      if (a) a.currentTime = 0;
      if (s) s.play();
      else if (a) a.play();
      return;
    }
    if (mode === "shuffle") {
      if (list.tracks.length === 1) {
        loadTrack(true);
        return;
      }
      var next = trackIndex;
      while (next === trackIndex) {
        next = Math.floor(Math.random() * list.tracks.length);
      }
      trackIndex = next;
      loadTrack(true);
      return;
    }
    trackIndex = (trackIndex + delta + list.tracks.length) % list.tracks.length;
    loadTrack(true);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var panel = tab.getAttribute("data-panel");
      tabs.forEach(function (item) {
        var on = item === tab;
        item.classList.toggle("is-active", on);
        item.setAttribute("aria-selected", on ? "true" : "false");
      });
      panelLyrics.classList.toggle("is-active", panel === "lyrics");
      panelPlaylist.classList.toggle("is-active", panel === "playlist");
      panelLyrics.hidden = panel !== "lyrics";
      panelPlaylist.hidden = panel !== "playlist";
      if (panel === "playlist") requestAnimationFrame(updateScrollButtons);
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value || "";
      renderPlaylistView();
    });
  }

  if (scrollUpBtn) scrollUpBtn.addEventListener("click", function () { scrollPlaylist(-1); });
  if (scrollDownBtn) scrollDownBtn.addEventListener("click", function () { scrollPlaylist(1); });
  if (playlistView) playlistView.addEventListener("scroll", updateScrollButtons);
  window.addEventListener("resize", updateScrollButtons);

  if (lyricsBox) {
    lyricsBox.addEventListener("wheel", function () {
      userScrollingLyrics = true;
      clearTimeout(lyricScrollTimer);
      lyricScrollTimer = setTimeout(function () {
        userScrollingLyrics = false;
      }, 2500);
    }, { passive: true });
  }

  playBtn.addEventListener("click", function () {
    var s = sm();
    if (s) {
      s.toggle();
      return;
    }
    if (!localAudio.src) return;
    if (localAudio.paused) {
      localAudio.play().then(function () {
        setPlayingUi(true);
      }).catch(function () {
        setPlayingUi(false);
      });
    } else {
      localAudio.pause();
      setPlayingUi(false);
    }
  });

  prevBtn.addEventListener("click", function () {
    nextIndex(-1);
  });

  nextBtn.addEventListener("click", function () {
    nextIndex(1);
  });

  modeBtn.addEventListener("click", function () {
    modeIndex = (modeIndex + 1) % MODES.length;
    renderMode();
  });

  progress.addEventListener("input", function () {
    seeking = true;
    var a = audioEl();
    if (a && a.duration) {
      timeCurrent.textContent = formatTime((progress.value / 1000) * a.duration);
    }
  });

  progress.addEventListener("change", function () {
    var a = audioEl();
    if (a && a.duration) {
      a.currentTime = (progress.value / 1000) * a.duration;
    }
    seeking = false;
  });

  volume.addEventListener("input", function () {
    var s = sm();
    var v = Number(volume.value) / 100;
    if (s) s.setVolume(v);
    else localAudio.volume = v;
    paintVolume();
  });

  function paintProgress() {
    var a = audioEl();
    var pct = 0;
    if (a && a.duration) pct = (a.currentTime / a.duration) * 100;
    progress.style.background =
      "linear-gradient(90deg, #ec4141 " + pct + "%, rgba(255,255,255,0.18) " + pct + "%)";
  }

  function paintVolume() {
    var pct = Number(volume.value) || 0;
    volume.style.background =
      "linear-gradient(90deg, #ec4141 " + pct + "%, rgba(255,255,255,0.18) " + pct + "%)";
  }

  function bindAudioEvents(a) {
    if (!a || a.__musicBound) return;
    a.__musicBound = true;
    a.addEventListener("timeupdate", function () {
      if (!seeking && a.duration) {
        progress.value = String(Math.floor((a.currentTime / a.duration) * 1000));
        timeCurrent.textContent = formatTime(a.currentTime);
        timeTotal.textContent = formatTime(a.duration);
        paintProgress();
      }
      updateActiveLyric(activeLyricIndex(a.currentTime), false);
    });
    a.addEventListener("loadedmetadata", function () {
      timeTotal.textContent = formatTime(a.duration);
    });
    a.addEventListener("play", function () {
      setPlayingUi(true);
    });
    a.addEventListener("pause", function () {
      setPlayingUi(false);
    });
    a.addEventListener("ended", function () {
      if (!sm()) nextIndex(1);
    });
    a.addEventListener("error", function () {
      setPlayingUi(false);
      if (artistNode && artistNode.textContent.indexOf("暂不可播") === -1) {
        artistNode.textContent = (artistNode.textContent || "") + " · 暂不可播";
      }
    });
  }

  bindAudioEvents(localAudio);

  function wireSiteMusic() {
    var s = sm();
    if (!s) return false;
    bindAudioEvents(s.getAudio());
    if (window.__musicPageUnsubs) {
      window.__musicPageUnsubs.forEach(function (off) {
        try {
          off();
        } catch (e) {}
      });
    }
    window.__musicPageUnsubs = [
      s.on("track", function (track) {
        if (!document.getElementById("music-app")) return;
        syncIndicesFromSiteTrack(track);
        paintUiFromTrack(track);
        setPlayingUi(!s.isPaused());
      }),
      s.on("playstate", function (payload) {
        if (!document.getElementById("music-app")) return;
        setPlayingUi(!!payload.playing);
      })
    ];
    var cur = s.getTrack();
    if (cur) {
      syncIndicesFromSiteTrack(cur);
      paintUiFromTrack(cur);
      setPlayingUi(!s.isPaused());
    }
    return true;
  }

  if (!wireSiteMusic()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (wireSiteMusic() || tries > 40) clearInterval(timer);
    }, 100);
  }

  localAudio.volume = Number(volume.value) / 100;
  paintVolume();
  paintProgress();
  renderMode();

  fetch(dataUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      playlists = Array.isArray(data) ? data : [];
      if (!playlists.length) {
        lyricsBox.innerHTML = '<p class="music-empty">还没有歌单，去工作台添加或导入网易云。</p>';
        playlistView.innerHTML = '<p class="music-empty">还没有播放列表</p>';
        return;
      }
      var s = sm();
      var cur = s && s.getTrack();
      if (cur && typeof cur.playlistIndex === "number") {
        playlistIndex = cur.playlistIndex;
        trackIndex = cur.trackIndex || 0;
        paintUiFromTrack(currentTrack());
        setPlayingUi(s && !s.isPaused());
      } else {
        loadTrack(false);
      }
    })
    .catch(function () {
      lyricsBox.innerHTML = '<p class="music-empty">歌单加载失败。</p>';
    });
})();
