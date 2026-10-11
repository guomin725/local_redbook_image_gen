/* GPT Image 2 提示词画廊 — 纯静态，无构建依赖 */
(function () {
  "use strict";

  var DATA = window.GALLERY_DATA && window.GALLERY_DATA.prompts;
  if (!DATA || !DATA.length) {
    document.getElementById("tagline").textContent = "数据加载失败：未找到 data.js";
    return;
  }

  var CATEGORY_ICONS = {
    "精选": "🔥",
    "个人资料 / 头像": "👤",
    "社交媒体帖子": "💬",
    "信息图 / 教育视觉图": "📊",
    "YouTube 缩略图": "▶️",
    "漫画 / 故事板": "🎨",
    "产品营销": "🛍️",
    "电商主图": "📦",
    "游戏素材": "🎮",
    "海报 / 传单": "🖼️",
    "App / 网页设计": "📱",
  };
  var LANG_LABELS = { zh: "中文", en: "English", ja: "日本語" };

  var state = { q: "", cat: "", lang: "", sort: "date-desc", openId: null };

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), emptyEl = $("empty");

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(true); }
      catch (e) { done(false); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        fallback
      );
    } else fallback();
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1800);
  }

  /* ---------- 状态 ↔ URL hash ---------- */
  function readHash() {
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    state.q = h.get("q") || "";
    state.cat = h.get("cat") || "";
    state.lang = h.get("lang") || "";
    state.sort = h.get("sort") || "date-desc";
    state.openId = h.get("p") ? Number(h.get("p")) : null;
  }

  var hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var h = new URLSearchParams();
      if (state.q) h.set("q", state.q);
      if (state.cat) h.set("cat", state.cat);
      if (state.lang) h.set("lang", state.lang);
      if (state.sort !== "date-desc") h.set("sort", state.sort);
      if (state.openId) h.set("p", String(state.openId));
      var s = h.toString();
      history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
    }, 200);
  }

  /* ---------- 数据 ---------- */
  var categoryOrder = [];
  var categoryCounts = {};
  var langCounts = {};
  DATA.forEach(function (p) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    if (p.lang) langCounts[p.lang] = (langCounts[p.lang] || 0) + 1;
  });
  // 分类顺序：精选最前，其余按数量降序
  categoryOrder = Object.keys(categoryCounts).sort(function (a, b) {
    if (a === "精选") return -1;
    if (b === "精选") return 1;
    return categoryCounts[b] - categoryCounts[a];
  });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.filter(function (p) {
      if (state.cat && p.category !== state.cat) return false;
      if (state.lang && p.lang !== state.lang) return false;
      if (q) {
        var hay = (p.title + "\n" + p.description + "\n" + p.prompt + "\n" +
          (p.author ? p.author.name : "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var cmp = {
      "date-desc": function (a, b) { return (b.date || "").localeCompare(a.date || ""); },
      "date-asc": function (a, b) { return (a.date || "").localeCompare(b.date || ""); },
      "featured": function (a, b) {
        var fa = a.category === "精选" ? 0 : 1, fb = b.category === "精选" ? 0 : 1;
        return fa - fb || (b.date || "").localeCompare(a.date || "");
      },
    }[state.sort] || function () { return 0; };
    return list.slice().sort(cmp);
  }

  /* ---------- 筛选 chips ---------- */
  function renderChips() {
    var catRow = $("category-chips");
    var html = '<button type="button" class="chip' + (state.cat ? "" : " active") +
      '" data-cat="">全部 <span class="count">' + DATA.length + "</span></button>";
    categoryOrder.forEach(function (c) {
      var active = state.cat === c ? " active" : "";
      var icon = CATEGORY_ICONS[c] || "";
      html += '<button type="button" class="chip' + active + '" data-cat="' +
        escapeHtml(c) + '">' + icon + " " + escapeHtml(c) +
        ' <span class="count">' + categoryCounts[c] + "</span></button>";
    });
    catRow.innerHTML = html;

    var langRow = $("lang-chips");
    var lhtml = '<button type="button" class="chip' + (state.lang ? "" : " active") +
      '" data-lang="">全部语言</button>';
    Object.keys(langCounts).forEach(function (l) {
      var active = state.lang === l ? " active" : "";
      lhtml += '<button type="button" class="chip' + active + '" data-lang="' + l +
        '">' + (LANG_LABELS[l] || l) + " <span class=\"count\">" + langCounts[l] + "</span></button>";
    });
    langRow.innerHTML = lhtml;
  }

  /* ---------- 网格 ---------- */
  function cardHtml(p) {
    var img = p.images[0];
    var meta = [];
    if (p.date) meta.push(escapeHtml(p.date));
    if (p.langName) meta.push(escapeHtml(p.langName));
    var flags = "";
    if (p.category === "精选") flags += '<span class="featured-flag">🔥 精选</span>';
    if (p.images.length > 1) flags += '<span class="multi-flag">📷 ' + p.images.length + "</span>";
    return (
      '<figure class="card" data-id="' + p.id + '" tabindex="0" role="button" aria-label="' +
      escapeHtml(p.title) + '">' +
      '<div class="card-img-wrap">' +
      '<img loading="lazy" decoding="async" alt="' + escapeHtml(p.title) + '" src="' + escapeHtml(img) + '">' +
      flags +
      '<button type="button" class="card-copy" data-copy="' + p.id + '">📋 复制提示词</button>' +
      '<figcaption class="card-overlay">' +
      '<div class="card-title">' + escapeHtml(p.title) + "</div>" +
      '<div class="card-meta"><span class="cat-badge">' +
      (CATEGORY_ICONS[p.category] || "") + " " + escapeHtml(p.category) +
      "</span><span>" + meta.join(" · ") + "</span></div>" +
      "</figcaption></div></figure>"
    );
  }

  function renderGrid() {
    var list = filtered();
    var html = list.map(cardHtml).join("");
    grid.innerHTML = html;
    emptyEl.hidden = list.length > 0;
    $("result-count").textContent =
      "共 " + list.length + " 条" +
      (list.length !== DATA.length ? "（全部 " + DATA.length + " 条）" : "");
    // 图片渐显
    grid.querySelectorAll(".card-img-wrap img").forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) img.classList.add("loaded");
      else {
        img.addEventListener("load", function () { img.classList.add("loaded"); });
        img.addEventListener("error", function () {
          var w = img.closest(".card-img-wrap");
          if (w) w.style.minHeight = "160px";
        });
      }
    });
  }

  /* ---------- 弹窗 ---------- */
  function openModal(id) {
    var p = null;
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) { p = DATA[i]; break; }
    if (!p) return;

    $("modal-images").innerHTML = p.images.map(function (src, i) {
      return '<img loading="eager" decoding="async" alt="' + escapeHtml(p.title) +
        " - 图 " + (i + 1) + '" src="' + escapeHtml(src) + '">';
    }).join("");

    var metaTop = [];
    if (p.category) {
      metaTop.push('<span class="meta-item">' + (CATEGORY_ICONS[p.category] || "") + " " +
        escapeHtml(p.category) + "</span>");
    }
    if (p.langName) metaTop.push('<span class="meta-item">🌐 ' + escapeHtml(p.langName) + "</span>");
    if (p.date) metaTop.push('<span class="meta-item">📅 ' + escapeHtml(p.date) + "</span>");
    if (p.raycast) metaTop.push('<span class="meta-item">🚀 Raycast 友好</span>');
    $("modal-meta-top").innerHTML = metaTop.join("");

    $("modal-title").textContent = p.title;
    $("modal-desc").textContent = p.description || "";
    $("modal-prompt").textContent = p.prompt;

    var links = [];
    if (p.author) {
      links.push('✍️ 作者：<a href="' + escapeHtml(p.author.url) +
        '" target="_blank" rel="noopener">' + escapeHtml(p.author.name) + "</a>");
    }
    if (p.source) {
      links.push('🔗 来源：<a href="' + escapeHtml(p.source.url) +
        '" target="_blank" rel="noopener">' + escapeHtml(p.source.label) + "</a>");
    }
    links.push('⚡ <a href="https://youmind.com/zh-CN/gpt-image-2-prompts?id=' + p.id +
      '" target="_blank" rel="noopener">在 YouMind 打开</a>');
    $("modal-links").innerHTML = links.map(function (l) {
      return "<span>" + l + "</span>";
    }).join("");

    var copyBtn = $("modal-copy");
    copyBtn.classList.remove("copied");
    copyBtn.textContent = "复制";

    $("modal-backdrop").hidden = false;
    document.body.classList.add("modal-open");
    state.openId = id;
    writeHash();
  }

  function closeModal() {
    $("modal-backdrop").hidden = true;
    document.body.classList.remove("modal-open");
    state.openId = null;
    writeHash();
  }

  /* ---------- 事件 ---------- */
  function bindCopy(btn, getText) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      copyText(getText(), function (ok) {
        if (ok) {
          toast("已复制到剪贴板");
          btn.classList.add("copied");
          btn.textContent = "✓ 已复制";
          setTimeout(function () {
            btn.classList.remove("copied");
            btn.textContent = "复制";
          }, 1600);
        } else toast("复制失败，请手动选择文本");
      });
    });
  }

  $("category-chips").addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn) return;
    state.cat = btn.dataset.cat;
    renderChips(); renderGrid(); writeHash();
  });

  $("lang-chips").addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn) return;
    state.lang = btn.dataset.lang;
    renderChips(); renderGrid(); writeHash();
  });

  var searchTimer = null;
  $("search").addEventListener("input", function () {
    $("clear-search").hidden = !this.value;
    clearTimeout(searchTimer);
    var v = this.value;
    searchTimer = setTimeout(function () {
      state.q = v;
      renderGrid(); writeHash();
    }, 160);
  });

  $("clear-search").addEventListener("click", function () {
    $("search").value = "";
    $("clear-search").hidden = true;
    state.q = "";
    renderGrid(); writeHash();
    $("search").focus();
  });

  $("sort").addEventListener("change", function () {
    state.sort = this.value;
    renderGrid(); writeHash();
  });

  grid.addEventListener("click", function (e) {
    var copyBtn = e.target.closest(".card-copy");
    if (copyBtn) {
      var pid = Number(copyBtn.dataset.copy);
      for (var i = 0; i < DATA.length; i++) {
        if (DATA[i].id === pid) break;
      }
      copyText(DATA[i].prompt, function (ok) {
        toast(ok ? "已复制到剪贴板" : "复制失败，请打开详情手动复制");
      });
      return;
    }
    var card = e.target.closest(".card");
    if (card) openModal(Number(card.dataset.id));
  });

  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".card");
    if (card) { e.preventDefault(); openModal(Number(card.dataset.id)); }
  });

  bindCopy($("modal-copy"), function () {
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].id === state.openId) return DATA[i].prompt;
    }
    return "";
  });

  $("modal-close").addEventListener("click", closeModal);
  $("modal-backdrop").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("modal-backdrop").hidden) closeModal();
  });

  window.addEventListener("hashchange", function () {
    var prevOpen = state.openId;
    readHash();
    if ($("search").value !== state.q) {
      $("search").value = state.q;
      $("clear-search").hidden = !state.q;
    }
    $("sort").value = state.sort;
    renderChips(); renderGrid();
    if (state.openId && state.openId !== prevOpen) openModal(state.openId);
    else if (!state.openId && !$("modal-backdrop").hidden) closeModal();
  });

  /* ---------- 初始化 ---------- */
  readHash();
  $("search").value = state.q;
  $("clear-search").hidden = !state.q;
  $("sort").value = state.sort;
  renderChips();
  renderGrid();

  var generatedAt = window.GALLERY_DATA.generatedAt
    ? window.GALLERY_DATA.generatedAt.slice(0, 10) : "";
  $("tagline").textContent =
    "共 " + DATA.length + " 个精选提示词 · 数据更新于 " + generatedAt +
    " · 点击卡片查看详情与复制";

  if (state.openId) openModal(state.openId);
})();
