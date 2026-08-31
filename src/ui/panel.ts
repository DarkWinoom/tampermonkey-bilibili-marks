// 主面板:顶部"我的收藏"标题 + "收藏视频"按钮;底部 footer(导入/导出/分享);中间 分类侧栏 + entry 列表
// 负责渲染和用户交互;不直接操作 storage,通过回调把变更上报
import { h, on, showToast, getDoc } from "./dom";
import { formatTime } from "../format";
import type { Category, Entry, StoreSchema } from "../types";

// 沙箱模式下用 unsafeWindow.document(否则 appendChild 不可见)
var _doc = getDoc();

export interface PanelCallbacks {
  /** 名称(无 icon) */
  onCreateCategory(name: string): void;
  onDeleteCategory(id: string): void;
  onRenameCategory(id: string, newName: string): void;
  onMoveCategoryToTop(id: string): void;
  onCreateEntry(input: {
    categoryId: string;
    bvid: string;
    p: number;
    time: number;
    label: string;
    title?: string;
    note?: string;
  }): void;
  onUpdateEntry(entry: Entry): void;
  onDeleteEntry(id: string): void;
  onMoveEntry(entryId: string, newCategoryId: string): void;
  onMoveEntryToTop(entryId: string): void;
  onJumpToEntry(entry: Entry): void;
  onExport(): void;
  onImport(): void;
  onShare(): void;
  onCaptureCurrent(): void;
}

interface PanelState {
  selectedCategoryId: string | null;
}

export interface PanelHandle {
  render(data: StoreSchema): void;
  /** 根据 isVideoPage 同步"收藏视频"按钮的 disabled / title */
  updateCaptureButton(isVideoPage: boolean): void;
  /** 拿当前选中的分类 id(供 onCaptureCurrent 直接使用) */
  getSelectedCategoryId(): string | null;
  destroy(): void;
}

/** 固定的"未分类"分类 id(由 index.ts 启动时建,UI 不可删) */
export const UNCATEGORIZED_ID = "bm-uncategorized";

