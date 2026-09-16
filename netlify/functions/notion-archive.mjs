// 零用金申請系統 — Notion 電子存檔 API（Netlify Function）
// POST /api/notion-archive
// Body: { notionId, filename, pdf (base64), meta: { house, payee, payeeId, amount, date, no, staff } }
//
// 流程：
//   1. 驗證 x-roster-key 標頭（同 ROSTER_PASSWORD 環境變數，同名單 API 共用）
//   2. 解析 notionId：完整 32 位 page id 直接用；否則喺 NOTION_DATABASE_ID 嘅資料庫搵
//   3. Notion file_uploads 三段式上傳 PDF，再將 file block 附加到該舍友嘅頁面
//
// 需要環境變數：
//   NOTION_TOKEN         — Notion internal integration token（必須）
//   NOTION_DATABASE_ID   — 舍友登記資料庫 id（選填；唔設就只接受完整 page id）
import { timingSafeEqual } from "node:crypto";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_PDF_BYTES = 8 * 1024 * 1024; // base64 解碼後上限

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function dash(id) {
  const hex = String(id).replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function notion(token, path, options = {}) {
  const res = await fetch(NOTION_API + path, {
    ...options,
    headers: {
      "authorization": `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 保留原文 */ }
  if (!res.ok) {
    const msg = (data && data.message) || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 用短碼（例如 A01）喺資料庫搵舍友頁面
async function findMemberPage(token, dbId, notionId) {
  const db = await notion(token, `/databases/${dash(dbId) || dbId}`);
  const props = db.properties || {};
  // 優先用名為 ID／舍號 嘅欄，否則用 title 欄
  const named = Object.entries(props).find(([k]) => /^(id|舍號|編號)$/i.test(k.trim()));
  const titleProp = Object.entries(props).find(([, v]) => v.type === "title");
  let filter = null;
  if (named && ["rich_text", "title"].includes(named[1].type)) {
    filter = { property: named[0], [named[1].type]: { equals: notionId } };
  } else if (titleProp) {
    filter = { property: titleProp[0], title: { contains: notionId } };
  }
  if (!filter) throw new Error("資料庫搵唔到可以用嚟對照嘅欄位（ID／標題）");
  const res = await notion(token, `/databases/${db.id}/query`, {
    method: "POST",
    body: JSON.stringify({ filter, page_size: 2 }),
  });
  if (!res.results || !res.results.length) return null;
  return res.results[0].id;
}

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // 與名單 API 共用密碼，避免任何人都能向 Notion 寫入
  const password = (globalThis.Netlify && Netlify.env.get("ROSTER_PASSWORD")) || process.env.ROSTER_PASSWORD || "";
  if (password) {
    let provided = req.headers.get("x-roster-key") || "";
    try { provided = decodeURIComponent(provided); } catch { /* 保留原值 */ }
    if (!safeEqual(provided, password)) return json({ ok: false, error: "unauthorized" }, 401);
  }

  const token = (globalThis.Netlify && Netlify.env.get("NOTION_TOKEN")) || process.env.NOTION_TOKEN || "";
  if (!token) return json({ ok: false, error: "尚未在 Netlify 設定環境變數 NOTION_TOKEN（請參閱設定教學）" }, 503);
  const dbId = (globalThis.Netlify && Netlify.env.get("NOTION_DATABASE_ID")) || process.env.NOTION_DATABASE_ID || "";

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const { notionId, filename, pdf } = body || {};
  const meta = body && typeof body.meta === "object" ? body.meta : {};
  if (!notionId || typeof notionId !== "string") return json({ ok: false, error: "缺少 notionId" }, 400);
  if (!pdf || typeof pdf !== "string") return json({ ok: false, error: "缺少 pdf" }, 400);
  const fname = String(filename || "零用金單據.pdf").slice(0, 120);

  let bytes;
  try { bytes = Buffer.from(pdf, "base64"); } catch { return json({ ok: false, error: "pdf 編碼錯誤" }, 400); }
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) return json({ ok: false, error: "pdf 太大或空白" }, 413);

  // 1) 解析目標頁面
  let pageId = dash(notionId.trim());
  try {
    if (!pageId) {
      if (!dbId) {
        return json({ ok: false, error: "Notion ID 唔係完整頁面 ID；請喺 Netlify 設定 NOTION_DATABASE_ID，或喺舍友名單填完整頁面 ID" }, 400);
      }
      pageId = await findMemberPage(token, dbId, notionId.trim());
      if (!pageId) return json({ ok: false, error: `喺 Notion 資料庫搵唔到「${notionId}」` }, 404);
    }
    // 確認 integration 有權限讀呢頁
    await notion(token, `/pages/${pageId}`);
  } catch (e) {
    const code = e.status === 404 ? 404 : 502;
    return json({ ok: false, error: `Notion 錯誤：${e.message}` }, code);
  }

  // 2) 三段式上傳檔案
  try {
    const upload = await notion(token, "/file_uploads", {
      method: "POST",
      body: JSON.stringify({ filename: fname, content_type: "application/pdf" }),
    });
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), fname);
    await notion(token, `/file_uploads/${upload.id}/send`, { method: "POST", body: form });
    await notion(token, `/file_uploads/${upload.id}/complete`, { method: "POST", body: "{}" });

    // 3) 附加到舍友頁面：檔案 + 一行摘要
    const summary = [
      meta.date, meta.house, meta.payee,
      meta.amount ? `港幣 $${meta.amount}` : "",
      meta.no ? `單據編號 ${meta.no}` : "",
      meta.staff ? `經手職員：${meta.staff}` : "",
    ].filter(Boolean).join("　");
    await notion(token, `/blocks/${pageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({
        children: [
          { type: "file", file: { type: "file_upload", file_upload: { id: upload.id }, caption: [] } },
          ...(summary ? [{ type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: summary.slice(0, 1800) } }] } }] : []),
        ],
      }),
    });
    return json({ ok: true, pageId, filename: fname });
  } catch (e) {
    return json({ ok: false, error: `Notion 上傳失敗：${e.message}` }, 502);
  }
};

export const config = { path: "/api/notion-archive" };
