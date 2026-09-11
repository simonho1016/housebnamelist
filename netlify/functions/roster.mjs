// 孝社 舍友名單 — 雲端儲存 API（Netlify Function + Netlify Blobs）
// GET  /api/roster  → 讀取整份名單
// PUT  /api/roster  → 儲存整份名單（需附 baseRev，版本不符會回 409）
// 所有請求都必須附上 x-roster-key 標頭，內容須與環境變數 ROSTER_PASSWORD 相同。
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const STORE_NAME = "hostel-roster";
const DATA_KEY = "roster";
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

// 只保留名單需要的欄位，並限制長度，避免存入奇怪的資料
function sanitize(input) {
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
    title: typeof src.title === "string" && src.title.trim() ? src.title.trim().slice(0, 60) : "孝社 舍友名單",
    workers: cleanList(src.workers, 20, 20),
    tags: cleanList(src.tags, 20, 40),
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
  const provided = req.headers.get("x-roster-key") || "";
  if (!safeEqual(provided, password)) return json({ error: "unauthorized" }, 401);

  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (req.method === "GET") {
    const data = await store.get(DATA_KEY, { type: "json" });
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
    const current = await store.get(DATA_KEY, { type: "json" });
    const currentRev = current ? Number(current.rev) || 0 : 0;
    const baseRev = Number(body.baseRev) || 0;
    if (baseRev !== currentRev) return json({ error: "conflict", data: current ?? null }, 409);

    const next = { ...sanitize(body), rev: currentRev + 1, savedAt: new Date().toISOString() };
    await store.setJSON(DATA_KEY, next);
    return json({ data: next });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/roster" };
