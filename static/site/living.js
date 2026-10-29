(function () {
  var root = document.getElementById("living-app");
  var grid = document.getElementById("living-grid");
  var empty = document.getElementById("living-empty");
  var input = document.getElementById("living-search");
  var roomsEl = document.getElementById("living-rooms");
  var summary = document.getElementById("living-summary");
  if (!root || !grid) return;

  var dataUrl = root.getAttribute("data-devices") || "/static/living/devices.json";
  var POWER_KEY = "living.power.v1";
  var devices = [];
  var activeRoom = "全部";

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadPower() {
    try {
      return JSON.parse(localStorage.getItem(POWER_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function savePower(map) {
    localStorage.setItem(POWER_KEY, JSON.stringify(map));
  }

  function searchBlob(device) {
    var specs = (device.specs || [])
      .map(function (item) {
        return (item.label || "") + " " + (item.value || "");
      })
      .join(" ");
    return [device.name, device.tagline, device.room, specs].join(" ").toLowerCase();
  }

  function roomsOf(list) {
    var set = {};
    list.forEach(function (d) {
      set[d.room || "客厅"] = true;
    });
    return ["全部"].concat(Object.keys(set));
  }

  function renderRooms(list) {
    if (!roomsEl) return;
    var rooms = roomsOf(list);
    roomsEl.innerHTML = rooms
      .map(function (room) {
        return (
          '<button type="button" class="living-room-chip' +
          (room === activeRoom ? " is-active" : "") +
          '" data-room="' +
          escapeHtml(room) +
          '">' +
          escapeHtml(room) +
          "</button>"
        );
      })
      .join("");
    roomsEl.querySelectorAll(".living-room-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeRoom = btn.getAttribute("data-room") || "全部";
        roomsEl.querySelectorAll(".living-room-chip").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        filter();
      });
    });
  }

  function updateSummary(list) {
    if (!summary) return;
    var onCount = 0;
    var power = loadPower();
    list.forEach(function (d) {
      var id = d.id || d.name;
      var on = power[id];
      if (typeof on === "undefined") on = true;
      if (on && d.online !== false) onCount += 1;
    });
    summary.textContent =
      list.length + " 个设备 · " + onCount + " 个开启";
  }

  function render(list) {
    var power = loadPower();
    grid.innerHTML = "";
    list.forEach(function (device, index) {
      var id = device.id || device.name || String(index);
      var online = device.online !== false;
      var on = power[id];
      if (typeof on === "undefined") on = online;
      var room = device.room || "客厅";
      var statusText = device.tagline || (online ? "在线" : "离线");

      var card = document.createElement("article");
      card.className =
        "living-card" +
        (on ? "" : " is-off") +
        (online ? "" : " is-offline");
      card.setAttribute("data-search", searchBlob(device));
      card.setAttribute("data-room", room);
      card.setAttribute("data-id", id);

      var pills = (device.specs || [])
        .slice(0, 3)
        .map(function (item) {
          return (
            '<span class="living-pill">' +
            escapeHtml(item.label) +
            " <strong>" +
            escapeHtml(item.value) +
            "</strong></span>"
          );
        })
        .join("");

      card.innerHTML =
        '<div class="living-card-main">' +
        '<p class="living-card-room">' +
        escapeHtml(room) +
        "</p>" +
        '<h2 class="living-card-name">' +
        escapeHtml(device.name) +
        "</h2>" +
        '<p class="living-card-status"><span class="is-dot"></span>' +
        escapeHtml(online ? statusText : "设备已离线") +
        "</p>" +
        "</div>" +
        '<div class="living-card-side">' +
        '<div class="living-card-media">' +
        '<img src="' +
        escapeHtml(device.image) +
        '" alt="' +
        escapeHtml(device.name) +
        '" loading="lazy">' +
        "</div>" +
        '<button type="button" class="living-switch' +
        (on ? " is-on" : "") +
        '" data-power="' +
        escapeHtml(id) +
        '" aria-label="电源" ' +
        (online ? "" : "disabled") +
        "></button>" +
        "</div>" +
        (pills ? '<div class="living-card-specs">' + pills + "</div>" : "");

      grid.appendChild(card);
    });

    grid.querySelectorAll(".living-switch").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        var id = btn.getAttribute("data-power");
        var map = loadPower();
        var next = !btn.classList.contains("is-on");
        map[id] = next;
        savePower(map);
        btn.classList.toggle("is-on", next);
        var card = btn.closest(".living-card");
        if (card) card.classList.toggle("is-off", !next);
        updateSummary(devices);
      });
    });

    updateSummary(list);
  }

  function filter() {
    var keyword = (input && input.value ? input.value : "").trim().toLowerCase();
    var cards = grid.querySelectorAll(".living-card");
    var visible = 0;
    cards.forEach(function (card) {
      var blob = card.getAttribute("data-search") || "";
      var room = card.getAttribute("data-room") || "";
      var roomOk = activeRoom === "全部" || room === activeRoom;
      var textOk = !keyword || blob.indexOf(keyword) !== -1;
      var show = roomOk && textOk;
      card.classList.toggle("is-hidden", !show);
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  function normalize(list) {
    return (list || []).map(function (d) {
      return {
        id: d.id || d.slug || d.name,
        name: d.name || "未命名设备",
        tagline: d.tagline || "",
        room: d.room || "客厅",
        online: d.online !== false,
        image: d.image || "",
        specs: d.specs || [],
      };
    });
  }

  fetch(dataUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      devices = normalize(Array.isArray(data) ? data : []);
      if (!devices.length) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = "还没有设备，去工作台「家居」添加吧。";
        }
        if (summary) summary.textContent = "暂无设备";
        return;
      }
      renderRooms(devices);
      render(devices);
      if (input) input.addEventListener("input", filter);
      filter();
    })
    .catch(function () {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "设备列表加载失败。";
      }
      if (summary) summary.textContent = "加载失败";
    });
})();
