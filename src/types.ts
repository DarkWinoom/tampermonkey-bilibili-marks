// 全局类型契约。数据可序列化(纯 JSON 兼容),不含方法。

export interface Category {
  id: string;
  name: string;
  icon?: string;          // emoji 或短文本(分享页用)
  order: number;          // 排序权重(升序)
  createdAt: number;
}

export interface Entry {
  id: string;
  categoryId: string;     // FK → Category.id
  bvid: string;           // "BV1xx411c7mD" 或番剧 "ep<id>"
  p: number;              // 分P(1-based)
  time: number;           // 秒数(浮点,>= 0)
  label: string;
  title?: string;
  note?: string;
  order?: number;         // 置顶权重:order 越大越靠前,不影响 updatedAt
  createdAt: number;
  updatedAt: number;
}

export interface EntryKey {
  bvid: string;
  p: number;
  time: number;
}

export interface StoreSchema {
  version: 1;
  categories: Category[];
  entries: Entry[];
}

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  source: string;
  data: StoreSchema;
}

export interface ParsedBiliUrl {
  bvid: string;
  p: number;              // 默认 1
  time: number;           // 默认 0
}

export const EMPTY_STORE: StoreSchema = { version: 1, categories: [], entries: [] };
