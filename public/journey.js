(function initJourneyHelpers(root) {
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

  function matchesSearch(summary, search) {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return true;
    return String(summary.userName || "").toLowerCase().includes(term) ||
      String(summary.userCode || "").toLowerCase().includes(term);
  }

  function summarizeUserDay(userId, punches, dateKey) {
    const sorted = punches.slice().sort(byCreatedAtAsc);
    const approved = sorted.filter((punch) => punch.status === "approved");
    const rejected = sorted.filter((punch) => punch.status === "rejected");
    const attention = [];
    const firstApproved = approved[0] || sorted[0] || {};
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
    if (hasEdited) addUnique(attention, "Registro editado");

    return {
      userId,
      userName: firstApproved.userName || "",
      userCode: firstApproved.userCode || "",
      dateKey,
      firstIn,
      lastIntervalIn,
      lastIntervalOut,
      lastOut,
      journeySteps: buildJourneySteps(ins, intervalIns, intervalOuts, outs),
      lastApprovedType: lastApproved?.type || null,
      status,
      statusLabel: STATUS_LABELS[status],
      attention,
      hasRejected,
      hasManual,
      hasEdited,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      punches: sorted,
    };
  }

  function buildDailyJourneys(punches, options = {}) {
    const dateKey = options.dateKey || getDateKey(new Date());
    const grouped = new Map();

    for (const punch of punches || []) {
      if (getDateKey(punch.createdAt) !== dateKey) continue;
      const key = punch.userId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }

    return Array.from(grouped.entries())
      .map(([userId, userPunches]) => summarizeUserDay(userId, userPunches, dateKey))
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
    return Array.from(grouped.entries())
      .sort(([aDate], [bDate]) => byDateKeyDesc(aDate, bDate))
      .slice(0, limit)
      .map(([dateKey, userPunches]) => summarizeUserDay(userId, userPunches, dateKey));
  }

  const api = {
    buildDailyJourneys,
    buildUserJourneyHistory,
    getDateKey,
    getPunchTime,
    isManualPunch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RenovaJourney = api;
})(typeof window !== "undefined" ? window : globalThis);
