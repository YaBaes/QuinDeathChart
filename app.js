"use strict";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1Kp-XEQY5-Lw2FDkZdUjCOWYqyjsIpQHBHRfys5qBF68/export?format=csv&gid=0";
const NOTABLE_EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1Kp-XEQY5-Lw2FDkZdUjCOWYqyjsIpQHBHRfys5qBF68/gviz/tq?tqx=out:csv&sheet=Notable%20Events";

const FILTERS = [
  { key: "enemy", label: "Enemy", column: "Enemy" },
  { key: "level", label: "Enemy level", column: "Enemy level" },
  { key: "situation", label: "Situation", column: "Situation" },
  { key: "location", label: "Location", column: "Location" },
];

const THEME_STORAGE_KEY = "quin-death-chart-theme";
const HIGHLIGHT_COLOR_STORAGE_KEY = "quin-death-chart-highlight-color";
const HIGHLIGHT_COLORS = {
  "light-blue": {
    light: { accent: "#456c83", variants: ["#456c83", "#7290a0", "#a2b2bb"] },
    dark: { accent: "#8fb4c8", variants: ["#8fb4c8", "#b0c3cd", "#d0d8dc"] },
  },
  red: {
    light: { accent: "#a33a43", variants: ["#a33a43", "#c56b72", "#dfa0a4"] },
    dark: { accent: "#d34a55", variants: ["#d34a55", "#dd727b", "#e7a0a5"] },
  },
  yellow: {
    light: { accent: "#8a6d00", variants: ["#8a6d00", "#b49632", "#cfbd73"] },
    dark: { accent: "#e6c75a", variants: ["#e6c75a", "#f0d983", "#f8eab5"] },
  },
  orange: {
    light: { accent: "#a5480a", variants: ["#a5480a", "#c8783c", "#dfa77c"] },
    dark: { accent: "#f29a62", variants: ["#f29a62", "#f6b78f", "#f9d5bd"] },
  },
  green: {
    light: { accent: "#286344", variants: ["#286344", "#4e8666", "#80a88f"] },
    dark: { accent: "#80c99a", variants: ["#80c99a", "#a6d9b6", "#cdebd4"] },
  },
  "dark-blue": {
    light: { accent: "#315996", variants: ["#315996", "#6380ad", "#93a8c6"] },
    dark: { accent: "#85a9f5", variants: ["#85a9f5", "#abc4fa", "#d4e1fc"] },
  },
  purple: {
    light: { accent: "#70469a", variants: ["#70469a", "#9270b3", "#b5a0cc"] },
    dark: { accent: "#bd9ae8", variants: ["#bd9ae8", "#d0b6ef", "#e4d6f6"] },
  },
};
const themeToggle = document.querySelector("#theme-toggle");
const highlightColorSelect = document.querySelector("#highlight-color");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const selectedValues = new Map(FILTERS.map(({ key }) => [key, new Set()]));
const filterControls = document.querySelector("#filter-controls");
const resetButton = document.querySelector("#reset-filters");
const refreshButton = document.querySelector("#refresh-button");
const retryButton = document.querySelector("#retry-button");
const statusElement = document.querySelector("#data-status");
const statusMessage = statusElement.querySelector(".status-message");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = errorPanel.querySelector(".error-message");
const deathCount = document.querySelector("#death-count");
const highlightCount = document.querySelector("#highlight-count");
const focusMatchingToggle = document.querySelector("#focus-matching-toggle");
const chartCanvas = document.querySelector("#death-chart");
const timeNavigator = document.querySelector("#time-navigator");
const timeRangeTrack = document.querySelector("#time-range-track");
const timeRangeSelection = document.querySelector("#time-range-selection");
const timeRangeStartHandle = timeRangeTrack.querySelector('[data-range-handle="start"]');
const timeRangeEndHandle = timeRangeTrack.querySelector('[data-range-handle="end"]');
const timeRangeStartLabel = document.querySelector("#time-range-start-label");
const timeRangeEndLabel = document.querySelector("#time-range-end-label");
const timeNavigatorLine = timeNavigator.querySelector(".time-navigator-line");
const timeNavigatorArea = timeNavigator.querySelector(".time-navigator-area");
const categoryChartCanvas = document.querySelector("#category-chart");
const categoryButtons = document.querySelector("#category-buttons");
const recentEventsSection = document.querySelector(".recent-events");
const recentEventsList = document.querySelector("#recent-events-list");
const recentEventsToggle = document.querySelector("#recent-events-toggle");
const recentEventsTooltip = document.querySelector("#recent-events-tooltip");

let deaths = [];
let notableEvents = [];
let chart;
let hoveredNotableEvent = false;
let categoryChart;
let activeCategory = "enemy";
let recentEventsExpanded = false;
let categoryChartValues = [];
let categoryAxisLabelHitAreas = [];
let hoveredCategorySegment = null;
let exactSituationCombination = null;
let hasExplicitTheme = false;
let selectedHighlightColor = "light-blue";
let selectedDayRange = { start: 0, end: 1 };
let timeRangeDrag = null;

const DEFAULT_RECENT_DEATH_COUNT = 3;

function colorWithAlpha(hex, alpha) {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function chartThemeColors() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const highlight = HIGHLIGHT_COLORS[selectedHighlightColor][isDark ? "dark" : "light"];
  const axis = isDark ? "#c2c2c2" : "#686868";
  return {
    chartAccent: highlight.accent,
    chartVariants: highlight.variants,
    chartSecondary: isDark ? "#b0b0b0" : "#777777",
    tooltipBackground: isDark ? "#1b1b1b" : "#ffffff",
    tooltipBorder: isDark ? "#555555" : "#d0d0d0",
    tooltipTitle: isDark ? "#f0f0f0" : "#222222",
    tooltipText: isDark ? "#e0e0e0" : "#333333",
    axis,
    grid: colorWithAlpha(axis, 0.16),
    border: colorWithAlpha(axis, 0.28),
  };
}

function chartFilterColors() {
  const colors = chartThemeColors();
  const darkSurface = document.documentElement.dataset.theme === "dark";
  return {
    match: colors.chartAccent,
    matchBorder: darkSurface ? "#1b1b1b" : "#ffffff",
    muted: colorWithAlpha("#858585", 0.28),
    mutedBorder: colorWithAlpha("#858585", 0.55),
    line: colorWithAlpha(colors.chartAccent, 0.5),
  };
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  applyHighlightColor(selectedHighlightColor);
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
  );
  themeColorMeta.content = theme === "dark" ? "#111111" : "#f5f5f5";

  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Unable to save the selected theme in this browser.", error);
  }
}

function applyHighlightColor(color, persist = false) {
  selectedHighlightColor = color;
  highlightColorSelect.value = color;
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  document.documentElement.style.setProperty(
    "--highlight-color",
    HIGHLIGHT_COLORS[color][theme].accent,
  );

  if (!persist) return;
  try {
    localStorage.setItem(HIGHLIGHT_COLOR_STORAGE_KEY, color);
  } catch (error) {
    console.warn("Unable to save the selected highlight color in this browser.", error);
  }
}

function initializeHighlightColor() {
  let savedColor;
  try {
    savedColor = localStorage.getItem(HIGHLIGHT_COLOR_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read the saved highlight color from this browser.", error);
  }
  applyHighlightColor(
    Object.hasOwn(HIGHLIGHT_COLORS, savedColor) ? savedColor : "light-blue",
  );
}

function initializeTheme() {
  let savedTheme;
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read the saved theme from this browser.", error);
  }
  const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
  hasExplicitTheme = savedTheme === "dark" || savedTheme === "light";
  const systemTheme = systemPreference.matches
    ? "dark"
    : "light";
  applyTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemTheme);
  systemPreference.addEventListener("change", (event) => {
    if (!hasExplicitTheme) {
      applyTheme(event.matches ? "dark" : "light");
      refreshChartsForAppearance();
    }
  });
}