export function createPanel(
  root: HTMLElement,
  initial: StoreSchema,
  cb: PanelCallbacks,
  getIsVideoPage: () => boolean,
): PanelHandle {
  const state: PanelState = { selectedCategoryId: null };
  // 持有当前 data 引用(每次 render 更新,供 promptMoveEntry 等读分类列表)
  let currentData: StoreSchema = initial;

  // 节点
  const panel = h("div", { id: "bm-panel" });

  // 顶部:左 "我的收藏" + 右 "收藏视频" + "关于" 链接
  const header = h("div", { id: "bm-panel-header" }, [
    h("div", { id: "bm-panel-title" }, "我的收藏"),
    h("div", { id: "bm-panel-actions" }, [
      h(
        "button",
        { id: "bm-btn-capture", title: "点击收藏当前视频进度" },
        "收藏视频",
      ),
      h(
        "a",
        {
          id: "bm-btn-about",
          href: "https://github.com/DarkWinoom/tampermonkey-bilibili-marks",
          target: "_blank",
          rel: "noopener noreferrer",
          title: "项目源码",
        },
        "ⓘ",
      ),
    ]),
  ]);

  // 主体
  const catList = h("div", { id: "bm-categories" });
  const entryList = h("div", { id: "bm-entries" });
  const body = h("div", { id: "bm-panel-body" }, [catList, entryList]);

  // 底部 footer
  const footer = h("div", { id: "bm-panel-footer" }, [
    h("div", { class: "bm-footer-left" }, [
      h("button", { id: "bm-btn-import", title: "从 JSON 导入" }, "导入"),
      h("button", { id: "bm-btn-export", title: "导出为 JSON" }, "导出"),
    ]),
    h("div", { class: "bm-footer-right" }, [
      h(
        "button",
        { id: "bm-btn-share", title: "生成分享页(静态 HTML)" },
        "分享",
      ),
    ]),
  ]);

  // toast
  const toast = h("div", { id: "bm-toast" });

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  root.appendChild(panel);
  root.appendChild(toast);

  // 绑定按钮
  const cleanupFns: Array<() => void> = [];
  const captureBtn =
    header.querySelector<HTMLButtonElement>("#bm-btn-capture")!;
  cleanupFns.push(
    on(captureBtn, "click", () => {
      if (captureBtn.disabled) return; // 非视频页禁用
      cb.onCaptureCurrent();
    }),
  );

  const importBtn = footer.querySelector<HTMLButtonElement>("#bm-btn-import")!;
  const exportBtn = footer.querySelector<HTMLButtonElement>("#bm-btn-export")!;
  const shareBtn = footer.querySelector<HTMLButtonElement>("#bm-btn-share")!;
  cleanupFns.push(on(importBtn, "click", () => cb.onImport()));
  cleanupFns.push(on(exportBtn, "click", () => cb.onExport()));
  cleanupFns.push(on(shareBtn, "click", () => cb.onShare()));

  // 记录当前打开的 dropdown(全局只有一个)
  let openDropdownEntryId: string | null = null;
  function closeAllDropdowns(): void {
    openDropdownEntryId = null;
    var menus = _doc.querySelectorAll(".bm-dropdown-menu");
    for (var i = 0; i < menus.length; i += 1) {
      var m = menus[i] as HTMLElement;
      m.remove();
    }
  }

  // document 点击:三种处理
  //   1. 点 dropdown 内(菜单项) → 不动(菜单项 handler 自行处理)
  //   2. 点 panel 内(不是 dropdown) → 关 dropdown,不关 panel
  //   3. 点 panel 外 → 关 panel + dropdown
  // 关键:用 composedPath() 而不是 e.target.contains,
  // 因为 click 触发后,handler 可能调用 render() 重建 DOM,
  // 此时 e.target 已脱离 DOM 树,contains 返回 false → 误关 panel
  function onDocClick(e: MouseEvent): void {
    if (!root.classList.contains("bm-open")) return;
    var path = (e.composedPath && e.composedPath()) || [];

    // 1. 点 dropdown 内 → 不动
    for (var j = 0; j < path.length; j += 1) {
      var m = path[j] as Element;
      if (m && m.classList && m.classList.contains("bm-dropdown-menu")) return;
    }

    // 2/3:不在 dropdown 内。看是不是在 panel/icon 内
    var insidePanel = false;
    for (var i = 0; i < path.length; i += 1) {
      var n = path[i] as Element;
      if (n && (n.id === "bm-panel" || n.id === "bm-icon")) {
        insidePanel = true;
        break;
      }
    }
    // 在 panel/icon 内 → 只关 dropdown
    closeAllDropdowns();
    // 在 panel 外 → 关 panel
    if (!insidePanel) {
      root.classList.remove("bm-open");
    }
  }
  _doc.addEventListener("click", onDocClick);

  function render(data: StoreSchema): void {
    currentData = data;
    // 默认选中第一个分类(优先级:未分类 > 其他第一个)
    if (
      !state.selectedCategoryId ||
      !data.categories.find(function (c) {
        return c.id === state.selectedCategoryId;
      })
    ) {
      var first = data.categories.find(function (c) {
        return c.id === UNCATEGORIZED_ID;
      });
      if (!first && data.categories.length > 0) first = data.categories[0]!;
      state.selectedCategoryId = first ? first.id : null;
    }
    renderCategories(data, state);
    renderEntries(data, state, cb);
  }

  function renderCategories(data: StoreSchema, state: PanelState): void {
    catList.innerHTML = "";
    // 新建分类按钮
    var addBtn = h("button", { class: "bm-cat-add" }, "+ 新建分类");
    addBtn.addEventListener("click", function () {
      promptCreateCategory(cb);
    });
    catList.appendChild(addBtn);

    // 分类列表:
    //   - "未分类"永远显示在第一位(不论 order)
    //   - 其他分类按 order 降序(order 大的在前,新分类放最后)
    var uncat = data.categories.find(function (c) {
      return c.id === UNCATEGORIZED_ID;
    });
    var others = data.categories
      .filter(function (c) {
        return c.id !== UNCATEGORIZED_ID;
      })
      .sort(function (a, b) {
        return (b.order || 0) - (a.order || 0);
      });
    var sorted: Category[] = [];
    if (uncat) sorted.push(uncat);
    sorted = sorted.concat(others);

    for (var i = 0; i < sorted.length; i += 1) {
      var cat = sorted[i]!;
      var count = data.entries.filter(function (e) {
        return e.categoryId === cat.id;
      }).length;
      var isActive = cat.id === state.selectedCategoryId;
      var isProtected = cat.id === UNCATEGORIZED_ID;
      var catEl = h(
        "div",
        {
          class: "bm-cat" + (isActive ? " bm-active" : ""),
          title: cat.name,
        },
        [
          h("span", { class: "bm-cat-name" }, cat.name),
          h("span", { class: "bm-cat-count" }, String(count)),
        ],
      );
      (function (catObj: Category) {
        catEl.addEventListener("click", function () {
          state.selectedCategoryId = catObj.id;
          render(data);
        });
        // 右键:用鼠标位置定位 dropdown;未分类不弹 dropdown(已在第一位,不能改名)
        catEl.addEventListener("contextmenu", function (e) {
          e.preventDefault();
          if (!isProtected) {
            openCategoryDropdown(catObj, e.clientX, e.clientY);
          }
        });
      })(cat);
      catList.appendChild(catEl);
    }
    // 阻止 catList 空白处右键显示浏览器默认菜单
    catList.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  }

  function renderEntries(
    data: StoreSchema,
    state: PanelState,
    cb: PanelCallbacks,
  ): void {
    entryList.innerHTML = "";
    var catOpt = data.categories.find(function (c) {
      return c.id === state.selectedCategoryId;
    });
    if (!catOpt) {
      var emptyEl = h("div", { id: "bm-entries-empty" }, [
        h("div", {}, "👈 从左侧选一个分类,或新建一个开始收藏。"),
      ]);
      entryList.appendChild(emptyEl);
      return;
    }
    var cat = catOpt;

    var entries = data.entries
      .filter(function (e) {
        return e.categoryId === cat.id;
      })
      .sort(function (a, b) {
        // order 大的在前(置顶),同 order 内部按 createdAt 升序(老的在前,新建的在最后)
        var ao = a.order || 0;
        var bo = b.order || 0;
        if (ao !== bo) return bo - ao;
        return a.createdAt - b.createdAt;
      });

    if (entries.length === 0) {
      // 空状态:引导用户去视频页收藏,而不是手动添加
      var empty2 = h("div", { id: "bm-entries-empty" }, [
        h("div", { class: "bm-empty-title" }, "该分类还没有收藏"),
        h(
          "div",
          { class: "bm-empty-hint" },
          "您可以在 B 站任意视频、番剧页点面板顶部「收藏视频」一键收藏，它会自动记录您当前观看时间",
        ),
      ]);
      entryList.appendChild(empty2);
      return;
    }

    for (var j = 0; j < entries.length; j += 1) {
      var e = entries[j]!;
      // 置顶是排序行为,无视觉差异(label 保持纯文本)
      var rowEl = h("div", { class: "bm-entry" }, [
        h("div", { class: "bm-entry-info" }, [
          h("div", { class: "bm-entry-label" }, e.label || "(未命名)"),
          h(
            "div",
            { class: "bm-entry-meta" },
            formatTime(e.time) +
              " · " +
              e.bvid +
              (e.p > 1 ? " · P" + e.p : "") +
              (e.title ? " · " + e.title : ""),
          ),
        ]),
        h("div", { class: "bm-entry-actions" }, [
          h("button", { class: "bm-play", title: "跳到该时间点播放" }, "▶"),
          h("button", { class: "bm-manage", title: "管理" }, "⚙"),
        ]),
      ]);
      (function (entry: Entry) {
        var buttons = rowEl.querySelectorAll<HTMLButtonElement>("button");
        var playBtn = buttons[0]!;
        var manageBtn = buttons[1]!;
        playBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          cb.onJumpToEntry(entry);
        });
        manageBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleDropdown(entry, manageBtn);
        });
      })(e);
      entryList.appendChild(rowEl);
    }
  }

  function toggleDropdown(entry: Entry, buttonEl: HTMLElement): void {
    if (openDropdownEntryId === entry.id) {
      closeAllDropdowns();
      return;
    }
    closeAllDropdowns();
    openDropdownEntryId = entry.id;

    var menu = h("div", { class: "bm-dropdown-menu" }, [
      h("button", { class: "bm-dd-item" }, "改分类"),
      h("button", { class: "bm-dd-item" }, "置顶"),
      h("button", { class: "bm-dd-item" }, "修改"),
      h("button", { class: "bm-dd-item bm-dd-del" }, "删除"),
    ]);
    positionDropdown(menu, buttonEl);
    _doc.body.appendChild(menu);

    var items = menu.querySelectorAll<HTMLButtonElement>("button");
    items[0]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      promptMoveEntry(entry, currentData, cb);
    });
    items[1]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      cb.onMoveEntryToTop(entry.id);
    });
    items[2]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      promptEditEntry(entry, cb);
    });
    items[3]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      if (confirm('删除"' + (entry.label || "未命名") + '"?'))
        cb.onDeleteEntry(entry.id);
    });
  }

  function openCategoryDropdown(
    cat: Category,
    clientX: number,
    clientY: number,
  ): void {
    closeAllDropdowns();
    var isProtected = cat.id === UNCATEGORIZED_ID;
    var items: HTMLElement[] = [
      h("button", { class: "bm-dd-item" }, "置顶"),
      h("button", { class: "bm-dd-item" }, "改名"),
    ];
    if (!isProtected) {
      items.push(h("button", { class: "bm-dd-item bm-dd-del" }, "删除"));
    }
    var menu = h("div", { class: "bm-dropdown-menu" }, items);
    positionDropdownAtMouse(menu, clientX, clientY);
    _doc.body.appendChild(menu);

    var btns = menu.querySelectorAll<HTMLButtonElement>("button");
    btns[0]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      cb.onMoveCategoryToTop(cat.id);
    });
    btns[1]!.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      var newName = window.prompt("新名字:", cat.name);
      if (newName === null) return;
      var trimmed = newName.trim();
      if (!trimmed) return;
      cb.onRenameCategory(cat.id, trimmed);
    });
    if (!isProtected && btns[2]) {
      btns[2]!.addEventListener("click", function (e) {
        e.stopPropagation();
        closeAllDropdowns();
        if (
          confirm(
            '删除分类"' +
              cat.name +
              '"?该分类下的 entry 会自动移到「未分类」。',
          )
        ) {
          cb.onDeleteCategory(cat.id);
          if (state.selectedCategoryId === cat.id)
            state.selectedCategoryId = null;
        }
      });
    }
  }

  function positionDropdown(menu: HTMLElement, anchorEl: HTMLElement): void {
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

  /** 用鼠标位置定位(分类右键用,符合"对应那条"的位置) */
  function positionDropdownAtMouse(
    menu: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    var menuWidth = 100;
    var left = clientX;
    var top = clientY;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 8) left = 8;
    // 菜单项数 3 / 4
    var itemCount = menu.querySelectorAll("button").length;
    var estimatedHeight = itemCount * 32 + 8;
    if (top + estimatedHeight > window.innerHeight) {
      top = window.innerHeight - estimatedHeight - 8;
    }
    if (top < 8) top = 8;
    applyMenuStyle(menu, left, top, menuWidth);
  }

  /** 实际写 inline style(用 cssText + !important 避免被 css class 覆盖) */
  function applyMenuStyle(
    menu: HTMLElement,
    left: number,
    top: number,
    menuWidth: number,
  ): void {
    menu.style.cssText =
      "position: fixed !important; z-index: 2147483647 !important;" +
      "top: " +
      top +
      "px !important; left: " +
      left +
      "px !important;" +
      "width: " +
      menuWidth +
      "px !important;" +
      "background: #fff; border: 1px solid #e0e0e0; border-radius: 6px;" +
      "box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 4px 0;" +
      "margin: 0;";
  }

  function updateCaptureButton(isVideoPage: boolean): void {
    captureBtn.disabled = !isVideoPage;
    captureBtn.title = isVideoPage
      ? "点击收藏当前视频进度"
      : "当前页面不是 B 站视频页,无法收藏当前进度。";
  }

  function destroy(): void {
    for (var i = 0; i < cleanupFns.length; i += 1) cleanupFns[i]!();
    _doc.removeEventListener("click", onDocClick);
    closeAllDropdowns();
  }

  // 首次渲染
  render(initial);
  // 同步"收藏视频"按钮状态
  updateCaptureButton(getIsVideoPage());

  return {
    render: render,
    updateCaptureButton: updateCaptureButton,
    getSelectedCategoryId: function (): string | null {
      return state.selectedCategoryId;
    },
    destroy: destroy,
  };
}

