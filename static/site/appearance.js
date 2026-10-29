(function () {
  if (window.__siteAppearanceBound) {
    if (window.SiteAppearance && typeof window.SiteAppearance.refresh === "function") {
      window.SiteAppearance.refresh();
    }
    return;
  }

  var STORAGE_KEY = "blog.appearance";
  var DB_NAME = "blog-appearance";
  var STORE = "backgrounds";
  var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  var PAGE_SIZE = 4;

  var settingsRoot = document.getElementById("site-settings");
  var wallpaper = document.getElementById("site-wallpaper");
  var seasonCanvas = document.getElementById("site-season");
  var veil = document.getElementById("site-veil");
  if (!settingsRoot || !wallpaper || !seasonCanvas) return;

  window.__siteAppearanceBound = true;

  function elWallpaper() {
    return document.getElementById("site-wallpaper") || wallpaper;
  }

  var toggle = document.getElementById("site-settings-toggle");
  var panel = document.getElementById("site-settings-panel");
  var uploadInput = document.getElementById("site-bg-upload");
  var uploadList = document.getElementById("site-bg-uploads");
  var emptyHint = document.getElementById("site-bg-empty");
  var statusNode = document.getElementById("site-settings-status");
  var blurRange = document.getElementById("site-blur-range");
  var blurValue = document.getElementById("site-blur-value");
  var seasonToggle = document.getElementById("site-season-toggle");
  var seasonHint = document.getElementById("site-season-hint");
  var defaultButton = document.getElementById("site-bg-default");
  var presetButtons = settingsRoot.querySelectorAll("#site-bg-presets .site-bg-choice");
  var presetPager = createPager(document.getElementById("site-bg-presets-pager"));
  var uploadPager = createPager(document.getElementById("site-bg-uploads-pager"));

  var activeObjectUrl = "";
  var previewUrls = [];
  var seasonFrame = 0;
  var seasonParticles = [];

  if (document.getElementById("hero")) {
    document.body.classList.add("is-home");
  }

  var seasonInfo = currentSeason();
  if (seasonHint) {
    seasonHint.textContent = "当前是" + seasonInfo.label + "，开启后会" + seasonInfo.effect;
  }

  var state = loadState();
  seasonToggle.checked = state.season;
  applyBlur();
  applyState();
  if (presetPager) presetPager.render();
  if (uploadList) renderUploads();

  toggle.addEventListener("click", function () {
    var open = panel.hasAttribute("hidden");
    if (open) {
      panel.removeAttribute("hidden");
      toggle.setAttribute("aria-expanded", "true");
      if (presetPager) presetPager.render();
      if (uploadPager) uploadPager.render();
    } else {
      closePanel();
    }
  });

  settingsRoot.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  document.addEventListener("click", closePanel);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closePanel();
  });

  function selectPreset(button) {
    state.background = button.getAttribute("data-src") || "";
    saveState();
    applyState();
    markActive();
  }

  if (defaultButton) {
    defaultButton.addEventListener("click", function () {
      selectPreset(defaultButton);
    });
  }

  presetButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      selectPreset(button);
    });
  });

  blurRange.addEventListener("input", function () {
    state.blur = normalizeBlur(blurRange.value);
    saveState();
    applyBlur();
  });

  seasonToggle.addEventListener("change", function () {
    state.season = seasonToggle.checked;
    saveState();
    applyState();
  });

  if (uploadInput) uploadInput.addEventListener("change", function () {
    var file = uploadInput.files && uploadInput.files[0];
    uploadInput.value = "";
    if (!file) return;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      setStatus("请选择图片文件");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus("请小于 8MB：壁纸保存在本机浏览器，过大易占内存、变卡");
      return;
    }
    var record = {
      id: "up-" + Date.now(),
      name: file.name || "背景",
      blob: file,
      created: Date.now()
    };
    withStore("readwrite", function (store) {
      store.add(record);
    }).then(function () {
      state.background = "idb:" + record.id;
      saveState();
      setStatus("已加入可选背景");
      applyState();
      renderUploads();
    }).catch(function () {
      setStatus("保存失败，请重试");
    });
  });

  if (uploadList) uploadList.addEventListener("click", function (event) {
    var deleteButton = event.target.closest(".site-bg-delete");
    var choice = event.target.closest(".site-bg-choice");
    if (deleteButton) {
      event.stopPropagation();
      var removeId = deleteButton.getAttribute("data-id");
      withStore("readwrite", function (store) {
        store.delete(removeId);
      }).then(function () {
        if (state.background === "idb:" + removeId) {
          state.background = "";
          saveState();
          applyState();
        }
        renderUploads();
      });
      return;
    }
    if (!choice) return;
    state.background = "idb:" + choice.getAttribute("data-id");
    saveState();
    applyState();
    renderUploads();
  });

  window.addEventListener("resize", function () {
    if (!state.season) return;
    resizeSeasonCanvas();
    seasonParticles = createParticles(seasonInfo.key);
  });

  function closePanel() {
    panel.setAttribute("hidden", "");
    toggle.setAttribute("aria-expanded", "false");
  }

  function setStatus(text) {
    if (statusNode) statusNode.textContent = text || "";
  }

  function normalizeBlur(value) {
    if (value === true) return 18;
    var amount = Number(value);
    if (!isFinite(amount)) return 0;
    return Math.max(0, Math.min(20, Math.round(amount)));
  }

  function siteDefaults() {
    var d = window.SITE_APPEARANCE || {};
    return {
      background: typeof d.background === "string" ? d.background : "",
      blur: normalizeBlur(d.blur),
      season: !!d.season
    };
  }

  function loadState() {
    var defaults = siteDefaults();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      var saved = JSON.parse(raw || "{}");
      return {
        background: typeof saved.background === "string" ? saved.background : defaults.background,
        blur: saved.blur === undefined ? defaults.blur : normalizeBlur(saved.blur),
        season: saved.season === undefined ? defaults.season : !!saved.season
      };
    } catch (error) {
      return defaults;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyBlur() {
    var layer = elWallpaper();
    state.blur = normalizeBlur(state.blur);
    if (blurRange) {
      blurRange.value = String(state.blur);
      var percent = (state.blur / 20) * 100;
      blurRange.style.background = "linear-gradient(90deg, #1d6fb8 " + percent + "%, #d5d8de " + percent + "%)";
    }
    if (blurValue) blurValue.textContent = state.blur + "px";
    if (!layer) return;
    if (state.blur > 0) {
      layer.style.filter = "blur(" + state.blur + "px)";
      layer.style.transform = "scale(" + (1 + state.blur / 160).toFixed(3) + ")";
    } else {
      layer.style.filter = "";
      layer.style.transform = "";
    }
  }

  function applyState() {
    var layer = elWallpaper();
    if (!layer) return;
    applyBlur();
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = "";
    }
    if (!state.background) {
      layer.style.backgroundImage = "";
      layer.classList.remove("is-on");
      layer.removeAttribute("hidden");
      document.body.classList.remove("has-bg");
      markActive();
      syncSeason();
      return;
    }
    if (state.background.indexOf("idb:") === 0) {
      var id = state.background.slice(4);
      withStore("readonly", function (store) {
        return store.get(id);
      }).then(function (record) {
        if (!record || state.background !== "idb:" + id) {
          if (!record) {
            state.background = "";
            saveState();
            applyState();
          }
          return;
        }
        activeObjectUrl = URL.createObjectURL(record.blob);
        showWallpaper(activeObjectUrl);
      }).catch(function () {
        state.background = "";
        saveState();
        applyState();
      });
    } else {
      showWallpaper(state.background);
    }
    syncSeason();
  }

  function showWallpaper(url) {
    var layer = elWallpaper();
    if (!layer || !url) return;
    layer.style.backgroundImage = "url(\"" + String(url).replace(/"/g, "\\\"") + "\")";
    layer.removeAttribute("hidden");
    layer.classList.add("is-on");
    document.body.classList.add("has-bg");
    if (veil) veil.classList.add("is-on");
    markActive();
  }

  window.SiteAppearance = {
    refresh: function () {
      state = loadState();
      if (seasonToggle) seasonToggle.checked = state.season;
      applyState();
    }
  };

  document.addEventListener("turbo:load", function () {
    if (window.SiteAppearance) window.SiteAppearance.refresh();
  });

  function createPager(root) {
    if (!root) return null;
    var grid = root.querySelector(".site-bg-grid");
    var controls = root.querySelector(".site-bg-page-controls");
    var label = root.querySelector(".site-bg-page-label");
    var buttons = root.querySelectorAll(".site-bg-page-btn");
    if (!grid || !controls || !label) return null;

    var page = 0;
    function items() {
      return Array.prototype.slice.call(grid.querySelectorAll(".site-bg-choice"));
    }

    function render() {
      var list = items();
      var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (page > totalPages - 1) page = totalPages - 1;
      if (page < 0) page = 0;
      list.forEach(function (item, index) {
        var onPage = Math.floor(index / PAGE_SIZE) === page;
        item.classList.toggle("is-page-hidden", !onPage);
      });
      label.textContent = page + 1 + " / " + totalPages;
      if (list.length > PAGE_SIZE) {
        controls.removeAttribute("hidden");
      } else {
        controls.setAttribute("hidden", "");
      }
      buttons.forEach(function (button) {
        var dir = Number(button.getAttribute("data-dir") || 0);
        button.disabled = (dir < 0 && page <= 0) || (dir > 0 && page >= totalPages - 1);
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        page += Number(button.getAttribute("data-dir") || 0);
        render();
      });
    });

    return {
      render: render,
      showItem: function (item) {
        var list = items();
        var index = list.indexOf(item);
        if (index < 0) return;
        page = Math.floor(index / PAGE_SIZE);
        render();
      }
    };
  }

  function markActive() {
    if (defaultButton) {
      defaultButton.classList.toggle("is-active", !state.background);
    }
    presetButtons.forEach(function (button) {
      var src = button.getAttribute("data-src") || "";
      var active = src === state.background;
      button.classList.toggle("is-active", active);
      if (active && presetPager) presetPager.showItem(button);
    });
    if (!uploadList) return;
    uploadList.querySelectorAll(".site-bg-choice").forEach(function (button) {
      var active = "idb:" + button.getAttribute("data-id") === state.background;
      button.classList.toggle("is-active", active);
      if (active && uploadPager) uploadPager.showItem(button);
    });
  }

  function renderUploads() {
    previewUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    previewUrls = [];
    withStore("readonly", function (store) {
      return store.getAll();
    }).then(function (records) {
      records.sort(function (a, b) {
        return b.created - a.created;
      });
      uploadList.innerHTML = "";
      if (emptyHint) emptyHint.hidden = records.length > 0;
      records.forEach(function (record) {
        var url = URL.createObjectURL(record.blob);
        previewUrls.push(url);
        var button = document.createElement("button");
        button.type = "button";
        button.className = "site-bg-choice" + (state.background === "idb:" + record.id ? " is-active" : "");
        button.setAttribute("data-id", record.id);
        button.title = record.name || "已上传背景";
        var image = document.createElement("img");
        image.src = url;
        image.alt = record.name || "已上传背景";
        var remove = document.createElement("span");
        remove.className = "site-bg-delete";
        remove.setAttribute("data-id", record.id);
        remove.textContent = "×";
        remove.title = "删除";
        button.appendChild(image);
        button.appendChild(remove);
        uploadList.appendChild(button);
      });
      if (uploadPager) uploadPager.render();
      markActive();
    }).catch(function () {
      if (emptyHint) emptyHint.hidden = false;
    });
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function withStore(mode, worker) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var request = worker(tx.objectStore(STORE));
        tx.oncomplete = function () {
          resolve(request ? request.result : undefined);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error("aborted"));
        };
      });
    });
  }

  function currentSeason() {
    var month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return { key: "spring", label: "春季", effect: "飘落花瓣" };
    if (month >= 6 && month <= 8) return { key: "summer", label: "夏季", effect: "升起光点" };
    if (month >= 9 && month <= 11) return { key: "autumn", label: "秋季", effect: "飘落枫叶" };
    return { key: "winter", label: "冬季", effect: "落下雪花" };
  }

  function syncSeason() {
    if (seasonFrame) {
      cancelAnimationFrame(seasonFrame);
      seasonFrame = 0;
    }
    if (!state.season) {
      seasonCanvas.setAttribute("hidden", "");
      seasonParticles = [];
      return;
    }
    seasonCanvas.removeAttribute("hidden");
    resizeSeasonCanvas();
    seasonParticles = createParticles(seasonInfo.key);
    drawSeason();
  }

  function resizeSeasonCanvas() {
    if (!state.season) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    seasonCanvas.width = Math.floor(window.innerWidth * ratio);
    seasonCanvas.height = Math.floor(window.innerHeight * ratio);
    var ctx = seasonCanvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function createParticles(season) {
    var count = Math.round(window.innerWidth / 42);
    var list = [];
    for (var i = 0; i < count; i += 1) {
      list.push(makeParticle(season, true));
    }
    return list;
  }

  function makeParticle(season, anywhere) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    return {
      season: season,
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -20 - Math.random() * height * 0.3,
      size: 4 + Math.random() * 8,
      speed: 0.6 + Math.random() * 1.6,
      drift: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.04,
      rotation: Math.random() * Math.PI * 2,
      color: particleColor(season)
    };
  }

  function particleColor(season) {
    if (season === "spring") return ["#f7b7c8", "#f48fb1", "#ffe4ec"][Math.floor(Math.random() * 3)];
    if (season === "summer") return ["#ffe08a", "#fff4c2", "#ffd166"][Math.floor(Math.random() * 3)];
    if (season === "autumn") return ["#e07a3d", "#c4472c", "#e6b325"][Math.floor(Math.random() * 3)];
    return "rgba(255,255,255,0.92)";
  }

  function drawSeason() {
    var ctx = seasonCanvas.getContext("2d");
    var width = window.innerWidth;
    var height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    seasonParticles.forEach(function (particle) {
      particle.drift += 0.01;
      particle.rotation += particle.spin;
      particle.x += Math.sin(particle.drift) * 0.6;
      if (particle.season === "summer") {
        particle.y -= particle.speed * 0.55;
        if (particle.y < -20) Object.assign(particle, makeParticle(particle.season, false), { y: height + 10 });
      } else {
        particle.y += particle.speed;
        if (particle.y > height + 20) Object.assign(particle, makeParticle(particle.season, false));
      }
      drawParticle(ctx, particle);
    });
    seasonFrame = requestAnimationFrame(drawSeason);
  }

  function drawParticle(ctx, particle) {
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    if (particle.season === "spring") {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 0.55, particle.size * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (particle.season === "summer") {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (particle.season === "autumn") {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.moveTo(0, -particle.size);
      ctx.quadraticCurveTo(particle.size * 0.8, -particle.size * 0.15, 0, particle.size);
      ctx.quadraticCurveTo(-particle.size * 0.8, -particle.size * 0.15, 0, -particle.size);
      ctx.fill();
    } else {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
})();
