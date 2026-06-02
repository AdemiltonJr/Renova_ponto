const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDailyJourneys,
  buildUserJourneyHistory,
  getDateKey,
  getPunchTime,
  isManualPunch,
} = require("../public/journey.js");

function punch(overrides) {
  return {
    id: overrides.id || crypto.randomUUID(),
    userId: overrides.userId || "u1",
    userCode: overrides.userCode || "gabrielle",
    userName: overrides.userName || "Gabrielle",
    type: overrides.type || "in",
    status: overrides.status || "approved",
    reason: overrides.reason || null,
    distanceMeters: overrides.distanceMeters ?? 140,
    accuracy: overrides.accuracy ?? 15,
    createdAt: overrides.createdAt || "2026-05-28T10:00:00.000Z",
    originalCreatedAt: overrides.originalCreatedAt,
    source: overrides.source,
  };
}

test("getDateKey returns pt-BR date key", () => {
  assert.equal(getDateKey("2026-05-28T10:00:00.000Z"), "28/05/2026");
});

test("getPunchTime formats a punch time for display", () => {
  assert.match(getPunchTime(punch({ createdAt: "2026-05-28T10:05:00.000Z" })), /^\d{2}:\d{2}$/);
  assert.equal(getPunchTime(null), "-");
});

test("isManualPunch detects admin-created manual records", () => {
  assert.equal(isManualPunch(punch({ distanceMeters: 0, accuracy: 1, reason: "Registro manual por admin" })), true);
  assert.equal(isManualPunch(punch({ distanceMeters: 140, accuracy: 20, reason: null })), false);
});

test("buildDailyJourneys groups approved punches into a complete journey", () => {
  const result = buildDailyJourneys([
    punch({ type: "out", createdAt: "2026-05-28T20:00:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T15:00:00.000Z" }),
    punch({ type: "interval_out", createdAt: "2026-05-28T16:00:00.000Z" }),
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "complete");
  assert.equal(result[0].statusLabel, "Completa");
  assert.equal(result[0].firstIn.type, "in");
  assert.equal(result[0].lastIntervalIn.type, "interval_in");
  assert.equal(result[0].lastIntervalOut.type, "interval_out");
  assert.equal(result[0].lastOut.type, "out");
  assert.deepEqual(result[0].journeySteps.map((step) => step.label), ["Entrada", "Intervalo", "Retorno", "Saída"]);
  assert.deepEqual(result[0].attention, []);
});

test("buildDailyJourneys keeps the default journey fields and appends extra punches only when they exist", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T15:00:00.000Z" }),
    punch({ type: "interval_out", createdAt: "2026-05-28T15:15:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T17:00:00.000Z" }),
    punch({ type: "interval_out", createdAt: "2026-05-28T17:15:00.000Z" }),
    punch({ type: "out", createdAt: "2026-05-28T20:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.deepEqual(
    result[0].journeySteps.map((step) => step.label),
    ["Entrada", "Intervalo", "Retorno", "Saída", "Intervalo 2", "Retorno 2"],
  );
  assert.equal(result[0].journeySteps[1].punch.createdAt, "2026-05-28T15:00:00.000Z");
  assert.equal(result[0].journeySteps[4].punch.createdAt, "2026-05-28T17:00:00.000Z");
});

test("buildDailyJourneys appends extra entries and exits only when a second work period exists", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "out", createdAt: "2026-05-28T15:00:00.000Z" }),
    punch({ type: "in", createdAt: "2026-05-28T17:00:00.000Z" }),
    punch({ type: "out", createdAt: "2026-05-28T20:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.deepEqual(
    result[0].journeySteps.map((step) => step.label),
    ["Entrada", "Intervalo", "Retorno", "Saída", "Entrada 2", "Saída 2"],
  );
});

test("buildDailyJourneys marks open journey without exit", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].status, "open");
  assert.equal(result[0].statusLabel, "Em jornada");
  assert.deepEqual(result[0].attention, ["Sem saida"]);
});

test("buildDailyJourneys marks interval still open", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T15:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].status, "interval_open");
  assert.equal(result[0].statusLabel, "Intervalo aberto");
  assert.deepEqual(result[0].attention, ["Intervalo iniciado e nao finalizado"]);
});

test("buildDailyJourneys includes rejected, edited, and manual attention flags", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", status: "approved", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "in", status: "rejected", reason: "Precisao insuficiente", createdAt: "2026-05-28T11:05:00.000Z" }),
    punch({ type: "out", status: "approved", reason: "Registro manual por admin", distanceMeters: 0, accuracy: 1, createdAt: "2026-05-28T20:00:00.000Z" }),
    punch({ type: "interval_in", status: "approved", originalCreatedAt: "2026-05-28T15:00:00.000Z", createdAt: "2026-05-28T15:10:00.000Z" }),
    punch({ type: "interval_out", status: "approved", source: "employee_request", createdAt: "2026-05-28T15:30:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].hasRejected, true);
  assert.equal(result[0].hasManual, true);
  assert.equal(result[0].hasEdited, true);
  assert.equal(result[0].hasEmployeeRequest, true);
  assert.equal(result[0].attention.includes("Ponto recusado"), true);
  assert.equal(result[0].attention.includes("Registro manual"), true);
  assert.equal(result[0].attention.includes("Ajuste solicitado pelo colaborador"), true);
  assert.equal(result[0].attention.includes("Registro editado"), true);
});

test("buildDailyJourneys filters by collaborator search", () => {
  const result = buildDailyJourneys([
    punch({ userId: "u1", userName: "Gabrielle", userCode: "gab", type: "in" }),
    punch({ userId: "u2", userName: "Talita", userCode: "tal", type: "in" }),
  ], { dateKey: "28/05/2026", search: "tali" });

  assert.equal(result.length, 1);
  assert.equal(result[0].userName, "Talita");
});

test("buildUserJourneyHistory returns the latest five journeys for one collaborator", () => {
  const result = buildUserJourneyHistory([
    punch({ userId: "u1", type: "in", createdAt: "2026-05-23T11:00:00.000Z" }),
    punch({ userId: "u1", type: "in", createdAt: "2026-05-24T11:00:00.000Z" }),
    punch({ userId: "u1", type: "in", createdAt: "2026-05-25T11:00:00.000Z" }),
    punch({ userId: "u1", type: "in", createdAt: "2026-05-26T11:00:00.000Z" }),
    punch({ userId: "u1", type: "in", createdAt: "2026-05-27T11:00:00.000Z" }),
    punch({ userId: "u1", type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ userId: "u2", userName: "Talita", type: "in", createdAt: "2026-05-29T11:00:00.000Z" }),
  ], { userId: "u1", limit: 5 });

  assert.equal(result.length, 5);
  assert.deepEqual(result.map((journey) => journey.dateKey), [
    "28/05/2026",
    "27/05/2026",
    "26/05/2026",
    "25/05/2026",
    "24/05/2026",
  ]);
  assert.equal(result.some((journey) => journey.userName === "Talita"), false);
});
