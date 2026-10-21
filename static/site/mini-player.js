(function () {
  var root = document.getElementById("site-mini-player");
  if (!root || window.SiteMusic) return;

  var STORAGE_KEY = "siteMusic.v1";
  var EDGE_SNAP_PX = 28;
  var apiUrl = root.getAttribute("data-api") || "/workstation/api/music/";

  var audio = document.getElementById("smp-audio");
  var card = document.getElementById("smp-card");
  var edge = document.getElementById("smp-edge");
  var coverImg = document.getElementById("smp-cover-img");
  var coverFallback = document.getElementById("smp-cover-fallback");
  var edgeCover = document.getElementById("smp-edge-cover");
  var edgeFallback = document.getElementById("smp-edge-fallback");
  var playBtn = document.getElementById("smp-play");
  var prevBtn = document.getElementById("smp-prev");
  var nextBtn = document.getElementById("smp-next");
  var muteBtn = document.getElementById("smp-mute");
  var volIcon = document.getElementById("smp-vol-icon");
  var volRange = document.getElementById("smp-vol-range");
  var volWrap = document.getElementById("smp-vol");

  var flat = [];
  var index = 0;
  var volume = 0.8;
  var muted = false;
  var collapsed = false;
  var dockSide = "right";
  var listeners = {};
  var dragging = false;
  var moved = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var edgePulling = false;
  var edgePulledOut = false;
  var edgeStartX = 0;
  var edgeStartY = 0;
  var edgeStartTop = 0;
  var PULL_OUT_PX = 12;

  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {}
    });
  }

  function on(name, fn) {
    if (!listeners[name]) listeners[name] = [];
    listeners[name].push(fn);
    return function () {
      listeners[name] = (listeners[name] || []).filter(function (x) {
        return x !== fn;
      });
    };
  }

  function currentTrack() {
    return flat[index] || null;
  }

  function flatten(lists) {
    var out = [];
    (lists || []).forEach(function (pl, pi) {
      (pl.tracks || []).forEach(function (tr, ti) {
        out.push({
          playlistIndex: pi,
          trackIndex: ti,
          playlistId: pl.id,
          playlistName: pl.name,
          title: tr.title || "未命名",
          artist: tr.artist || "未知艺术家",
          cover: tr.cover || "",
          src: tr.src || "",
          lyrics: tr.lyrics || []
        });
      });
    });
    return out;
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(partial) {
    var cur = readStore();
    Object.keys(partial).forEach(function (k) {
      cur[k] = partial[k];
    });
    cur.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  }

  function paintVolume() {
    var pct = muted ? 0 : Math.round(volume * 100);
    volRange.value = String(pct);
    volRange.style.background =
      "linear-gradient(90deg, #ec4141 " + pct + "%, rgba(255,255,255,0.18) " + pct + "%)";
    var icon = "fa-volume-low";
    if (muted || pct === 0) icon = "fa-volume-xmark";
    else if (pct > 60) icon = "fa-volume-high";
    volIcon.className = "fas " + icon;
    audio.volume = muted ? 0 : volume;
  }

  function setPlayingUi(playing) {
    playBtn.innerHTML = playing
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
    root.classList.toggle("is-playing", playing);
    emit("playstate", { playing: playing });
  }

  function applyCover(url) {
    if (url) {
      coverImg.src = url;
      coverImg.hidden = false;
      coverFallback.hidden = true;
      if (edgeCover) {
        edgeCover.src = url;
        edgeCover.hidden = false;
      }
      if (edgeFallback) edgeFallback.hidden = true;
    } else {
      coverImg.hidden = true;
      coverFallback.hidden = false;
      if (edgeCover) edgeCover.hidden = true;
      if (edgeFallback) edgeFallback.hidden = false;
    }
  }

  function renderTrack() {
    var track = currentTrack();
    applyCover(track ? track.cover : "");
    emit("track", track);
  }

  function loadTrack(autoplay, seek) {
    var track = currentTrack();
    if (!track) {
      renderTrack();
      return;
    }
    renderTrack();
    var same = audio.getAttribute("data-src") === track.src;
    if (!same) {
      audio.src = track.src || "";
      audio.setAttribute("data-src", track.src || "");
    }
    if (typeof seek === "number" && isFinite(seek)) {
      var applySeek = function () {
        try {
          audio.currentTime = seek;
        } catch (e) {}
      };
      if (audio.readyState >= 1) applySeek();
      else audio.addEventListener("loadedmetadata", applySeek, { once: true });
    }
    persistLayout();
    if (autoplay && track.src) {
      audio.play().then(function () {
        setPlayingUi(true);
        writeStore({ playing: true, currentTime: audio.currentTime || 0 });
      }).catch(function () {
        setPlayingUi(false);
        writeStore({ playing: false });
      });
    } else {
      setPlayingUi(!audio.paused && !audio.ended);
    }
  }

  function play() {
    if (!audio.src && currentTrack()) loadTrack(true);
    else {
      audio.play().then(function () {
        setPlayingUi(true);
        writeStore({ playing: true });
      }).catch(function () {});
    }
  }

  function pause() {
    audio.pause();
    setPlayingUi(false);
    writeStore({ playing: false, currentTime: audio.currentTime || 0 });
  }

  function toggle() {
    if (audio.paused) play();
    else pause();
  }

  function playlistIndices(playlistIndex) {
    var indices = [];
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].playlistIndex === playlistIndex) indices.push(i);
    }
    return indices;
  }

  function next(delta) {
    if (!flat.length) return;
    delta = delta || 1;
    var cur = currentTrack();
    // 只在同一歌单内循环，不跨歌单
    var indices = playlistIndices(cur ? cur.playlistIndex : 0);
    if (!indices.length) return;
    var pos = indices.indexOf(index);
    if (pos < 0) pos = 0;
    pos = (pos + delta + indices.length) % indices.length;
    index = indices[pos];
    loadTrack(true);
  }

  function playAt(i, autoplay) {
    if (i < 0 || i >= flat.length) return;
    index = i;
    loadTrack(autoplay !== false);
  }

  function findIndexBySrc(src) {
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].src === src) return i;
    }
    return -1;
  }

  function persistLayout() {
    var track = currentTrack();
    writeStore({
      index: index,
      src: track ? track.src : "",
      volume: volume,
      muted: muted,
      collapsed: collapsed,
      dockSide: dockSide,
      left: root.style.left || "",
      top: root.style.top || "",
      bottom: root.style.bottom || ""
    });
  }

  function clampPosition(left, top) {
    var w = root.offsetWidth || 200;
    var h = root.offsetHeight || 64;
    var maxL = Math.max(0, window.innerWidth - w);
    var maxT = Math.max(0, window.innerHeight - h);
    return {
      left: Math.min(maxL, Math.max(0, left)),
      top: Math.min(maxT, Math.max(0, top))
    };
  }

  function placeAt(left, top) {
    var p = clampPosition(left, top);
    root.style.left = p.left + "px";
    root.style.top = p.top + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    persistLayout();
  }

  function setCollapsed(on, side) {
    collapsed = !!on;
    if (side) dockSide = side;
    root.classList.toggle("is-collapsed", collapsed);
    root.classList.toggle("is-dock-left", dockSide === "left");
    root.classList.toggle("is-dock-right", dockSide === "right");
    if (edge) edge.hidden = !collapsed;

    if (collapsed) {
      var top = root.style.top;
      if (!top) {
        var rect = root.getBoundingClientRect();
        top = rect.top + "px";
      }
      root.style.top = top;
      root.style.bottom = "auto";
      root.style.left = "";
      root.style.right = "";
      if (dockSide === "right") {
        root.style.right = "0";
        root.style.left = "auto";
      } else {
        root.style.left = "0";
        root.style.right = "auto";
      }
    }
    persistLayout();
  }

  function beginDragFromPoint(clientX, clientY) {
    dragging = true;
    moved = true;
    root.classList.add("is-dragging");
    var rect = root.getBoundingClientRect();
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
  }

  function expandFromEdge() {
    var top = root.getBoundingClientRect().top;
    setCollapsed(false);
    var w = root.offsetWidth || 200;
    if (dockSide === "right") {
      placeAt(window.innerWidth - w - 16, top);
    } else {
      placeAt(16, top);
    }
  }

  function pullOutAt(clientX, clientY) {
    edgePulledOut = true;
    var top = root.getBoundingClientRect().top;
    setCollapsed(false);
    var w = root.offsetWidth || 200;
    var left = dockSide === "right" ? window.innerWidth - w - 12 : 12;
    placeAt(left, top);
    beginDragFromPoint(clientX, clientY);
  }

  function maybeSnapToEdge() {
    var rect = root.getBoundingClientRect();
    if (rect.left <= EDGE_SNAP_PX) {
      setCollapsed(true, "left");
      return;
    }
    if (rect.right >= window.innerWidth - EDGE_SNAP_PX) {
      setCollapsed(true, "right");
    }
  }

  function isInteractive(el) {
    return !!(el && el.closest && el.closest("button, input, a, .smp-vol-range"));
  }

  function startDrag(clientX, clientY, target) {
    if (collapsed || isInteractive(target)) return;
    dragging = true;
    moved = false;
    root.classList.add("is-dragging");
    var rect = root.getBoundingClientRect();
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
  }

  function moveDrag(clientX, clientY) {
    if (edgePulling && collapsed) {
      var dx = clientX - edgeStartX;
      var dy = clientY - edgeStartY;
      var nextTop = Math.max(0, Math.min(window.innerHeight - 48, edgeStartTop + dy));
      root.style.top = nextTop + "px";
      root.style.bottom = "auto";
      var pullOut =
        (dockSide === "right" && dx < -PULL_OUT_PX) ||
        (dockSide === "left" && dx > PULL_OUT_PX);
      if (pullOut) {
        edgePulling = false;
        pullOutAt(clientX, clientY);
      }
      return;
    }
    if (!dragging) return;
    moved = true;
    placeAt(clientX - dragOffsetX, clientY - dragOffsetY);
  }

  function endDrag() {
    if (edgePulling) {
      edgePulling = false;
      root.classList.remove("is-dragging");
      persistLayout();
    }
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    if (moved) maybeSnapToEdge();
  }

  function startEdgePull(clientX, clientY) {
    if (!collapsed) return;
    edgePulling = true;
    edgePulledOut = false;
    edgeStartX = clientX;
    edgeStartY = clientY;
    edgeStartTop = root.getBoundingClientRect().top;
    root.classList.add("is-dragging");
  }

  function restoreLayout(st) {
    if (st.collapsed) {
      if (st.top) root.style.top = st.top;
      setCollapsed(true, st.dockSide || "right");
      return;
    }
    setCollapsed(false);
    if (st.left && st.top) {
      root.style.left = st.left;
      root.style.top = st.top;
      root.style.right = "auto";
      root.style.bottom = "auto";
    }
  }

  playBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggle();
  });
  prevBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    next(-1);
  });
  nextBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    next(1);
  });
  muteBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    muted = !muted;
    paintVolume();
    writeStore({ muted: muted, volume: volume });
  });
  volRange.addEventListener("input", function () {
    volume = Number(volRange.value) / 100;
    muted = volume === 0;
    paintVolume();
    writeStore({ volume: volume, muted: muted });
  });
  volRange.addEventListener("mousedown", function (e) {
    e.stopPropagation();
    volWrap.classList.add("is-open");
  });
  volRange.addEventListener("mouseup", function () {
    volWrap.classList.remove("is-open");
  });

  if (edge) {
    edge.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      startEdgePull(e.clientX, e.clientY);
    });
    edge.addEventListener(
      "touchstart",
      function (e) {
        if (!e.touches[0]) return;
        startEdgePull(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    // 点击也可展开（未向外拉时）
    edge.addEventListener("click", function (e) {
      e.preventDefault();
      if (edgePulledOut || dragging) {
        edgePulledOut = false;
        return;
      }
      if (collapsed) expandFromEdge();
    });
  }

  card.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    startDrag(e.clientX, e.clientY, e.target);
  });
  card.addEventListener(
    "touchstart",
    function (e) {
      if (!e.touches[0]) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    { passive: true }
  );

  window.addEventListener("mousemove", function (e) {
    moveDrag(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", endDrag);
  window.addEventListener(
    "touchmove",
    function (e) {
      if (!dragging || !e.touches[0]) return;
      if (moved) e.preventDefault();
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: false }
  );
  window.addEventListener("touchend", endDrag);

  audio.addEventListener("play", function () {
    setPlayingUi(true);
    writeStore({ playing: true });
  });
  audio.addEventListener("pause", function () {
    setPlayingUi(false);
    writeStore({ playing: false, currentTime: audio.currentTime || 0 });
  });
  audio.addEventListener("timeupdate", function () {
    if (Math.floor(audio.currentTime) % 2 === 0) {
      writeStore({ currentTime: audio.currentTime || 0 });
    }
    emit("timeupdate", {
      currentTime: audio.currentTime || 0,
      duration: audio.duration || 0
    });
  });
  audio.addEventListener("ended", function () {
    next(1);
  });

  window.addEventListener("beforeunload", function () {
    writeStore({
      index: index,
      currentTime: audio.currentTime || 0,
      playing: !audio.paused,
      volume: volume,
      muted: muted,
      collapsed: collapsed,
      dockSide: dockSide
    });
  });

  window.SiteMusic = {
    on: on,
    play: play,
    pause: pause,
    toggle: toggle,
    next: function () {
      next(1);
    },
    prev: function () {
      next(-1);
    },
    playAt: playAt,
    findIndexBySrc: findIndexBySrc,
    getTrack: currentTrack,
    getTracks: function () {
      return flat.slice();
    },
    getAudio: function () {
      return audio;
    },
    isPaused: function () {
      return audio.paused;
    },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      muted = volume === 0;
      paintVolume();
      writeStore({ volume: volume, muted: muted });
    }
  };

  root.hidden = false;
  paintVolume();

  fetch(apiUrl)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      flat = flatten(Array.isArray(data) ? data : []);
      var st = readStore();
      if (typeof st.volume === "number") volume = st.volume;
      if (typeof st.muted === "boolean") muted = st.muted;
      paintVolume();
      restoreLayout(st);

      if (typeof st.index === "number" && st.index >= 0 && st.index < flat.length) {
        index = st.index;
      } else if (st.src) {
        var found = findIndexBySrc(st.src);
        if (found >= 0) index = found;
      }

      if (!flat.length) {
        renderTrack();
        return;
      }
      loadTrack(false, st.currentTime || 0);
    })
    .catch(function () {
      renderTrack();
    });
})();
