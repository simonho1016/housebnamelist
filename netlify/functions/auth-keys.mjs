// 忠孝宿舍服務入口 — Google 網域登入換鑰 API
// POST /api/auth-keys { credential: "<Google ID token>" }
// 流程：向 Google tokeninfo 查證 token → aud 必須係本站 Client ID、
//       email 必須屬於 sbccyc.org.hk → 通過後回傳系統共用密鑰。
// 共用密鑰取自環境變數 PORTAL_KEY；未設定時沿用 ROSTER_PASSWORD（兩者本來相同）。
// 咁樣密鑰唔使寫死喺前端源碼，只有成功通過 Google 網域認證嘅職員先攞到。
const CLIENT_ID = "141456186458-t5ihfut5sir6fl0l3kqbi72hehekerlr.apps.googleusercontent.com";
const ALLOWED_DOMAIN = "sbccyc.org.hk";
const MAX_BODY_BYTES = 8192;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function envGet(name) {
  return (globalThis.Netlify && Netlify.env.get(name)) || process.env[name] || "";
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
  const credential = body && typeof body.credential === "string" ? body.credential : "";
  if (!credential) return json({ error: "missing_credential" }, 400);

  // 向 Google 查證 ID token（過期或造假會回 400）
  let payload;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!r.ok) return json({ error: "bad_token" }, 401);
    payload = await r.json();
  } catch {
    return json({ error: "verify_failed", message: "未能連線 Google 驗證登入" }, 502);
  }

  if (payload.aud !== CLIENT_ID) return json({ error: "bad_audience" }, 401);
  const email = String(payload.email || "").toLowerCase();
  const hd = String(payload.hd || "").toLowerCase();
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!verified || (hd !== ALLOWED_DOMAIN && !email.endsWith("@" + ALLOWED_DOMAIN))) {
    return json({ error: "wrong_domain", message: `只限 @${ALLOWED_DOMAIN} 帳戶` }, 403);
  }

  const key = envGet("PORTAL_KEY") || envGet("ROSTER_PASSWORD");
  if (!key) {
    return json({ error: "server_not_configured", message: "尚未在 Netlify 設定環境變數 PORTAL_KEY" }, 503);
  }
  return json({ key, email, name: String(payload.name || "") });
};

export const config = { path: "/api/auth-keys" };
