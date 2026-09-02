// ==UserScript==
// @name         B 站收藏夹增强工具
// @name:zh-CN   B 站收藏夹增强工具
// @name:en      Bilibili Marks
// @namespace    darkwinoom/tampermonkey-bilibili-marks
// @version      1.1.0
// @description  Tampermonkey 脚本:管理 B 站收藏分类与多时间点标记,支持一键收藏与静态页分享。
// @match        https://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==


"use strict";
(() => {
  // src/id.ts
  function uuid() {
    const c = typeof window !== "undefined" ? window.crypto : void 0;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") {
      c.getRandomValues(bytes);
    }
    bytes[6] = (bytes[6] ?? 0) & 15 | 64;
    bytes[8] = (bytes[8] ?? 0) & 63 | 128;
    const hex = [];
    for (let i = 0; i < 16; i += 1) {
      hex.push((bytes[i] ?? 0).toString(16).padStart(2, "0"));
    }
    return hex.slice(0, 4).join("") + "-" + hex.slice(4, 6).join("") + "-" + hex.slice(6, 8).join("") + "-" + hex.slice(8, 10).join("") + "-" + hex.slice(10, 16).join("");
  }

  // src/types.ts
  var EMPTY_STORE = { version: 1, categories: [], entries: [] };

  // src/storage.ts
  var STORE_KEY = "bm-store";
  var _GM = typeof unsafeWindow !== "undefined" ? unsafeWindow.GM ?? null : null;
  function gmGet(key) {
    if (_GM?.getValue) return _GM.getValue(key);
    try {
      return localStorage.getItem(key) ?? void 0;
    } catch {
      return void 0;
    }
  }
  function gmSet(key, value) {
    if (_GM?.setValue) {
      _GM.setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, String(value));
    } catch (err) {
      console.error("[bm] save failed:", err);
    }
  }
  function gmDel(key) {
    if (_GM?.deleteValue) {
      _GM.deleteValue(key);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error("[bm] reset failed:", err);
    }
  }
  function getMinOrder(items) {
    let m = Infinity;
    for (const x of items) m = Math.min(m, x.order ?? 0);
    return Number.isFinite(m) ? m : 0;
  }
  function parseStored(raw) {
    if (typeof raw !== "string" || !raw) return { ...EMPTY_STORE };
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && Array.isArray(parsed.categories) && Array.isArray(parsed.entries)) {
        return { version: 1, categories: parsed.categories, entries: parsed.entries };
      }
    } catch {
    }
    return { ...EMPTY_STORE };
  }
  function createStore() {
    function load() {
      return parseStored(gmGet(STORE_KEY));
    }
    function save(schema) {
      try {
        gmSet(STORE_KEY, JSON.stringify(schema));
      } catch (err) {
        console.error("[bm] save failed (quota?):", err);
      }
    }
    function reset() {
      try {
        gmDel(STORE_KEY);
      } catch (err) {
        console.error("[bm] reset failed:", err);
      }
    }
    function upsertCategory(category) {
      const data = load();
      const idx = data.categories.findIndex((c) => c.id === category.id);
      if (idx >= 0) data.categories[idx] = category;
      else data.categories.push(category);
      save(data);
    }
    function deleteCategory(id) {
      const data = load();
      data.categories = data.categories.filter((c) => c.id !== id);
      save(data);
    }
    function moveEntriesToCategory(fromId, toId) {
      const data = load();
      let count = 0;
      const now = Date.now();
      data.entries = data.entries.map((e) => {
        if (e.categoryId === fromId) {
          count += 1;
          return { ...e, categoryId: toId, updatedAt: now };
        }
        return e;
      });
      save(data);
      return count;
    }
    function moveEntryToTop(id) {
      const data = load();
      const target = data.entries.find((e) => e.id === id);
      if (!target) return;
      const maxOrder = data.entries.filter((e) => e.categoryId === target.categoryId).reduce((m, e) => Math.max(m, e.order ?? 0), 0);
      data.entries = data.entries.map((e) => e.id === id ? { ...e, order: maxOrder + 1 } : e);
      save(data);
    }
    function moveCategoryToTop(id) {
      const data = load();
      const maxOrder = data.categories.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
      data.categories = data.categories.map((c) => c.id === id ? { ...c, order: maxOrder + 1 } : c);
      save(data);
    }
    function renameCategory(id, newName) {
      const data = load();
      data.categories = data.categories.map((c) => c.id === id ? { ...c, name: newName } : c);
      save(data);
    }
    function upsertEntry(entry) {
      const data = load();
      const idx = data.entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) data.entries[idx] = entry;
      else data.entries.push(entry);
      save(data);
    }
    function deleteEntry(id) {
      const data = load();
      data.entries = data.entries.filter((e) => e.id !== id);
      save(data);
    }
    function findEntryByKey(key) {
      return load().entries.find(
        (e) => e.bvid === key.bvid && e.p === key.p && Math.abs(e.time - key.time) < 0.5
      );
    }
    function importData(data, mode) {
      if (mode === "replace") {
        save(data);
        return;
      }
      const current = load();
      const catMap = new Map(current.categories.map((c) => [c.id, c]));
      for (const c of data.categories) catMap.set(c.id, c);
      const entryMap = new Map(current.entries.map((e) => [e.id, e]));
      for (const e of data.entries) {
        const existing = entryMap.get(e.id);
        if (!existing || (e.updatedAt ?? 0) > (existing.updatedAt ?? 0)) entryMap.set(e.id, e);
      }
      save({ version: 1, categories: Array.from(catMap.values()), entries: Array.from(entryMap.values()) });
    }
    return {
      load,
      save,
      reset,
      upsertCategory,
      deleteCategory,
      upsertEntry,
      deleteEntry,
      findEntryByKey,
      moveEntriesToCategory,
      moveEntryToTop,
      moveCategoryToTop,
      renameCategory,
      import: importData
    };
  }

  // src/ui/dom.ts
  function getDoc() {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow.document : document;
  }
  function h(tag, attrs, children) {
    const el = getDoc().createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === void 0 || v === false) continue;
        if (k === "class" || k === "className") el.className = String(v);
        else if (k === "style" && typeof v === "string") el.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "string") continue;
        else if (k === "html") el.innerHTML = String(v);
        else el.setAttribute(k, String(v));
      }
    }
    if (children !== void 0) {
      if (typeof children === "string") el.textContent = children;
      else {
        const doc = getDoc();
        for (const c of children) {
          if (c === null || c === void 0 || c === false) continue;
          el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
        }
      }
    }
    return el;
  }
  function svgIcon(d, viewBox = "0 0 24 24") {
    const doc = getDoc();
    const ns = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("xmlns", ns);
    const path = doc.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
  }
  function showToast(root, message, durationMs = 2e3) {
    const toast = root.querySelector("#bm-toast");
    if (!toast) return;
    toast.textContent = message;
    root.classList.add("bm-toast");
    setTimeout(() => root.classList.remove("bm-toast"), durationMs);
  }
  function on(el, event, handler) {
    el.addEventListener(event, handler);
    return () => el.removeEventListener(event, handler);
  }

  // src/ui/icon.ts
  var ICON_PATH = "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z";
  function createIcon() {
    return h("div", { id: "bm-icon" }, [
      h("div", { class: "bm-icon-circle" }, [svgIcon(ICON_PATH)]),
      ...["M", "A", "R", "K"].map((c) => h("span", { class: "bm-icon-letter" }, c))
    ]);
  }
  function togglePanel(root) {
    const willOpen = !root.classList.contains("bm-open");
    root.classList.toggle("bm-open", willOpen);
    return willOpen;
  }
  function bindIcon(root, icon) {
    on(icon, "click", (e) => {
      e.stopPropagation();
      togglePanel(root);
    });
  }

  // src/format.ts
  var PAD2 = (n) => n.toString().padStart(2, "0");
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const h2 = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h2 > 0) return `${h2}:${PAD2(m)}:${PAD2(s)}`;
    return `${m}:${PAD2(s)}`;
  }
  function formatDate(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "\u2014";
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "\u2014";
    return `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}-${PAD2(d.getDate())} ${PAD2(d.getHours())}:${PAD2(d.getMinutes())}`;
  }

  // src/ui/panel.ts
  var _doc = getDoc();
  function matchesQuery(text, q) {
    if (!q) return true;
    if (!text) return false;
    return text.toLowerCase().includes(q.toLowerCase());
  }
  function filterEntries(entries, q) {
    const query = q.trim().toLowerCase();
    if (!query) return entries.slice();
    return entries.filter(
      (e) => matchesQuery(e.label, query) || matchesQuery(e.bvid, query) || matchesQuery(e.title, query)
    );
  }
  function filterCategoriesBySearch(categories, entries, q) {
    const query = q.trim();
    const hasQuery = query.length > 0;
    const out = [];
    for (const c of categories) {
      const inCat = entries.filter((e) => e.categoryId === c.id);
      const count = hasQuery ? filterEntries(inCat, query).length : inCat.length;
      if (hasQuery && count === 0 && c.id !== UNCATEGORIZED_ID) continue;
      out.push({ category: c, count });
    }
    return out;
  }
  function highlightInto(parent, text, q) {
    const query = q.trim();
    if (!query) {
      parent.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const ql = query.toLowerCase();
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(ql, i);
      if (idx === -1) {
        parent.appendChild(_doc.createTextNode(text.slice(i)));
        return;
      }
      if (idx > i) parent.appendChild(_doc.createTextNode(text.slice(i, idx)));
      parent.appendChild(h("mark", { class: "bm-hl" }, text.slice(idx, idx + ql.length)));
      i = idx + ql.length;
    }
  }
  var UNCATEGORIZED_ID = "bm-uncategorized";
  function createPanel(root, initial, cb, getIsVideoPage) {
    const state = { selectedCategoryId: null, searchQuery: "" };
    let currentData = initial;
    const panel = h("div", { id: "bm-panel" });
    const header = h("div", { id: "bm-panel-header" }, [
      h("div", { id: "bm-panel-title" }, "\u6211\u7684\u6536\u85CF"),
      h("div", { id: "bm-panel-actions" }, [
        h(
          "button",
          { id: "bm-btn-capture", title: "\u70B9\u51FB\u6536\u85CF\u5F53\u524D\u89C6\u9891\u8FDB\u5EA6" },
          "\u6536\u85CF\u89C6\u9891"
        ),
        h(
          "a",
          {
            id: "bm-btn-about",
            href: "https://github.com/DarkWinoom/tampermonkey-bilibili-marks",
            target: "_blank",
            rel: "noopener noreferrer",
            title: "\u9879\u76EE\u6E90\u7801"
          },
          "\u24D8"
        )
      ])
    ]);
    const searchInput = h("input", {
      id: "bm-search",
      type: "search",
      class: "bm-search",
      placeholder: "\u641C\u7D22\u6807\u6CE8 / BV\u53F7 / \u6807\u9898",
      autocomplete: "off"
    });
    const searchBar = h("div", { id: "bm-search-bar" }, [searchInput]);
    const catList = h("div", { id: "bm-categories" });
    const entryList = h("div", { id: "bm-entries" });
    const body = h("div", { id: "bm-panel-body" }, [catList, entryList]);
    const footer = h("div", { id: "bm-panel-footer" }, [
      h("div", { class: "bm-footer-left" }, [
        h("button", { id: "bm-btn-import", title: "\u4ECE JSON \u5BFC\u5165" }, "\u5BFC\u5165"),
        h("button", { id: "bm-btn-export", title: "\u5BFC\u51FA\u4E3A JSON" }, "\u5BFC\u51FA")
      ]),
      h("div", { class: "bm-footer-right" }, [
        h(
          "button",
          { id: "bm-btn-share", title: "\u751F\u6210\u5206\u4EAB\u9875(\u9759\u6001 HTML)" },
          "\u5206\u4EAB"
        )
      ])
    ]);
    const toast = h("div", { id: "bm-toast" });
    panel.appendChild(header);
    panel.appendChild(searchBar);
    panel.appendChild(body);
    panel.appendChild(footer);
    root.appendChild(panel);
    root.appendChild(toast);
    const cleanupFns = [];
    const captureBtn = header.querySelector("#bm-btn-capture");
    cleanupFns.push(
      on(captureBtn, "click", () => {
        if (captureBtn.disabled) return;
        cb.onCaptureCurrent();
      })
    );
    const importBtn = footer.querySelector("#bm-btn-import");
    const exportBtn = footer.querySelector("#bm-btn-export");
    const shareBtn = footer.querySelector("#bm-btn-share");
    cleanupFns.push(on(importBtn, "click", () => cb.onImport()));
    cleanupFns.push(on(exportBtn, "click", () => cb.onExport()));
    cleanupFns.push(on(shareBtn, "click", () => cb.onShare()));
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      render(currentData);
    });
    let openDropdownEntryId = null;
    function closeAllDropdowns() {
      openDropdownEntryId = null;
      var menus = _doc.querySelectorAll(".bm-dropdown-menu");
      for (var i = 0; i < menus.length; i += 1) {
        var m = menus[i];
        m.remove();
      }
    }
    function onDocClick(e) {
      if (!root.classList.contains("bm-open")) return;
      var path = e.composedPath && e.composedPath() || [];
      for (var j = 0; j < path.length; j += 1) {
        var m = path[j];
        if (m && m.classList && m.classList.contains("bm-dropdown-menu")) return;
      }
      var insidePanel = false;
      for (var i = 0; i < path.length; i += 1) {
        var n = path[i];
        if (n && (n.id === "bm-panel" || n.id === "bm-icon")) {
          insidePanel = true;
          break;
        }
      }
      closeAllDropdowns();
      if (!insidePanel) {
        root.classList.remove("bm-open");
      }
    }
    _doc.addEventListener("click", onDocClick);
    function render(data) {
      currentData = data;
      if (!state.selectedCategoryId || !data.categories.find(function(c) {
        return c.id === state.selectedCategoryId;
      })) {
        var first = data.categories.find(function(c) {
          return c.id === UNCATEGORIZED_ID;
        });
        if (!first && data.categories.length > 0) first = data.categories[0];
        state.selectedCategoryId = first ? first.id : null;
      }
      renderCategories(data, state);
      renderEntries(data, state, cb);
    }
    function renderCategories(data, state2) {
      catList.innerHTML = "";
      var addBtn = h("button", { class: "bm-cat-add" }, "+ \u65B0\u5EFA\u5206\u7C7B");
      addBtn.addEventListener("click", function() {
        promptCreateCategory(cb);
      });
      catList.appendChild(addBtn);
      var uncat = data.categories.find(function(c) {
        return c.id === UNCATEGORIZED_ID;
      });
      var others = data.categories.filter(function(c) {
        return c.id !== UNCATEGORIZED_ID;
      }).sort(function(a, b) {
        return (b.order || 0) - (a.order || 0);
      });
      var sorted = [];
      if (uncat) sorted.push(uncat);
      sorted = sorted.concat(others);
      var visible = filterCategoriesBySearch(sorted, data.entries, state2.searchQuery);
      for (var i = 0; i < visible.length; i += 1) {
        var cat = visible[i].category;
        var count = visible[i].count;
        var isActive = cat.id === state2.selectedCategoryId;
        var isProtected = cat.id === UNCATEGORIZED_ID;
        var catEl = h(
          "div",
          {
            class: "bm-cat" + (isActive ? " bm-active" : ""),
            title: cat.name
          },
          [
            h("span", { class: "bm-cat-name" }, cat.name),
            h("span", { class: "bm-cat-count" }, String(count))
          ]
        );
        (function(catObj) {
          catEl.addEventListener("click", function() {
            state2.selectedCategoryId = catObj.id;
            render(data);
          });
          catEl.addEventListener("contextmenu", function(e) {
            e.preventDefault();
            if (!isProtected) {
              openCategoryDropdown(catObj, e.clientX, e.clientY);
            }
          });
        })(cat);
        catList.appendChild(catEl);
      }
      catList.addEventListener("contextmenu", function(e) {
        e.preventDefault();
      });
    }
    function renderEntries(data, state2, cb2) {
      entryList.innerHTML = "";
      var catOpt = data.categories.find(function(c) {
        return c.id === state2.selectedCategoryId;
      });
      if (!catOpt) {
        var emptyEl = h("div", { id: "bm-entries-empty" }, [
          h("div", {}, "\u{1F448} \u4ECE\u5DE6\u4FA7\u9009\u4E00\u4E2A\u5206\u7C7B,\u6216\u65B0\u5EFA\u4E00\u4E2A\u5F00\u59CB\u6536\u85CF\u3002")
        ]);
        entryList.appendChild(emptyEl);
        return;
      }
      var cat = catOpt;
      var entries = data.entries.filter(function(e2) {
        return e2.categoryId === cat.id;
      }).sort(function(a, b) {
        var ao = a.order || 0;
        var bo = b.order || 0;
        if (ao !== bo) return bo - ao;
        return a.createdAt - b.createdAt;
      });
      var filtered = filterEntries(entries, state2.searchQuery);
      if (filtered.length === 0) {
        if (entries.length === 0) {
          var empty2 = h("div", { id: "bm-entries-empty" }, [
            h("div", { class: "bm-empty-title" }, "\u8BE5\u5206\u7C7B\u8FD8\u6CA1\u6709\u6536\u85CF"),
            h(
              "div",
              { class: "bm-empty-hint" },
              "\u60A8\u53EF\u4EE5\u5728 B \u7AD9\u4EFB\u610F\u89C6\u9891\u3001\u756A\u5267\u9875\u70B9\u9762\u677F\u9876\u90E8\u300C\u6536\u85CF\u89C6\u9891\u300D\u4E00\u952E\u6536\u85CF\uFF0C\u5B83\u4F1A\u81EA\u52A8\u8BB0\u5F55\u60A8\u5F53\u524D\u89C2\u770B\u65F6\u95F4"
            )
          ]);
          entryList.appendChild(empty2);
        } else {
          entryList.appendChild(
            h("div", { id: "bm-entries-empty" }, [
              h("div", { class: "bm-empty-title" }, "\u6CA1\u6709\u5339\u914D\u300C" + state2.searchQuery.trim() + "\u300D\u7684\u6536\u85CF"),
              h("div", { class: "bm-empty-hint" }, "\u8BD5\u8BD5\u522B\u7684\u5173\u952E\u8BCD,\u6216\u6E05\u7A7A\u641C\u7D22\u6846")
            ])
          );
        }
        return;
      }
      for (var j = 0; j < filtered.length; j += 1) {
        var e = filtered[j];
        var labelEl = h("div", { class: "bm-entry-label" });
        highlightInto(labelEl, e.label || "(\u672A\u547D\u540D)", state2.searchQuery);
        var metaEl = h("div", { class: "bm-entry-meta" });
        metaEl.appendChild(_doc.createTextNode(formatTime(e.time) + " \xB7 "));
        highlightInto(metaEl, e.bvid, state2.searchQuery);
        if (e.p > 1) metaEl.appendChild(_doc.createTextNode(" \xB7 P" + e.p));
        if (e.title) {
          metaEl.appendChild(_doc.createTextNode(" \xB7 "));
          highlightInto(metaEl, e.title, state2.searchQuery);
        }
        var rowEl = h("div", { class: "bm-entry" }, [
          h("div", { class: "bm-entry-info" }, [labelEl, metaEl]),
          h("div", { class: "bm-entry-actions" }, [
            h("button", { class: "bm-play", title: "\u8DF3\u5230\u8BE5\u65F6\u95F4\u70B9\u64AD\u653E" }, "\u25B6"),
            h("button", { class: "bm-manage", title: "\u7BA1\u7406" }, "\u2699")
          ])
        ]);
        (function(entry) {
          var buttons = rowEl.querySelectorAll("button");
          var playBtn = buttons[0];
          var manageBtn = buttons[1];
          playBtn.addEventListener("click", function(e2) {
            e2.stopPropagation();
            cb2.onJumpToEntry(entry);
          });
          manageBtn.addEventListener("click", function(e2) {
            e2.stopPropagation();
            toggleDropdown(entry, manageBtn);
          });
        })(e);
        entryList.appendChild(rowEl);
      }
    }
    function toggleDropdown(entry, buttonEl) {
      if (openDropdownEntryId === entry.id) {
        closeAllDropdowns();
        return;
      }
      closeAllDropdowns();
      openDropdownEntryId = entry.id;
      var menu = h("div", { class: "bm-dropdown-menu" }, [
        h("button", { class: "bm-dd-item" }, "\u6539\u5206\u7C7B"),
        h("button", { class: "bm-dd-item" }, "\u7F6E\u9876"),
        h("button", { class: "bm-dd-item" }, "\u4FEE\u6539"),
        h("button", { class: "bm-dd-item bm-dd-del" }, "\u5220\u9664")
      ]);
      positionDropdown(menu, buttonEl);
      _doc.body.appendChild(menu);
      var items = menu.querySelectorAll("button");
      items[0].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        promptMoveEntry(entry, currentData, cb);
      });
      items[1].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        cb.onMoveEntryToTop(entry.id);
      });
      items[2].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        promptEditEntry(entry, cb);
      });
      items[3].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        if (confirm('\u5220\u9664"' + (entry.label || "\u672A\u547D\u540D") + '"?'))
          cb.onDeleteEntry(entry.id);
      });
    }
    function openCategoryDropdown(cat, clientX, clientY) {
      closeAllDropdowns();
      var isProtected = cat.id === UNCATEGORIZED_ID;
      var items = [
        h("button", { class: "bm-dd-item" }, "\u7F6E\u9876"),
        h("button", { class: "bm-dd-item" }, "\u6539\u540D")
      ];
      if (!isProtected) {
        items.push(h("button", { class: "bm-dd-item bm-dd-del" }, "\u5220\u9664"));
      }
      var menu = h("div", { class: "bm-dropdown-menu" }, items);
      positionDropdownAtMouse(menu, clientX, clientY);
      _doc.body.appendChild(menu);
      var btns = menu.querySelectorAll("button");
      btns[0].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        cb.onMoveCategoryToTop(cat.id);
      });
      btns[1].addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllDropdowns();
        var newName = window.prompt("\u65B0\u540D\u5B57:", cat.name);
        if (newName === null) return;
        var trimmed = newName.trim();
        if (!trimmed) return;
        cb.onRenameCategory(cat.id, trimmed);
      });
      if (!isProtected && btns[2]) {
        btns[2].addEventListener("click", function(e) {
          e.stopPropagation();
          closeAllDropdowns();
          if (confirm(
            '\u5220\u9664\u5206\u7C7B"' + cat.name + '"?\u8BE5\u5206\u7C7B\u4E0B\u7684 entry \u4F1A\u81EA\u52A8\u79FB\u5230\u300C\u672A\u5206\u7C7B\u300D\u3002'
          )) {
            cb.onDeleteCategory(cat.id);
            if (state.selectedCategoryId === cat.id)
              state.selectedCategoryId = null;
          }
        });
      }
    }
    function positionDropdown(menu, anchorEl) {
      var rect = anchorEl.getBoundingClientRect();
      var menuWidth = 100;
      var left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;
      var top = rect.bottom + 4;
      var estimatedHeight = 4 * 32 + 8;
      if (top + estimatedHeight > window.innerHeight) {
        top = rect.top - estimatedHeight;
        if (top < 8) top = 8;
      }
      applyMenuStyle(menu, left, top, menuWidth);
    }
    function positionDropdownAtMouse(menu, clientX, clientY) {
      var menuWidth = 100;
      var left = clientX;
      var top = clientY;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;
      var itemCount = menu.querySelectorAll("button").length;
      var estimatedHeight = itemCount * 32 + 8;
      if (top + estimatedHeight > window.innerHeight) {
        top = window.innerHeight - estimatedHeight - 8;
      }
      if (top < 8) top = 8;
      applyMenuStyle(menu, left, top, menuWidth);
    }
    function applyMenuStyle(menu, left, top, menuWidth) {
      menu.style.cssText = "position: fixed !important; z-index: 2147483647 !important;top: " + top + "px !important; left: " + left + "px !important;width: " + menuWidth + "px !important;background: #fff; border: 1px solid #e0e0e0; border-radius: 6px;box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 4px 0;margin: 0;";
    }
    function updateCaptureButton(isVideoPage2) {
      captureBtn.disabled = !isVideoPage2;
      captureBtn.title = isVideoPage2 ? "\u70B9\u51FB\u6536\u85CF\u5F53\u524D\u89C6\u9891\u8FDB\u5EA6" : "\u5F53\u524D\u9875\u9762\u4E0D\u662F B \u7AD9\u89C6\u9891\u9875,\u65E0\u6CD5\u6536\u85CF\u5F53\u524D\u8FDB\u5EA6\u3002";
    }
    function destroy() {
      for (var i = 0; i < cleanupFns.length; i += 1) cleanupFns[i]();
      _doc.removeEventListener("click", onDocClick);
      closeAllDropdowns();
    }
    render(initial);
    updateCaptureButton(getIsVideoPage());
    return {
      render,
      updateCaptureButton,
      getSelectedCategoryId: function() {
        return state.selectedCategoryId;
      },
      destroy
    };
  }
  function promptCreateCategory(cb) {
    var name = prompt("\u5206\u7C7B\u540D:");
    if (!name) return;
    cb.onCreateCategory(name.trim());
  }
  function promptEditEntry(entry, cb) {
    var label = prompt("\u65B0\u6807\u6CE8:", entry.label)?.trim();
    if (!label) return;
    var timeStr = prompt("\u65B0\u65F6\u95F4(\u79D2):", String(entry.time));
    var time = Number(timeStr);
    if (!Number.isFinite(time) || time < 0) {
      alert("\u65F6\u95F4\u683C\u5F0F\u9519\u8BEF");
      return;
    }
    var note = prompt("\u5907\u6CE8(\u7559\u7A7A\u4E0D\u53D8):", entry.note ?? "") ?? entry.note;
    cb.onUpdateEntry({
      id: entry.id,
      categoryId: entry.categoryId,
      bvid: entry.bvid,
      p: entry.p,
      time,
      label,
      title: entry.title,
      note: note || void 0,
      createdAt: entry.createdAt,
      updatedAt: Date.now()
    });
  }
  function promptMoveEntry(entry, data, cb) {
    var others = data.categories.filter(function(c) {
      return c.id !== UNCATEGORIZED_ID;
    }).sort(function(a, b) {
      return (b.order || 0) - (a.order || 0);
    });
    var currentIsUncategorized = entry.categoryId === UNCATEGORIZED_ID;
    var defaultIdx;
    if (currentIsUncategorized) {
      defaultIdx = 0;
    } else {
      var pos = others.findIndex(function(c) {
        return c.id === entry.categoryId;
      });
      defaultIdx = pos >= 0 ? pos + 1 : 0;
    }
    var lines = ["0. \u672A\u5206\u7C7B"];
    others.forEach(function(c, i) {
      var mark = c.id === entry.categoryId ? " (\u5F53\u524D)" : "";
      lines.push(i + 1 + ". " + c.name + mark);
    });
    var list = lines.join("\n");
    var pick = prompt(
      "\u9009\u76EE\u6807\u5206\u7C7B(\u8F93\u5165\u5E8F\u53F7,\u76F4\u63A5\u56DE\u8F66 = \u4FDD\u6301\u5F53\u524D):\n\n" + list + "\n",
      String(defaultIdx)
    );
    if (pick === null) return;
    if (pick === "" || pick === String(defaultIdx)) return;
    var targetId;
    if (pick === "0") {
      targetId = UNCATEGORIZED_ID;
    } else {
      var idx = Number(pick) - 1;
      var target = others[idx];
      if (!target) {
        alert("\u5E8F\u53F7\u65E0\u6548");
        return;
      }
      targetId = target.id;
    }
    if (targetId === entry.categoryId) return;
    cb.onMoveEntry(entry.id, targetId);
  }

  // src/url-parser.ts
  var VIDEO_PATTERN = /\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})/i;
  var BANGUMI_PATTERN = /\/bangumi\/play\/(ep|ss)(\d+)/i;
  function parseBiliUrl(url) {
    if (typeof url !== "string" || !url) return null;
    const video = url.match(VIDEO_PATTERN);
    const bangumi = url.match(BANGUMI_PATTERN);
    const bvid = video ? video[1] : bangumi ? bangumi[1] + bangumi[2] : null;
    if (!bvid) return null;
    let search;
    try {
      const base = url.startsWith("http") ? void 0 : "https://www.bilibili.com";
      search = new URL(url, base).searchParams;
    } catch {
      return null;
    }
    const pRaw = search.get("p");
    let p = 1;
    if (pRaw !== null) {
      const n = Number(pRaw);
      if (Number.isFinite(n) && n >= 1) p = Math.max(1, Math.floor(n));
    }
    const tRaw = search.get("t");
    let time = 0;
    if (tRaw !== null && tRaw !== "") {
      const numMatch = tRaw.match(/^(\d+(?:\.\d+)?)$/);
      if (numMatch) {
        const n = Number(numMatch[1]);
        if (Number.isFinite(n) && n >= 0) time = Math.floor(n);
      } else {
        const m = tRaw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
        if (m && (m[1] || m[2] || m[3])) {
          time = (m[1] ? Number(m[1]) : 0) * 3600 + (m[2] ? Number(m[2]) : 0) * 60 + (m[3] ? Number(m[3]) : 0);
        }
      }
    }
    return { bvid, p, time };
  }
  function buildBiliUrl(key) {
    const { bvid, p, time } = key;
    const safeP = Math.max(1, Math.round(p));
    const safeTime = Math.max(0, Math.floor(time));
    const params = [];
    if (safeP > 1) params.push(`p=${safeP}`);
    if (safeTime > 0) params.push(`t=${safeTime}`);
    const query = params.length > 0 ? `?${params.join("&")}` : "";
    const path = /^(ep|ss)/.test(bvid) ? `/bangumi/play/${bvid}` : `/video/${bvid}`;
    return `https://www.bilibili.com${path}${query}`;
  }

  // src/bilibili-page.ts
  function isVideoPage() {
    var path = window.location.pathname;
    return /^\/video\//.test(path) || /^\/bangumi\/play\//.test(path);
  }
  function captureCurrent() {
    var path = window.location.pathname;
    if (/^\/video\//.test(path)) {
      var parsed = parseBiliUrl(window.location.href);
      if (!parsed) return null;
      return {
        bvid: parsed.bvid,
        p: parsed.p,
        time: readMainVideoTime(),
        title: readTitle()
      };
    }
    if (/^\/bangumi\/play\//.test(path)) {
      var m = path.match(/\/bangumi\/play\/(ep|ss)(\d+)/);
      if (!m) return null;
      return {
        bvid: m[1] + m[2],
        // 保留 ep/ss 前缀,buildBiliUrl 据此选 /bangumi/play/
        p: 1,
        time: readMainVideoTime(),
        title: readTitle()
      };
    }
    return null;
  }
  function readMainVideoTime() {
    var videos = document.querySelectorAll("video");
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < videos.length; i += 1) {
      var v = videos[i];
      var area = (v.videoWidth || 0) * (v.videoHeight || 0);
      if (area > bestArea) {
        bestArea = area;
        best = v;
      }
    }
    return (best || videos[0]).currentTime ?? 0;
  }
  function readTitle() {
    var sels = [".video-title", 'h1[class*="title"]', '[class*="VideoTitle"]', "h1", "title"];
    for (var i = 0; i < sels.length; i += 1) {
      var el = document.querySelector(sels[i]);
      var text = el?.textContent?.trim();
      if (text) return text;
    }
    return void 0;
  }

  // src/share/template.ts
  var SHARE_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #f8f9fa;
  --card: #fff;
  --text: #222;
  --muted: #888;
  --border: #eee;
  --accent: #00AEEC;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --card: #2a2a2a;
    --text: #eee;
    --muted: #999;
    --border: #333;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
