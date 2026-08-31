// 解析用户导入的 JSON 字符串为 StoreSchema
// 校验 schema version、必填字段、id 唯一性,失败时返回错误信息
import type { StoreSchema } from '../types';

export type ImportResult =
  | { ok: true; data: StoreSchema }
  | { ok: false; error: string };
export function parseImportPayload(raw: string): ImportResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: '内容为空' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败:${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '根不是对象' };
  }
  const obj = parsed as Record<string, unknown>;

  // 两种合法形态:
  //  A. { version, data: { version, categories, entries } }  ← ExportPayload
  //  B. { version, categories, entries }  ← StoreSchema 直接
  let data: Record<string, unknown> | null = null;
  if (obj.version === 1 && obj.data && typeof obj.data === 'object') {
    data = obj.data as Record<string, unknown>;
  } else if (obj.version === 1 && Array.isArray(obj.categories) && Array.isArray(obj.entries)) {
    data = obj;
  }
  if (!data) {
    return { ok: false, error: 'schema 不匹配(期望 version=1 + categories/entries 或嵌套 data)' };
  }

  const categoriesIn = data.categories as unknown[];
  const entriesIn = data.entries as unknown[];
  if (!Array.isArray(categoriesIn) || !Array.isArray(entriesIn)) {
    return { ok: false, error: 'categories/entries 不是数组' };
  }

  // 校验每个 category
  const categories = [];
  const seenCatIds = new Set<string>();
  for (const c of categoriesIn) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'category 不是对象' };
    const cat = c as Record<string, unknown>;
    if (typeof cat.id !== 'string' || !cat.id) return { ok: false, error: 'category.id 缺失' };
    if (typeof cat.name !== 'string') return { ok: false, error: 'category.name 缺失' };
    if (typeof cat.order !== 'number') return { ok: false, error: 'category.order 缺失' };
    if (typeof cat.createdAt !== 'number') return { ok: false, error: 'category.createdAt 缺失' };
    if (seenCatIds.has(cat.id)) return { ok: false, error: `category.id 重复:${cat.id}` };
    seenCatIds.add(cat.id);
    categories.push({
      id: cat.id,
      name: cat.name,
      icon: typeof cat.icon === 'string' ? cat.icon : undefined,
      order: cat.order,
      createdAt: cat.createdAt,
    });
  }

  // 校验每个 entry
  const entries = [];
  const seenEntryIds = new Set<string>();
  for (const e of entriesIn) {
    if (!e || typeof e !== 'object') return { ok: false, error: 'entry 不是对象' };
    const en = e as Record<string, unknown>;
    if (typeof en.id !== 'string' || !en.id) return { ok: false, error: 'entry.id 缺失' };
    if (typeof en.categoryId !== 'string') return { ok: false, error: 'entry.categoryId 缺失' };
    if (!seenCatIds.has(en.categoryId)) {
      return { ok: false, error: `entry.categoryId 引用了不存在的分类:${en.categoryId}` };
    }
    if (typeof en.bvid !== 'string' || en.bvid.length === 0) {
      return { ok: false, error: 'entry.bvid 缺失' };
    }
    // bvid 三种合法格式:video = BVxxx,bangumi = ep<id> 或 ss<id>
    if (!/^(BV|ep|ss)/.test(en.bvid)) {
      return { ok: false, error: 'entry.bvid 格式错误(应 BV/ep/ss 开头)' };
    }
    if (typeof en.p !== 'number' || en.p < 1) return { ok: false, error: 'entry.p 非法' };
    if (typeof en.time !== 'number' || en.time < 0) return { ok: false, error: 'entry.time 非法' };
    if (typeof en.label !== 'string') return { ok: false, error: 'entry.label 缺失' };
    if (seenEntryIds.has(en.id)) return { ok: false, error: `entry.id 重复:${en.id}` };
    seenEntryIds.add(en.id);
    entries.push({
      id: en.id,
      categoryId: en.categoryId,
      bvid: en.bvid,
      p: en.p,
      time: en.time,
      label: en.label,
      title: typeof en.title === 'string' ? en.title : undefined,
      note: typeof en.note === 'string' ? en.note : undefined,
      createdAt: typeof en.createdAt === 'number' ? en.createdAt : Date.now(),
      updatedAt: typeof en.updatedAt === 'number' ? en.updatedAt : Date.now(),
    });
  }

  return {
    ok: true,
    data: { version: 1, categories, entries },
  };
}