// —— 弹窗辅助 ——

function promptCreateCategory(cb: PanelCallbacks): void {
  var name = prompt("分类名:");
  if (!name) return;
  cb.onCreateCategory(name.trim());
}

function promptEditEntry(entry: Entry, cb: PanelCallbacks): void {
  var label = prompt("新标注:", entry.label)?.trim();
  if (!label) return;
  var timeStr = prompt("新时间(秒):", String(entry.time));
  var time = Number(timeStr);
  if (!Number.isFinite(time) || time < 0) {
    alert("时间格式错误");
    return;
  }
  var note = prompt("备注(留空不变):", entry.note ?? "") ?? entry.note;
  cb.onUpdateEntry({
    id: entry.id,
    categoryId: entry.categoryId,
    bvid: entry.bvid,
    p: entry.p,
    time: time,
    label: label,
    title: entry.title,
    note: note || undefined,
    createdAt: entry.createdAt,
    updatedAt: Date.now(),
  });
}

function promptMoveEntry(
  entry: Entry,
  data: StoreSchema,
  cb: PanelCallbacks,
): void {
  // 把"未分类"作为独立选项 0,其他分类从 1 开始
  // 列表里标注当前分类(避免选错)
  // 默认 = 当前分类的序号(回车 = 不动)
  var others = data.categories
    .filter(function (c) {
      return c.id !== UNCATEGORIZED_ID;
    })
    .sort(function (a, b) {
      return (b.order || 0) - (a.order || 0);
    });

  var currentIsUncategorized = entry.categoryId === UNCATEGORIZED_ID;
  var defaultIdx: number;
  if (currentIsUncategorized) {
    defaultIdx = 0;
  } else {
    var pos = others.findIndex(function (c) {
      return c.id === entry.categoryId;
    });
    defaultIdx = pos >= 0 ? pos + 1 : 0;
  }

  // 显式 \n 隔离每个 item(防止某些 prompt 实现吞掉首项前的换行)
  var lines: string[] = ["0. 未分类"];
  others.forEach(function (c, i) {
    var mark = c.id === entry.categoryId ? " (当前)" : "";
    lines.push(i + 1 + ". " + c.name + mark);
  });
  var list = lines.join("\n");

  var pick = prompt(
    "选目标分类(输入序号,直接回车 = 保持当前):\n\n" + list + "\n",
    String(defaultIdx),
  );
  if (pick === null) return; // 取消
  if (pick === "" || pick === String(defaultIdx)) return; // 没改

  var targetId: string;
  if (pick === "0") {
    targetId = UNCATEGORIZED_ID;
  } else {
    var idx = Number(pick) - 1;
    var target = others[idx];
    if (!target) {
      alert("序号无效");
      return;
    }
    targetId = target.id;
  }
  if (targetId === entry.categoryId) return; // 已在该分类
  cb.onMoveEntry(entry.id, targetId);
}