function refreshChartsForAppearance() {
  if (chart) renderChart();
  if (categoryChart) renderCategoryChart();
}

function updateChartThemeOptions(chartInstance) {
  const colors = chartThemeColors();
  const tooltip = chartInstance.options.plugins.tooltip;
  tooltip.backgroundColor = colors.tooltipBackground;
  tooltip.borderColor = colors.tooltipBorder;
  tooltip.titleColor = colors.tooltipTitle;
  tooltip.bodyColor = colors.tooltipText;

  for (const scale of Object.values(chartInstance.options.scales)) {
    scale.ticks.color = colors.axis;
    scale.grid.color = colors.grid;
    scale.border.color = colors.border;
    if (scale.title) scale.title.color = colors.axis;
  }
}

function createDeathTooltipContent(death) {
  const title = document.createElement("div");
  title.className = "line-chart-tooltip-title";
  title.textContent = `Death #${death.death} · Day ${death.day}`;

  const details = document.createElement("div");
  details.className = "line-chart-tooltip-details";
  [
    ["Enemy", death.enemy],
    ["Level", death.level || "Unspecified"],
    ["Situation", death.situation || "Unspecified"],
    ["Location", death.location || "Unspecified"],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "line-chart-tooltip-row";

    const name = document.createElement("span");
    name.className = "line-chart-tooltip-label";
    name.textContent = `${label}: `;

    const categoryValue = document.createElement("strong");
    categoryValue.className = "line-chart-tooltip-value";
    categoryValue.textContent = value;
    row.append(name, categoryValue);
    details.append(row);
  });

  const note = document.createElement("div");
  if (getValidClipUrl(death.clip)) {
    note.className = "line-chart-tooltip-note";
    note.textContent = "Click to open Twitch clip";
  } else {
    note.className = "line-chart-tooltip-unavailable";
    note.textContent = "No Twitch clip available";
  }

  return [title, details, note];
}

function updateLineChartTooltip(chartInstance, tooltip) {
  let tooltipElement = chartInstance.canvas.parentElement.querySelector(".death-line-chart-tooltip");
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.className = "line-chart-tooltip death-line-chart-tooltip";
    tooltipElement.setAttribute("role", "tooltip");
    tooltipElement.setAttribute("aria-hidden", "true");
    chartInstance.canvas.parentElement.append(tooltipElement);
  }

  const dataPoint = tooltip.dataPoints?.[0];
  if (
    hoveredNotableEvent ||
    tooltip.opacity === 0 ||
    !dataPoint ||
    !isDeathHighlighted(dataPoint.dataIndex)
  ) {
    tooltipElement.classList.remove("is-visible");
    tooltipElement.setAttribute("aria-hidden", "true");
    return;
  }

  tooltipElement.replaceChildren(...createDeathTooltipContent(dataPoint.raw));
  tooltipElement.classList.add("is-visible");
  tooltipElement.setAttribute("aria-hidden", "false");

  const wrapper = chartInstance.canvas.parentElement;
  const tooltipWidth = tooltipElement.offsetWidth;
  const tooltipHeight = tooltipElement.offsetHeight;
  const pointX = chartInstance.canvas.offsetLeft + tooltip.caretX;
  const pointY = chartInstance.canvas.offsetTop + tooltip.caretY;
  const horizontalPadding = 8;
  const left = Math.max(
    tooltipWidth / 2 + horizontalPadding,
    Math.min(pointX, wrapper.clientWidth - tooltipWidth / 2 - horizontalPadding),
  );
  const showBelow = pointY < tooltipHeight + 14;

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${pointY}px`;
  tooltipElement.style.transform = showBelow
    ? "translate(-50%, 14px)"
    : "translate(-50%, calc(-100% - 14px))";
}

function createNotableEventTooltipContent(event) {
  const title = document.createElement("div");
  title.className = "line-chart-tooltip-title";
  title.textContent = `${event.name} · Day ${event.day}`;

  const note = document.createElement("div");
  if (getValidClipUrl(event.clip)) {
    note.className = "line-chart-tooltip-note";
    note.textContent = "Click to open Twitch clip";
  } else {
    note.className = "line-chart-tooltip-unavailable";
    note.textContent = "No Twitch clip available";
  }

  return [title, note];
}

function hideNotableEventTooltip() {
  const tooltipElement = chartCanvas.parentElement.querySelector(".notable-event-tooltip");
  if (!tooltipElement) return;
  tooltipElement.classList.remove("is-visible");
  tooltipElement.setAttribute("aria-hidden", "true");
}

function updateNotableEventTooltip(chartInstance, event, position) {
  let tooltipElement = chartInstance.canvas.parentElement.querySelector(".notable-event-tooltip");
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.className = "line-chart-tooltip notable-event-tooltip";
    tooltipElement.setAttribute("role", "tooltip");
    tooltipElement.setAttribute("aria-hidden", "true");
    chartInstance.canvas.parentElement.append(tooltipElement);
  }

  tooltipElement.replaceChildren(...createNotableEventTooltipContent(event));
  tooltipElement.classList.add("is-visible");
  tooltipElement.setAttribute("aria-hidden", "false");

  const wrapper = chartInstance.canvas.parentElement;
  const tooltipWidth = tooltipElement.offsetWidth;
  const tooltipHeight = tooltipElement.offsetHeight;
  const pointX = chartInstance.canvas.offsetLeft + position.x;
  const pointY = chartInstance.canvas.offsetTop + position.y;
  const horizontalPadding = 8;
  const left = Math.max(
    tooltipWidth / 2 + horizontalPadding,
    Math.min(pointX, wrapper.clientWidth - tooltipWidth / 2 - horizontalPadding),
  );
  const showBelow = pointY < tooltipHeight + 14;

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${pointY}px`;
  tooltipElement.style.transform = showBelow
    ? "translate(-50%, 14px)"
    : "translate(-50%, calc(-100% - 14px))";
}

function hideRecentEventTooltip() {
  recentEventsTooltip.classList.remove("is-visible");
  recentEventsTooltip.setAttribute("aria-hidden", "true");
}

function showRecentEventTooltip(item, row) {
  const tooltipContent = item.kind === "death"
    ? createDeathTooltipContent(item.data)
    : createNotableEventTooltipContent(item.data);
  recentEventsTooltip.replaceChildren(...tooltipContent);
  recentEventsTooltip.classList.add("is-visible");
  recentEventsTooltip.setAttribute("aria-hidden", "false");

  const sectionRect = recentEventsSection.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const pointX = rowRect.left - sectionRect.left + rowRect.width / 2;
  const pointY = rowRect.top - sectionRect.top + rowRect.height / 2;
  const tooltipWidth = recentEventsTooltip.offsetWidth;
  const tooltipHeight = recentEventsTooltip.offsetHeight;
  const horizontalPadding = 8;
  const left = Math.max(
    tooltipWidth / 2 + horizontalPadding,
    Math.min(pointX, recentEventsSection.clientWidth - tooltipWidth / 2 - horizontalPadding),
  );
  const showBelow = pointY < tooltipHeight + 14;

  recentEventsTooltip.style.left = `${left}px`;
  recentEventsTooltip.style.top = `${pointY}px`;
  recentEventsTooltip.style.transform = showBelow
    ? "translate(-50%, 14px)"
    : "translate(-50%, calc(-100% - 14px))";
}

function recentTimelineItems() {
  const items = [
    ...deaths.map((death) => ({ kind: "death", day: death.day, data: death })),
    ...notableEvents.map((event) => ({ kind: "event", day: event.day, data: event })),
  ];
  return items.sort((left, right) =>
    right.day - left.day ||
    (left.kind === right.kind
      ? (left.kind === "death" ? right.data.death - left.data.death : 0)
      : left.kind === "death" ? -1 : 1),
  );
}

