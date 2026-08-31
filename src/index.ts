// 油猴脚本入口(沙箱模式:@grant GM + unsafeWindow)
// 串起:样式注入 + 数据层 + 浮标 + 面板 + 路由监听
import type { Category, Entry, ExportPayload, StoreSchema } from './types';
import { uuid } from './id';
import { createStore, getMinOrder } from './storage';
import { createIcon, bindIcon } from './ui/icon';
import { createPanel, type PanelCallbacks, UNCATEGORIZED_ID } from './ui/panel';
import { captureCurrent, isVideoPage } from './bilibili-page';
import { buildBiliUrl } from './url-parser';
import { downloadShareHtml } from './share/export';
import { parseImportPayload } from './share/import';
import { showToast, getDoc } from './ui/dom';
import STYLES from './ui/styles.css';

const _doc = getDoc();

function main(): void {
  // 样式 + 根容器 + 浮标
  const styleEl = _doc.createElement('style');
  styleEl.textContent = STYLES;
  _doc.head.appendChild(styleEl);

  const root = _doc.createElement('div');
  root.id = 'bm-root';
  _doc.body.appendChild(root);

  const icon = createIcon();
  root.appendChild(icon);

  // 数据层 + 首次启动自动建"未分类"分类
  const store = createStore();
  let data: StoreSchema = store.load();
  if (data.categories.length === 0) {
    const uncategorized: Category = {
      id: UNCATEGORIZED_ID,
      name: '未分类',
      order: 0,
      createdAt: Date.now(),
    };
    store.upsertCategory(uncategorized);
    data = store.load();
  }

  const panel = createPanel(root, data, buildCallbacks(), isVideoPage);
  bindIcon(root, icon);

  // SPA 路由变化:收起面板 + 同步"收藏视频"按钮状态
  // 用 class 切换而非 inline style.display(否则后续加 bm-open 也无法显示)
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      root.classList.remove('bm-open');
      panel.updateCaptureButton(isVideoPage());
    }
  }).observe(_doc.body, { childList: true, subtree: true });

  function refresh(): void {
    data = store.load();
    panel.render(data);
  }

  // —— callbacks ——
  function buildCallbacks(): PanelCallbacks {
    return {
      onCreateCategory: function (name) {
        // 新分类放最末:order 取既有最小值 - 1(UI 排序是 order 降序)
        store.upsertCategory({
          id: uuid(),
          name: name,
          order: getMinOrder(data.categories) - 1,
          createdAt: Date.now(),
        });
        refresh();
      },

      onDeleteCategory: function (id) {
        if (id === UNCATEGORIZED_ID) return; // 保护未分类不被删
        // 删除前把 entry 全部移回未分类(而非级联删)
        const moved = store.moveEntriesToCategory(id, UNCATEGORIZED_ID);
        store.deleteCategory(id);
        if (moved > 0) showToast(root, '已把 ' + moved + ' 条 entry 移到「未分类」');
        refresh();
      },

      onRenameCategory: function (id, newName) {
        store.renameCategory(id, newName);
        refresh();
      },

      onMoveCategoryToTop: function (id) {
        store.moveCategoryToTop(id);
        refresh();
      },

      onMoveEntryToTop: function (entryId) {
        store.moveEntryToTop(entryId);
        refresh();
      },

      onCreateEntry: function (input) {
        if (store.findEntryByKey({ bvid: input.bvid, p: input.p, time: input.time })) {
          if (!window.confirm('该时间点已存在,是否仍要添加?')) return;
        }
        // 新 entry 放该分类最末:order 取同分类内最小值 - 1
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
          updatedAt: now,
        });
        refresh();
      },

      onUpdateEntry: function (entry) {
        store.upsertEntry(entry);
        refresh();
      },

      onDeleteEntry: function (id) {
        store.deleteEntry(id);
        refresh();
      },

      onMoveEntry: function (entryId, newCategoryId) {
        const found = data.entries.find((e) => e.id === entryId);
        if (!found) return;
        store.upsertEntry({ ...found, categoryId: newCategoryId, updatedAt: Date.now() });
        refresh();
      },

      onJumpToEntry: function (entry) {
        window.location.href = buildBiliUrl({ bvid: entry.bvid, p: entry.p, time: entry.time });
      },

      onExport: function () {
        const payload: ExportPayload = {
          version: 1,
          exportedAt: Date.now(),
          source: 'tampermonkey-bilibili-marks',
          data: data,
        };
        const a = _doc.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        a.download = 'bilibili-marks-' + payload.exportedAt + '.json';
        _doc.body.appendChild(a);
        a.click();
        _doc.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        showToast(root, '已导出 JSON');
      },

      onImport: function () {
        const input = _doc.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', function () {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function () {
            const result = parseImportPayload(String(reader.result));
            if (!result.ok) { window.alert('导入失败:' + result.error); return; }
            const mode: 'merge' | 'replace' = window.confirm('点"确定"= 合并到现有数据;点"取消"= 替换现有数据。') ? 'merge' : 'replace';
            store.import(result.data, mode);
            refresh();
            showToast(root, '已' + (mode === 'merge' ? '合并' : '替换') + '导入');
          };
          reader.readAsText(file);
        });
        input.click();
      },

      onShare: function () {
        const payload: ExportPayload = {
          version: 1,
          exportedAt: Date.now(),
          source: 'tampermonkey-bilibili-marks',
          data: data,
        };
        downloadShareHtml(payload);
        showToast(root, '已生成分享页');
      },

      onCaptureCurrent: function () {
        if (!isVideoPage()) {
          window.alert('当前页面不是 B 站可收藏页(video / 番剧),无法收藏当前进度。');
          return;
        }
        const ctx = captureCurrent();
        if (!ctx) { window.alert('无法识别当前内容。'); return; }
        const catId = panel.getSelectedCategoryId() || UNCATEGORIZED_ID;
        const label = window.prompt('给这一段起个标注(必填):', ctx.title || '');
        if (!label?.trim()) return;
        // 同分类最末:order 取同分类内最小值 - 1
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
          updatedAt: now,
        });
        refresh();
        const cat = data.categories.find((c) => c.id === catId);
        showToast(root, '已收藏到「' + (cat ? cat.name : '?') + '」');
      },
    };
  }
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  _doc.title = '[BM ERR] ' + msg;
  console.error('[bm] init failed:', err);
  try {
    const box = _doc.createElement('div');
    box.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;background:#f56c6c;color:#fff;padding:12px 16px;border-radius:6px;font:13px/1.4 system-ui,sans-serif;max-width:320px;white-space:pre-wrap;';
    box.textContent = 'B 站收藏夹初始化失败:\n' + msg + '\n(详情见控制台 F12)';
    _doc.body.appendChild(box);
  } catch { /* ignore */ }
}
