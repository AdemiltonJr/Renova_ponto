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

  function getBlocksForDate(schedule, dateKey) {
    if (!schedule || schedule.active === false || !schedule.days) return [];
    const weekday = weekdayFromDateKey(dateKey);
    const blocks = schedule.days[weekday] || schedule.days[String(weekday)] || [];
    return blocks
      .filter((block) => Array.isArray(block) && block.length >= 2)
      .map(([start, end]) => [normalizeTime(start), normalizeTime(end)])
      .filter(([start, end]) => parseTimeToMinutes(end) > parseTimeToMinutes(start))
      .sort((a, b) => parseTimeToMinutes(a[0]) - parseTimeToMinutes(b[0]));
  }

  function getExpectedEventsForDate(schedule, dateKey) {
    const blocks = getBlocksForDate(schedule, dateKey);
    if (!blocks.length) return [];

    const events = [{ type: "in", time: blocks[0][0], label: "Entrada" }];
    blocks.forEach((block, index) => {
      if (index === blocks.length - 1) {
        events.push({ type: "out", time: block[1], label: "Saida" });
        return;
      }
      events.push({ type: "interval_in", time: block[1], label: "Intervalo" });
      events.push({ type: "interval_out", time: blocks[index + 1][0], label: "Retorno" });
    });

    return events;
  }

  function calculateExpectedMinutesForDate(schedule, dateKey) {
    return getBlocksForDate(schedule, dateKey).reduce((total, [start, end]) => {
      return total + parseTimeToMinutes(end) - parseTimeToMinutes(start);
    }, 0);
  }

  function formatScheduleDays(schedule) {
    if (!schedule?.days) return "";
    return Object.entries(schedule.days)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([weekday, blocks]) => {
        const blockText = (blocks || []).map(([start, end]) => `${normalizeTime(start)}-${normalizeTime(end)}`).join(" / ");
        return `${WEEKDAY_LABELS[Number(weekday)] || weekday}: ${blockText}`;
      })
      .join(" | ");
  }

  const api = {
    calculateExpectedMinutesForDate,
    formatMinutesAsDuration,
    formatScheduleDays,
    getBlocksForDate,
    getExpectedEventsForDate,
    normalizeTime,
    parseTimeToMinutes,
    toIsoDateKey,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RenovaSchedule = api;
})(typeof window !== "undefined" ? window : globalThis);