function renderRecentEvents() {
  const allItems = recentTimelineItems();
  const recentItems = recentEventsExpanded
    ? allItems
    : allItems.slice(0, DEFAULT_RECENT_DEATH_COUNT);
  const fragment = document.createDocumentFragment();

  recentItems.forEach((item) => {
    const entry = document.createElement("li");
    entry.className = "recent-event-entry";

    const isDeath = item.kind === "death";
    const data = item.data;
    const clipUrl = getValidClipUrl(data.clip);
    const row = document.createElement(clipUrl ? "a" : "div");
    row.className = "recent-event-row";
    row.setAttribute("aria-describedby", "recent-events-tooltip");
    if (clipUrl) {
      row.href = clipUrl;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
    } else {
      row.tabIndex = 0;
    }

    const name = document.createElement("span");
    name.className = "recent-event-name";
    name.textContent = isDeath ? `Death #${data.death}` : data.type;
    if (isDeath) {
      name.classList.add("recent-event-name-death");
    }

    const day = document.createElement("span");
    day.className = "recent-event-day";
    day.textContent = `Day ${item.day}`;

    const details = document.createElement("span");
    details.className = "recent-event-details";
    if (isDeath) {
      const values = [
        { value: data.enemy, className: "recent-event-value-enemy" },
      ];
      if (/^⭐+$/u.test(data.level)) {
        values.push({ value: data.level, className: "recent-event-value-level" });
      }
      values.push(
        { value: data.situation || "Unspecified", className: "recent-event-value-muted" },
        { value: data.location || "Unspecified", className: "recent-event-value-muted" },
      );
      values.forEach(({ value, className }, index) => {
        if (index > 0) details.append(document.createTextNode(" · "));
        const detail = document.createElement("span");
        detail.className = className;
        detail.textContent = value;
        details.append(detail);
      });
    } else {
      details.textContent = data.name;
      if (data.type === "Boss Kill") {
        details.classList.add("recent-event-details-boss-kill");
      }
    }

    row.append(name, day, details);
    row.addEventListener("pointerenter", () => showRecentEventTooltip(item, row));
    row.addEventListener("pointerleave", hideRecentEventTooltip);
    row.addEventListener("focus", () => showRecentEventTooltip(item, row));
    row.addEventListener("blur", hideRecentEventTooltip);
    entry.append(row);
    fragment.append(entry);
  });

  recentEventsList.replaceChildren(fragment);
  recentEventsList.classList.toggle("is-expanded", recentEventsExpanded);
  recentEventsToggle.textContent = recentEventsExpanded ? "Show recent only" : "Show more";
  recentEventsToggle.setAttribute("aria-expanded", String(recentEventsExpanded));
  recentEventsToggle.disabled = allItems.length <= DEFAULT_RECENT_DEATH_COUNT;
  hideRecentEventTooltip();
}

function parseCsvRows(text, sheetName) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error(`The ${sheetName} CSV contains an unclosed quoted field.`);
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function parseCsv(text) {
  const rows = parseCsvRows(text, "Death Recap");
  if (rows.length < 2) throw new Error("The Death Recap sheet has no death records.");
  const headers = rows[0].map((header) => header.toLocaleLowerCase());
  const requiredColumns = ["death", "day", "enemy", "enemy level", "situation", "location", "clip"];
  const columnIndexes = new Map(headers.map((header, index) => [header, index]));
  const missingColumns = requiredColumns.filter((header) => !columnIndexes.has(header));
  if (missingColumns.length) {
    throw new Error(`The sheet is missing required columns: ${missingColumns.join(", ")}.`);
  }

  const cell = (cells, name) => cells[columnIndexes.get(name)] ?? "";
  return rows.slice(1).flatMap((cells, index) => {
    const rowNumber = index + 2;
    const deathValue = cell(cells, "death");
    const dayValue = cell(cells, "day");
    const enemy = cell(cells, "enemy");

    if (!deathValue && !dayValue && !enemy) return [];

    const deathNumber = Number(deathValue);
    const day = Number(dayValue);
    if (!Number.isInteger(deathNumber) || deathNumber < 1) {
      throw new Error(`Row ${rowNumber} has an invalid Death value.`);
    }
    if (!Number.isInteger(day) || day < 0) {
      throw new Error(`Row ${rowNumber} has an invalid Day value.`);
    }
    if (!enemy) throw new Error(`Row ${rowNumber} is missing an Enemy value.`);

    const situation = cell(cells, "situation");
    return [{
      death: deathNumber,
      day,
      enemy,
      level: cell(cells, "enemy level"),
      situation,
      situationTags: getSituationTags(situation),
      location: cell(cells, "location"),
      clip: cell(cells, "clip"),
    }];
  }).sort((left, right) => left.death - right.death);
}

function parseNotableEventsCsv(text) {
  const rows = parseCsvRows(text, "Notable Events");
  if (!rows.length) throw new Error("The Notable Events sheet is missing its header row.");

  const headers = rows[0].map((header) => header.toLocaleLowerCase());
  const requiredColumns = ["event", "event type", "day", "clip"];
  const columnIndexes = new Map(headers.map((header, index) => [header, index]));
  const missingColumns = requiredColumns.filter((header) => !columnIndexes.has(header));
  if (missingColumns.length) {
    throw new Error(`The Notable Events sheet is missing required columns: ${missingColumns.join(", ")}.`);
  }

  const cell = (cells, name) => cells[columnIndexes.get(name)] ?? "";
  return rows.slice(1).flatMap((cells, index) => {
    const rowNumber = index + 2;
    const name = cell(cells, "event");
    const type = cell(cells, "event type");
    const dayValue = cell(cells, "day");
    if (!name && !type && !dayValue) return [];
    if (!name) throw new Error(`Notable Events row ${rowNumber} is missing an Event value.`);
    if (!type) throw new Error(`Notable Events row ${rowNumber} is missing an Event Type value.`);

    const day = Number(dayValue);
    if (!Number.isInteger(day) || day < 0) {
      throw new Error(`Notable Events row ${rowNumber} has an invalid Day value.`);
    }

    return [{ name, type, day, clip: cell(cells, "clip") }];
  }).sort((left, right) => left.day - right.day);
}

