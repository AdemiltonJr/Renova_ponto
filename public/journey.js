(function initJourneyHelpers(root) {
  const Schedule = typeof require === "function" ? require("./schedule.js") : root.RenovaSchedule;
  const STATUS_LABELS = {
    not_started: "Sem entrada",
    open: "Em jornada",
    interval_open: "Intervalo aberto",
    complete: "Completa",
    attention: "Revisar",
  };

  function getDateKey(value) {
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function getIsoDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function dateKeyToIso(dateKey) {
    if (typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
    const match = String(dateKey || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return getIsoDateKey(new Date());
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function getPunchTime(punch) {
    if (!punch) return "-";
    return new Date(punch.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function isManualPunch(punch) {
    return punch.status === "approved" && punch.distanceMeters === 0 && punch.accuracy === 1 && Boolean(punch.reason);
  }

  function addUnique(list, value) {
    if (!list.includes(value)) list.push(value);
  }

  function byCreatedAtAsc(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  function buildNumberedExtraSteps(label, punches) {
    return punches.slice(1).map((punch, index) => ({
      label: `${label} ${index + 2}`,
      punch,
    }));
  }

  function buildJourneySteps(ins, intervalIns, intervalOuts, outs) {
    const baseSteps = [
      { label: "Entrada", punch: ins[0] || null },
      { label: "Intervalo", punch: intervalIns[0] || null },
      { label: "Retorno", punch: intervalOuts[0] || null },
      { label: "Saída", punch: outs[0] || null },
    ];
    const extraSteps = [
      ...buildNumberedExtraSteps("Entrada", ins),
      ...buildNumberedExtraSteps("Intervalo", intervalIns),
      ...buildNumberedExtraSteps("Retorno", intervalOuts),
      ...buildNumberedExtraSteps("Saída", outs),
    ].sort((a, b) => byCreatedAtAsc(a.punch, b.punch));

    return [...baseSteps, ...extraSteps];
  }

  function minutesBetweenDates(start, end) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
    return Math.round((endMs - startMs) / 60000);
  }

  function calculateWorkedMinutes(approved) {
    let total = 0;
    let workStart = null;

    for (const punch of approved.slice().sort(byCreatedAtAsc)) {
      if (punch.type === "in" && !workStart) {
        workStart = punch.createdAt;
      } else if (punch.type === "interval_in" && workStart) {
        total += minutesBetweenDates(workStart, punch.createdAt);
        workStart = null;
      } else if (punch.type === "interval_out" && !workStart) {
        workStart = punch.createdAt;
      } else if (punch.type === "out" && workStart) {
        total += minutesBetweenDates(workStart, punch.createdAt);
        workStart = null;
      }
    }

    return Math.max(total, 0);
  }

  function findScheduleForUser(schedules, userId) {
    return (schedules || []).find((schedule) => schedule.userId === userId) || null;
  }

  function hasPunchForExpectedType(approved, type) {
    return approved.some((punch) => punch.type === type);
  }

  function expectedEventHasPassed(event, isoDateKey, now) {
    const expectedAt = new Date(`${isoDateKey}T${event.time}:00`);
    return now.getTime() > expectedAt.getTime() + 5 * 60000;
  }

  function buildExpectedAttention(expectedEvents, approved, isoDateKey, now) {
    return expectedEvents
      .filter((event) => !hasPunchForExpectedType(approved, event.type) && expectedEventHasPassed(event, isoDateKey, now))
      .map((event) => `${event.label} esperada sem marcacao`);
  }

  function matchesSearch(summary, search) {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return true;
    return String(summary.userName || "").toLowerCase().includes(term) ||
      String(summary.userCode || "").toLowerCase().includes(term);
  }

  function summarizeUserDay(userId, punches, dateKey, options = {}) {
    const sorted = punches.slice().sort(byCreatedAtAsc);
    const approved = sorted.filter((punch) => punch.status === "approved");
    const rejected = sorted.filter((punch) => punch.status === "rejected");
    const attention = [];
    const firstApproved = approved[0] || sorted[0] || {};
    const user = options.user || {};
    const schedule = options.schedule || null;
    const isoDateKey = options.isoDateKey || dateKeyToIso(dateKey);
    const now = options.now || new Date();
    const expectedEvents = schedule && Schedule
      ? Schedule.getExpectedEventsForDate(schedule, isoDateKey)
      : [];
    const expectedMinutes = schedule && Schedule
      ? Schedule.calculateExpectedMinutesForDate(schedule, isoDateKey)
      : 0;
    const lastApproved = approved[approved.length - 1] || null;
    const ins = approved.filter((punch) => punch.type === "in");
    const firstIn = ins[0] || null;
    const intervalIns = approved.filter((punch) => punch.type === "interval_in");
    const intervalOuts = approved.filter((punch) => punch.type === "interval_out");
    const outs = approved.filter((punch) => punch.type === "out");
    const lastIntervalIn = intervalIns[intervalIns.length - 1] || null;
    const lastIntervalOut = intervalOuts[intervalOuts.length - 1] || null;
    const lastOut = outs[outs.length - 1] || null;
    const hasManual = sorted.some(isManualPunch);
    const hasEdited = sorted.some((punch) => Boolean(punch.originalCreatedAt));
    const hasRejected = rejected.length > 0;
    const hasEmployeeRequest = sorted.some((punch) => punch.source === "employee_request");

    let status = "attention";
    if (!firstIn) {
      status = "not_started";
      addUnique(attention, "Sem entrada");
    } else if (lastApproved?.type === "out") {
      status = "complete";
    } else if (lastApproved?.type === "interval_in") {
      status = "interval_open";
      addUnique(attention, "Intervalo iniciado e nao finalizado");
    } else if (lastApproved?.type === "in" || lastApproved?.type === "interval_out") {
      status = "open";
      addUnique(attention, "Sem saida");
    }

    if (hasRejected) addUnique(attention, "Ponto recusado");
    if (hasManual) addUnique(attention, "Registro manual");
    if (hasEmployeeRequest) addUnique(attention, "Ajuste solicitado pelo colaborador");
    if (hasEdited) addUnique(attention, "Registro editado");
    for (const item of buildExpectedAttention(expectedEvents, approved, isoDateKey, now)) {
      addUnique(attention, item);
    }
    if (status === "complete" && attention.length) {
      status = "attention";
    }

    const workedMinutes = calculateWorkedMinutes(approved);

    return {
      userId,
      userName: firstApproved.userName || user.name || "",
      userCode: firstApproved.userCode || user.code || "",
      dateKey,
      isoDateKey,
      firstIn,
      lastIntervalIn,
      lastIntervalOut,
      lastOut,
      journeySteps: buildJourneySteps(ins, intervalIns, intervalOuts, outs),
      schedule,
      expectedEvents,
      expectedMinutes,
      workedMinutes,
      balanceMinutes: workedMinutes - expectedMinutes,
      lastApprovedType: lastApproved?.type || null,
      status,
      statusLabel: STATUS_LABELS[status],
      attention,
      hasRejected,
      hasManual,
      hasEmployeeRequest,
      hasEdited,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      punches: sorted,
    };
  }

  function buildDailyJourneys(punches, options = {}) {
    const dateKey = options.dateKey || getDateKey(new Date());
    const isoDateKey = options.isoDateKey || dateKeyToIso(dateKey);
    const usersById = new Map((options.users || []).map((user) => [user.id, user]));
    const schedulesByUserId = new Map((options.schedules || []).map((schedule) => [schedule.userId, schedule]));
    const grouped = new Map();

    for (const punch of punches || []) {
      if (getDateKey(punch.createdAt) !== dateKey) continue;
      const key = punch.userId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }

    for (const schedule of options.schedules || []) {
      if (!Schedule || !Schedule.getExpectedEventsForDate(schedule, isoDateKey).length) continue;
      if (!grouped.has(schedule.userId)) grouped.set(schedule.userId, []);
    }

    return Array.from(grouped.entries())
      .map(([userId, userPunches]) => summarizeUserDay(userId, userPunches, dateKey, {
        isoDateKey,
        now: options.now,
        schedule: schedulesByUserId.get(userId) || null,
        user: usersById.get(userId) || null,
      }))
      .filter((summary) => matchesSearch(summary, options.search))
      .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
  }

  function byDateKeyDesc(a, b) {
    const [aDay, aMonth, aYear] = a.split("/").map(Number);
    const [bDay, bMonth, bYear] = b.split("/").map(Number);
    return new Date(bYear, bMonth - 1, bDay).getTime() - new Date(aYear, aMonth - 1, aDay).getTime();
  }

  function buildUserJourneyHistory(punches, options = {}) {
    const userId = options.userId;
    if (!userId) return [];

    const grouped = new Map();
    for (const punch of punches || []) {
      if (punch.userId !== userId) continue;
      const dateKey = getDateKey(punch.createdAt);
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey).push(punch);
    }

    const limit = Number(options.limit || 5);
    const schedule = findScheduleForUser(options.schedules || [], userId);
    const user = (options.users || []).find((item) => item.id === userId) || null;
    return Array.from(grouped.entries())
      .sort(([aDate], [bDate]) => byDateKeyDesc(aDate, bDate))
      .slice(0, limit)
      .map(([dateKey, userPunches]) => summarizeUserDay(userId, userPunches, dateKey, {
        isoDateKey: dateKeyToIso(dateKey),
        now: options.now,
        schedule,
        user,
      }));
  }

  const api = {
    buildDailyJourneys,
    buildUserJourneyHistory,
    dateKeyToIso,
    getDateKey,
    getIsoDateKey,
    getPunchTime,
    isManualPunch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RenovaJourney = api;
})(typeof window !== "undefined" ? window : globalThis);