.container { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
h1 { margin: 0 0 8px; font-size: 24px; }
.subtitle { color: var(--muted); font-size: 13px; }
.cat { background: var(--card); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.cat h2 { margin: 0 0 12px; font-size: 18px; display: flex; align-items: center; gap: 8px; }
.cat-count { color: var(--muted); font-size: 13px; font-weight: normal; }
.entry {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.entry:last-child { border-bottom: none; }
.entry-time { color: var(--accent); font-weight: 600; min-width: 80px; font-variant-numeric: tabular-nums; }
.entry-info { flex: 1; min-width: 0; }
.entry-label { font-weight: 500; }
.entry-meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
.entry-play {
  background: var(--accent); color: #fff;
  border: none; padding: 6px 12px; border-radius: 6px;
  cursor: pointer; font-size: 13px; text-decoration: none;
  white-space: nowrap;
}
.entry-play:hover { opacity: 0.85; }
footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>\u{1F3AC} {{TITLE}}</h1>
    <div class="subtitle">\u5171 {{TOTAL_ENTRIES}} \u6761\u6536\u85CF \xB7 \u5BFC\u51FA\u4E8E {{EXPORTED_AT}}</div>
  </header>
  <main id="bm-content"></main>
  <footer>\u7531 tampermonkey-bilibili-marks \u751F\u6210 \xB7 \u63A5\u6536\u8005\u65E0\u9700\u5B89\u88C5\u4EFB\u4F55\u63D2\u4EF6</footer>
</div>
<script type="application/json" id="bm-data">{{DATA}}<\/script>
<script>
(function() {
  var raw = document.getElementById('bm-data').textContent;
  var payload = JSON.parse(raw);
  var root = document.getElementById('bm-content');
  var entries = payload.data.entries.slice().sort(function(a, b) {
    return b.updatedAt - a.updatedAt;
  });
  var byCat = {};
  payload.data.categories.forEach(function(c) { byCat[c.id] = c; });
  var grouped = {};
  entries.forEach(function(e) {
    if (!grouped[e.categoryId]) grouped[e.categoryId] = [];
    grouped[e.categoryId].push(e);
  });
  var frag = document.createDocumentFragment();
  payload.data.categories
    .slice()
    .sort(function(a, b) { return a.order - b.order; })
    .forEach(function(cat) {
      var list = grouped[cat.id] || [];
      if (list.length === 0) return;
      var card = document.createElement('section');
      card.className = 'cat';
      var h = document.createElement('h2');
      h.textContent = (cat.icon || '\u{1F4C1}') + ' ' + cat.name;
      var cnt = document.createElement('span');
      cnt.className = 'cat-count';
      cnt.textContent = '(' + list.length + ')';
      h.appendChild(cnt);
      card.appendChild(h);
      list.forEach(function(e) {
        // \u756A\u5267 (ep<id> / ss<id>) \u8D70 /bangumi/play/,\u5176\u4ED6\u8D70 /video/
        var base = /^(ep|ss)/.test(e.bvid)
          ? 'https://www.bilibili.com/bangumi/play/' + e.bvid
          : 'https://www.bilibili.com/video/' + e.bvid;
        var url = base +
          (e.p > 1 ? '?p=' + e.p : '') +
          (e.time > 0 ? (e.p > 1 ? '&' : '?') + 't=' + Math.floor(e.time) : '');
        var fmt = function(sec) {
          sec = Math.floor(sec);
          var h = Math.floor(sec / 3600);
          var m = Math.floor((sec % 3600) / 60);
          var s = sec % 60;
          if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
          return m + ':' + (s < 10 ? '0' + s : s);
        };
        var row = document.createElement('div');
        row.className = 'entry';
        var t = document.createElement('div');
        t.className = 'entry-time';
        t.textContent = fmt(e.time);
        var info = document.createElement('div');
        info.className = 'entry-info';
        var lab = document.createElement('div');
        lab.className = 'entry-label';
        lab.textContent = e.label || '(\u672A\u547D\u540D)';
        var meta = document.createElement('div');
        meta.className = 'entry-meta';
        var parts = [e.bvid];
        if (e.p > 1) parts.push('P' + e.p);
        if (e.title) parts.push(e.title);
        meta.textContent = parts.join(' \xB7 ');
        info.appendChild(lab);
        info.appendChild(meta);
        var a = document.createElement('a');
        a.className = 'entry-play';
        a.href = url;
        a.target = '_blank';
        a.textContent = '\u25B6 \u6253\u5F00';
        row.appendChild(t);
        row.appendChild(info);
        row.appendChild(a);
        card.appendChild(row);
      });
      frag.appendChild(card);
    });
  if (frag.childNodes.length === 0) {
    var empty = document.createElement('div');
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--muted)';
    empty.style.padding = '48px 16px';
    empty.textContent = '\u8FD9\u4EFD\u6536\u85CF\u5939\u662F\u7A7A\u7684\u3002';
    frag.appendChild(empty);
  }
  root.appendChild(frag);
})();
<\/script>
</body>
</html>`;

  // src/share/export.ts
  var ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  var esc = (v) => v.replace(/[&<>]/g, (ch) => ESCAPE_MAP[ch] ?? ch);
  function buildShareHtml(payload, title = "B \u7AD9\u6536\u85CF\u5939\u5206\u4EAB") {
    return SHARE_TEMPLATE.replaceAll("{{TITLE}}", esc(title)).replaceAll("{{TOTAL_ENTRIES}}", String(payload.data.entries.length)).replaceAll("{{EXPORTED_AT}}", esc(formatDate(payload.exportedAt))).replaceAll("{{DATA}}", esc(JSON.stringify(payload)));
  }
  function downloadShareHtml(payload, title = "B \u7AD9\u6536\u85CF\u5939\u5206\u4EAB") {
    const doc = getDoc();
    const a = doc.createElement("a");
    a.href = URL.createObjectURL(new Blob([buildShareHtml(payload, title)], { type: "text/html;charset=utf-8" }));
    a.download = `bilibili-marks-${payload.exportedAt}.html`;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }

  // src/share/import.ts
  function parseImportPayload(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, error: "\u5185\u5BB9\u4E3A\u7A7A" };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `JSON \u89E3\u6790\u5931\u8D25:${e.message}` };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "\u6839\u4E0D\u662F\u5BF9\u8C61" };
    }
    const obj = parsed;
    let data = null;
    if (obj.version === 1 && obj.data && typeof obj.data === "object") {
      data = obj.data;
    } else if (obj.version === 1 && Array.isArray(obj.categories) && Array.isArray(obj.entries)) {
      data = obj;
    }
    if (!data) {
      return { ok: false, error: "schema \u4E0D\u5339\u914D(\u671F\u671B version=1 + categories/entries \u6216\u5D4C\u5957 data)" };
    }
    const categoriesIn = data.categories;
    const entriesIn = data.entries;
    if (!Array.isArray(categoriesIn) || !Array.isArray(entriesIn)) {
      return { ok: false, error: "categories/entries \u4E0D\u662F\u6570\u7EC4" };
    }
    const categories = [];
    const seenCatIds = /* @__PURE__ */ new Set();
    for (const c of categoriesIn) {
      if (!c || typeof c !== "object") return { ok: false, error: "category \u4E0D\u662F\u5BF9\u8C61" };
      const cat = c;
      if (typeof cat.id !== "string" || !cat.id) return { ok: false, error: "category.id \u7F3A\u5931" };
      if (typeof cat.name !== "string") return { ok: false, error: "category.name \u7F3A\u5931" };
      if (typeof cat.order !== "number") return { ok: false, error: "category.order \u7F3A\u5931" };
      if (typeof cat.createdAt !== "number") return { ok: false, error: "category.createdAt \u7F3A\u5931" };
      if (seenCatIds.has(cat.id)) return { ok: false, error: `category.id \u91CD\u590D:${cat.id}` };
      seenCatIds.add(cat.id);
      categories.push({
        id: cat.id,
        name: cat.name,
        icon: typeof cat.icon === "string" ? cat.icon : void 0,
        order: cat.order,
        createdAt: cat.createdAt
      });
    }
    const entries = [];
    const seenEntryIds = /* @__PURE__ */ new Set();
    for (const e of entriesIn) {
      if (!e || typeof e !== "object") return { ok: false, error: "entry \u4E0D\u662F\u5BF9\u8C61" };
      const en = e;
      if (typeof en.id !== "string" || !en.id) return { ok: false, error: "entry.id \u7F3A\u5931" };
      if (typeof en.categoryId !== "string") return { ok: false, error: "entry.categoryId \u7F3A\u5931" };
      if (!seenCatIds.has(en.categoryId)) {
        return { ok: false, error: `entry.categoryId \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u5206\u7C7B:${en.categoryId}` };
      }
      if (typeof en.bvid !== "string" || en.bvid.length === 0) {
        return { ok: false, error: "entry.bvid \u7F3A\u5931" };
      }
      if (!/^(BV|ep|ss)/.test(en.bvid)) {
        return { ok: false, error: "entry.bvid \u683C\u5F0F\u9519\u8BEF(\u5E94 BV/ep/ss \u5F00\u5934)" };
      }
      if (typeof en.p !== "number" || en.p < 1) return { ok: false, error: "entry.p \u975E\u6CD5" };
      if (typeof en.time !== "number" || en.time < 0) return { ok: false, error: "entry.time \u975E\u6CD5" };
      if (typeof en.label !== "string") return { ok: false, error: "entry.label \u7F3A\u5931" };
      if (seenEntryIds.has(en.id)) return { ok: false, error: `entry.id \u91CD\u590D:${en.id}` };
      seenEntryIds.add(en.id);
      entries.push({
        id: en.id,
        categoryId: en.categoryId,
        bvid: en.bvid,
        p: en.p,
        time: en.time,
        label: en.label,
        title: typeof en.title === "string" ? en.title : void 0,
        note: typeof en.note === "string" ? en.note : void 0,
        createdAt: typeof en.createdAt === "number" ? en.createdAt : Date.now(),
        updatedAt: typeof en.updatedAt === "number" ? en.updatedAt : Date.now()
      });
    }
    return {
      ok: true,
      data: { version: 1, categories, entries }
    };
  }

  // src/ui/styles.css
  var styles_default = `/* bilibili-marks \u6CB9\u7334\u811A\u672C UI \u6837\u5F0F */
/* \u8BBE\u8BA1\u539F\u5219:
   1. \u6D6E\u6807\u56FA\u5B9A\u5DE6\u4E0B,\u5C0F\u5C3A\u5BF8,\u4E0D\u6321\u89C6\u7EBF
   2. \u9762\u677F\u4ECE\u6D6E\u6807\u4F4D\u7F6E\u6D6E\u51FA,\u5C55\u5F00\u540E\u80CC\u666F\u906E\u7F69\u4E0D\u963B\u6321\u70B9\u51FB(pointer-events: none)
   3. \u989C\u8272\u8DDF B \u7AD9\u4E3B\u9898\u8D34\u8FD1(#00AEEC \u4E3B\u8272)
   4. \u6697\u8272\u6A21\u5F0F\u81EA\u9002\u5E94
   5. \u5B57\u4F53\u4F18\u5148\u7CFB\u7EDF\u5B57\u4F53,\u907F\u514D\u8FDC\u7A0B\u5B57\u4F53
*/

#bm-root {
  position: fixed;
  inset: 0;
  pointer-events: none; /* \u9ED8\u8BA4\u4E0D\u63A5\u6536\u4E8B\u4EF6,\u53EA\u6709\u6D6E\u6807\u548C\u9762\u677F\u63A5\u6536 */
  z-index: 999999;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

/* \u6D6E\u6807:\u957F\u6761\u72B6\u4FA7\u6807\u7B7E,\u8D34\u89C6\u53E3 left:0 bottom:0,\u5185\u5BB9:\u56FE\u6807 + M/A/R/K \u56DB\u5B57\u6BCD\u5782\u76F4\u5806\u53E0 */
#bm-icon {
  position: fixed;
  left: 0;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px 12px;
  background: #00aeec;
  color: #fff;
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2147483647;
  user-select: none;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
  transition: background 0.15s ease;
}

#bm-icon:hover {
  background: #00c4f4;
}