function getSituationTags(situation) {
  return [...new Set(situation.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function getValidClipUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    const isTwitchHost = url.hostname === "twitch.tv" || url.hostname.endsWith(".twitch.tv");
    return url.protocol === "https:" && isTwitchHost ? url.href : "";
  } catch {
    return "";
  }
}

function setStatus(message, state) {
  statusElement.dataset.state = state;
  statusMessage.textContent = message;
}

function showError(error) {
  const detail = error instanceof Error ? error.message : "An unexpected error occurred.";
  setStatus("Chart data could not be loaded.", "error");
  errorMessage.textContent =
    `${detail} Check that the Death Recap and Notable Events sheets are published for read-only access, then try again.`;
  errorPanel.hidden = false;
}

function sortFilterValues(key, values) {
  if (key === "level") {
    const order = ["-", "⭐", "⭐⭐", "👑"];
    return values.sort((left, right) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      if (leftIndex === -1 || rightIndex === -1) {
        return left.localeCompare(right, undefined, { numeric: true });
      }
      return leftIndex - rightIndex;
    });
  }
  return values.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function updateFilterSummary(key) {
  const menu = document.querySelector(`[data-filter-menu="${key}"]`);
  const count = selectedValues.get(key).size;
  const valueCount = menu.querySelectorAll(".filter-option input").length;
  const summary = menu.querySelector(".selection-summary");
  if (key === "situation" && exactSituationCombination !== null) {
    summary.textContent = exactSituationCombination || "Unspecified";
  } else if (count === 1) {
    summary.textContent = selectedValues.get(key).values().next().value || "Unspecified";
  } else {
    summary.textContent = count === 0 || count === valueCount ? "All" : `${count} selected`;
  }
  updateSelectAll(key);
}

function populateFilters() {
  exactSituationCombination = null;
  for (const { key, label, column } of FILTERS) {
    const menu = document.querySelector(`[data-filter-menu="${key}"]`);
    const options = menu.querySelector(".filter-option-list");
    options.replaceChildren();

    const values = [...new Set(deaths.flatMap((death) =>
      key === "situation" ? death.situationTags : [death[key === "level" ? "level" : key]],
    ))];
    sortFilterValues(key, values);

    values.forEach((value, index) => {
      const option = document.createElement("label");
      const checkbox = document.createElement("input");
      const name = document.createElement("span");
      const id = `filter-${key}-${index}`;

      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = value;
      checkbox.dataset.filter = key;
      checkbox.setAttribute("aria-label", `${label}: ${value || "Unspecified"}`);
      name.textContent = value || "Unspecified";
      option.className = "filter-option";
      option.htmlFor = id;
      option.append(checkbox, name);
      options.append(option);
    });

    selectedValues.get(key).clear();
    updateFilterSummary(key);
  }
}

function visibleOptions(key) {
  const menu = document.querySelector(`[data-filter-menu="${key}"]`);
  return [...menu.querySelectorAll(".filter-option")].filter((option) => !option.hidden);
}

function updateSelectAll(key) {
  const menu = document.querySelector(`[data-filter-menu="${key}"]`);
  const selectAll = menu.querySelector("[data-select-all]");
  const visible = visibleOptions(key);
  const selectedCount = visible.reduce(
    (count, option) => count + Number(option.querySelector("input").checked),
    0,
  );

  selectAll.checked = visible.length > 0 && selectedCount === visible.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;
  selectAll.disabled = visible.length === 0;
  const hasSearchQuery = menu.querySelector(".filter-search input")?.value.trim();
  selectAll.nextElementSibling.textContent = hasSearchQuery ? "Select all matching" : "Select all";
}

function applyFilterSearch(key) {
  const menu = document.querySelector(`[data-filter-menu="${key}"]`);
  const search = menu.querySelector(".filter-search input");
  const query = search ? search.value.trim().toLocaleLowerCase() : "";
  menu.querySelectorAll(".filter-option").forEach((option) => {
    option.hidden = !option.textContent.trim().toLocaleLowerCase().includes(query);
  });
  updateSelectAll(key);
}

function matchesFilters(death) {
  return FILTERS.every(({ key }) => {
    const selected = selectedValues.get(key);
    if (key === "situation" && exactSituationCombination !== null) {
      return death.situation === exactSituationCombination;
    }
    if (key === "situation") {
      return selected.size === 0 || death.situationTags.some((tag) => selected.has(tag));
    }
    return selected.size === 0 || selected.has(death[key]);
  });
}

function categoryLabel(value) {
  return value || "Unspecified";
}

function enemyGroupName(enemy) {
  const variant = enemy.match(/^(.*?)\s+\(([^()]*)\)$/);
  return variant ? variant[1].trim() : enemy;
}

function categoryChartData(key) {
  const colors = chartThemeColors();
  if (key === "enemy") {
    const enemyValues = [...new Set(deaths.map((death) => death.enemy))];
    enemyValues.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const groupCounts = new Map();
    for (const enemy of enemyValues) {
      const count = deaths.reduce((total, death) => total + Number(death.enemy === enemy), 0);
      const group = enemyGroupName(enemy);
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + count);
    }
    const groups = [...groupCounts.keys()].sort((left, right) =>
      groupCounts.get(right) - groupCounts.get(left) ||
      left.localeCompare(right, undefined, { numeric: true }),
    );
    const variantsByGroup = new Map(groups.map((group) => [
      group,
      enemyValues.filter((enemy) => enemyGroupName(enemy) === group),
    ]));
    return {
      labels: groups,
      datasets: enemyValues.map((enemy) => ({
        label: enemy,
        data: groups.map((group) =>
          group === enemyGroupName(enemy)
            ? deaths.reduce((count, death) => count + Number(death.enemy === enemy), 0)
            : null,
        ),
        backgroundColor: groups.map((group) => {
          const variants = variantsByGroup.get(group);
          const baseColor = variants.length > 1
            ? colors.chartVariants[variants.indexOf(enemy) % colors.chartVariants.length]
            : colors.chartAccent;
          return baseColor;
        }),
        hoverBackgroundColor: groups.map((group) => {
          const variants = variantsByGroup.get(group);
          const baseColor = variants.length > 1
            ? colors.chartVariants[variants.indexOf(enemy) % colors.chartVariants.length]
            : colors.chartAccent;
          return baseColor;
        }),
        borderColor: colors.tooltipBackground,
        borderWidth: 1,
        stack: "deaths",
      })),
      values: enemyValues.map((enemy) =>
        groups.map((group) => group === enemyGroupName(enemy) ? enemy : null),
      ),
      groupValues: groups.map((group) =>
        enemyValues.filter((enemy) => enemyGroupName(enemy) === group),
      ),
    };
  }

  const counts = new Map();
  for (const death of deaths) {
    counts.set(death[key], (counts.get(death[key]) ?? 0) + 1);
  }
  const values = [...counts.keys()].sort((left, right) =>
    counts.get(right) - counts.get(left) ||
    left.localeCompare(right, undefined, { numeric: true }),
  );
  return {
    labels: values.map(categoryLabel),
    datasets: [{
      label: "Deaths",
      data: values.map((value) => counts.get(value)),
      backgroundColor: colors.chartAccent,
      hoverBackgroundColor: colors.chartAccent,
      borderColor: colors.tooltipBackground,
      borderWidth: 1,
    }],
    values: [values],
    groupValues: values.map((value) => [value]),
  };
}

