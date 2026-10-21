(function () {
  const dataEl = document.getElementById("archive-data");
  const stage = document.getElementById("archive-stage");
  const canvas = document.getElementById("archive-canvas");
  const nodesEl = document.getElementById("archive-nodes");
  if (!dataEl || !stage || !canvas || !nodesEl) return;

  let events = [];
  try {
    events = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    events = [];
  }
  if (!events.length) {
    nodesEl.innerHTML =
      '<p class="archive-card-empty" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">还没有可归档的足迹。</p>';
    return;
  }

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const UNIT = 360;
  // river line spans full canvas; cards stay inset so they aren't clipped
  const CONTENT_INSET = 140;
  const STEM = 32;
  const CARD_GAP = 12;
  // keep river in the middle band so cards above/below are not clipped
  const SAFE_TOP = 280;
  const SAFE_BOTTOM = 280;

  let particles = [];
  let pathPoints = [];
  let nodePositions = [];
  let branches = [];
  let pathWidth = 0;
  let pathHeight = 0;
  let riverLen = 0;
  let nextSpawnAt = 0;
  let animId = 0;
  let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pathY(t, h) {
    const mid = h * 0.5;
    const band = Math.max(120, h - SAFE_TOP - SAFE_BOTTOM);
    // use most of the safe band so the river really snakes
    const amp = band * 0.48;
    const y =
      mid +
      Math.sin(t * Math.PI * 2.6 + 0.2) * amp +
      Math.sin(t * Math.PI * 5.4 + 1.15) * (amp * 0.42) +
      Math.sin(t * Math.PI * 9.8 + 0.55) * (amp * 0.22) +
      Math.sin(t * Math.PI * 16.2 + 2.05) * (amp * 0.1);
    return Math.min(h - SAFE_BOTTOM, Math.max(SAFE_TOP, y));
  }

  function pathX(t, w) {
    return t * w;
  }

  function buildPath(w, h) {
    const pts = [];
    const steps = Math.max(280, Math.floor(w / 2.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: pathX(t, w), y: pathY(t, h), t });
    }
    return pts;
  }

  function buildBranches(pts) {
    const out = [];
    const count = Math.min(12, Math.max(5, events.length + 2));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + 0.4) / (count + 1)) * (pts.length - 1));
      const p = pts[idx];
      const next = pts[Math.min(idx + 10, pts.length - 1)];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const side = i % 2 === 0 ? 1 : -1;
      const reach = 28 + (i % 4) * 12;
      out.push({
        x0: p.x,
        y0: p.y,
        cx: p.x + dx * 0.4 + nx * side * reach * 0.5,
        cy: p.y + dy * 0.4 + ny * side * reach * 0.5,
        x1: p.x + dx * 0.12 + nx * side * reach,
        y1: p.y + dy * 0.12 + ny * side * reach,
        alpha: 0.18 + (i % 3) * 0.06,
      });
    }
    return out;
  }

  function sampleAt(t, pts) {
    if (!pts.length) return { x: 0, y: 0 };
    const i = Math.min(pts.length - 1, Math.max(0, Math.round(t * (pts.length - 1))));
    return pts[i];
  }

  function polylineLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return total;
  }

  function pointAlong(pts, dist) {
    if (!pts.length) return { x: 0, y: 0 };
    let remain = dist;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const seg = Math.hypot(dx, dy);
      if (remain <= seg) {
        const r = seg ? remain / seg : 0;
        return {
          x: pts[i - 1].x + dx * r,
          y: pts[i - 1].y + dy * r,
        };
      }
      remain -= seg;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y };
  }

  function makeParticle(atStart) {
    return {
      dist: atStart ? 0 : Math.random() * Math.max(riverLen, 1),
      speed: 140,
      size: 1.2 + Math.random() * 1.8,
      alpha: 0.28 + Math.random() * 0.4,
      trail: Math.random() > 0.55,
    };
  }

  function scheduleNextSpawn(now) {
    // sparse random gaps: ~1.4s–4.2s
    const minGap = reducedMotion ? 2800 : 1400;
    const span = reducedMotion ? 2400 : 2800;
    nextSpawnAt = now + minGap + Math.random() * span;
  }

  function spawnParticles(totalLen) {
    riverLen = totalLen;
    particles = [];
    if (!reducedMotion && Math.random() < 0.55) {
      particles.push(makeParticle(false));
    }
    scheduleNextSpawn(performance.now());
  }

  function updateParticles(now, totalLen) {
    if (!reducedMotion && now >= nextSpawnAt) {
      particles.push(makeParticle(true));
      scheduleNextSpawn(now);
    }

    const alive = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!reducedMotion) p.dist += p.speed * 0.016;
      if (p.dist < totalLen) alive.push(p);
    }
    particles = alive;
  }

  function drawRiver(w, h, time) {
    ctx.clearRect(0, 0, w, h);

    // soft cyan-blue halo
    ctx.save();
    ctx.beginPath();
    pathPoints.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = "rgba(125, 211, 252, 0.38)";
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.filter = "blur(12px)";
    ctx.stroke();
    ctx.restore();

    // diverging filaments
    branches.forEach((b) => {
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.quadraticCurveTo(b.cx, b.cy, b.x1, b.y1);
      ctx.strokeStyle = `rgba(186, 230, 253, ${b.alpha * 0.85})`;
      ctx.lineWidth = 1.15;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x1, b.y1, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha + 0.15})`;
      ctx.fill();
    });

    // main river
    ctx.beginPath();
    pathPoints.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.45)");
    grad.addColorStop(0.5, "rgba(224, 242, 254, 0.95)");
    grad.addColorStop(1, "rgba(59, 130, 246, 0.55)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // bright core
    ctx.beginPath();
    pathPoints.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // nodes
    nodePositions.forEach((n) => {
      const pulse = 0.75 + Math.sin(time * 0.0022 + n.x * 0.012) * 0.25;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 12 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(186, 230, 253, 0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, 5.4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(125, 211, 252, 0.95)";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });

    const totalLen = riverLen || polylineLength(pathPoints);
    updateParticles(time, totalLen);
    particles.forEach((p) => {
      const pt = pointAlong(pathPoints, p.dist);
      if (p.trail) {
        const back = pointAlong(pathPoints, Math.max(0, p.dist - 22));
        ctx.beginPath();
        ctx.moveTo(back.x, back.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = `rgba(219, 234, 254, ${p.alpha * 0.5})`;
        ctx.lineWidth = p.size * 0.75;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.fill();
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function kindIcon(kind) {
    if (kind === "message") return "fi fi-rr-comment";
    if (kind === "project") return "fi fi-rr-edit-alt";
    if (kind === "music") return "fi fi-rs-music-alt";
    if (kind === "idea") return "fi fi-rr-bulb";
    if (kind === "living") return "fi fi-rr-bed";
    if (kind === "ai") return "fi fi-rr-sparkles";
    return "fi fi-rr-document";
  }

  function kindLabel(kind) {
    const map = {
      article: "文章",
      message: "留言",
      project: "项目",
      music: "音乐",
      idea: "灵感",
      living: "家居",
      ai: "AI",
      manual: "手记",
    };
    return map[kind] || "足迹";
  }

  function kindClass(kind) {
    if (kind === "ai") return "is-ai";
    if (kind === "message") return "is-message";
    if (kind === "project") return "is-project";
    return "";
  }

  function buildCard(event) {
    const cover = event.cover
      ? `<img class="archive-card-cover" src="${escapeHtml(event.cover)}" alt="">`
      : `<div class="archive-card-cover is-placeholder"><i class="${kindIcon(event.kind)}"></i></div>`;

    const metaBits = [];
    if (event.kind === "article" || Number(event.views) > 0) {
      metaBits.push(`<span><i class="fa-regular fa-eye"></i>${Number(event.views) || 0}</span>`);
    }
    if (event.kind === "message" || Number(event.likes) > 0) {
      metaBits.push(`<span><i class="fa-regular fa-heart"></i>${Number(event.likes) || 0}</span>`);
    }
    if (!metaBits.length) {
      metaBits.push(`<span>${escapeHtml(kindLabel(event.kind))}</span>`);
    }

    return (
      `<a class="archive-card" href="${escapeHtml(event.url || "#")}">` +
      cover +
      `<div class="archive-card-body">` +
      `<div class="archive-card-top">` +
      `<p class="archive-card-date"><i class="fi fi-rs-calendar"></i>${escapeHtml(event.date || "")}</p>` +
      `<span class="archive-card-kind ${kindClass(event.kind)}">${escapeHtml(kindLabel(event.kind))}</span>` +
      `</div>` +
      `<h3 class="archive-card-title">${escapeHtml(event.title || "")}</h3>` +
      `<p class="archive-card-snippet">${escapeHtml(event.snippet || "")}</p>` +
      `<div class="archive-card-meta">${metaBits.join("")}</div>` +
      `</div></a>`
    );
  }

  function placeCards() {
    nodesEl.innerHTML = "";
    nodePositions.forEach((n, idx) => {
      const event = events[idx];
      const above = idx % 2 === 0;
      const item = document.createElement("div");
      item.className = "archive-item " + (above ? "is-above" : "is-below");
      item.style.left = n.x + "px";

      const stem = document.createElement("div");
      stem.className = "archive-stem";
      stem.style.height = STEM + "px";

      const date = document.createElement("div");
      date.className = "archive-node-date";
      date.textContent = event.date || "";

      item.innerHTML = buildCard(event);
      item.appendChild(stem);
      item.appendChild(date);
      nodesEl.appendChild(item);

      const card = item.querySelector(".archive-card");
      if (card) card.style.animationDelay = idx * 0.07 + "s";

      requestAnimationFrame(() => {
        const cardH = (card && card.offsetHeight) || 200;
        const pad = 12;
        if (above) {
          // card → stem → node
          let top = n.y - STEM - CARD_GAP - cardH;
          top = Math.max(pad, top);
          item.style.top = top + "px";
          stem.style.top = cardH + CARD_GAP + "px";
          stem.style.bottom = "auto";
          // stretch stem if node is farther due to clamp
          const stemLen = Math.max(STEM, n.y - (top + cardH + CARD_GAP));
          stem.style.height = stemLen + "px";
        } else {
          // node → stem → card
          let top = n.y;
          const blockH = STEM + CARD_GAP + cardH;
          if (top + blockH > pathHeight - pad) {
            top = Math.max(pad, pathHeight - pad - blockH);
          }
          item.style.top = top + "px";
          stem.style.top = "0px";
          const stemLen = Math.max(STEM, n.y - top + STEM * 0.2);
          stem.style.height = Math.min(stemLen, STEM + 40) + "px";
          if (card) card.style.marginTop = STEM + CARD_GAP + "px";
        }
      });
    });
  }

  function layout() {
    pathHeight = stage.clientHeight || 980;
    pathWidth =
      CONTENT_INSET * 2 + Math.max(events.length - 1, 1) * UNIT;
    // ensure stage can scroll a bit even with few events
    pathWidth = Math.max(pathWidth, stage.clientWidth + 80);

    canvas.style.width = pathWidth + "px";
    canvas.style.height = pathHeight + "px";
    canvas.width = Math.floor(pathWidth * dpr);
    canvas.height = Math.floor(pathHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pathPoints = buildPath(pathWidth, pathHeight);
    branches = buildBranches(pathPoints);

    const t0 = CONTENT_INSET / pathWidth;
    const t1 = 1 - CONTENT_INSET / pathWidth;
    nodePositions = events.map((_, i) => {
      const t =
        events.length === 1 ? 0.5 : t0 + (i / (events.length - 1)) * (t1 - t0);
      const p = sampleAt(t, pathPoints);
      return { x: p.x, y: p.y };
    });
    spawnParticles(polylineLength(pathPoints));
    placeCards();
  }

  function tick(now) {
    drawRiver(pathWidth, pathHeight, now);
    animId = requestAnimationFrame(tick);
  }

  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".archive-card")) return;
    dragging = true;
    stage.classList.add("is-dragging");
    startX = e.clientX;
    startScroll = stage.scrollLeft;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    stage.scrollLeft = startScroll - (e.clientX - startX);
  });
  function endDrag() {
    dragging = false;
    stage.classList.remove("is-dragging");
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  layout();
  stage.scrollLeft = Math.max(0, pathWidth - stage.clientWidth);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(tick);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });
})();
