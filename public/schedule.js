(function initScheduleHelpers(root) {
  const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  function toIsoDateKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function weekdayFromDateKey(dateKey) {
    return new Date(`${toIsoDateKey(dateKey)}T12:00:00`).getDay();
  }

  function parseTimeToMinutes(value) {
    if (typeof value !== "string") throw new Error("time must be a string");
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error(`invalid time: ${value}`);
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`invalid time: ${value}`);
    }
    return hours * 60 + minutes;
  }

  function normalizeTime(value) {
    const minutes = parseTimeToMinutes(value);
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function formatMinutesAsDuration(totalMinutes) {
    const safeMinutes = Number.isFinite(Number(totalMinutes)) ? Math.round(Number(totalMinutes)) : 0;
    const sign = safeMinutes < 0 ? "-" : "";
    const absolute = Math.abs(safeMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${sign}${hours}h${String(minutes).padStart(2, "0")}`;
  }

  function formatIntervalDuration(totalMinutes) {
    const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    if (!minutes) return "Sem intervalo";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
  }

  function minutesToTime(totalMinutes) {
    const normalized = ((Math.round(Number(totalMinutes) || 0) % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function normalizeDayConfig(day) {
    if (!day) return null;

    if (Array.isArray(day)) {
      const blocks = day
        .filter((block) => Array.isArray(block) && block.length >= 2)
        .map(([start, end]) => [normalizeTime(start), normalizeTime(end)])
        .filter(([start, end]) => parseTimeToMinutes(end) > parseTimeToMinutes(start))
        .sort((a, b) => parseTimeToMinutes(a[0]) - parseTimeToMinutes(b[0]));
      if (!blocks.length) return null;

      const intervalMinutes = blocks.slice(0, -1).reduce((total, block, index) => {
        return total + parseTimeToMinutes(blocks[index + 1][0]) - parseTimeToMinutes(block[1]);
      }, 0);

      return {
        start: blocks[0][0],
        end: blocks[blocks.length - 1][1],
        intervalMinutes: Math.max(0, intervalMinutes),
        blocks,
      };
    }

    if (typeof day === "object") {
      const start = normalizeTime(day.start);
      const end = normalizeTime(day.end);
      const intervalMinutes = Math.max(0, Math.round(Number(day.intervalMinutes || 0)));
      if (parseTimeToMinutes(end) <= parseTimeToMinutes(start)) return null;
      return { start, end, intervalMinutes };
    }

    return null;
  }

  function getDayConfigForDate(schedule, dateKey) {
    if (!schedule || schedule.active === false || !schedule.days) return null;
    const weekday = weekdayFromDateKey(dateKey);
    return normalizeDayConfig(schedule.days[weekday] || schedule.days[String(weekday)]);
  }

  function getBlocksForDate(schedule, dateKey) {
    const dayConfig = getDayConfigForDate(schedule, dateKey);
    if (!dayConfig) return [];
    if (dayConfig.blocks) return dayConfig.blocks;
    return [[dayConfig.start, dayConfig.end]];
  }

  function getExpectedEventsForDate(schedule, dateKey) {
    const dayConfig = getDayConfigForDate(schedule, dateKey);
    if (!dayConfig) return [];
    return [
      { type: "in", time: dayConfig.start, label: "Entrada" },
      { type: "out", time: dayConfig.end, label: "Saida" },
    ];
  }

  function calculateExpectedMinutesForDate(schedule, dateKey) {
    const dayConfig = getDayConfigForDate(schedule, dateKey);
    if (!dayConfig) return 0;
    return Math.max(0, parseTimeToMinutes(dayConfig.end) - parseTimeToMinutes(dayConfig.start) - dayConfig.intervalMinutes);
  }

  function getIntervalMinutesForDate(schedule, dateKey) {
    return getDayConfigForDate(schedule, dateKey)?.intervalMinutes || 0;
  }

  function getReturnTimeFromIntervalStart(schedule, dateKey, intervalStartTime) {
    const intervalMinutes = getIntervalMinutesForDate(schedule, dateKey);
    if (!intervalMinutes || !intervalStartTime) return null;
    return minutesToTime(parseTimeToMinutes(intervalStartTime) + intervalMinutes);
  }

  function formatScheduleDays(schedule) {
    if (!schedule?.days) return "";
    return Object.entries(schedule.days)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([weekday, day]) => {
        const config = normalizeDayConfig(day);
        if (!config) return "";
        const intervalText = config.intervalMinutes ? `, intervalo ${formatIntervalDuration(config.intervalMinutes)}` : "";
        const blockText = `${config.start}-${config.end}${intervalText}`;
        return `${WEEKDAY_LABELS[Number(weekday)] || weekday}: ${blockText}`;
      })
      .filter(Boolean)
      .join(" | ");
  }

  const api = {
    calculateExpectedMinutesForDate,
    formatIntervalDuration,
    formatMinutesAsDuration,
    formatScheduleDays,
    getBlocksForDate,
    getDayConfigForDate,
    getExpectedEventsForDate,
    getIntervalMinutesForDate,
    getReturnTimeFromIntervalStart,
    minutesToTime,
    normalizeDayConfig,
    normalizeTime,
    parseTimeToMinutes,
    toIsoDateKey,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RenovaSchedule = api;
})(typeof window !== "undefined" ? window : globalThis);