.bm-icon-circle {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bm-icon-circle svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.bm-icon-letter {
  display: block;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0;
}

/* (\u53BB\u6389\u4E86\u5168\u5C4F mask;\u70B9\u51FB\u5916\u90E8\u7531 JS \u5173\u95ED panel) */

/* \u9762\u677F */
#bm-panel {
  position: fixed;
  left: 35px;
  bottom: 100px;
  width: 480px;
  max-width: calc(100vw - 40px);
  height: 70vh;
  max-height: 600px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  pointer-events: none;
  overflow: hidden;
  transform: translateY(20px) scale(0.95);
  opacity: 0;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

#bm-root.bm-open #bm-panel {
  transform: translateY(0) scale(1);
  opacity: 1;
  pointer-events: auto;
}

#bm-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background: linear-gradient(180deg, #f8f9fa, #fff);
}

#bm-panel-title {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
  color: #222;
}

#bm-panel-actions {
  display: flex;
  gap: 4px;
}

#bm-panel-actions button,
#bm-panel-actions a {
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  text-decoration: none;
  transition: background 0.15s;
  display: inline-flex;
  align-items: center;
}

#bm-panel-actions button:hover,
#bm-panel-actions a:hover {
  background: #f0f0f0;
  color: #00aeec;
}

#bm-btn-about {
  font-size: 16px;
  line-height: 1;
  margin-left: 4px;
}

