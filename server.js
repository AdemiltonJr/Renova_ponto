const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PUNCHES_FILE = path.join(DATA_DIR, "punches.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const config = {
  port: Number(process.env.PORT || 3000),
  schoolName: process.env.SCHOOL_NAME || "Escola Renova",
  schoolLatitude: Number(process.env.SCHOOL_LATITUDE || -23.55052),
  schoolLongitude: Number(process.env.SCHOOL_LONGITUDE || -46.633308),
  allowedRadiusMeters: Number(process.env.ALLOWED_RADIUS_METERS || 120),
  maxAccuracyMeters: Number(process.env.MAX_ACCURACY_METERS || 80),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 16),
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function nowIso() {
  return new Date().toISOString();
}

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await createJsonIfMissing(PUNCHES_FILE, []);
  await createJsonIfMissing(SESSIONS_FILE, []);

  try {
    await fs.access(USERS_FILE);
  } catch {
    const users = [
      await makeUser("admin", "Admin Renova", process.env.ADMIN_PIN || "123456", "admin"),
      await makeUser("colab001", "Colaborador Demo", process.env.DEMO_PIN || "1234", "employee"),
    ];
    await writeJson(USERS_FILE, users);
    console.log("Usuarios iniciais criados: admin/123456 e colab001/1234. Troque os PINs antes do uso real.");
  }
}

async function createJsonIfMissing(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, fallback);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeUser(code, name, pin, role) {
  const { salt, hash } = await hashPin(pin);
  return {
    id: crypto.randomUUID(),
    code,
    name,
    role,
    active: true,
    salt,
    pinHash: hash,
    createdAt: nowIso(),
  };
}

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve({ salt, hash: derivedKey.toString("hex") });
    });
  });
}

async function verifyPin(pin, user) {
  const { hash } = await hashPin(pin, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.pinHash, "hex"));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function createSession(userId) {
  const sessions = await readJson(SESSIONS_FILE, []);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000).toISOString();
  sessions.push({ token, userId, expiresAt, createdAt: nowIso() });
  await writeJson(SESSIONS_FILE, sessions.filter((session) => new Date(session.expiresAt) > new Date()));
  return { token, expiresAt };
}

async function getUserFromRequest(req) {
  const token = parseCookies(req).renova_session;
  if (!token) return null;
  const [sessions, users] = await Promise.all([readJson(SESSIONS_FILE, []), readJson(USERS_FILE, [])]);
  const session = sessions.find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  return users.find((user) => user.id === session.userId && user.active) || null;
}

