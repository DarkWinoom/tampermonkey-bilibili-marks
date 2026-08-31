// B 站页检测:从当前页面提取 bvid + currentTime
// 用途:一键收藏当前进度
// 范围:video + bangumi 两种页面
import { parseBiliUrl } from './url-parser';

export interface CurrentVideoContext {
  bvid: string;          // video: BV 号;bangumi: "ep" + ep_id
  p: number;              // 分P(默认 1)
  time: number;           // 秒数(浮点)
  title?: string;
}

/** 当前是否在 B 站可收藏页(video / bangumi) */
export function isVideoPage(): boolean {
  var path = window.location.pathname;
  return /^\/video\//.test(path) || /^\/bangumi\/play\//.test(path);
}

/** 抓当前页面的视频信息(失败返回 null) */
export function captureCurrent(): CurrentVideoContext | null {
  var path = window.location.pathname;
  if (/^\/video\//.test(path)) {
    var parsed = parseBiliUrl(window.location.href);
    if (!parsed) return null;
    return {
      bvid: parsed.bvid,
      p: parsed.p,
      time: readMainVideoTime(),
      title: readTitle(),
    };
  }
  if (/^\/bangumi\/play\//.test(path)) {
    var m = path.match(/\/bangumi\/play\/(ep|ss)(\d+)/);
    if (!m) return null;
    return {
      bvid: m[1]! + m[2]!, // 保留 ep/ss 前缀,buildBiliUrl 据此选 /bangumi/play/
      p: 1,
      time: readMainVideoTime(),
      title: readTitle(),
    };
  }
  return null;
}

/** 取主视频 currentTime(选尺寸最大的 video) */
function readMainVideoTime(): number {
  var videos = document.querySelectorAll<HTMLVideoElement>('video');
  var best: HTMLVideoElement | null = null;
  var bestArea = 0;
  for (var i = 0; i < videos.length; i += 1) {
    var v = videos[i]!;
    var area = (v.videoWidth || 0) * (v.videoHeight || 0);
    if (area > bestArea) { bestArea = area; best = v; }
  }
  return (best || videos[0]!).currentTime ?? 0;
}

function readTitle(): string | undefined {
  // 优先级:视频标题专用 selector → 通用 h1 / title
  var sels = ['.video-title', 'h1[class*="title"]', '[class*="VideoTitle"]', 'h1', 'title'];
  for (var i = 0; i < sels.length; i += 1) {
    var el = document.querySelector(sels[i]!);
    var text = el?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}
