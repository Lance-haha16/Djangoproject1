(function () {
  var root = document.getElementById("living-app");
  var grid = document.getElementById("living-grid");
  var empty = document.getElementById("living-empty");
  var input = document.getElementById("living-search");
  if (!root || !grid) return;

  var dataUrl = root.getAttribute("data-devices") || "/static/living/devices.json";

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function searchBlob(device) {
    var specs = (device.specs || []).map(function (item) {
      return (item.label || "") + " " + (item.value || "");
    }).join(" ");
    return [device.name, device.tagline, specs].join(" ").toLowerCase();
  }

  function render(devices) {
    grid.innerHTML = "";
    devices.forEach(function (device) {
      var card = document.createElement("article");
      card.className = "living-card";
      card.setAttribute("data-search", searchBlob(device));

      var specsHtml = (device.specs || []).map(function (item) {
        return (
          '<div class="living-spec">' +
            '<span class="living-spec-label">' + escapeHtml(item.label) + "</span>" +
            '<span class="living-spec-value">' + escapeHtml(item.value) + "</span>" +
          "</div>"
        );
      }).join("");

      card.innerHTML =
        '<div class="living-card-media">' +
          '<img src="' + escapeHtml(device.image) + '" alt="' + escapeHtml(device.name) + '" loading="lazy">' +
        "</div>" +
        '<div class="living-card-body">' +
          '<h2 class="living-card-name">' + escapeHtml(device.name) + "</h2>" +
          '<p class="living-card-tagline">' + escapeHtml(device.tagline || "") + "</p>" +
          '<div class="living-specs">' + specsHtml + "</div>" +
        "</div>";

      grid.appendChild(card);
    });
  }

  function filter() {
    var keyword = (input.value || "").trim().toLowerCase();
    var cards = grid.querySelectorAll(".living-card");
    var visible = 0;
    cards.forEach(function (card) {
      var blob = card.getAttribute("data-search") || "";
      var show = !keyword || blob.indexOf(keyword) !== -1;
      card.classList.toggle("is-hidden", !show);
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  fetch(dataUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      var devices = Array.isArray(data) ? data : [];
      if (!devices.length) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = "还没有设备，去 static/living/devices.json 添加吧。";
        }
        return;
      }
      render(devices);
      if (input) input.addEventListener("input", filter);
    })
    .catch(function () {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "设备列表加载失败。";
      }
    });
})();