#bm-panel-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* \u641C\u7D22\u680F(\u65E0\u6309\u94AE,input \u5373\u8FC7\u6EE4) */
#bm-search-bar {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}
.bm-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #222;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.bm-search:focus { border-color: #00AEEC; }
.bm-search::placeholder { color: #999; }

/* \u81EA\u5E26\u6E05\u7A7A \xD7 \u6309\u94AE:\u589E\u5927\u89E6\u78B0\u8303\u56F4 + cursor: pointer */
.bm-search::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  height: 18px;
  width: 18px;
  margin-right: 2px;
  border-radius: 50%;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'><path stroke='%23999' stroke-width='2' fill='none' stroke-linecap='round' d='M4 4l10 10M14 4l-10 10'/></svg>") center/12px 12px no-repeat;
  cursor: pointer;
  transition: background-color 0.15s;
}
.bm-search::-webkit-search-cancel-button:hover {
  background-color: #f0f0f0;
}

/* \u5173\u952E\u8BCD\u9AD8\u4EAE */
mark.bm-hl {
  background: #fff3a3;
  color: inherit;
  padding: 0;
  font-weight: 600;
}

/* \u5206\u7C7B\u4FA7\u680F */
#bm-categories {
  width: 120px;
  background: #f8f9fa;
  border-right: 1px solid #eee;
  overflow-y: auto;
  padding: 8px 0;
}