function publicUser(user) {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  const earthRadius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateLocation({ latitude, longitude, accuracy }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "Localizacao invalida." };
  }
  if (Number.isFinite(acc) && acc > config.maxAccuracyMeters) {
    return {
      ok: false,
      reason: `Precisao insuficiente (${Math.round(acc)}m). Tente novamente em uma area aberta.`,
      distance: null,
      accuracy: acc,
    };
  }
  const distance = distanceMeters(lat, lng, config.schoolLatitude, config.schoolLongitude);
  if (distance > config.allowedRadiusMeters) {
    return {
      ok: false,
      reason: `Fora do raio permitido. Distancia aproximada: ${Math.round(distance)}m.`,
      distance,
      accuracy: acc,
    };
  }
  return { ok: true, distance, accuracy: acc };
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    return send(res, 200, { ok: true, name: config.schoolName });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const users = await readJson(USERS_FILE, []);
    const user = users.find((item) => item.code.toLowerCase() === String(body.code || "").trim().toLowerCase() && item.active);
    if (!user || !(await verifyPin(body.pin || "", user))) {
      return send(res, 401, { error: "Codigo ou PIN incorreto." });
    }
    const session = await createSession(user.id);
    return send(res, 200, { user: publicUser(user), expiresAt: session.expiresAt }, {
      "Set-Cookie": `renova_session=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.sessionTtlHours * 3600}`,
    });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const token = parseCookies(req).renova_session;
    if (token) {
      const sessions = await readJson(SESSIONS_FILE, []);
      await writeJson(SESSIONS_FILE, sessions.filter((session) => session.token !== token));
    }
    return send(res, 200, { ok: true }, { "Set-Cookie": "renova_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  const user = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: "Sessao expirada. Entre novamente." });

  if (url.pathname === "/api/me") {
    return send(res, 200, {
      user: publicUser(user),
      config: {
        schoolName: config.schoolName,
        schoolLatitude: config.schoolLatitude,
        schoolLongitude: config.schoolLongitude,
        allowedRadiusMeters: config.allowedRadiusMeters,
        maxAccuracyMeters: config.maxAccuracyMeters,
      },
    });
  }

  if (url.pathname === "/api/punches" && req.method === "GET") {
    const punches = await readJson(PUNCHES_FILE, []);
    const visible = user.role === "admin" ? punches : punches.filter((punch) => punch.userId === user.id);
    return send(res, 200, { punches: visible.slice(-250).reverse() });
  }

  if (url.pathname === "/api/punches" && req.method === "POST") {
    const body = await readBody(req);
    const validTypes = ["in", "interval_in", "interval_out", "out"];
    const type = validTypes.includes(body.type) ? body.type : "in";
    const location = validateLocation(body.location || {});
    const punches = await readJson(PUNCHES_FILE, []);
    const punch = {
      id: crypto.randomUUID(),
      userId: user.id,
      userCode: user.code,
      userName: user.name,
      type,
      status: location.ok ? "approved" : "rejected",
      reason: location.reason || null,
      latitude: Number(body.location?.latitude),
      longitude: Number(body.location?.longitude),
      accuracy: Number(body.location?.accuracy),
      distanceMeters: location.distance === null || location.distance === undefined ? null : Math.round(location.distance),
      createdAt: nowIso(),
    };
    punches.push(punch);
    await writeJson(PUNCHES_FILE, punches);
    if (!location.ok) return send(res, 422, { error: location.reason, punch });
    return send(res, 201, { punch });
  }

  if (url.pathname === "/api/admin/users" && user.role === "admin") {
    if (req.method === "GET") {
      const users = await readJson(USERS_FILE, []);
      return send(res, 200, { users: users.map(publicUser) });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const code = String(body.code || "").trim();
      const name = String(body.name || "").trim();
      const pin = String(body.pin || "").trim();
      const role = body.role === "admin" ? "admin" : "employee";

      if (!code || !name || !pin) return send(res, 400, { error: "Todos os campos sao obrigatorios." });

      const users = await readJson(USERS_FILE, []);
      if (users.some((u) => u.code.toLowerCase() === code.toLowerCase())) {
        return send(res, 400, { error: "Este codigo ja esta em uso." });
      }

      const newUser = await makeUser(code, name, pin, role);
      users.push(newUser);
      await writeJson(USERS_FILE, users);
      return send(res, 201, { user: publicUser(newUser) });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const targetId = body.id;
      const newPin = body.pin;
      const action = body.action;

      const users = await readJson(USERS_FILE, []);
      const targetUser = users.find((u) => u.id === targetId);
      if (!targetUser) return send(res, 404, { error: "Usuario nao encontrado." });

      if (action === "pin") {
        if (!newPin) return send(res, 400, { error: "PIN obrigatorio." });
        const { salt, hash } = await hashPin(newPin);
        targetUser.salt = salt;
        targetUser.pinHash = hash;
      } else if (action === "toggle_active") {
        targetUser.active = !targetUser.active;
      }

      await writeJson(USERS_FILE, users);
      return send(res, 200, { user: publicUser(targetUser) });
    }
  }

  if (url.pathname === "/api/admin/punches" && user.role === "admin") {
    if (req.method === "POST") {
      const body = await readBody(req);
      const targetUserId = body.userId;
      const type = body.type;
      const createdAt = body.createdAt;
      const reason = body.reason || "Registro manual por admin";

      if (!targetUserId || !type || !createdAt) {
        return send(res, 400, { error: "Todos os campos são obrigatórios." });
      }

      const users = await readJson(USERS_FILE, []);
      const targetUser = users.find((u) => u.id === targetUserId);
      if (!targetUser) {
        return send(res, 404, { error: "Usuário não encontrado." });
      }

      const punches = await readJson(PUNCHES_FILE, []);
      const newPunch = {
        id: crypto.randomUUID(),
        userId: targetUser.id,
        userCode: targetUser.code,
        userName: targetUser.name,
        type,
        status: "approved",
        reason,
        latitude: config.schoolLatitude,
        longitude: config.schoolLongitude,
        accuracy: 1,
        distanceMeters: 0,
        createdAt: new Date(createdAt).toISOString(),
      };

      punches.push(newPunch);
      await writeJson(PUNCHES_FILE, punches);
      return send(res, 201, { punch: newPunch });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const punchId = body.punchId;

      if (!punchId) {
        return send(res, 400, { error: "O campo punchId é obrigatório." });
      }

      const punches = await readJson(PUNCHES_FILE, []);
      const punch = punches.find((p) => p.id === punchId);
      if (!punch) {
        return send(res, 404, { error: "Ponto não encontrado." });
      }

      if (body.action === "edit") {
        const { createdAt, type, status, reason } = body;
        if (!createdAt || !type || !status || !reason) {
          return send(res, 400, { error: "Todos os campos (data, hora, tipo, status e justificativa) são obrigatórios." });
        }

        const validTypes = ["in", "interval_in", "interval_out", "out"];
        if (!validTypes.includes(type)) {
          return send(res, 400, { error: "Tipo de registro inválido." });
        }

        const hasChanges =
          new Date(punch.createdAt).getTime() !== new Date(createdAt).getTime() ||
          punch.type !== type ||
          punch.status !== status ||
          punch.reason !== reason;

        if (hasChanges) {
          if (!punch.originalCreatedAt) {
            punch.originalCreatedAt = punch.createdAt;
            punch.originalType = punch.type;
            punch.originalStatus = punch.status;
            punch.originalReason = punch.reason;
          }
          punch.createdAt = new Date(createdAt).toISOString();
          punch.type = type;
          punch.status = status;
          punch.reason = reason;
          punch.editedAt = nowIso();
          punch.editedBy = `${user.name} (${user.code})`;
        }
      } else {
        const status = body.status;
        const reason = body.reason || null;

        if (!status) {
          return send(res, 400, { error: "Campos punchId e status são obrigatórios." });
        }

        if (punch.status !== status || punch.reason !== reason) {
          if (!punch.originalCreatedAt) {
            punch.originalCreatedAt = punch.createdAt;
            punch.originalType = punch.type;
            punch.originalStatus = punch.status;
            punch.originalReason = punch.reason;
          }
          punch.status = status;
          punch.reason = reason;
          punch.editedAt = nowIso();
          punch.editedBy = `${user.name} (${user.code})`;
        }
      }

      await writeJson(PUNCHES_FILE, punches);
      return send(res, 200, { punch });
    }

    if (req.method === "DELETE") {
      let punchId = url.searchParams.get("punchId");
      if (!punchId) {
        const body = await readBody(req).catch(() => ({}));
        punchId = body.punchId;
      }

      if (!punchId) {
        return send(res, 400, { error: "O campo punchId é obrigatório." });
      }

      const punches = await readJson(PUNCHES_FILE, []);
      const index = punches.findIndex((p) => p.id === punchId);
      if (index === -1) {
        return send(res, 404, { error: "Ponto não encontrado." });
      }

      punches.splice(index, 1);
      await writeJson(PUNCHES_FILE, punches);
      return send(res, 200, { success: true });
    }
  }

  if (url.pathname === "/api/admin/export.csv" && user.role === "admin") {
    const punches = await readJson(PUNCHES_FILE, []);
    const rows = [
      ["data_hora", "codigo", "nome", "tipo", "status", "distancia_m", "precisao_m", "motivo"],
      ...punches.map((punch) => [
        punch.createdAt,
        punch.userCode,
        punch.userName,
        punch.type === "in" ? "Entrada Trabalho" : punch.type === "interval_in" ? "Entrada Intervalo" : punch.type === "interval_out" ? "Saida Intervalo" : "Saida Trabalho",
        punch.status,
        punch.distanceMeters ?? "",
        punch.accuracy ?? "",
        punch.reason ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"renova-pontos.csv\"",
      "Cache-Control": "no-store",
    });
    return res.end(csv);
  }

  return send(res, 404, { error: "Rota nao encontrada." });
}

function csvCell(value) {
  const text = String(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Acesso negado.");
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return redirect(res, "/");
    const extension = path.extname(filePath);
    const fileName = path.basename(filePath);
    const file = await fs.readFile(filePath);
    const noStoreAssets = new Set([".html", ".js", ".css"]);
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": fileName === "sw.js" || noStoreAssets.has(extension) ? "no-store" : "public, max-age=3600",
    });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fallback);
  }
}

async function main() {
  await ensureData();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      return await serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: "Erro interno." });
    }
  });

  server.listen(config.port, () => {
    console.log(`${config.schoolName} Ponto rodando em http://localhost:${config.port}`);
  });
}

main();
