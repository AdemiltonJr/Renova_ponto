const state = {
  user: null,
  config: null,
  punches: [],
};

const elements = {
  loginView: document.querySelector("#loginView"),
  appView: document.querySelector("#appView"),
  loginForm: document.querySelector("#loginForm"),
  loginMessage: document.querySelector("#loginMessage"),
  helloTitle: document.querySelector("#helloTitle"),
  logoutButton: document.querySelector("#logoutButton"),
  locationStatus: document.querySelector("#locationStatus"),
  radiusBadge: document.querySelector("#radiusBadge"),
  clockInButton: document.querySelector("#clockInButton"),
  clockOutButton: document.querySelector("#clockOutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  appMessage: document.querySelector("#appMessage"),
  punchList: document.querySelector("#punchList"),
  adminPanel: document.querySelector("#adminPanel"),
  adminSummary: document.querySelector("#adminSummary"),
};

function setMessage(target, text, kind = "") {
  target.textContent = text;
  target.className = `message ${kind}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const isCsv = response.headers.get("content-type")?.includes("text/csv");
  const payload = isCsv ? await response.text() : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Nao foi possivel concluir a acao.");
  }
  return payload;
}

async function boot() {
  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    state.config = payload.config;
    showApp();
    await loadPunches();
    warmLocation();
  } catch {
    showLogin();
  }
}

function showLogin() {
  elements.loginView.classList.remove("hidden");
  elements.appView.classList.add("hidden");
}

function showApp() {
  elements.loginView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  elements.helloTitle.textContent = `Ola, ${state.user.name.split(" ")[0]}`;
  elements.radiusBadge.textContent = `${state.config.allowedRadiusMeters}m`;
  elements.adminPanel.classList.toggle("hidden", state.user.role !== "admin");
}

async function loadPunches() {
  const payload = await api("/api/punches");
  state.punches = payload.punches || [];
  renderPunches();
  renderAdmin();
}

function renderPunches() {
  if (!state.punches.length) {
    elements.punchList.innerHTML = '<p class="empty">Nenhum registro ainda.</p>';
    return;
  }

  elements.punchList.innerHTML = state.punches
    .slice(0, 20)
    .map((punch) => {
      const date = new Date(punch.createdAt);
      const type = punch.type === "in" ? "Entrada" : "Saida";
      const status = punch.status === "approved" ? "Aprovado" : "Recusado";
      const detail = punch.status === "approved"
        ? `${Math.round(punch.distanceMeters || 0)}m da escola`
        : punch.reason || "Registro recusado";
      return `
        <article class="punch-item">
          <div>
            <strong>${type} - ${escapeHtml(punch.userName || state.user.name)}</strong>
            <span>${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${detail}</span>
          </div>
          <span class="status-pill ${punch.status === "rejected" ? "rejected" : ""}">${status}</span>
        </article>
      `;
    })
    .join("");
}

function renderAdmin() {
  if (state.user?.role !== "admin") return;
  const today = new Date().toLocaleDateString("pt-BR");
  const todayPunches = state.punches.filter((punch) => new Date(punch.createdAt).toLocaleDateString("pt-BR") === today);
  const approved = todayPunches.filter((punch) => punch.status === "approved").length;
  const rejected = todayPunches.filter((punch) => punch.status === "rejected").length;
  const people = new Set(todayPunches.map((punch) => punch.userId)).size;
  elements.adminSummary.innerHTML = `
    <div class="summary-box"><strong>${approved}</strong><span>Aprovados</span></div>
    <div class="summary-box"><strong>${rejected}</strong><span>Recusados</span></div>
    <div class="summary-box"><strong>${people}</strong><span>Pessoas</span></div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador nao oferece geolocalizacao."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
  });
}

async function warmLocation() {
  try {
    const position = await getPosition();
    updateLocationStatus(position);
  } catch (error) {
    elements.locationStatus.textContent = error.message || "Permissao de localizacao pendente";
  }
}

function updateLocationStatus(position) {
  const distance = distanceMeters(
    position.coords.latitude,
    position.coords.longitude,
    state.config.schoolLatitude,
    state.config.schoolLongitude,
  );
  const accuracy = Math.round(position.coords.accuracy || 0);
  const inside = distance <= state.config.allowedRadiusMeters && accuracy <= state.config.maxAccuracyMeters;
  elements.locationStatus.textContent = inside
    ? `Dentro do raio (${Math.round(distance)}m)`
    : `Fora/sem precisao (${Math.round(distance)}m, precisao ${accuracy}m)`;
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

async function punch(type) {
  setMessage(elements.appMessage, "Obtendo localizacao precisa...");
  elements.clockInButton.disabled = true;
  elements.clockOutButton.disabled = true;
  try {
    const position = await getPosition();
    updateLocationStatus(position);
    const payload = await api("/api/punches", {
      method: "POST",
      body: JSON.stringify({
        type,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      }),
    });
    state.punches.unshift(payload.punch);
    renderPunches();
    renderAdmin();
    setMessage(elements.appMessage, "Ponto registrado com sucesso.", "success");
  } catch (error) {
    setMessage(elements.appMessage, error.message, "error");
    await loadPunches().catch(() => {});
  } finally {
    elements.clockInButton.disabled = false;
    elements.clockOutButton.disabled = false;
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(elements.loginMessage, "Entrando...");
  const form = new FormData(elements.loginForm);
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        code: form.get("code"),
        pin: form.get("pin"),
      }),
    });
    state.user = payload.user;
    const me = await api("/api/me");
    state.config = me.config;
    showApp();
    await loadPunches();
    warmLocation();
  } catch (error) {
    setMessage(elements.loginMessage, error.message, "error");
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  state.punches = [];
  showLogin();
});

elements.clockInButton.addEventListener("click", () => punch("in"));
elements.clockOutButton.addEventListener("click", () => punch("out"));
elements.refreshButton.addEventListener("click", () => loadPunches());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