.bm-cat {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}

.bm-cat:hover {
  background: #eef0f2;
}

.bm-cat.bm-active {
  background: #fff;
  border-left-color: #00aeec;
  color: #00aeec;
  font-weight: 500;
}

.bm-cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-cat-count {
  font-size: 11px;
  color: #999;
}

.bm-cat-add {
  margin: 4px 8px;
  padding: 6px 8px;
  background: transparent;
  border: 1px dashed #ccc;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.bm-cat-add:hover {
  border-color: #00aeec;
  color: #00aeec;
}

/* entry \u5217\u8868\u533A */
#bm-entries {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.bm-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: #fff;
  border: 1px solid #f0f0f0;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.bm-entry:hover {
  border-color: #00aeec;
  box-shadow: 0 2px 8px rgba(0, 174, 236, 0.1);
}

.bm-entry-info {
  flex: 1;
  min-width: 0;
}

.bm-entry-label {
  font-weight: 500;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-entry-meta {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-entry-actions {
  display: flex;
  gap: 2px;
}

.bm-entry-actions button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  color: #999;
  border-radius: 3px;
  font-size: 14px;
  transition:
    background 0.15s,
    color 0.15s;
}

.bm-entry-actions button:hover {
  background: #f0f0f0;
  color: #00aeec;
}

/* \u7F6E\u9876\u662F\u6392\u5E8F\u884C\u4E3A,\u65E0\u89C6\u89C9\u5DEE\u5F02 */

/* \u4E0B\u62C9\u83DC\u5355(\u6BCF\u4E2A entry / \u5206\u7C7B\u7684\u7BA1\u7406\u83DC\u5355) */
.bm-dropdown-menu {
  position: fixed;
  z-index: 2147483647;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  width: 100px;
}

.bm-dropdown-menu button {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  text-align: center;
  padding: 7px 10px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: background 0.1s;
}

.bm-dropdown-menu button:hover {
  background: #f0f0f0;
}

.bm-dropdown-menu .bm-dd-del {
  color: #f56c6c;
}

.bm-dropdown-menu .bm-dd-del:hover {
  background: #fff5f5;
  color: #f56c6c;
}

/* \u4FDD\u62A4\u5206\u7C7B(\u672A\u5206\u7C7B)\u2014 \u4E0D\u663E\u793A\u9501,\u6837\u5F0F\u4E0E\u5176\u4ED6\u5206\u7C7B\u4E00\u81F4(JS \u4FA7\u63A7\u5236\u53F3\u952E\u83DC\u5355\u8DF3\u8FC7\u5220\u9664) */

#bm-entries-empty {
  text-align: center;
  color: #999;
  padding: 48px 20px;
  font-size: 13px;
  line-height: 1.6;
}

