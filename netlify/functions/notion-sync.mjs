// 零用金申請系統 — Notion 舍友資料同步 API（Netlify Function）
// POST /api/notion-sync
// Body: { parentPageId?, databaseId?, members: { "忠社": [{id,name}], "孝社": [{id,name}] } }
//
// 流程：
//   1. 驗證 x-roster-key 標頭（同 ROSTER_PASSWORD 環境變數）
//   2. 搵／建舍友登記資料庫（優先 body.databaseId → env NOTION_DATABASE_ID → 父頁面下嘅子資料庫 → 新建）
//   3. 逐個舍友：資料庫有就用返（更新姓名社別），冇就新建頁，回傳每人的 Notion page id
//
// 前端會分批（每批約 8 人）呼叫，避免逾時；除第一批外都要帶返 databaseId。
//
// 需要環境變數：
//   NOTION_TOKEN         — Notion internal integration token（必須）
//   NOTION_DATABASE_ID   — 已有嘅舍友登記資料庫 id（選填）
//   NOTION_PARENT_PAGE_ID— 預設父頁面 id（選填；body 冇填時用）
import { timingSafeEqual } from "node:crypto";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const DB_TITLE = "忠孝宿舍 舍友登記";
const HOUSES = ["忠社", "孝社"];

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
  const hex = String(id || "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// 接受完整網址或裸 id，抽出 32 位 hex
function extractId(v) {
  const m = String(v || "").match(/[0-9a-fA-F]{32}/);
  return m ? dash(m[0]) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function notion(token, path, options = {}) {
  const res = await fetch(NOTION_API + path, {
    ...options,
    headers: {
      "authorization": `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
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

// 搵／建舍友登記資料庫
async function resolveDatabase(token, { databaseId, parentPageId }) {
  const envDb = (globalThis.Netlify && Netlify.env.get("NOTION_DATABASE_ID")) || process.env.NOTION_DATABASE_ID || "";
  const direct = extractId(databaseId) || extractId(envDb);
  if (direct) {
    const db = await notion(token, `/databases/${direct}`);
    return db.id;
  }
  const envParent = (globalThis.Netlify && Netlify.env.get("NOTION_PARENT_PAGE_ID")) || process.env.NOTION_PARENT_PAGE_ID || "";
  const parent = extractId(parentPageId) || extractId(envParent);
  if (!parent) throw Object.assign(new Error("請提供 Notion 父頁面 ID 或網址"), { status: 400 });
  // 睇吓父頁面下有冇已建嘅登記資料庫
  const children = await notion(token, `/blocks/${parent}/children?page_size=100`);
  const found = (children.results || []).find(
    (b) => b.type === "child_database" && (b.child_database?.title || "").includes("舍友登記")
  );
  if (found) return found.id;
  // 冇就新建
  const db = await notion(token, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parent },
      title: [{ type: "text", text: { content: DB_TITLE } }],
      properties: {
        "姓名": { title: {} },
        "舍號": { rich_text: {} },
        "社別": { select: { options: HOUSES.map((h) => ({ name: h })) } },
      },
    }),
  });
  return db.id;
}

// 一次過讀晒資料庫入面嘅 舍號 → pageId
async function loadExisting(token, dbId) {
  const map = {};
  let cursor;
  do {
    const res = await notion(token, `/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const p of res.results || []) {
      const rt = p.properties?.["舍號"]?.rich_text || [];
      const code = rt.map((t) => t.plain_text).join("").trim();
      if (code) map[code] = p.id;
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return map;
}

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const password = (globalThis.Netlify && Netlify.env.get("ROSTER_PASSWORD")) || process.env.ROSTER_PASSWORD || "";
  if (password) {
    let provided = req.headers.get("x-roster-key") || "";
    try { provided = decodeURIComponent(provided); } catch { /* 保留原值 */ }
    if (!safeEqual(provided, password)) return json({ ok: false, error: "unauthorized" }, 401);
  }

  const token = (globalThis.Netlify && Netlify.env.get("NOTION_TOKEN")) || process.env.NOTION_TOKEN || "";
  if (!token) return json({ ok: false, error: "尚未在 Netlify 設定環境變數 NOTION_TOKEN（請參閱設定教學）" }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const members = body && typeof body.members === "object" ? body.members : null;
  if (!members) return json({ ok: false, error: "缺少 members" }, 400);

  try {
    const dbId = await resolveDatabase(token, body);
    const existing = await loadExisting(token, dbId);
    const out = {};
    for (const house of HOUSES) {
      const list = Array.isArray(members[house]) ? members[house] : [];
      out[house] = [];
      for (const m of list) {
        const id = String(m.id || "").trim();
        const name = String(m.name || "").trim();
        if (!id || !name) continue;
        const props = {
          "姓名": { title: [{ type: "text", text: { content: name.slice(0, 100) } }] },
          "舍號": { rich_text: [{ type: "text", text: { content: id.slice(0, 20) } }] },
          "社別": { select: { name: house } },
        };
        let pageId = existing[id];
        if (pageId) {
          await notion(token, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
        } else {
          const page = await notion(token, "/pages", {
            method: "POST",
            body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
          });
          pageId = page.id;
          existing[id] = pageId;
        }
        out[house].push({ id, name, notion: pageId.replace(/-/g, "") });
        await sleep(320); // Notion API 平均每秒 3 次，保持安全距離
      }
    }
    return json({ ok: true, databaseId: dbId.replace(/-/g, ""), members: out });
  } catch (e) {
    const status = e.status === 400 || e.status === 404 ? e.status : 502;
    return json({ ok: false, error: `Notion 同步失敗：${e.message}` }, status);
  }
};

export const config = { path: "/api/notion-sync" };