function wrapCategoryLabel(context, label, maxWidth) {
  const words = String(label).split(/\s+/);
  if (words.length < 2 || context.measureText(label).width <= maxWidth) return [String(label)];

  let bestSplit = 1;
  let bestWidth = Infinity;
  for (let split = 1; split < words.length; split += 1) {
    const firstLine = words.slice(0, split).join(" ");
    const secondLine = words.slice(split).join(" ");
    const widestLine = Math.max(
      context.measureText(firstLine).width,
      context.measureText(secondLine).width,
    );
    if (widestLine < bestWidth) {
      bestSplit = split;
      bestWidth = widestLine;
    }
  }

  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

const categoryAxisLabels = {
  id: "categoryAxisLabels",
  afterDraw(instance) {
    const context = instance.ctx;
    const scale = instance.scales.x;
    const labels = instance.data.labels;
    const labelStep = labels.length > 1
      ? scale.getPixelForValue(1) - scale.getPixelForValue(0)
      : scale.width;
    const maxLabelWidth = Math.max(36, labelStep * 0.9);
    categoryAxisLabelHitAreas = [];

    context.save();
    context.font = "10px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = chartThemeColors().axis;

    labels.forEach((label, index) => {
      const x = scale.getPixelForValue(index);
      const y = instance.chartArea.bottom + 9;
      const text = String(label);
      const lines = wrapCategoryLabel(context, text, maxLabelWidth);
      const lineHeight = 13;

      lines.forEach((line, lineIndex) => {
        context.fillText(line, x, y + lineIndex * lineHeight, maxLabelWidth);
      });

      categoryAxisLabelHitAreas.push({
        index,
        left: x - labelStep / 2,
        right: x + labelStep / 2,
        top: y - 4,
        bottom: y + lines.length * lineHeight,
      });
    });

    context.restore();
  },
};

function categoryAxisLabelAt(event) {
  return categoryAxisLabelHitAreas.find((area) =>
    event.x >= area.left && event.x <= area.right &&
    event.y >= area.top && event.y <= area.bottom,
  );
}

function handleCategoryChartClick(event) {
  const position = { x: event.offsetX, y: event.offsetY };
  const labelArea = categoryAxisLabelAt(position);
  let selection = null;

  if (labelArea) {
    selection = {
      category: activeCategory,
      values: categoryChart.groupValues[labelArea.index],
      group: activeCategory === "enemy",
    };
  } else {
    const elements = categoryChart.getElementsAtEventForMode(
      event,
      "nearest",
      { intersect: true, axis: "xy" },
      true,
    );
    if (elements.length) {
      const { datasetIndex, index } = elements[0];
      const value = categoryChartValues[datasetIndex]?.[index];
      if (value !== null && value !== undefined) {
        selection = { category: activeCategory, values: [value], group: false };
      }
    }
  }

  if (!selection) {
    clearFilterSelections();
    applyFilters();
    return;
  }

  const currentValues = selectedValues.get(selection.category);
  const isSelectedAgain = selection.category === "situation"
    ? exactSituationCombination === selection.values[0]
    : currentValues.size === selection.values.length &&
      selection.values.every((value) => currentValues.has(value));
  if (isSelectedAgain) {
    clearFilterSelections();
    applyFilters();
    return;
  }

  overwriteLineChartFilters(selection.category, selection.values, selection.category === "situation");
}

function updateCategoryChartTooltip(chartInstance, tooltip) {
  const tooltipElement = chartInstance.canvas.closest(".category-chart")
    .querySelector(".category-chart-tooltip");

  if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    tooltipElement.classList.remove("is-visible");
    tooltipElement.setAttribute("aria-hidden", "true");
    return;
  }

  const rows = [...tooltip.dataPoints]
    .filter((item) => Number.isFinite(item.raw) && item.raw > 0)
    .sort((left, right) => right.datasetIndex - left.datasetIndex);
  if (!rows.length) {
    tooltipElement.classList.remove("is-visible");
    tooltipElement.setAttribute("aria-hidden", "true");
    return;
  }

  tooltipElement.replaceChildren();
  rows.forEach((item) => {
    const value = categoryChartValues[item.datasetIndex]?.[item.dataIndex];
    if (value === null || value === undefined) return;

    const row = document.createElement("div");
    const isHighlighted = hoveredCategorySegment?.datasetIndex === item.datasetIndex &&
      hoveredCategorySegment?.index === item.dataIndex;
    row.className = `category-chart-tooltip-row${isHighlighted ? " is-highlighted" : ""}`;

    const color = document.createElement("span");
    color.className = "category-chart-tooltip-swatch";
    const datasetColor = item.dataset.backgroundColor;
    color.style.backgroundColor = Array.isArray(datasetColor)
      ? datasetColor[item.dataIndex]
      : datasetColor;
    color.setAttribute("aria-hidden", "true");

    const name = document.createElement("strong");
    name.className = "category-chart-tooltip-name";
    name.textContent = activeCategory === "enemy" ? value : categoryLabel(value);

    const count = document.createElement("span");
    count.className = "category-chart-tooltip-count";
    count.textContent = `${item.raw} ${item.raw === 1 ? "death" : "deaths"}`;

    row.append(color, name, count);
    tooltipElement.append(row);
  });

  if (!tooltipElement.childElementCount) {
    tooltipElement.classList.remove("is-visible");
    tooltipElement.setAttribute("aria-hidden", "true");
    return;
  }

  tooltipElement.classList.add("is-visible");
  tooltipElement.setAttribute("aria-hidden", "false");

  const section = chartInstance.canvas.closest(".category-chart");
  const sectionRect = section.getBoundingClientRect();
  const canvasRect = chartInstance.canvas.getBoundingClientRect();
  const pointX = canvasRect.left - sectionRect.left + tooltip.caretX;
  const pointY = canvasRect.top - sectionRect.top + tooltip.caretY;
  const tooltipWidth = tooltipElement.offsetWidth;
  const tooltipHeight = tooltipElement.offsetHeight;
  const horizontalPadding = 8;
  const left = Math.max(
    tooltipWidth / 2 + horizontalPadding,
    Math.min(pointX, section.clientWidth - tooltipWidth / 2 - horizontalPadding),
  );
  const showBelow = pointY < tooltipHeight + 14;

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${pointY}px`;
  tooltipElement.style.transform = showBelow
    ? "translate(-50%, 14px)"
    : "translate(-50%, calc(-100% - 14px))";
}

function renderCategoryChart() {
  const data = categoryChartData(activeCategory);
  const colors = chartThemeColors();
  categoryChartValues = data.values;
  const categoryChartInner = categoryChartCanvas.parentElement;
  categoryChartInner.style.width =
    `${Math.max(categoryChartInner.parentElement.clientWidth, data.labels.length * 92)}px`;

  if (!categoryChart) {
    categoryChart = new window.Chart(categoryChartCanvas, {
      type: "bar",
      data: { labels: data.labels, datasets: data.datasets },
      plugins: [categoryAxisLabels],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: "index", intersect: false, axis: "x" },
        onHover: (event, elements) => {
          if (!(event.native?.target instanceof HTMLElement)) return;
          const segment = categoryChart.getElementsAtEventForMode(
            event,
            "nearest",
            { intersect: true, axis: "xy" },
            true,
          )[0];
          hoveredCategorySegment = segment
            ? { datasetIndex: segment.datasetIndex, index: segment.index }
            : null;
          if (categoryChart.tooltip) {
            updateCategoryChartTooltip(categoryChart, categoryChart.tooltip);
          }
          event.native.target.style.cursor =
            elements.length || categoryAxisLabelAt(event) ? "pointer" : "default";
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            axis: "x",
            enabled: false,
            external: ({ chart: chartInstance, tooltip }) =>
              updateCategoryChartTooltip(chartInstance, tooltip),
            filter: (item) => Number.isFinite(item.raw) && item.raw > 0,
          },
        },
        scales: {
          x: {
            stacked: true,
            afterFit: (scale) => {
              scale.height = 88;
            },
            ticks: { display: false },
            grid: { display: false },
            border: { color: colors.border },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: "Deaths",
              color: colors.axis,
              font: { family: "Segoe UI, sans-serif", size: 11, weight: "600" },
            },
            ticks: {
              color: colors.axis,
              precision: 0,
            },
            grid: { color: colors.grid, tickLength: 6 },
            border: { color: colors.border },
          },
        },
      },
    });
    categoryChartCanvas.addEventListener("click", handleCategoryChartClick);
  } else {
    categoryChart.data.labels = data.labels;
    categoryChart.data.datasets = data.datasets;
    updateChartThemeOptions(categoryChart);
    categoryChart.update();
  }

  categoryChart.groupValues = data.groupValues;
  categoryChartCanvas.setAttribute(
    "aria-label",
    `Bar chart showing all deaths by ${FILTERS.find(({ key }) => key === activeCategory).label.toLocaleLowerCase()}`,
  );
}

function clearFilterSelections() {
  for (const { key: filterKey } of FILTERS) selectedValues.get(filterKey).clear();
  exactSituationCombination = null;
  filterControls.querySelectorAll(".filter-search input").forEach((search) => {
    search.value = "";
    applyFilterSearch(search.closest(".filter-menu").dataset.filterMenu);
  });
  filterControls.querySelectorAll('.filter-option input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  for (const { key: filterKey } of FILTERS) updateFilterSummary(filterKey);
}

function overwriteLineChartFilters(key, values, matchExactSituation = false) {
  clearFilterSelections();
  const selected = selectedValues.get(key);
  if (key === "situation" && matchExactSituation) {
    exactSituationCombination = values[0];
    getSituationTags(exactSituationCombination).forEach((tag) => selected.add(tag));
  } else {
    values.forEach((value) => selected.add(value));
  }
  filterControls.querySelectorAll(`.filter-option input[data-filter="${key}"]`).forEach((checkbox) => {
    checkbox.checked = selected.has(checkbox.value);
  });
  updateFilterSummary(key);
  applyFilters();
}

function updateSummary() {
  const matchingCount = deaths.reduce((count, death) => count + Number(matchesFilters(death)), 0);
  deathCount.textContent = String(deaths.length);
  highlightCount.textContent = String(matchingCount);
}

function pointColor(context, matching) {
  const index = context.dataIndex;
  const colors = chartFilterColors();
  return matching[index] ? colors.match : colors.muted;
}

function isDeathHighlighted(index) {
  return deaths[index] !== undefined && matchesFilters(deaths[index]);
}

const dimmedDeathPoints = {
  id: "dimmedDeathPoints",
  afterDatasetsDraw(chartInstance) {
    const meta = chartInstance.getDatasetMeta(0);
    const { ctx, chartArea } = chartInstance;
    const colors = chartFilterColors();
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    ctx.fillStyle = colors.muted;
    ctx.strokeStyle = colors.mutedBorder;
    ctx.lineWidth = 1;

    meta.data.forEach((point, index) => {
      if (isDeathHighlighted(index) || point.skip) return;
      const { x, y } = point.getProps(["x", "y"], true);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  },
};

function notableEventColor(event) {
  const colors = chartThemeColors();
  return event.type === "Boss Kill" ? colors.chartAccent : colors.chartSecondary;
}

const notableEventMarkers = {
  id: "notableEventMarkers",
  afterDatasetsDraw(chartInstance) {
    if (!notableEvents.length) return;

    const { ctx, chartArea, scales } = chartInstance;
    const xScale = scales.x;
    const visibleEvents = notableEvents.flatMap((event) => {
      const x = xScale.getPixelForValue(event.day);
      return x >= chartArea.left && x <= chartArea.right ? [{ event, x }] : [];
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    visibleEvents.forEach(({ event, x }) => {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colorWithAlpha(notableEventColor(event), 0.75);
      ctx.lineWidth = event.type === "Boss Kill" ? 1.75 : 1.25;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    });
    ctx.restore();

    const bossKills = visibleEvents.filter(({ event }) => event.type === "Boss Kill");
    if (!bossKills.length) return;

    ctx.save();
    ctx.font = "600 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelTracks = [];
    bossKills.forEach(({ event, x }) => {
      const labelWidth = ctx.measureText(event.name).width + 10;
      const left = Math.max(
        chartArea.left,
        Math.min(x - labelWidth / 2, chartArea.right - labelWidth),
      );
      let track = labelTracks.findIndex((right) => left >= right + 5);
      if (track === -1) track = labelTracks.length;
      labelTracks[track] = left + labelWidth;

      const y = chartArea.top + 6 + track * 17;
      ctx.fillStyle = chartThemeColors().tooltipBackground;
      ctx.strokeStyle = notableEventColor(event);
      ctx.lineWidth = 1;
      ctx.fillRect(left, y - 2, labelWidth, 15);
      ctx.strokeRect(left, y - 2, labelWidth, 15);
      ctx.fillStyle = chartThemeColors().tooltipTitle;
      ctx.fillText(event.name, left + labelWidth / 2, y, labelWidth - 6);
    });
    ctx.restore();
  },
};

function findNotableEventAtPosition(position) {
  if (!chart || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const { chartArea, scales } = chart;
  if (
    position.y < chartArea.top ||
    position.y > chartArea.bottom ||
    notableEvents.length === 0
  ) {
    return null;
  }

  let nearestEvent = null;
  let nearestDistance = 8;
  notableEvents.forEach((event) => {
    const eventX = scales.x.getPixelForValue(event.day);
    if (eventX < chartArea.left || eventX > chartArea.right) return;
    const distance = Math.abs(eventX - position.x);
    if (distance <= nearestDistance) {
      nearestEvent = event;
      nearestDistance = distance;
    }
  });
  return nearestEvent;
}

function findHighlightedDeathPointAtPosition(position) {
  if (!chart || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const points = chart.getDatasetMeta(0).data;
  let nearestIndex = null;
  let nearestDistance = 7;
  points.forEach((point, index) => {
    if (!isDeathHighlighted(index) || point.skip) return;
    const { x, y } = point.getProps(["x", "y"], true);
    const distance = Math.hypot(position.x - x, position.y - y);
    if (distance <= nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });
  return nearestIndex;
}

function hasActiveFilters() {
  return exactSituationCombination !== null ||
    FILTERS.some(({ key }) => selectedValues.get(key).size > 0);
}

function updateChartFocusRange(matching) {
  const xScaleOptions = chart.options.scales.x;
  const yScaleOptions = chart.options.scales.y;
  const matchingDeaths = deaths.filter((_death, index) => matching[index]);
  const shouldFocusOnMatches =
    focusMatchingToggle.checked && hasActiveFilters() && matchingDeaths.length > 0;

  if (!shouldFocusOnMatches) {
    xScaleOptions.min = selectedDayRange.start;
    xScaleOptions.max = selectedDayRange.end;
  } else {
    const firstDay = Math.min(...matchingDeaths.map((death) => death.day));
    const lastDay = Math.max(...matchingDeaths.map((death) => death.day));
    const dayPadding = Math.max(1, Math.ceil((lastDay - firstDay) * 0.05));
    xScaleOptions.min = Math.max(0, firstDay - dayPadding);
    xScaleOptions.max = lastDay + dayPadding;
  }

  const deathsForYAxis = shouldFocusOnMatches
    ? matchingDeaths
    : deaths.filter(
        (death) =>
          death.day >= selectedDayRange.start && death.day <= selectedDayRange.end,
      );

  if (deathsForYAxis.length === 0) {
    delete yScaleOptions.min;
    delete yScaleOptions.max;
    yScaleOptions.beginAtZero = true;
    return;
  }

  const firstDeath = Math.min(...deathsForYAxis.map((death) => death.death));
  const lastDeath = Math.max(...deathsForYAxis.map((death) => death.death));
  const deathPadding = Math.max(1, Math.ceil((lastDeath - firstDeath) * 0.05));
  yScaleOptions.beginAtZero = false;
  yScaleOptions.min = Math.max(0, firstDeath - deathPadding);
  yScaleOptions.max = lastDeath + deathPadding;
}

function chartDayBounds() {
  const days = [
    ...deaths.map((death) => death.day),
    ...notableEvents.map((event) => event.day),
  ];
  return {
    min: days.length ? Math.min(0, ...days) : 0,
    max: suggestedChartDayMax(),
  };
}

function initializeTimeNavigator() {
  const bounds = chartDayBounds();
  selectedDayRange = { start: bounds.min, end: bounds.max };
  const maximumDeath = Math.max(1, ...deaths.map((death) => death.death));
  const points = deaths
    .slice()
    .sort((first, second) => first.day - second.day || first.death - second.death)
    .map((death) => ({
      x: ((death.day - bounds.min) / (bounds.max - bounds.min)) * 1000,
      y: 56 - (death.death / maximumDeath) * 48,
    }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  timeNavigatorLine.setAttribute("d", linePath);
  timeNavigatorArea.setAttribute(
    "d",
    points.length
      ? `M ${points[0].x.toFixed(2)} 60 ${points
          .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(" ")} L ${points[points.length - 1].x.toFixed(2)} 60 Z`
      : "",
  );
  timeNavigator.hidden = false;
  updateTimeNavigator();
}

function updateTimeNavigator() {
  const bounds = chartDayBounds();
  const fullRange = bounds.max - bounds.min;
  const startPercent = ((selectedDayRange.start - bounds.min) / fullRange) * 100;
  const endPercent = ((selectedDayRange.end - bounds.min) / fullRange) * 100;
  const startDay = Math.round(selectedDayRange.start);
  const endDay = Math.round(selectedDayRange.end);

  timeRangeSelection.style.left = `${startPercent}%`;
  timeRangeSelection.style.width = `${endPercent - startPercent}%`;
  timeRangeStartHandle.style.left = `${startPercent}%`;
  timeRangeEndHandle.style.left = `${endPercent}%`;
  timeRangeStartLabel.textContent = `Day ${startDay}`;
  timeRangeEndLabel.textContent = `Day ${endDay}`;

  timeRangeStartHandle.setAttribute("aria-valuemin", String(bounds.min));
  timeRangeStartHandle.setAttribute(
    "aria-valuemax",
    String(Math.max(bounds.min, selectedDayRange.end - Math.min(1, fullRange))),
  );
  timeRangeStartHandle.setAttribute("aria-valuenow", String(selectedDayRange.start));
  timeRangeStartHandle.setAttribute("aria-valuetext", `Day ${startDay}`);
  timeRangeEndHandle.setAttribute(
    "aria-valuemin",
    String(Math.min(bounds.max, selectedDayRange.start + Math.min(1, fullRange))),
  );
  timeRangeEndHandle.setAttribute("aria-valuemax", String(bounds.max));
  timeRangeEndHandle.setAttribute("aria-valuenow", String(selectedDayRange.end));
  timeRangeEndHandle.setAttribute("aria-valuetext", `Day ${endDay}`);
}

function resetTimeRange() {
  const bounds = chartDayBounds();
  selectedDayRange = { start: bounds.min, end: bounds.max };
  updateTimeNavigator();
}

function setTimeRange(mode, day) {
  const bounds = chartDayBounds();
  const minSpan = Math.min(1, bounds.max - bounds.min);
  const roundedDay = Math.round(day);
  const start = selectedDayRange.start;
  const end = selectedDayRange.end;

  if (mode === "start") {
    selectedDayRange.start = Math.min(
      Math.max(bounds.min, roundedDay),
      end - minSpan,
    );
  } else if (mode === "end") {
    selectedDayRange.end = Math.max(
      Math.min(bounds.max, roundedDay),
      start + minSpan,
    );
  } else if (mode === "pan") {
    const span = end - start;
    const nextStart = Math.min(Math.max(bounds.min, roundedDay), bounds.max - span);
    selectedDayRange = { start: nextStart, end: nextStart + span };
  }

  updateTimeNavigator();
  if (chart) {
    updateChartFocusRange(deaths.map(matchesFilters));
    chart.update("none");
  }
}

function timeRangeDayFromPointer(event) {
  const bounds = chartDayBounds();
  const track = timeRangeTrack.getBoundingClientRect();
  const position = Math.min(Math.max(0, event.clientX - track.left), track.width);
  return bounds.min + (position / track.width) * (bounds.max - bounds.min);
}

function handleTimeRangeKeydown(event) {
  const handle = event.target.closest("[data-range-handle]");
  if (!handle) return;
  const mode = handle.dataset.rangeHandle;
  const current = mode === "start" ? selectedDayRange.start : selectedDayRange.end;
  const step = event.shiftKey ? 10 : 1;
  let nextDay = current;

  if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextDay -= step;
  else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextDay += step;
  else if (event.key === "PageDown") nextDay -= 10;
  else if (event.key === "PageUp") nextDay += 10;
  else if (event.key === "Home") {
    nextDay = mode === "start" ? chartDayBounds().min : selectedDayRange.start + 1;
  } else if (event.key === "End") {
    nextDay = mode === "start" ? selectedDayRange.end - 1 : chartDayBounds().max;
  } else return;

  event.preventDefault();
  setTimeRange(mode, nextDay);
}

function suggestedChartDayMax() {
  const lastDeathDay = deaths.length ? Math.max(...deaths.map((death) => death.day)) : 0;
  const lastEventDay = notableEvents.length
    ? Math.max(...notableEvents.map((event) => event.day))
    : 0;
  const lastDay = Math.max(lastDeathDay, lastEventDay);
  return lastDay + Math.max(1, Math.ceil(lastDay * 0.01));
}

function renderChart() {
  if (typeof window.Chart !== "function") {
    throw new Error("The chart library did not load. Check your internet connection and refresh.");
  }

  const colors = chartThemeColors();
  const filterColors = chartFilterColors();
  const matching = deaths.map(matchesFilters);
  const data = deaths.map((death) => ({ x: death.day, y: death.death, ...death }));
  const dataset = {
    label: "Death number",
    data,
    borderColor: filterColors.line,
    borderDash: [6, 4],
    borderWidth: 2,
    tension: 0.18,
    fill: false,
    pointRadius: (context) => matching[context.dataIndex] ? 4.5 : 0,
    pointHoverRadius: (context) => matching[context.dataIndex] ? 7 : 0,
    pointHitRadius: (context) => matching[context.dataIndex] ? 11 : 0,
    pointBackgroundColor: (context) => pointColor(context, matching),
    pointHoverBackgroundColor: (context) =>
      matching[context.dataIndex] ? filterColors.match : filterColors.muted,
    pointBorderColor: (context) =>
      matching[context.dataIndex] ? filterColors.matchBorder : filterColors.mutedBorder,
    pointBorderWidth: (context) => matching[context.dataIndex] ? 1.5 : 1,
    segment: { borderColor: filterColors.line },
  };

  if (chart) {
    chart.data.datasets[0] = dataset;
    chart.options.plugins.tooltip.filter = (item) => isDeathHighlighted(item.dataIndex);
    updateChartFocusRange(matching);
    updateChartThemeOptions(chart);
    chart.update();
    return;
  }

  chart = new window.Chart(chartCanvas, {
    type: "line",
    data: { datasets: [dataset] },
    plugins: [dimmedDeathPoints, notableEventMarkers],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: "nearest", intersect: true },
      onHover: (event, elements) => {
        const hasMatchingPoint = elements.some((element) => isDeathHighlighted(element.index));
        const notableEvent = hasMatchingPoint ? null : findNotableEventAtPosition(event);
        hoveredNotableEvent = Boolean(notableEvent);
        if (notableEvent) {
          const deathTooltip = chartCanvas.parentElement.querySelector(".death-line-chart-tooltip");
          if (deathTooltip) {
            deathTooltip.classList.remove("is-visible");
            deathTooltip.setAttribute("aria-hidden", "true");
          }
          updateNotableEventTooltip(chart, notableEvent, event);
        } else {
          hideNotableEventTooltip();
        }

        if (event.native?.target instanceof HTMLElement) {
          event.native.target.style.cursor =
            notableEvent || hasMatchingPoint ? "pointer" : "default";
        }
      },
      onClick: (event, elements) => {
        const hoveredDeathIndex = findHighlightedDeathPointAtPosition(event);
        const matchingElement = elements.find((element) => isDeathHighlighted(element.index));
        const deathIndex = hoveredDeathIndex ?? matchingElement?.index;
        if (deathIndex !== undefined && deathIndex !== null) {
          const death = deaths[deathIndex];
          const clipUrl = getValidClipUrl(death.clip);
          if (clipUrl) {
            window.open(clipUrl, "_blank", "noopener,noreferrer");
          }
          return;
        }

        const notableEvent = findNotableEventAtPosition(event);
        if (!notableEvent) return;
        const clipUrl = getValidClipUrl(notableEvent.clip);
        if (clipUrl) window.open(clipUrl, "_blank", "noopener,noreferrer");
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: ({ chart: chartInstance, tooltip }) =>
            updateLineChartTooltip(chartInstance, tooltip),
          filter: (item) => isDeathHighlighted(item.dataIndex),
        },
      },
      scales: {
        x: {
          type: "linear",
          min: selectedDayRange.start,
          max: selectedDayRange.end,
          title: { display: false },
          ticks: {
            color: colors.axis,
            maxTicksLimit: 10,
            precision: 0,
            callback: (value) => `Day ${Math.round(value)}`,
          },
          grid: { color: colors.grid, tickLength: 6 },
          border: { color: colors.border },
        },
        y: {
          title: {
            display: true,
            text: "Death",
            color: colors.axis,
            font: { family: "Segoe UI, sans-serif", size: 11, weight: "600" },
          },
          beginAtZero: true,
          ticks: {
            color: colors.axis,
            precision: 0,
          },
          grid: { color: colors.grid, tickLength: 6 },
          border: { color: colors.border },
        },
      },
    },
  });
}

function applyFilters() {
  updateSummary();
  if (chart) {
    const matching = deaths.map(matchesFilters);
    const filterColors = chartFilterColors();
    const dataset = chart.data.datasets[0];
    dataset.pointRadius = (context) => matching[context.dataIndex] ? 4.5 : 0;
    dataset.pointHoverRadius = (context) => matching[context.dataIndex] ? 7 : 0;
    dataset.pointHitRadius = (context) => matching[context.dataIndex] ? 11 : 0;
    dataset.pointBackgroundColor = (context) => pointColor(context, matching);
    dataset.pointBorderColor = (context) =>
      matching[context.dataIndex] ? filterColors.matchBorder : filterColors.mutedBorder;
    dataset.pointBorderWidth = (context) => matching[context.dataIndex] ? 1.5 : 1;
    dataset.borderColor = filterColors.line;
    dataset.segment.borderColor = filterColors.line;
    chart.options.plugins.tooltip.filter = (item) => isDeathHighlighted(item.dataIndex);
    updateChartFocusRange(matching);
    chart.update();
  }
  if (categoryChart) renderCategoryChart();
}

async function loadSheetData() {
  errorPanel.hidden = true;
  refreshButton.disabled = true;
  retryButton.disabled = true;
  filterControls.disabled = true;
  categoryButtons.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  resetButton.disabled = true;
  setStatus("Connecting to the chart data…", "loading");

  try {
    const [deathResponse, notableEventsResponse] = await Promise.all([
      fetch(SHEET_CSV_URL, { cache: "no-store" }),
      fetch(NOTABLE_EVENTS_CSV_URL, { cache: "no-store" }),
    ]);
    if (!deathResponse.ok) {
      throw new Error(`Google Sheets returned HTTP ${deathResponse.status} for Death Recap.`);
    }
    if (!notableEventsResponse.ok) {
      throw new Error(
        `Google Sheets returned HTTP ${notableEventsResponse.status} for Notable Events.`,
      );
    }

    const [deathCsv, notableEventsCsv] = await Promise.all([
      deathResponse.text(),
      notableEventsResponse.text(),
    ]);
    const loadedDeaths = parseCsv(deathCsv.replace(/^\uFEFF/, ""));
    const loadedNotableEvents = parseNotableEventsCsv(notableEventsCsv.replace(/^\uFEFF/, ""));
    deaths = loadedDeaths;
    notableEvents = loadedNotableEvents;
    initializeTimeNavigator();
    populateFilters();
    updateSummary();
    renderChart();
    renderCategoryChart();
    renderRecentEvents();
    filterControls.disabled = false;
    categoryButtons.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    resetButton.disabled = false;
    setStatus(
      `${deaths.length} deaths and ${notableEvents.length} notable events loaded.`,
      "success",
    );
  } catch (error) {
    showError(error);
  } finally {
    refreshButton.disabled = false;
    retryButton.disabled = false;
  }
}

filterControls.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;

  if (checkbox.dataset.selectAll) {
    const key = checkbox.dataset.selectAll;
    if (key === "situation") exactSituationCombination = null;
    const selected = selectedValues.get(key);
    visibleOptions(key).forEach((option) => {
      const valueCheckbox = option.querySelector("input");
      valueCheckbox.checked = checkbox.checked;
      if (checkbox.checked) {
        selected.add(valueCheckbox.value);
      } else {
        selected.delete(valueCheckbox.value);
      }
    });
    updateFilterSummary(key);
    applyFilters();
    return;
  }

  if (!checkbox.dataset.filter) return;

  const key = checkbox.dataset.filter;
  if (key === "situation") exactSituationCombination = null;
  const selected = selectedValues.get(key);
  if (checkbox.checked) {
    selected.add(checkbox.value);
  } else {
    selected.delete(checkbox.value);
  }

  updateFilterSummary(key);
  applyFilters();
});

filterControls.addEventListener("input", (event) => {
  const search = event.target;
  if (!(search instanceof HTMLInputElement) || !search.matches(".filter-search input")) return;
  const menu = search.closest(".filter-menu");
  applyFilterSearch(menu.dataset.filterMenu);
});

document.addEventListener("click", (event) => {
  const clickedMenu = event.target instanceof Element ? event.target.closest(".filter-menu") : null;
  filterControls.querySelectorAll(".filter-menu[open]").forEach((menu) => {
    if (menu !== clickedMenu) menu.open = false;
  });
});

categoryButtons.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-category]") : null;
  if (!button || button.disabled) return;
  activeCategory = button.dataset.category;
  categoryButtons.querySelectorAll("[data-category]").forEach((categoryButton) => {
    categoryButton.setAttribute("aria-pressed", String(categoryButton === button));
  });
  renderCategoryChart();
});

resetButton.addEventListener("click", () => {
  clearFilterSelections();
  resetTimeRange();
  applyFilters();
});

recentEventsToggle.addEventListener("click", () => {
  recentEventsExpanded = !recentEventsExpanded;
  renderRecentEvents();
});

recentEventsList.addEventListener("scroll", hideRecentEventTooltip);

timeRangeTrack.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const day = timeRangeDayFromPointer(event);
  const handle = event.target.closest("[data-range-handle]");
  let mode = handle?.dataset.rangeHandle;

  if (!mode) {
    if (day >= selectedDayRange.start && day <= selectedDayRange.end) {
      mode = "pan";
    } else {
      mode = Math.abs(day - selectedDayRange.start) <= Math.abs(day - selectedDayRange.end)
        ? "start"
        : "end";
      setTimeRange(mode, day);
    }
  }

  event.preventDefault();
  timeRangeDrag = {
    pointerId: event.pointerId,
    mode,
    pointerDay: day,
    start: selectedDayRange.start,
  };
  timeRangeTrack.setPointerCapture(event.pointerId);
  if (handle instanceof HTMLButtonElement) handle.focus();
});

timeRangeTrack.addEventListener("pointermove", (event) => {
  if (!timeRangeDrag || timeRangeDrag.pointerId !== event.pointerId) return;
  const day = timeRangeDayFromPointer(event);
  if (timeRangeDrag.mode === "pan") {
    setTimeRange("pan", timeRangeDrag.start + day - timeRangeDrag.pointerDay);
  } else {
    setTimeRange(timeRangeDrag.mode, day);
  }
});

function finishTimeRangeDrag(event) {
  if (!timeRangeDrag || timeRangeDrag.pointerId !== event.pointerId) return;
  timeRangeDrag = null;
}

timeRangeTrack.addEventListener("pointerup", finishTimeRangeDrag);
timeRangeTrack.addEventListener("pointercancel", finishTimeRangeDrag);
timeRangeTrack.addEventListener("keydown", handleTimeRangeKeydown);

initializeTheme();
initializeHighlightColor();
themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  hasExplicitTheme = true;
  applyTheme(nextTheme, true);
  refreshChartsForAppearance();
});
highlightColorSelect.addEventListener("change", () => {
  applyHighlightColor(highlightColorSelect.value, true);
  refreshChartsForAppearance();
});

refreshButton.addEventListener("click", loadSheetData);
retryButton.addEventListener("click", loadSheetData);
focusMatchingToggle.addEventListener("change", applyFilters);

loadSheetData();
