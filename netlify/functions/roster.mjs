// 孝社 舍友名單 — 雲端儲存 API（Netlify Function + Netlify Blobs）
// GET  /api/roster?house=xiao|zhong  → 讀取該社整份名單
// PUT  /api/roster?house=xiao|zhong  → 儲存該社整份名單（需附 baseRev，版本不符會回 409）
// 所有請求都必須附上 x-roster-key 標頭，內容須與環境變數 ROSTER_PASSWORD 相同。
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const STORE_NAME = "hostel-roster";
// 各社名單：id → 雲端儲存鍵及預設標題。孝社沿用原本的鍵，既有資料不受影響。
const HOUSES = {
  xiao:  { key: "roster",       title: "孝社 舍友名單" },
  zhong: { key: "roster-zhong", title: "忠社 舍友名單" },
};
const MAX_BODY_BYTES = 200_000;

const BEDS = [];
for (let i = 1; i <= 24; i++) { if (i === 8) continue; BEDS.push("B" + String(i).padStart(2, "0")); }
BEDS.push("B26");

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

function cleanList(list, maxItems, maxLen) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    if (typeof x !== "string") continue;
    const v = x.trim().slice(0, maxLen);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanColors(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string" || !k.trim() || n >= 40) continue;
    out[k.trim().slice(0, 20)] = v.trim().slice(0, 20);
    n++;
  }
  return out;
}

// 只保留名單需要的欄位，並限制長度，避免存入奇怪的資料
function sanitize(input, defaultTitle) {
  const src = input && typeof input === "object" ? input : {};
  const residentsIn = src.residents && typeof src.residents === "object" ? src.residents : {};
  const residents = {};
  for (const bed of BEDS) {
    const r = residentsIn[bed] && typeof residentsIn[bed] === "object" ? residentsIn[bed] : {};
    residents[bed] = {
      name: typeof r.name === "string" ? r.name.trim().slice(0, 60) : "",
      workers: cleanList(r.workers, 10, 20),
      tags: cleanList(r.tags, 20, 30),
    };
  }
  return {
    version: 1,
    title: typeof src.title === "string" && src.title.trim() ? src.title.trim().slice(0, 60) : defaultTitle,
    workers: cleanList(src.workers, 20, 20),
    tags: cleanList(src.tags, 20, 40),
    workerColors: cleanColors(src.workerColors),
    greyTag: typeof src.greyTag === "string" ? src.greyTag.trim().slice(0, 40) : "",
    theme: typeof src.theme === "string" ? src.theme.trim().slice(0, 20) : "",
    font: typeof src.font === "string" ? src.font.trim().slice(0, 20) : "",
    residents,
    updated: typeof src.updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(src.updated)
      ? src.updated
      : new Date().toISOString().slice(0, 10),
  };
}

export default async (req) => {
  const password = (globalThis.Netlify && Netlify.env.get("ROSTER_PASSWORD")) || process.env.ROSTER_PASSWORD || "";
  if (!password) {
    return json({ error: "server_not_configured", message: "尚未在 Netlify 設定環境變數 ROSTER_PASSWORD" }, 503);
  }
  // 前端會先 encodeURIComponent 再放入標頭（HTTP 標頭不能直接載有中文），這裡解碼後才比對
  let provided = req.headers.get("x-roster-key") || "";
  try { provided = decodeURIComponent(provided); } catch { /* 保留原值 */ }
  if (!safeEqual(provided, password)) return json({ error: "unauthorized" }, 401);

  const houseId = new URL(req.url).searchParams.get("house") || "xiao";
  if (!Object.prototype.hasOwnProperty.call(HOUSES, houseId)) return json({ error: "unknown_house" }, 400);
  const house = HOUSES[houseId];

  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (req.method === "GET") {
    const data = await store.get(house.key, { type: "json" });
    return json({ data: data ?? null });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
    if (!body || typeof body !== "object" || !body.residents || typeof body.residents !== "object") {
      return json({ error: "bad_shape" }, 400);
    }
    const current = await store.get(house.key, { type: "json" });
    const currentRev = current ? Number(current.rev) || 0 : 0;
    const baseRev = Number(body.baseRev) || 0;
    if (baseRev !== currentRev) return json({ error: "conflict", data: current ?? null }, 409);

    const next = { ...sanitize(body, house.title), rev: currentRev + 1, savedAt: new Date().toISOString() };
    await store.setJSON(house.key, next);
    return json({ data: next });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/roster" };