.bm-empty-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.bm-empty-hint {
  color: #999;
  font-size: 12px;
  white-space: pre-line;
}

/* \u5E95\u90E8 footer */
#bm-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid #eee;
  background: #fafafa;
  gap: 8px;
}

.bm-footer-left,
.bm-footer-right {
  display: flex;
  gap: 6px;
}

#bm-panel-footer button {
  background: #fff;
  border: 1px solid #e0e0e0;
  color: #555;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

#bm-panel-footer button:hover {
  background: #00aeec;
  border-color: #00aeec;
  color: #fff;
}

/* \u6536\u85CF\u89C6\u9891\u6309\u94AE(\u5934\u90E8) */
#bm-btn-capture {
  background: #00aeec;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition:
    background 0.15s,
    opacity 0.15s;
}

/* enabled + hover \u624D\u6362\u80CC\u666F\u8272(\u907F\u514D\u7981\u7528\u6001 hover \u4ECD\u53D8) */
#bm-btn-capture:not(:disabled):hover {
  color: #fff !important;
  background: #00c4f4 !important;
}

#bm-btn-capture:disabled,
#bm-btn-capture:disabled:hover {
  background: #ccc !important;
  color: #666 !important;
  cursor: not-allowed;
  opacity: 0.7;
}

/* Toast \u63D0\u793A */
#bm-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity 0.2s,
    transform 0.2s;
  z-index: 1000000;
}

