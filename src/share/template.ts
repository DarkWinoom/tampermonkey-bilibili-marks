// 静态分享页模板:self-contained HTML,数据内嵌 <script id="bm-data">
// 流程:buildShareHtml(payload) 替换占位符 → 写 .html → 浏览器打开

export const SHARE_TEMPLATE = `<!DOCTYPE html>
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
    <h1>🎬 {{TITLE}}</h1>
    <div class="subtitle">共 {{TOTAL_ENTRIES}} 条收藏 · 导出于 {{EXPORTED_AT}}</div>
  </header>
  <main id="bm-content"></main>
  <footer>由 tampermonkey-bilibili-marks 生成 · 接收者无需安装任何插件</footer>
</div>
<script type="application/json" id="bm-data">{{DATA}}</script>
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
      h.textContent = (cat.icon || '📁') + ' ' + cat.name;
      var cnt = document.createElement('span');
      cnt.className = 'cat-count';
      cnt.textContent = '(' + list.length + ')';
      h.appendChild(cnt);
      card.appendChild(h);
      list.forEach(function(e) {
        // 番剧 (ep<id> / ss<id>) 走 /bangumi/play/,其他走 /video/
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
        lab.textContent = e.label || '(未命名)';
        var meta = document.createElement('div');
        meta.className = 'entry-meta';
        var parts = [e.bvid];
        if (e.p > 1) parts.push('P' + e.p);
        if (e.title) parts.push(e.title);
        meta.textContent = parts.join(' · ');
        info.appendChild(lab);
        info.appendChild(meta);
        var a = document.createElement('a');
        a.className = 'entry-play';
        a.href = url;
        a.target = '_blank';
        a.textContent = '▶ 打开';
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
    empty.textContent = '这份收藏夹是空的。';
    frag.appendChild(empty);
  }
  root.appendChild(frag);
})();
</script>
</body>
</html>`;
