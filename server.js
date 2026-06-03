const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const webPush = require("web-push");
const Schedule = require("./public/schedule.js");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PUNCHES_FILE = path.join(DATA_DIR, "punches.json");
const PUNCH_REQUESTS_FILE = path.join(DATA_DIR, "punch-requests.json");
const SCHEDULES_FILE = path.join(DATA_DIR, "work-schedules.json");
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const NOTIFICATION_LOG_FILE = path.join(DATA_DIR, "notification-log.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const config = {
  port: Number(process.env.PORT || 3000),
  schoolName: process.env.SCHOOL_NAME || "Escola Renova",
  schoolLatitude: Number(process.env.SCHOOL_LATITUDE || -23.55052),
  schoolLongitude: Number(process.env.SCHOOL_LONGITUDE || -46.633308),
  allowedRadiusMeters: Number(process.env.ALLOWED_RADIUS_METERS || 120),
  maxAccuracyMeters: Number(process.env.MAX_ACCURACY_METERS || 80),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 16),
  timeZone: process.env.TIME_ZONE || "America/Sao_Paulo",
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
  await createJsonIfMissing(PUNCH_REQUESTS_FILE, []);
  await createJsonIfMissing(SCHEDULES_FILE, []);
  await createJsonIfMissing(PUSH_SUBSCRIPTIONS_FILE, []);
  await createJsonIfMissing(NOTIFICATION_LOG_FILE, []);
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

const readSchedules = () => readJson(SCHEDULES_FILE, []);
const writeSchedules = (schedules) => writeJson(SCHEDULES_FILE, schedules);
const readPushSubscriptions = () => readJson(PUSH_SUBSCRIPTIONS_FILE, []);
const writePushSubscriptions = (subscriptions) => writeJson(PUSH_SUBSCRIPTIONS_FILE, subscriptions);
const readNotificationLog = () => readJson(NOTIFICATION_LOG_FILE, []);
const writeNotificationLog = (log) => writeJson(NOTIFICATION_LOG_FILE, log);

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

const initialSchedulesByName = {
  leonilda: { weekdays: [1, 2, 3, 4, 5], start: "07:30", end: "17:30", intervalMinutes: 60 },
  viviane: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "17:30", intervalMinutes: 15 },
  priscila: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "17:30", intervalMinutes: 15 },
  gabrielle: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", intervalMinutes: 15 },
  gabriele: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", intervalMinutes: 15 },
  mayara: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", intervalMinutes: 15 },
  jaqueline: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", intervalMinutes: 15 },
  talita: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", intervalMinutes: 15 },
  rosilaine: { weekdays: [1, 2, 3, 4, 5], start: "07:30", end: "17:30", intervalMinutes: 75 },
  karen: { weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", intervalMinutes: 75 },
  bianca: { weekdays: [1, 2, 3, 4, 5], start: "07:30", end: "17:30", intervalMinutes: 75 },
  rebeca: { weekdays: [1, 2, 3, 4, 5], start: "13:00", end: "17:30", intervalMinutes: 15 },
  rosane: { days: { 3: { start: "13:45", end: "17:15", intervalMinutes: 0 }, 4: { start: "14:30", end: "17:15", intervalMinutes: 0 } } },
  gabriel: { days: { 1: { start: "13:45", end: "16:45", intervalMinutes: 0 }, 2: { start: "13:00", end: "17:15", intervalMinutes: 0 }, 4: { start: "13:00", end: "17:15", intervalMinutes: 0 }, 5: { start: "13:45", end: "16:45", intervalMinutes: 0 } } },
  leticia: { days: { 1: { start: "15:30", end: "17:15", intervalMinutes: 0 }, 3: { start: "14:45", end: "17:15", intervalMinutes: 0 }, 5: { start: "14:00", end: "17:15", intervalMinutes: 0 } } },
};

const vapidPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
const vapidSubject = process.env.WEB_PUSH_SUBJECT || "mailto:admin@empreendemjuntos.com.br";

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function normalizeNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function buildDaysFromWeekdays(seed) {
  if (seed.days) return JSON.parse(JSON.stringify(seed.days));
  return seed.weekdays.reduce((days, weekday) => {
    days[weekday] = {
      start: Schedule.normalizeTime(seed.start),
      end: Schedule.normalizeTime(seed.end),
      intervalMinutes: Math.max(0, Math.round(Number(seed.intervalMinutes || 0))),
    };
    return days;
  }, {});
}

function buildInitialScheduleForUser(user) {
  if (!user || user.role !== "employee") return null;
  const seed = initialSchedulesByName[normalizeNameKey(user.name)];
  if (!seed) return null;
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    profile: "Colaborador",
    active: true,
    notifyBeforeMinutes: 10,
    missedReminderMinutes: 5,
    days: buildDaysFromWeekdays(seed),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeScheduleDays(days) {
  if (!days || typeof days !== "object") return null;
  const normalized = {};

  for (const [weekdayKey, day] of Object.entries(days)) {
    const weekday = Number(weekdayKey);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;

    const config = Schedule.normalizeDayConfig(day);
    if (!config) return null;
    normalized[weekday] = {
      start: config.start,
      end: config.end,
      intervalMinutes: config.intervalMinutes,
    };
  }

  return normalized;
}

async function seedMissingSchedules() {
  const [users, schedules] = await Promise.all([readJson(USERS_FILE, []), readSchedules()]);
  let changed = false;

  for (const user of users.filter((item) => item.role === "employee")) {
    const officialSchedule = buildInitialScheduleForUser(user);
    if (!officialSchedule) continue;

    const existingIndex = schedules.findIndex((schedule) => schedule.userId === user.id);
    if (existingIndex === -1) {
      schedules.push(officialSchedule);
      changed = true;
      continue;
    }

    const existing = schedules[existingIndex];
    const expectedDays = normalizeScheduleDays(officialSchedule.days);
    if (JSON.stringify(normalizeScheduleDays(existing.days)) !== JSON.stringify(expectedDays)) {
      schedules[existingIndex] = {
        ...existing,
        profile: existing.profile || officialSchedule.profile,
        notifyBeforeMinutes: existing.notifyBeforeMinutes || officialSchedule.notifyBeforeMinutes,
        missedReminderMinutes: 5,
        days: expectedDays,
        updatedAt: nowIso(),
      };
      changed = true;
    }
  }

  if (changed) {
    await writeSchedules(schedules);
  }
}

function getZonedParts(date, timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function getZonedDateKey(date, timeZone = config.timeZone) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getZonedMinuteOfDay(date, timeZone = config.timeZone) {
  const parts = getZonedParts(date, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function notificationKey(userId, dateKey, type, kind) {
  return `${userId}:${dateKey}:${type}:${kind}`;
}

function hasPunchForEvent(punches, userId, dateKey, type) {
  return (punches || []).some((punch) => {
    return punch.userId === userId &&
      punch.status === "approved" &&
      punch.type === type &&
      getZonedDateKey(new Date(punch.createdAt)) === dateKey;
  });
}

function hasIntervalReturnAfter(punches, intervalInPunch) {
  const intervalStart = new Date(intervalInPunch.createdAt).getTime();
  return (punches || []).some((punch) => {
    return punch.userId === intervalInPunch.userId &&
      punch.status === "approved" &&
      punch.type === "interval_out" &&
      new Date(punch.createdAt).getTime() > intervalStart;
  });
}

function getDueScheduleNotifications({ now = new Date(), schedules = [], punches = [], sentLog = [] }) {
  const dateKey = getZonedDateKey(now);
  const currentMinute = getZonedMinuteOfDay(now);
  const sentKeys = new Set((sentLog || []).map((item) => item.key));
  const due = [];

  schedules.filter((schedule) => schedule.active !== false).forEach((schedule) => {
    const events = Schedule.getExpectedEventsForDate(schedule, dateKey);
    events.forEach((event) => {
      if (hasPunchForEvent(punches, schedule.userId, dateKey, event.type)) return;

      const eventMinute = Schedule.parseTimeToMinutes(event.time);
      const upcomingMinute = eventMinute - Number(schedule.notifyBeforeMinutes || 10);
      const missedMinute = eventMinute + Number(schedule.missedReminderMinutes || 5);

      if (currentMinute === upcomingMinute) {
        const key = notificationKey(schedule.userId, dateKey, event.type, "upcoming");
        if (!sentKeys.has(key)) due.push({ key, kind: "upcoming", schedule, event, dateKey });
      }

      if (currentMinute === missedMinute) {
        const key = notificationKey(schedule.userId, dateKey, event.type, "missed");
        if (!sentKeys.has(key)) due.push({ key, kind: "missed", schedule, event, dateKey });
      }
    });
  });

  const schedulesByUserId = new Map(schedules.map((schedule) => [schedule.userId, schedule]));
  (punches || [])
    .filter((punch) => punch.status === "approved" && punch.type === "interval_in")
    .forEach((punch) => {
      if (hasIntervalReturnAfter(punches, punch)) return;
      const schedule = schedulesByUserId.get(punch.userId);
      if (!schedule || schedule.active === false) return;

      const intervalDateKey = getZonedDateKey(new Date(punch.createdAt));
      const intervalMinutes = Schedule.getIntervalMinutesForDate(schedule, intervalDateKey);
      if (!intervalMinutes) return;

      const returnAt = new Date(new Date(punch.createdAt).getTime() + intervalMinutes * 60000);
      const missedAt = new Date(returnAt.getTime() + Number(schedule.missedReminderMinutes || 5) * 60000);
      const returnDateKey = getZonedDateKey(returnAt);
      const returnMinute = getZonedMinuteOfDay(returnAt);
      const missedDateKey = getZonedDateKey(missedAt);
      const missedMinute = getZonedMinuteOfDay(missedAt);

      if (dateKey === returnDateKey && currentMinute === returnMinute) {
        const key = notificationKey(schedule.userId, intervalDateKey, `interval_out:${punch.id}`, "interval_return");
        if (!sentKeys.has(key)) due.push({
          key,
          kind: "interval_return",
          schedule,
          event: { type: "interval_out", time: Schedule.minutesToTime(returnMinute), label: "Retorno" },
          dateKey: intervalDateKey,
        });
      }

      if (dateKey === missedDateKey && currentMinute === missedMinute) {
        const key = notificationKey(schedule.userId, intervalDateKey, `interval_out:${punch.id}`, "interval_missed");
        if (!sentKeys.has(key)) due.push({
          key,
          kind: "interval_missed",
          schedule,
          event: { type: "interval_out", time: Schedule.minutesToTime(returnMinute), label: "Retorno" },
          dateKey: intervalDateKey,
        });
      }
    });

  return due;
}

async function sendPushToUser(userId, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) return { sent: 0, skipped: true };
  const subscriptions = await readPushSubscriptions();
  const activeSubscriptions = subscriptions.filter((item) => item.userId === userId && item.active !== false);
  let sent = 0;

  for (const item of activeSubscriptions) {
    try {
      await webPush.sendNotification(item.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        item.active = false;
        item.updatedAt = nowIso();
      } else {
        console.error("Falha ao enviar push:", error.message || error);
      }
    }
  }

  await writePushSubscriptions(subscriptions);
  return { sent, skipped: false };
}

async function runScheduleNotificationTick(now = new Date()) {
  const [schedules, punches, sentLog] = await Promise.all([
    readSchedules(),
    readJson(PUNCHES_FILE, []),
    readNotificationLog(),
  ]);
  const due = getDueScheduleNotifications({ now, schedules, punches, sentLog });
  if (!due.length) return [];

  const delivered = [];
  for (const item of due) {
    const label = item.event.label.toLowerCase();
    let body = item.kind === "upcoming"
      ? `Seu ponto de ${label} esta chegando: ${item.event.time}.`
      : `Voce ainda nao registrou ${label} das ${item.event.time}.`;
    if (item.kind === "interval_return") {
      body = `Seu intervalo acabou. Registre o retorno ao trabalho.`;
    } else if (item.kind === "interval_missed") {
      body = `Seu retorno do intervalo ainda nao foi registrado.`;
    }
    const result = await sendPushToUser(item.schedule.userId, {
      title: "Renova Ponto",
      body,
      url: "/",
      tag: item.key,
      requireInteraction: item.kind === "missed",
    });

    if (result.skipped) continue;
    sentLog.push({
      key: item.key,
      userId: item.schedule.userId,
      dateKey: item.dateKey,
      type: item.event.type,
      kind: item.kind,
      sentAt: now.toISOString(),
      sentDevices: result.sent,
    });
    delivered.push({ ...item, sentDevices: result.sent });
  }

  if (delivered.length) {
    await writeNotificationLog(sentLog.slice(-5000));
  }

  return delivered;
}

function startScheduleNotificationScheduler() {
  setInterval(() => {
    runScheduleNotificationTick().catch((error) => {
      console.error("Erro ao enviar notificacoes de ponto:", error);
    });
  }, 60000);
}

const validPunchTypes = ["in", "interval_in", "interval_out", "out"];

function normalizePunchType(type) {
  return validPunchTypes.includes(type) ? type : null;
}

function normalizeAdjustmentRequest(body) {
  const type = normalizePunchType(body.type);
  const reason = String(body.reason || "").trim();
  const parsedDate = new Date(body.createdAt);

  if (!type) {
    return { ok: false, statusCode: 400, error: "Tipo de registro inválido." };
  }

  if (!Number.isFinite(parsedDate.getTime())) {
    return { ok: false, statusCode: 400, error: "Data/hora inválida." };
  }

  if (parsedDate.getTime() > Date.now() + 5 * 60 * 1000) {
    return { ok: false, statusCode: 400, error: "Não é possível solicitar ajuste para uma data futura." };
  }

  if (!reason || reason.length < 5) {
    return { ok: false, statusCode: 400, error: "Informe uma justificativa com pelo menos 5 caracteres." };
  }

  return {
    ok: true,
    type,
    reason,
    requestedCreatedAt: parsedDate.toISOString(),
  };
}

function publicPunchRequest(request) {
  return {
    id: request.id,
    userId: request.userId,
    userCode: request.userCode,
    userName: request.userName,
    type: request.type,
    status: request.status,
    reason: request.reason,
    reviewReason: request.reviewReason || null,
    requestedCreatedAt: request.requestedCreatedAt,
    requestedAt: request.requestedAt,
    reviewedAt: request.reviewedAt || null,
    reviewedBy: request.reviewedBy || null,
    punchId: request.punchId || null,
  };
}

function applyAdminPunchEdit(punch, body, editor) {
  const { createdAt, type, status, reason } = body;
  if (!createdAt || !type || !status || !reason) {
    return { ok: false, statusCode: 400, error: "Todos os campos (data, hora, tipo, status e justificativa) são obrigatórios." };
  }

  const validTypes = ["in", "interval_in", "interval_out", "out"];
  if (!validTypes.includes(type)) {
    return { ok: false, statusCode: 400, error: "Tipo de registro inválido." };
  }

  const validStatuses = ["approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return { ok: false, statusCode: 400, error: "Status de registro inválido." };
  }

  const parsedDate = new Date(createdAt);
  if (!Number.isFinite(parsedDate.getTime())) {
    return { ok: false, statusCode: 400, error: "Data/hora inválida." };
  }

  const normalizedCreatedAt = parsedDate.toISOString();
  const hasChanges =
    new Date(punch.createdAt).getTime() !== parsedDate.getTime() ||
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
    punch.createdAt = normalizedCreatedAt;
    punch.type = type;
    punch.status = status;
    punch.reason = reason;
    punch.editedAt = nowIso();
    punch.editedBy = editor;
  }

  return { ok: true };
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    return send(res, 200, { ok: true, name: config.schoolName });
  }

  if (url.pathname === "/api/push/public-key" && req.method === "GET") {
    if (!vapidPublicKey) return send(res, 503, { error: "Notificacoes push nao configuradas." });
    return send(res, 200, { publicKey: vapidPublicKey });
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

  if (url.pathname === "/api/push/subscriptions" && req.method === "POST") {
    const body = await readBody(req);
    if (!body?.subscription?.endpoint) {
      return send(res, 400, { error: "Inscricao de notificacao invalida." });
    }

    const subscriptions = await readPushSubscriptions();
    const filtered = subscriptions.filter((item) => item.endpoint !== body.subscription.endpoint);
    filtered.push({
      id: crypto.randomUUID(),
      userId: user.id,
      endpoint: body.subscription.endpoint,
      subscription: body.subscription,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    await writePushSubscriptions(filtered);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/me") {
    if (req.method === "GET") {
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

    if (req.method === "PUT") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const pin = String(body.pin || "").trim();

      if (!name) return send(res, 400, { error: "O nome é obrigatório." });

      const users = await readJson(USERS_FILE, []);
      const dbUser = users.find((u) => u.id === user.id);
      if (!dbUser) return send(res, 404, { error: "Usuário não encontrado." });

      dbUser.name = name;

      if (pin) {
        const { salt, hash } = await hashPin(pin);
        dbUser.salt = salt;
        dbUser.pinHash = hash;

        const currentToken = parseCookies(req).renova_session;
        const sessions = await readJson(SESSIONS_FILE, []);
        const filteredSessions = sessions.filter((s) => s.userId !== user.id || s.token === currentToken);
        await writeJson(SESSIONS_FILE, filteredSessions);
      }

      await writeJson(USERS_FILE, users);
      return send(res, 200, { user: publicUser(dbUser) });
    }
  }

  if (url.pathname === "/api/punches" && req.method === "GET") {
    const punches = await readJson(PUNCHES_FILE, []);
    const visible = user.role === "admin" ? punches : punches.filter((punch) => punch.userId === user.id);
    return send(res, 200, { punches: visible.slice(-250).reverse() });
  }

  if (url.pathname === "/api/my-schedule" && req.method === "GET") {
    const schedules = await readSchedules();
    const schedule = schedules.find((item) => item.userId === user.id) || null;
    return send(res, 200, { schedule });
  }

  if (url.pathname === "/api/punches" && req.method === "POST") {
    const body = await readBody(req);
    const type = normalizePunchType(body.type) || "in";
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

  if (url.pathname === "/api/punch-requests") {
    if (req.method === "GET") {
      const requests = await readJson(PUNCH_REQUESTS_FILE, []);
      const visible = user.role === "admin" ? requests : requests.filter((request) => request.userId === user.id);
      return send(res, 200, { requests: visible.slice(-250).reverse().map(publicPunchRequest) });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const normalized = normalizeAdjustmentRequest(body);
      if (!normalized.ok) {
        return send(res, normalized.statusCode, { error: normalized.error });
      }

      const requests = await readJson(PUNCH_REQUESTS_FILE, []);
      const request = {
        id: crypto.randomUUID(),
        userId: user.id,
        userCode: user.code,
        userName: user.name,
        type: normalized.type,
        status: "pending",
        reason: normalized.reason,
        requestedCreatedAt: normalized.requestedCreatedAt,
        requestedAt: nowIso(),
      };

      requests.push(request);
      await writeJson(PUNCH_REQUESTS_FILE, requests);
      return send(res, 201, { request: publicPunchRequest(request) });
    }
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
      const newSchedule = buildInitialScheduleForUser(newUser);
      if (newSchedule) {
        const schedules = await readSchedules();
        schedules.push(newSchedule);
        await writeSchedules(schedules);
      }
      return send(res, 201, { user: publicUser(newUser) });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const targetId = body.id;
      const action = body.action;

      const users = await readJson(USERS_FILE, []);
      const targetUser = users.find((u) => u.id === targetId);
      if (!targetUser) return send(res, 404, { error: "Usuário não encontrado." });

      if (action === "pin") {
        const newPin = body.pin;
        if (!newPin) return send(res, 400, { error: "PIN obrigatório." });
        const { salt, hash } = await hashPin(newPin);
        targetUser.salt = salt;
        targetUser.pinHash = hash;
      } else if (action === "toggle_active") {
        if (targetId === user.id) {
          return send(res, 400, { error: "Você não pode inativar seu próprio usuário." });
        }
        targetUser.active = !targetUser.active;
        if (!targetUser.active) {
          const sessions = await readJson(SESSIONS_FILE, []);
          await writeJson(SESSIONS_FILE, sessions.filter((s) => s.userId !== targetId));
        }
      } else if (action === "edit") {
        const name = String(body.name || "").trim();
        const code = String(body.code || "").trim();
        const role = body.role === "admin" ? "admin" : "employee";
        const pin = String(body.pin || "").trim();

        if (!name || !code) {
          return send(res, 400, { error: "Nome e código são obrigatórios." });
        }

        if (users.some((u) => u.id !== targetId && u.code.toLowerCase() === code.toLowerCase())) {
          return send(res, 400, { error: "Este código já está em uso por outro usuário." });
        }

        if (targetId === user.id && role !== "admin") {
          return send(res, 400, { error: "Você não pode alterar seu próprio perfil de Administrador para Colaborador." });
        }

        targetUser.name = name;
        targetUser.code = code;
        targetUser.role = role;

        if (pin) {
          const { salt, hash } = await hashPin(pin);
          targetUser.salt = salt;
          targetUser.pinHash = hash;
          const sessions = await readJson(SESSIONS_FILE, []);
          await writeJson(SESSIONS_FILE, sessions.filter((s) => s.userId !== targetId));
        }
      }

      await writeJson(USERS_FILE, users);
      return send(res, 200, { user: publicUser(targetUser) });
    }

    if (req.method === "DELETE") {
      let targetId = url.searchParams.get("id");
      if (!targetId) {
        const body = await readBody(req).catch(() => ({}));
        targetId = body.id;
      }
      if (!targetId) return send(res, 400, { error: "ID obrigatório." });

      if (targetId === user.id) {
        return send(res, 400, { error: "Você não pode excluir seu próprio usuário." });
      }

      const users = await readJson(USERS_FILE, []);
      const index = users.findIndex((u) => u.id === targetId);
      if (index === -1) return send(res, 404, { error: "Usuário não encontrado." });

      users.splice(index, 1);
      await writeJson(USERS_FILE, users);

      const sessions = await readJson(SESSIONS_FILE, []);
      await writeJson(SESSIONS_FILE, sessions.filter((s) => s.userId !== targetId));

      return send(res, 200, { success: true });
    }
  }

  if (url.pathname === "/api/admin/schedules" && user.role === "admin") {
    if (req.method === "GET") {
      const schedules = await readSchedules();
      return send(res, 200, { schedules });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const users = await readJson(USERS_FILE, []);
      const target = users.find((item) => item.id === body.userId && item.role === "employee");
      if (!target) return send(res, 404, { error: "Colaborador nao encontrado." });

      let days;
      try {
        days = normalizeScheduleDays(body.days);
      } catch {
        days = null;
      }
      if (!days) return send(res, 400, { error: "Grade de horarios invalida." });

      const schedules = await readSchedules();
      const existingIndex = schedules.findIndex((item) => item.userId === target.id);
      const now = nowIso();
      const nextSchedule = {
        id: existingIndex >= 0 ? schedules[existingIndex].id : crypto.randomUUID(),
        userId: target.id,
        profile: String(body.profile || "Colaborador").trim() || "Colaborador",
        active: body.active !== false,
        notifyBeforeMinutes: Math.max(1, Math.min(60, Number(body.notifyBeforeMinutes || 10))),
        missedReminderMinutes: 5,
        days,
        createdAt: existingIndex >= 0 ? schedules[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) schedules[existingIndex] = nextSchedule;
      else schedules.push(nextSchedule);

      await writeSchedules(schedules);
      return send(res, 200, { schedule: nextSchedule });
    }
  }

  if (url.pathname === "/api/admin/punch-requests" && user.role === "admin") {
    if (req.method === "PUT") {
      const body = await readBody(req);
      const requestId = body.requestId;
      const action = body.action;
      const reviewReason = String(body.reviewReason || "").trim();

      if (!requestId || !["approve", "reject"].includes(action)) {
        return send(res, 400, { error: "Solicitação e ação são obrigatórias." });
      }

      const requests = await readJson(PUNCH_REQUESTS_FILE, []);
      const request = requests.find((item) => item.id === requestId);
      if (!request) {
        return send(res, 404, { error: "Solicitação não encontrada." });
      }

      if (request.status !== "pending") {
        return send(res, 400, { error: "Esta solicitação já foi revisada." });
      }

      request.reviewedAt = nowIso();
      request.reviewedBy = `${user.name} (${user.code})`;
      request.reviewReason = reviewReason || null;

      if (action === "reject") {
        request.status = "rejected";
        await writeJson(PUNCH_REQUESTS_FILE, requests);
        return send(res, 200, { request: publicPunchRequest(request) });
      }

      const punches = await readJson(PUNCHES_FILE, []);
      const approvedPunch = {
        id: crypto.randomUUID(),
        userId: request.userId,
        userCode: request.userCode,
        userName: request.userName,
        type: request.type,
        status: "approved",
        reason: request.reason,
        latitude: null,
        longitude: null,
        accuracy: null,
        distanceMeters: null,
        createdAt: request.requestedCreatedAt,
        source: "employee_request",
        requestId: request.id,
        requestedAt: request.requestedAt,
        approvedAt: request.reviewedAt,
        approvedBy: request.reviewedBy,
      };

      punches.push(approvedPunch);
      request.status = "approved";
      request.punchId = approvedPunch.id;

      await writeJson(PUNCHES_FILE, punches);
      await writeJson(PUNCH_REQUESTS_FILE, requests);
      return send(res, 200, { request: publicPunchRequest(request), punch: approvedPunch });
    }
  }

  if (url.pathname === "/api/admin/punches" && user.role === "admin") {
    if (req.method === "POST") {
      const body = await readBody(req);
      if (body.punchId) {
        const punches = await readJson(PUNCHES_FILE, []);
        const punch = punches.find((p) => p.id === body.punchId);
        if (!punch) {
          return send(res, 404, { error: "Ponto não encontrado." });
        }

        const result = applyAdminPunchEdit(punch, body, `${user.name} (${user.code})`);
        if (!result.ok) {
          return send(res, result.statusCode, { error: result.error });
        }

        await writeJson(PUNCHES_FILE, punches);
        return send(res, 200, { punch });
      }

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
        const result = applyAdminPunchEdit(punch, body, `${user.name} (${user.code})`);
        if (!result.ok) {
          return send(res, result.statusCode, { error: result.error });
        }

        await writeJson(PUNCHES_FILE, punches);
        return send(res, 200, { punch });
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
  await seedMissingSchedules();
  startScheduleNotificationScheduler();
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

if (require.main === module) {
  main();
}

module.exports = {
  buildInitialScheduleForUser,
  getDueScheduleNotifications,
  normalizeNameKey,
  normalizeScheduleDays,
  runScheduleNotificationTick,
};