#bm-root.bm-toast #bm-toast {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* \u6697\u8272\u6A21\u5F0F */
@media (prefers-color-scheme: dark) {
  #bm-panel {
    background: #222;
    color: #ddd;
  }
  #bm-panel-header {
    background: linear-gradient(180deg, #2a2a2a, #222);
    border-bottom-color: #333;
  }
  #bm-search-bar {
    background: #1f1f1f;
    border-bottom-color: #333;
  }
  .bm-search {
    background: #2a2a2a;
    border-color: #444;
    color: #eee;
  }
  .bm-search::placeholder { color: #888; }
  .bm-search::-webkit-search-cancel-button {
    background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'><path stroke='%23aaa' stroke-width='2' fill='none' stroke-linecap='round' d='M4 4l10 10M14 4l-10 10'/></svg>") center/12px 12px no-repeat;
  }
  .bm-search::-webkit-search-cancel-button:hover {
    background-color: #333;
  }
  mark.bm-hl {
    background: #5a4a00;
    color: #ffe48a;
  }
  #bm-panel-title {
    color: #eee;
  }
  #bm-panel-actions button {
    color: #aaa;
  }
  #bm-panel-actions button:hover {
    background: #333;
  }
  #bm-categories {
    background: #1f1f1f;
    border-right-color: #333;
  }
  .bm-cat {
    color: #ccc;
  }
  .bm-cat:hover {
    background: #2a2a2a;
  }
  .bm-cat.bm-active {
    background: #2a2a2a;
    color: #00aeec;
  }
  .bm-cat-add {
    border-color: #444;
    color: #888;
  }
  .bm-entry {
    background: #2a2a2a;
    border-color: #333;
  }
  .bm-entry:hover {
    border-color: #00aeec;
  }
  .bm-entry-label {
    color: #eee;
  }
  #bm-panel-footer {
    background: #1f1f1f;
    border-top-color: #333;
  }
  #bm-panel-footer button {
    background: #2a2a2a;
    border-color: #444;
    color: #ccc;
  }
  .bm-entry-actions button:hover {
    background: #333;
  }
  #bm-entries-empty button {
    background: #00aeec;
  }
}
`;

  // src/index.ts
  var _doc2 = getDoc();
  function main() {
    const styleEl = _doc2.createElement("style");
    styleEl.textContent = styles_default;
    _doc2.head.appendChild(styleEl);
    const root = _doc2.createElement("div");
    root.id = "bm-root";
    _doc2.body.appendChild(root);
    const icon = createIcon();
    root.appendChild(icon);
    const store = createStore();
    let data = store.load();
    if (data.categories.length === 0) {
      const uncategorized = {
        id: UNCATEGORIZED_ID,
        name: "\u672A\u5206\u7C7B",
        order: 0,
        createdAt: Date.now()
      };
      store.upsertCategory(uncategorized);
      data = store.load();
    }
    const panel = createPanel(root, data, buildCallbacks(), isVideoPage);
    bindIcon(root, icon);
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        root.classList.remove("bm-open");
        panel.updateCaptureButton(isVideoPage());
      }
    }).observe(_doc2.body, { childList: true, subtree: true });
    function refresh() {
      data = store.load();
      panel.render(data);
    }
    function buildCallbacks() {
      return {
        onCreateCategory: function(name) {
          store.upsertCategory({
            id: uuid(),
            name,
            order: getMinOrder(data.categories) - 1,
            createdAt: Date.now()
          });
          refresh();
        },
        onDeleteCategory: function(id) {
          if (id === UNCATEGORIZED_ID) return;
          const moved = store.moveEntriesToCategory(id, UNCATEGORIZED_ID);
          store.deleteCategory(id);
          if (moved > 0) showToast(root, "\u5DF2\u628A " + moved + " \u6761 entry \u79FB\u5230\u300C\u672A\u5206\u7C7B\u300D");
          refresh();
        },
        onRenameCategory: function(id, newName) {
          store.renameCategory(id, newName);
          refresh();
        },
        onMoveCategoryToTop: function(id) {
          store.moveCategoryToTop(id);
          refresh();
        },
        onMoveEntryToTop: function(entryId) {
          store.moveEntryToTop(entryId);
          refresh();
        },
        onCreateEntry: function(input) {
          if (store.findEntryByKey({ bvid: input.bvid, p: input.p, time: input.time })) {
            if (!window.confirm("\u8BE5\u65F6\u95F4\u70B9\u5DF2\u5B58\u5728,\u662F\u5426\u4ECD\u8981\u6DFB\u52A0?")) return;
          }
          const inCat = data.entries.filter((e) => e.categoryId === input.categoryId);
          const now = Date.now();
          store.upsertEntry({
            id: uuid(),
            categoryId: input.categoryId,
            bvid: input.bvid,
            p: input.p,
            time: input.time,
            label: input.label,
            title: input.title,
            note: input.note,
            order: getMinOrder(inCat) - 1,
            createdAt: now,
            updatedAt: now
          });
          refresh();
        },
        onUpdateEntry: function(entry) {
          store.upsertEntry(entry);
          refresh();
        },
        onDeleteEntry: function(id) {
          store.deleteEntry(id);
          refresh();
        },
        onMoveEntry: function(entryId, newCategoryId) {
          const found = data.entries.find((e) => e.id === entryId);
          if (!found) return;
          store.upsertEntry({ ...found, categoryId: newCategoryId, updatedAt: Date.now() });
          refresh();
        },
        onJumpToEntry: function(entry) {
          window.location.href = buildBiliUrl({ bvid: entry.bvid, p: entry.p, time: entry.time });
        },
        onExport: function() {
          const payload = {
            version: 1,
            exportedAt: Date.now(),
            source: "tampermonkey-bilibili-marks",
            data
          };
          const a = _doc2.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
          a.download = "bilibili-marks-" + payload.exportedAt + ".json";
          _doc2.body.appendChild(a);
          a.click();
          _doc2.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
          showToast(root, "\u5DF2\u5BFC\u51FA JSON");
        },
        onImport: function() {
          const input = _doc2.createElement("input");
          input.type = "file";
          input.accept = "application/json,.json";
          input.addEventListener("change", function() {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function() {
              const result = parseImportPayload(String(reader.result));
              if (!result.ok) {
                window.alert("\u5BFC\u5165\u5931\u8D25:" + result.error);
                return;
              }
              const mode = window.confirm('\u70B9"\u786E\u5B9A"= \u5408\u5E76\u5230\u73B0\u6709\u6570\u636E;\u70B9"\u53D6\u6D88"= \u66FF\u6362\u73B0\u6709\u6570\u636E\u3002') ? "merge" : "replace";
              store.import(result.data, mode);
              refresh();
              showToast(root, "\u5DF2" + (mode === "merge" ? "\u5408\u5E76" : "\u66FF\u6362") + "\u5BFC\u5165");
            };
            reader.readAsText(file);
          });
          input.click();
        },
        onShare: function() {
          const payload = {
            version: 1,
            exportedAt: Date.now(),
            source: "tampermonkey-bilibili-marks",
            data
          };
          downloadShareHtml(payload);
          showToast(root, "\u5DF2\u751F\u6210\u5206\u4EAB\u9875");
        },
        onCaptureCurrent: function() {
          if (!isVideoPage()) {
            window.alert("\u5F53\u524D\u9875\u9762\u4E0D\u662F B \u7AD9\u53EF\u6536\u85CF\u9875(video / \u756A\u5267),\u65E0\u6CD5\u6536\u85CF\u5F53\u524D\u8FDB\u5EA6\u3002");
            return;
          }
          const ctx = captureCurrent();
          if (!ctx) {
            window.alert("\u65E0\u6CD5\u8BC6\u522B\u5F53\u524D\u5185\u5BB9\u3002");
            return;
          }
          const catId = panel.getSelectedCategoryId() || UNCATEGORIZED_ID;
          const label = window.prompt("\u7ED9\u8FD9\u4E00\u6BB5\u8D77\u4E2A\u6807\u6CE8(\u5FC5\u586B):", ctx.title || "");
          if (!label?.trim()) return;
          const inCat = data.entries.filter((e) => e.categoryId === catId);
          const now = Date.now();
          store.upsertEntry({
            id: uuid(),
            categoryId: catId,
            bvid: ctx.bvid,
            p: ctx.p,
            time: ctx.time,
            label: label.trim(),
            title: ctx.title,
            order: getMinOrder(inCat) - 1,
            createdAt: now,
            updatedAt: now
          });
          refresh();
          const cat = data.categories.find((c) => c.id === catId);
          showToast(root, "\u5DF2\u6536\u85CF\u5230\u300C" + (cat ? cat.name : "?") + "\u300D");
        }
      };
    }
  }
  try {
    main();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _doc2.title = "[BM ERR] " + msg;
    console.error("[bm] init failed:", err);
    try {
      const box = _doc2.createElement("div");
      box.style.cssText = "position:fixed;left:20px;bottom:20px;z-index:2147483647;background:#f56c6c;color:#fff;padding:12px 16px;border-radius:6px;font:13px/1.4 system-ui,sans-serif;max-width:320px;white-space:pre-wrap;";
      box.textContent = "B \u7AD9\u6536\u85CF\u5939\u521D\u59CB\u5316\u5931\u8D25:\n" + msg + "\n(\u8BE6\u60C5\u89C1\u63A7\u5236\u53F0 F12)";
      _doc2.body.appendChild(box);
    } catch {
    }
  }
})();
