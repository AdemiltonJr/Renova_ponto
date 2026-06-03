const state = {
  user: null,
  config: null,
  punches: [],
  punchRequests: [],
  schedules: [],
  users: [],
  activeTab: "dashboard",
};

let intervalTimerId = null;
let punchesAutoRefreshId = null;
const PUNCHES_AUTO_REFRESH_MS = 15000;

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function updateButtonStates() {
  if (!state.user) return;
  const today = new Date().toLocaleDateString("pt-BR");
  const myPunches = state.punches.filter(p => p.userId === state.user.id && p.status === "approved" && new Date(p.createdAt).toLocaleDateString("pt-BR") === today);
  const lastPunch = myPunches[0]?.type;

  elements.clockInButton.disabled = true;
  elements.intervalInButton.disabled = true;
  elements.intervalOutButton.disabled = true;
  elements.clockOutButton.disabled = true;

  if (!lastPunch || lastPunch === "out") {
    elements.clockInButton.disabled = false;
  } else if (lastPunch === "in" || lastPunch === "interval_out") {
    elements.intervalInButton.disabled = false;
    elements.clockOutButton.disabled = false;
  } else if (lastPunch === "interval_in") {
    elements.intervalOutButton.disabled = false;
  }
}

function translateError(error) {
  let msg = error.message || "Erro desconhecido";
  if (msg.includes("User denied") || msg.includes("denied")) {
    return "Permissão Negada! Libere a localização nos Ajustes.";
  }
  return msg;
}

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
  intervalInButton: document.querySelector("#intervalInButton"),
  intervalOutButton: document.querySelector("#intervalOutButton"),
  clockOutButton: document.querySelector("#clockOutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  appMessage: document.querySelector("#appMessage"),
  punchList: document.querySelector("#punchList"),
  openAdjustmentRequestButton: document.querySelector("#openAdjustmentRequestButton"),
  adjustmentRequestModal: document.querySelector("#adjustmentRequestModal"),
  closeAdjustmentRequestButton: document.querySelector("#closeAdjustmentRequestButton"),
  adjustmentRequestForm: document.querySelector("#adjustmentRequestForm"),
  adjustmentRequestMessage: document.querySelector("#adjustmentRequestMessage"),
  employeePunchRequestList: document.querySelector("#employeePunchRequestList"),
  employeeJourneyDate: document.querySelector("#employeeJourneyDate"),
  employeeJourneyHeading: document.querySelector("#employeeJourneyHeading"),
  employeeJourneySummary: document.querySelector("#employeeJourneySummary"),
  employeeJourneyCard: document.querySelector("#employeeJourneyCard"),
  activateNotificationsButton: document.querySelector("#activateNotificationsButton"),
  notificationStatus: document.querySelector("#notificationStatus"),
  
  // Elementos do Dashboard Administrativo
  adminTabs: document.querySelector("#adminTabs"),
  employeeView: document.querySelector("#employeeView"),
  adminView: document.querySelector("#adminView"),
  adminSummary: document.querySelector("#adminSummary"),
  newUserForm: document.querySelector("#newUserForm"),
  newUserMessage: document.querySelector("#newUserMessage"),
  adminUserList: document.querySelector("#adminUserList"),
  refreshDashboardBtn: document.querySelector("#refreshDashboardBtn"),
  dashboardRecentList: document.querySelector("#dashboardRecentList"),
  editUserModal: document.querySelector("#editUserModal"),
  editUserForm: document.querySelector("#editUserForm"),
  editUserMessage: document.querySelector("#editUserMessage"),
  btnCloseEditUser: document.querySelector("#btnCloseEditUser"),
  editProfileButton: document.querySelector("#editProfileButton"),
  selfProfileModal: document.querySelector("#selfProfileModal"),
  selfProfileForm: document.querySelector("#selfProfileForm"),
  selfProfileMessage: document.querySelector("#selfProfileMessage"),
  btnCloseSelfProfile: document.querySelector("#btnCloseSelfProfile"),
  
  // Elementos da Aba de Espelho de Ponto
  refreshPunchesBtn: document.querySelector("#refreshPunchesBtn"),
  btnOpenManualPunch: document.querySelector("#btnOpenManualPunch"),
  btnCloseManualPunch: document.querySelector("#btnCloseManualPunch"),
  manualPunchModal: document.querySelector("#manualPunchModal"),
  manualPunchForm: document.querySelector("#manualPunchForm"),
  manualPunchMessage: document.querySelector("#manualPunchMessage"),
  manualPunchUserSelect: document.querySelector("#manualPunchUserSelect"),
  refreshRequestsButton: document.querySelector("#refreshRequestsButton"),
  adminPunchRequestList: document.querySelector("#adminPunchRequestList"),
  filterSearch: document.querySelector("#filterSearch"),
  filterDate: document.querySelector("#filterDate"),
  filterType: document.querySelector("#filterType"),
  filterStatus: document.querySelector("#filterStatus"),
  journeyDate: document.querySelector("#journeyDate"),
  journeySummaryMeta: document.querySelector("#journeySummaryMeta"),
  adminJourneyCards: document.querySelector("#adminJourneyCards"),
  journeyUserSelect: document.querySelector("#journeyUserSelect"),
  journeyHistoryMeta: document.querySelector("#journeyHistoryMeta"),
  adminJourneyHistoryCards: document.querySelector("#adminJourneyHistoryCards"),
  scheduleAdminList: document.querySelector("#scheduleAdminList"),
  adminPunchesTableBody: document.querySelector("#adminPunchesTableBody"),
  adminPunchesEmpty: document.querySelector("#adminPunchesEmpty"),
  editPunchModal: document.querySelector("#editPunchModal"),
  editPunchForm: document.querySelector("#editPunchForm"),
  btnCloseEditPunch: document.querySelector("#btnCloseEditPunch"),
  editPunchMessage: document.querySelector("#editPunchMessage"),
  editPunchUserDisplay: document.querySelector("#editPunchUserDisplay"),
  editPunchAuditTrail: document.querySelector("#editPunchAuditTrail"),
  
  // Elementos do Ponto do Administrador (Pessoal)
  adminLocationStatus: document.querySelector("#adminLocationStatus"),
  adminRadiusBadge: document.querySelector("#adminRadiusBadge"),
  adminClockInButton: document.querySelector("#adminClockInButton"),
  adminIntervalInButton: document.querySelector("#adminIntervalInButton"),
  adminIntervalOutButton: document.querySelector("#adminIntervalOutButton"),
  adminClockOutButton: document.querySelector("#adminClockOutButton"),
  adminAppMessage: document.querySelector("#adminAppMessage"),
  adminRefreshButton: document.querySelector("#adminRefreshButton"),
  adminPunchList: document.querySelector("#adminPunchList"),
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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function activatePushNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador nao suporta notificacoes push.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissao de notificacao nao concedida.");
  }

  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/push/public-key");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });

  return subscription;
}

async function boot() {
  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    state.config = payload.config;
    showApp();
    await loadSchedules();
    if (state.user.role === "admin") {
      await loadAdminUsers();
    }
    await loadPunches();
    await loadPunchRequests();
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
  
  const isAdm = state.user.role === "admin";
  document.querySelector(".app-shell").classList.toggle("admin-mode", isAdm);
  elements.adminTabs.classList.toggle("hidden", !isAdm);
  elements.employeeView.classList.toggle("hidden", isAdm);
  elements.adminView.classList.toggle("hidden", !isAdm);

  if (isAdm) {
    startPunchesAutoRefresh();
    switchTab(state.activeTab || "dashboard");
  } else {
    stopPunchesAutoRefresh();
    elements.radiusBadge.textContent = `${state.config.allowedRadiusMeters}m`;
  }
  updateNotificationStatus();
}

function updateNotificationStatus() {
  if (!elements.notificationStatus || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    elements.notificationStatus.textContent = "Notificacoes permitidas neste aparelho.";
  } else if (Notification.permission === "denied") {
    elements.notificationStatus.textContent = "Notificacoes bloqueadas nas configuracoes do navegador.";
  } else {
    elements.notificationStatus.textContent = "Ative para receber alertas no celular.";
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });
  
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.add("hidden");
  });
  
  const targetContent = document.querySelector(`#tab-${tabId}`);
  if (targetContent) {
    targetContent.classList.remove("hidden");
  }
  
  if (tabId === "dashboard") {
    renderAdminSummary();
  } else if (tabId === "punches") {
    if (elements.journeyDate && !elements.journeyDate.value) {
      elements.journeyDate.value = toDateInputValue();
    }
    loadPunches().catch((error) => console.error(error));
    loadPunchRequests().catch((error) => console.error(error));
    renderAdminJourneyView();
    renderAdminJourneyHistoryView();
    renderAdminPunchRequests();
    renderAdminPunchesTable();
    renderScheduleAdminList();
  } else if (tabId === "users") {
    loadAdminUsers();
  } else if (tabId === "my-punch") {
    renderAdminPersonalPunch();
  }
}

function shouldAutoRefreshPunches() {
  return state.user?.role === "admin" && state.activeTab === "punches" && !elements.appView.classList.contains("hidden");
}

function startPunchesAutoRefresh() {
  if (punchesAutoRefreshId) return;
  punchesAutoRefreshId = setInterval(() => {
    if (!shouldAutoRefreshPunches()) return;
    loadPunches().catch((error) => console.error(error));
  }, PUNCHES_AUTO_REFRESH_MS);
}

function stopPunchesAutoRefresh() {
  if (!punchesAutoRefreshId) return;
  clearInterval(punchesAutoRefreshId);
  punchesAutoRefreshId = null;
}

async function refreshPunchesManually() {
  if (!elements.refreshPunchesBtn) return;
  const previousText = elements.refreshPunchesBtn.textContent;
  elements.refreshPunchesBtn.disabled = true;
  elements.refreshPunchesBtn.textContent = "Atualizando...";
  try {
    await loadSchedules();
    await loadPunches();
    await loadPunchRequests();
  } catch (error) {
    console.error(error);
    alert("Nao foi possivel atualizar os pontos agora.");
  } finally {
    elements.refreshPunchesBtn.disabled = false;
    elements.refreshPunchesBtn.textContent = previousText;
  }
}

async function loadPunches() {
  const payload = await api("/api/punches");
  state.punches = payload.punches || [];
  if (state.user?.role === "admin") {
    renderAdminSummary();
    renderAdminJourneyView();
    renderAdminJourneyHistoryView();
    renderAdminPunchesTable();
    renderAdminPersonalPunch();
  } else {
    renderPunches();
  }
}

async function loadPunchRequests() {
  const payload = await api("/api/punch-requests");
  state.punchRequests = payload.requests || [];
  if (state.user?.role === "admin") {
    renderAdminPunchRequests();
  } else {
    renderEmployeePunchRequests();
  }
}

async function loadSchedules() {
  if (!state.user) return;

  if (state.user.role === "admin") {
    const payload = await api("/api/admin/schedules");
    state.schedules = payload.schedules || [];
  } else {
    const payload = await api("/api/my-schedule");
    state.schedules = payload.schedule ? [payload.schedule] : [];
  }
  renderScheduleAdminList();
}

function getScheduleForUser(userId) {
  return (state.schedules || []).find((schedule) => schedule.userId === userId) || null;
}

function getIntervalMinutesForPunch(punch) {
  if (!window.RenovaSchedule || !punch) return 0;
  const schedule = getScheduleForUser(punch.userId);
  if (!schedule) return 0;
  return window.RenovaSchedule.getIntervalMinutesForDate(schedule, punch.createdAt);
}

function getPunchTypeLabel(type, compact = false) {
  const labels = compact
    ? {
        "in": "Entrada Trab.",
        "interval_in": "Entrada Int.",
        "interval_out": "Saída Int.",
        "out": "Saída Trab.",
      }
    : {
        "in": "Entrada Trabalho",
        "interval_in": "Entrada Intervalo",
        "interval_out": "Saída Intervalo",
        "out": "Saída Trabalho",
      };
  return labels[type] || "Ponto";
}

function getPunchDetail(punch) {
  if (punch.source === "employee_request") {
    return "Ajuste solicitado pelo colaborador";
  }
  if (punch.status === "approved") {
    return punch.distanceMeters !== null && punch.distanceMeters !== undefined
      ? `${Math.round(punch.distanceMeters || 0)}m da escola`
      : "Registro Manual";
  }
  return punch.reason || "Registro recusado";
}

function getRequestStatusLabel(status) {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Recusado";
  return "Pendente";
}

function renderEmployeePunchRequests() {
  if (!elements.employeePunchRequestList) return;
  const requests = state.punchRequests.slice(0, 5);

  if (!requests.length) {
    elements.employeePunchRequestList.innerHTML = '<p class="empty">Nenhuma solicitação de ajuste.</p>';
    return;
  }

  elements.employeePunchRequestList.innerHTML = requests.map((request) => {
    const date = new Date(request.requestedCreatedAt);
    const statusClass = request.status === "pending" ? "pending" : request.status === "approved" ? "approved" : "rejected";
    const review = request.status === "pending"
      ? "Aguardando aprovação"
      : request.reviewReason || (request.status === "approved" ? "Aprovado pela administração" : "Recusado pela administração");
    return `
      <article class="request-item">
        <div>
          <strong>${getPunchTypeLabel(request.type)} - ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong>
          <span>${escapeHtml(request.reason)}</span>
          <small>${escapeHtml(review)}</small>
        </div>
        <span class="request-status ${statusClass}">${getRequestStatusLabel(request.status)}</span>
      </article>
    `;
  }).join("");
}

function renderAdminPunchRequests() {
  if (!elements.adminPunchRequestList) return;
  const pendingRequests = state.punchRequests.filter((request) => request.status === "pending");

  if (!pendingRequests.length) {
    elements.adminPunchRequestList.innerHTML = '<p class="empty">Nenhuma solicitação pendente.</p>';
    return;
  }

  elements.adminPunchRequestList.innerHTML = pendingRequests.map((request) => {
    const date = new Date(request.requestedCreatedAt);
    return `
      <article class="request-item admin-request-item">
        <div>
          <strong>${escapeHtml(request.userName)} - ${getPunchTypeLabel(request.type)}</strong>
          <span>${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${escapeHtml(request.reason)}</span>
          <small>Código: ${escapeHtml(request.userCode)} · Solicitado em ${new Date(request.requestedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
        </div>
        <div class="request-actions">
          <button class="btn-action-table approve" type="button" onclick="reviewPunchRequest('${request.id}', 'approve')">Aprovar</button>
          <button class="btn-action-table delete" type="button" onclick="reviewPunchRequest('${request.id}', 'reject')">Recusar</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPunches() {
  renderEmployeeJourneyView();

  if (!state.punches.length) {
    elements.punchList.innerHTML = '<p class="empty">Nenhum registro ainda.</p>';
    updateButtonStates();
    return;
  }

  elements.punchList.innerHTML = state.punches
    .slice(0, 20)
    .map((punch) => {
      const date = new Date(punch.createdAt);
      const type = getPunchTypeLabel(punch.type, true);
      const status = punch.status === "approved" ? "Aprovado" : "Recusado";
      const detail = getPunchDetail(punch);
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
  updateButtonStates();
}

function renderAdminSummary() {
  if (state.user?.role !== "admin") return;
  const today = new Date().toLocaleDateString("pt-BR");
  const todayPunches = state.punches.filter((punch) => new Date(punch.createdAt).toLocaleDateString("pt-BR") === today);
  const approved = todayPunches.filter((punch) => punch.status === "approved").length;
  const rejected = todayPunches.filter((punch) => punch.status === "rejected").length;
  const people = new Set(todayPunches.map((punch) => punch.userId)).size;
  
  elements.adminSummary.innerHTML = `
    <div class="summary-box"><strong>${approved}</strong><span>Aprovados Hoje</span></div>
    <div class="summary-box"><strong>${rejected}</strong><span>Recusados Hoje</span></div>
    <div class="summary-box"><strong>${people}</strong><span>Pessoas Hoje</span></div>
  `;

  if (!todayPunches.length) {
    elements.dashboardRecentList.innerHTML = '<p class="empty">Nenhum registro hoje.</p>';
    return;
  }

  elements.dashboardRecentList.innerHTML = todayPunches
    .slice(0, 10)
    .map((punch) => {
      const date = new Date(punch.createdAt);
      const type = getPunchTypeLabel(punch.type, true);
      const status = punch.status === "approved" ? "Aprovado" : "Recusado";
      const detail = getPunchDetail(punch);
      return `
        <article class="punch-item">
          <div>
            <strong>${escapeHtml(punch.userName)} - ${type}</strong>
            <span>${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${detail}</span>
          </div>
          <span class="status-pill ${punch.status === "rejected" ? "rejected" : ""}">${status}</span>
        </article>
      `;
    })
    .join("");
}

async function loadAdminUsers(options = {}) {
  if (state.user?.role !== "admin") return;
  try {
    const payload = await api("/api/admin/users");
    state.users = payload.users || [];
    renderAdminUsers(state.users);
    populateUserSelect();
    renderScheduleAdminList();
  } catch (error) {
    console.error(error);
    if (options.throwOnError) throw error;
  }
}

function renderAdminUsers(users) {
  if (!elements.adminUserList) return;
  const currentUserId = state.user?.id;
  
  elements.adminUserList.innerHTML = users.map(u => {
    const isSelf = u.id === currentUserId;
    const activeLabel = u.active ? 'Inativar' : 'Ativar';
    const activeClass = !u.active ? 'action-inactive' : '';
    
    return `
      <div class="user-card ${!u.active ? 'inactive' : ''}">
        <div class="user-card-info">
          <strong>${escapeHtml(u.name)} <small>(${u.role === 'admin' ? 'Admin' : 'Colab'})</small></strong>
          <span>Código: ${escapeHtml(u.code)} | Status: ${u.active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div class="user-card-actions">
          <button onclick="openEditUserModal('${u.id}')" class="btn-edit">Editar</button>
          <button onclick="toggleUserActive('${u.id}')" class="${activeClass}" ${isSelf ? 'disabled title="Você não pode se inativar"' : ''}>
            ${activeLabel}
          </button>
          <button onclick="deleteUser('${u.id}')" class="btn-delete" ${isSelf ? 'disabled title="Você não pode se excluir"' : ''}>
            Excluir
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.openEditUserModal = (userId) => {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  elements.editUserForm.querySelector('input[name="userId"]').value = userId;
  elements.editUserForm.querySelector('input[name="name"]').value = user.name;
  elements.editUserForm.querySelector('input[name="code"]').value = user.code;
  elements.editUserForm.querySelector('select[name="role"]').value = user.role;
  elements.editUserForm.querySelector('input[name="pin"]').value = "";

  elements.editUserMessage.classList.add("hidden");
  elements.editUserModal.classList.remove("hidden");
};

window.toggleUserActive = async (userId) => {
  if (userId === state.user?.id) {
    alert("Você não pode inativar a si mesmo!");
    return;
  }
  try {
    await api("/api/admin/users", {
      method: "PUT",
      body: JSON.stringify({ id: userId, action: "toggle_active" })
    });
    loadAdminUsers();
  } catch (error) {
    alert("Erro: " + error.message);
  }
};

window.deleteUser = async (userId) => {
  if (userId === state.user?.id) {
    alert("Você não pode excluir a si mesmo!");
    return;
  }
  if (!confirm("Tem certeza que deseja excluir permanentemente este usuário? Todos os acessos futuros serão desativados. Os registros de ponto já realizados serão mantidos.")) return;
  try {
    await api(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    alert("Usuário excluído com sucesso!");
    loadAdminUsers();
  } catch (error) {
    alert("Erro: " + error.message);
  }
};

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
    elements.locationStatus.textContent = translateError(error);
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
  const text = inside
    ? `Dentro do raio (${Math.round(distance)}m)`
    : `Fora/sem precisao (${Math.round(distance)}m, precisao ${accuracy}m)`;
  if (elements.locationStatus) {
    elements.locationStatus.textContent = text;
  }
  if (elements.adminLocationStatus) {
    elements.adminLocationStatus.textContent = text;
  }
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

async function punch(type, isAdminPersonal = false) {
  const msgElement = isAdminPersonal ? elements.adminAppMessage : elements.appMessage;
  const inBtn = isAdminPersonal ? elements.adminClockInButton : elements.clockInButton;
  const intInBtn = isAdminPersonal ? elements.adminIntervalInButton : elements.intervalInButton;
  const intOutBtn = isAdminPersonal ? elements.adminIntervalOutButton : elements.intervalOutButton;
  const outBtn = isAdminPersonal ? elements.adminClockOutButton : elements.clockOutButton;

  setMessage(msgElement, "Obtendo localizacao precisa...");
  inBtn.disabled = true;
  intInBtn.disabled = true;
  intOutBtn.disabled = true;
  outBtn.disabled = true;
  
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
    
    if (state.user?.role === "admin") {
      renderAdminSummary();
      renderAdminPunchesTable();
      renderAdminPersonalPunch();
    } else {
      renderPunches();
    }
    setMessage(msgElement, "Ponto registrado com sucesso.", "success");

    if (type === "interval_in") {
      const intervalMinutes = getIntervalMinutesForPunch(payload.punch);
      if (intervalMinutes && "Notification" in window && Notification.permission === "granted") {
        if (intervalTimerId) clearTimeout(intervalTimerId);
        intervalTimerId = setTimeout(() => {
          new Notification("Escola Renova Ponto", {
            body: "Seu intervalo acabou. Registre o retorno ao trabalho.",
            icon: "/logo.webp"
          });
        }, intervalMinutes * 60 * 1000);
      }
    } else if (type === "interval_out" || type === "out") {
      if (intervalTimerId) {
        clearTimeout(intervalTimerId);
        intervalTimerId = null;
      }
    }
  } catch (error) {
    setMessage(msgElement, translateError(error), "error");
    await loadPunches().catch(() => {});
  } finally {
    if (isAdminPersonal) {
      updateAdminPersonalButtonStates();
    } else {
      updateButtonStates();
    }
  }
}

function populateUserSelect() {
  if (!elements.manualPunchUserSelect) return;
  const activeEmployees = state.users.filter(u => u.active && u.role === "employee");
  if (!activeEmployees.length) {
    elements.manualPunchUserSelect.disabled = true;
    elements.manualPunchUserSelect.innerHTML = '<option value="">Nenhum colaborador ativo encontrado</option>';
    return;
  }

  elements.manualPunchUserSelect.disabled = false;
  elements.manualPunchUserSelect.innerHTML = activeEmployees.map(u => `
    <option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.code)})</option>
  `).join("");
}

function matchesDateFilter(createdAtStr, filterValue) {
  const date = new Date(createdAtStr);
  const now = new Date();
  const todayStr = now.toLocaleDateString("pt-BR");
  const dateStr = date.toLocaleDateString("pt-BR");
  
  if (filterValue === "today") {
    return dateStr === todayStr;
  }
  
  if (filterValue === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return dateStr === yesterday.toLocaleDateString("pt-BR");
  }
  
  if (filterValue === "week") {
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }
  
  if (filterValue === "month") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  
  return true; // "all"
}

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToDateKey(value) {
  if (!value) return new Date().toLocaleDateString("pt-BR");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function dateKeyToDateInputValue(dateKey) {
  const match = String(dateKey || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return toDateInputValue();
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getNextExpectedEvent(journey) {
  const journeyDate = journey.isoDateKey || dateKeyToDateInputValue(journey.dateKey);
  if (journeyDate !== toDateInputValue()) return null;
  const now = new Date();
  return (journey.expectedEvents || []).find((event) => {
    return new Date(`${journeyDate}T${event.time}:00`).getTime() >= now.getTime();
  }) || null;
}

function renderExpectedPunchLine(label, expectedTime, punch) {
  const actual = punch ? window.RenovaJourney.getPunchTime(punch) : "Pendente";
  const stateClass = punch ? "done" : "pending";
  return `
    <div class="expected-punch-line ${stateClass}">
      <span>${label}</span>
      <strong>Esperado ${expectedTime}</strong>
      <small>${actual}</small>
    </div>
  `;
}

function renderExpectedSchedule(journey) {
  if (!window.RenovaSchedule || !journey.schedule) return "";
  const dayConfig = window.RenovaSchedule.getDayConfigForDate(journey.schedule, journey.isoDateKey || dateKeyToDateInputValue(journey.dateKey));
  if (!dayConfig) return "";

  const intervalMinutes = dayConfig.intervalMinutes || 0;
  let intervalDetail = "Sem intervalo previsto";
  if (intervalMinutes) {
    intervalDetail = `Duração esperada: ${window.RenovaSchedule.formatIntervalDuration(intervalMinutes)}`;
    if (journey.lastIntervalIn && !journey.lastIntervalOut) {
      const startedAt = window.RenovaJourney.getPunchTime(journey.lastIntervalIn);
      const returnAt = window.RenovaSchedule.getReturnTimeFromIntervalStart(journey.schedule, journey.isoDateKey, startedAt);
      if (returnAt) intervalDetail = `Retorno esperado: ${returnAt}`;
    } else if (journey.lastIntervalOut) {
      intervalDetail = `Retorno marcado: ${window.RenovaJourney.getPunchTime(journey.lastIntervalOut)}`;
    }
  }

  return `
    <div class="expected-schedule">
      <div class="expected-schedule-title">Horários esperados</div>
      <div class="expected-punch-grid">
        ${renderExpectedPunchLine("Entrada", dayConfig.start, journey.firstIn)}
        ${renderExpectedPunchLine("Saída", dayConfig.end, journey.lastOut)}
      </div>
      <div class="expected-interval-note">${intervalDetail}</div>
    </div>
  `;
}

function renderJourneyCard(journey, options = {}) {
  const steps = journey.journeySteps || [
    ["Entrada", journey.firstIn],
    ["Intervalo", journey.lastIntervalIn],
    ["Retorno", journey.lastIntervalOut],
    ["Saída", journey.lastOut],
  ].map(([label, punch]) => ({ label, punch }));
  const detail = options.showDate
    ? `${journey.dateKey} · Código: ${journey.userCode}`
    : `Código: ${journey.userCode}`;
  const attention = journey.attention.length
    ? `<div class="journey-attention">${journey.attention.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  const expectedSchedule = renderExpectedSchedule(journey);

  return `
    <article class="journey-card ${journey.status}">
      <div class="journey-card-top">
        <div>
          <strong>${escapeHtml(journey.userName)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
        <span class="journey-status ${journey.status}">${escapeHtml(journey.statusLabel)}</span>
      </div>
      <div class="journey-timeline">
        ${steps.map((step) => `
          <div class="journey-step ${step.punch ? "done" : "pending"}">
            <span>${escapeHtml(step.label)}</span>
            <strong>${window.RenovaJourney.getPunchTime(step.punch)}</strong>
          </div>
        `).join("")}
      </div>
      ${expectedSchedule}
      ${attention}
    </article>
  `;
}

function renderEmployeeJourneyView() {
  if (state.user?.role === "admin" || !elements.employeeJourneyCard || !window.RenovaJourney) return;

  if (elements.employeeJourneyDate && !elements.employeeJourneyDate.value) {
    elements.employeeJourneyDate.value = toDateInputValue();
  }

  const dateKey = elements.employeeJourneyDate?.value
    ? dateInputToDateKey(elements.employeeJourneyDate.value)
    : new Date().toLocaleDateString("pt-BR");
  const todayKey = new Date().toLocaleDateString("pt-BR");
  const isToday = dateKey === todayKey;
  const dateLabel = isToday ? "hoje" : `em ${dateKey}`;
  const journeys = window.RenovaJourney.buildDailyJourneys(state.punches, {
    dateKey,
    schedules: state.schedules,
    users: [state.user],
  });
  const journey = journeys.find((item) => item.userId === state.user.id);

  if (elements.employeeJourneyHeading) {
    elements.employeeJourneyHeading.textContent = isToday ? "Hoje" : dateKey;
  }

  if (!journey) {
    elements.employeeJourneySummary.textContent = `Nenhuma marcação registrada ${dateLabel}.`;
    elements.employeeJourneyCard.innerHTML = renderJourneyCard({
      userName: state.user.name,
      userCode: state.user.code,
      dateKey,
      firstIn: null,
      lastIntervalIn: null,
      lastIntervalOut: null,
      lastOut: null,
      status: "not_started",
      statusLabel: "Sem entrada",
      attention: ["Aguardando primeira marcação"],
      expectedEvents: [],
      expectedMinutes: 0,
      workedMinutes: 0,
      balanceMinutes: 0,
    });
    return;
  }

  const attentionText = journey.attention.length
    ? `${journey.attention.length} ponto(s) de atenção`
    : "sem alertas";
  const nextEvent = getNextExpectedEvent(journey);
  const nextText = nextEvent ? ` · Próximo ponto: ${nextEvent.label} ${nextEvent.time}` : "";
  elements.employeeJourneySummary.textContent = `${journey.statusLabel} ${dateLabel} · ${attentionText}${nextText}`;
  elements.employeeJourneyCard.innerHTML = renderJourneyCard(journey);
}

function getJourneyUserOptions() {
  const usersById = new Map();
  for (const user of state.users || []) {
    if (user.role === "employee" && user.active !== false) {
      usersById.set(user.id, {
        id: user.id,
        name: user.name || "Sem nome",
        code: user.code || "",
      });
    }
  }
  for (const punch of state.punches) {
    if (!punch.userId) continue;
    usersById.set(punch.userId, {
      id: punch.userId,
      name: punch.userName || "Sem nome",
      code: punch.userCode || "",
    });
  }
  return Array.from(usersById.values())
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function populateJourneyUserSelect() {
  if (!elements.journeyUserSelect) return;
  const users = getJourneyUserOptions();
  const currentValue = elements.journeyUserSelect.value;

  if (!users.length) {
    elements.journeyUserSelect.disabled = true;
    elements.journeyUserSelect.innerHTML = '<option value="">Nenhum colaborador com jornada</option>';
    return;
  }

  elements.journeyUserSelect.disabled = false;
  elements.journeyUserSelect.innerHTML = [
    '<option value="">Selecione</option>',
    ...users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.code)})</option>`),
  ].join("");

  const hasCurrent = users.some((user) => user.id === currentValue);
  elements.journeyUserSelect.value = hasCurrent ? currentValue : users[0].id;
}

function renderAdminJourneyHistoryView() {
  if (state.user?.role !== "admin" || !elements.adminJourneyHistoryCards || !window.RenovaJourney) return;

  populateJourneyUserSelect();
  const userId = elements.journeyUserSelect?.value;

  if (!userId) {
    elements.journeyHistoryMeta.textContent = "Selecione um colaborador para visualizar as últimas 5 jornadas registradas.";
    elements.adminJourneyHistoryCards.innerHTML = '<p class="empty">Nenhum colaborador selecionado.</p>';
    return;
  }

  const history = window.RenovaJourney.buildUserJourneyHistory(state.punches, {
    userId,
    limit: 5,
    schedules: state.schedules,
    users: state.users,
  });
  const selectedUser = getJourneyUserOptions().find((user) => user.id === userId);
  const completeCount = history.filter((journey) => journey.status === "complete").length;
  const attentionCount = history.filter((journey) => journey.attention.length > 0).length;
  const selectedName = selectedUser?.name || "colaborador";

  elements.journeyHistoryMeta.textContent = `${selectedName} · ${history.length} jornada(s) · ${completeCount} completas · ${attentionCount} com atenção`;

  if (!history.length) {
    elements.adminJourneyHistoryCards.innerHTML = '<p class="empty">Nenhuma jornada encontrada para este colaborador.</p>';
    return;
  }

  elements.adminJourneyHistoryCards.innerHTML = history
    .map((journey) => renderJourneyCard(journey, { showDate: true }))
    .join("");
}

function renderScheduleAdminList() {
  if (state.user?.role !== "admin" || !elements.scheduleAdminList || !window.RenovaSchedule) return;
  const usersById = new Map((state.users || []).map((user) => [user.id, user]));

  if (!state.schedules.length) {
    elements.scheduleAdminList.innerHTML = '<p class="empty">Nenhuma grade de horarios cadastrada.</p>';
    return;
  }

  elements.scheduleAdminList.innerHTML = state.schedules
    .slice()
    .sort((a, b) => {
      const userA = usersById.get(a.userId);
      const userB = usersById.get(b.userId);
      return String(userA?.name || "").localeCompare(String(userB?.name || ""), "pt-BR");
    })
    .map((schedule) => {
      const user = usersById.get(schedule.userId);
      const status = schedule.active === false ? "Inativa" : "Ativa";
      return `
        <article class="schedule-row ${schedule.active === false ? "inactive" : ""}">
          <div>
            <strong>${escapeHtml(user?.name || "Colaborador")}</strong>
            <span>${escapeHtml(schedule.profile || "Colaborador")} · ${status} · Aviso ${Number(schedule.notifyBeforeMinutes || 10)} min antes</span>
          </div>
          <p>${escapeHtml(window.RenovaSchedule.formatScheduleDays(schedule))}</p>
        </article>
      `;
    })
    .join("");
}

function renderAdminPunchesTable() {
  if (state.user?.role !== "admin") return;
  
  const searchVal = (elements.filterSearch.value || "").trim().toLowerCase();
  const dateVal = elements.filterDate.value;
  const typeVal = elements.filterType.value;
  const statusVal = elements.filterStatus.value;
  
  const filtered = state.punches.filter(punch => {
    const matchesSearch = !searchVal || 
      (punch.userName && punch.userName.toLowerCase().includes(searchVal)) || 
      (punch.userCode && punch.userCode.toLowerCase().includes(searchVal));
    const matchesDate = matchesDateFilter(punch.createdAt, dateVal);
    const matchesType = typeVal === "all" || punch.type === typeVal;
    const matchesStatus = statusVal === "all" || punch.status === statusVal;
    
    return matchesSearch && matchesDate && matchesType && matchesStatus;
  });
  
  if (!filtered.length) {
    elements.adminPunchesTableBody.innerHTML = "";
    elements.adminPunchesEmpty.classList.remove("hidden");
    return;
  }
  
  elements.adminPunchesEmpty.classList.add("hidden");
  
  elements.adminPunchesTableBody.innerHTML = filtered.map(punch => {
    const date = new Date(punch.createdAt);
    const typeLabel = getPunchTypeLabel(punch.type, true);
    const statusLabel = punch.status === "approved" ? "Aprovado" : "Recusado";
    const statusClass = punch.status === "rejected" ? "rejected" : "";
    const details = getPunchDetail(punch);
    
    let editedBadge = "";
    if (punch.originalCreatedAt) {
      const origDate = new Date(punch.originalCreatedAt);
      const origTypeLabel = getPunchTypeLabel(punch.originalType, true);
      const origStatusLabel = punch.originalStatus === "approved" ? "Aprovado" : "Recusado";
      const origDetail = punch.originalReason || "";
      const tooltip = `Original:\nData/Hora: ${origDate.toLocaleString("pt-BR")}\nTipo: ${origTypeLabel}\nStatus: ${origStatusLabel}\nMotivo: ${origDetail}`;
      editedBadge = `<br><span class="badge-edited" title="${escapeHtml(tooltip)}">✏️ Editado</span>`;
    }

    const mapsLink = punch.latitude && punch.longitude
      ? `<a href="https://www.google.com/maps/search/?api=1&query=${punch.latitude},${punch.longitude}" target="_blank" class="btn-map" title="Ver localização no mapa">📍 Mapa</a>`
      : `<span>Sem GPS</span>`;
      
    const toggleLabel = punch.status === "approved" ? "Negar" : "Aprovar";
    const toggleClass = punch.status === "approved" ? "delete" : "approve";
    const toggleTargetStatus = punch.status === "approved" ? "rejected" : "approved";
    
    return `
      <tr>
        <td data-label="Colaborador">
          <strong>${escapeHtml(punch.userName)}</strong>
          <span>Código: ${escapeHtml(punch.userCode)}</span>
        </td>
        <td data-label="Data/Hora">
          <strong>${date.toLocaleDateString("pt-BR")}</strong>
          <span>${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </td>
        <td data-label="Tipo">
          <strong>${typeLabel}</strong>
        </td>
        <td data-label="Status">
          <span class="status-pill ${statusClass}">${statusLabel}</span>
          ${editedBadge}
        </td>
        <td data-label="Localização">
          <strong>${details}</strong>
          ${mapsLink}
        </td>
        <td data-label="Ações">
          <button onclick="overridePunchStatus('${punch.id}', '${toggleTargetStatus}')" class="btn-action-table ${toggleClass}">
            ${toggleLabel}
          </button>
          <button onclick="openEditPunchModal('${punch.id}')" class="btn-action-table edit" title="Editar registro de ponto">
            Editar
          </button>
          <button onclick="deletePunch('${punch.id}')" class="btn-action-table delete" title="Excluir ponto permanentemente">
            Excluir
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAdminJourneyView() {
  if (state.user?.role !== "admin" || !elements.adminJourneyCards || !window.RenovaJourney) return;

  if (!elements.journeyDate.value) {
    elements.journeyDate.value = toDateInputValue();
  }

  const dateKey = dateInputToDateKey(elements.journeyDate.value);
  const search = elements.filterSearch.value || "";
  const journeys = window.RenovaJourney.buildDailyJourneys(state.punches, {
    dateKey,
    search,
    schedules: state.schedules,
    users: state.users,
  });
  const completeCount = journeys.filter((journey) => journey.status === "complete").length;
  const attentionCount = journeys.filter((journey) => journey.attention.length > 0).length;

  elements.journeySummaryMeta.textContent = `${journeys.length} colaboradores · ${completeCount} completas · ${attentionCount} com atenção`;

  if (!journeys.length) {
    elements.adminJourneyCards.innerHTML = '<p class="empty">Nenhuma jornada encontrada para a data e filtros selecionados.</p>';
    return;
  }

  elements.adminJourneyCards.innerHTML = journeys.map(renderJourneyCard).join("");
}

function renderAdminPersonalPunch() {
  if (!state.user || state.user.role !== "admin") return;
  
  elements.adminRadiusBadge.textContent = `${state.config.allowedRadiusMeters}m`;
  
  const myPunches = state.punches.filter(p => p.userId === state.user.id);
  if (!myPunches.length) {
    elements.adminPunchList.innerHTML = '<p class="empty">Nenhum registro seu ainda.</p>';
  } else {
    elements.adminPunchList.innerHTML = myPunches
      .slice(0, 20)
      .map((punch) => {
        const date = new Date(punch.createdAt);
        const type = getPunchTypeLabel(punch.type, true);
        const status = punch.status === "approved" ? "Aprovado" : "Recusado";
        const detail = getPunchDetail(punch);
        return `
          <article class="punch-item">
            <div>
              <strong>${type}</strong>
              <span>${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${detail}</span>
            </div>
            <span class="status-pill ${punch.status === "rejected" ? "rejected" : ""}">${status}</span>
          </article>
        `;
      })
      .join("");
  }
  
  updateAdminPersonalButtonStates();
}

function updateAdminPersonalButtonStates() {
  if (!state.user) return;
  const today = new Date().toLocaleDateString("pt-BR");
  const myPunches = state.punches.filter(p => p.userId === state.user.id && p.status === "approved" && new Date(p.createdAt).toLocaleDateString("pt-BR") === today);
  const lastPunch = myPunches[0]?.type;

  elements.adminClockInButton.disabled = true;
  elements.adminIntervalInButton.disabled = true;
  elements.adminIntervalOutButton.disabled = true;
  elements.adminClockOutButton.disabled = true;

  if (!lastPunch || lastPunch === "out") {
    elements.adminClockInButton.disabled = false;
  } else if (lastPunch === "in" || lastPunch === "interval_out") {
    elements.adminIntervalInButton.disabled = false;
    elements.adminClockOutButton.disabled = false;
  } else if (lastPunch === "interval_in") {
    elements.adminIntervalOutButton.disabled = false;
  }
}

window.overridePunchStatus = async (punchId, targetStatus) => {
  const defaultReason = targetStatus === "approved" ? "Aprovado manualmente pelo Admin" : "Recusado pelo Admin";
  const reason = prompt("Justificativa da alteração:", defaultReason);
  if (reason === null) return;

  try {
    await api("/api/admin/punches", {
      method: "PUT",
      body: JSON.stringify({ punchId, status: targetStatus, reason })
    });
    alert("Status do ponto alterado com sucesso!");
    await loadPunches();
  } catch (error) {
    alert("Erro: " + error.message);
  }
};

window.deletePunch = async (punchId) => {
  if (!confirm("Tem certeza que deseja excluir permanentemente este registro de ponto?")) return;
  try {
    await api(`/api/admin/punches?punchId=${encodeURIComponent(punchId)}`, {
      method: "DELETE"
    });
    alert("Registro de ponto excluído!");
    await loadPunches();
  } catch (error) {
    alert("Erro: " + error.message);
  }
};

window.reviewPunchRequest = async (requestId, action) => {
  const isApproval = action === "approve";
  const confirmation = isApproval
    ? "Aprovar esta solicitação e criar o ponto ajustado?"
    : "Recusar esta solicitação?";
  if (!confirm(confirmation)) return;

  const reviewReason = isApproval
    ? ""
    : prompt("Informe o motivo da recusa:", "Solicitação recusada pela administração");
  if (!isApproval && reviewReason === null) return;

  try {
    await api("/api/admin/punch-requests", {
      method: "PUT",
      body: JSON.stringify({ requestId, action, reviewReason })
    });
    await loadPunchRequests();
    await loadPunches();
  } catch (error) {
    alert("Erro: " + error.message);
  }
};

async function handleActivateNotifications() {
  if (!elements.activateNotificationsButton || !elements.notificationStatus) return;

  const previousText = elements.activateNotificationsButton.textContent;
  elements.activateNotificationsButton.disabled = true;
  elements.activateNotificationsButton.textContent = "Ativando...";
  elements.notificationStatus.textContent = "Solicitando permissao do celular...";

  try {
    await activatePushNotifications();
    elements.notificationStatus.textContent = "Notificacoes ativas neste aparelho.";
  } catch (error) {
    elements.notificationStatus.textContent = error.message || "Nao foi possivel ativar notificacoes.";
  } finally {
    elements.activateNotificationsButton.disabled = false;
    elements.activateNotificationsButton.textContent = previousText;
  }
}

elements.activateNotificationsButton?.addEventListener("click", handleActivateNotifications);

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
    await loadSchedules();
    if (state.user.role === "admin") {
      await loadAdminUsers();
    }
    await loadPunches();
    await loadPunchRequests();
    warmLocation();
  } catch (error) {
    setMessage(elements.loginMessage, error.message, "error");
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  stopPunchesAutoRefresh();
  state.user = null;
  state.punches = [];
  state.punchRequests = [];
  showLogin();
});

elements.clockInButton.addEventListener("click", () => punch("in"));
elements.intervalInButton.addEventListener("click", () => punch("interval_in"));
elements.intervalOutButton.addEventListener("click", () => punch("interval_out"));
elements.clockOutButton.addEventListener("click", () => punch("out"));
elements.refreshButton.addEventListener("click", async () => {
  await loadPunches();
  await loadPunchRequests();
});
if (elements.employeeJourneyDate) {
  elements.employeeJourneyDate.addEventListener("change", renderEmployeeJourneyView);
}

// Event Listeners dos botões de ponto pessoal do Admin
if (elements.openAdjustmentRequestButton) {
  elements.openAdjustmentRequestButton.addEventListener("click", () => {
    const now = new Date();
    const dateInput = elements.adjustmentRequestForm.querySelector('input[name="date"]');
    const timeInput = elements.adjustmentRequestForm.querySelector('input[name="time"]');

    elements.adjustmentRequestForm.reset();
    dateInput.value = toDateInputValue(now);
    timeInput.value = now.toTimeString().slice(0, 8);
    elements.adjustmentRequestMessage.classList.add("hidden");
    elements.adjustmentRequestModal.classList.remove("hidden");
  });
}

if (elements.closeAdjustmentRequestButton) {
  elements.closeAdjustmentRequestButton.addEventListener("click", () => {
    elements.adjustmentRequestModal.classList.add("hidden");
  });
}

if (elements.adjustmentRequestForm) {
  elements.adjustmentRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(elements.adjustmentRequestMessage, "Enviando solicitação...");
    elements.adjustmentRequestMessage.classList.remove("hidden");

    const form = new FormData(elements.adjustmentRequestForm);
    const date = form.get("date");
    const time = form.get("time");
    const type = form.get("type");
    const reason = form.get("reason");
    const createdAt = new Date(`${date}T${time}`).toISOString();

    try {
      await api("/api/punch-requests", {
        method: "POST",
        body: JSON.stringify({ type, createdAt, reason })
      });
      setMessage(elements.adjustmentRequestMessage, "Solicitação enviada para aprovação.", "success");
      await loadPunchRequests();
      setTimeout(() => {
        elements.adjustmentRequestModal.classList.add("hidden");
      }, 1200);
    } catch (error) {
      setMessage(elements.adjustmentRequestMessage, error.message, "error");
    }
  });
}

elements.adminClockInButton.addEventListener("click", () => punch("in", true));
elements.adminIntervalInButton.addEventListener("click", () => punch("interval_in", true));
elements.adminIntervalOutButton.addEventListener("click", () => punch("interval_out", true));
elements.adminClockOutButton.addEventListener("click", () => punch("out", true));
elements.adminRefreshButton.addEventListener("click", () => loadPunches());

// Abas do Admin
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const tabId = e.currentTarget.getAttribute("data-tab");
    switchTab(tabId);
  });
});

// Filtros do Espelho de Ponto
if (elements.filterSearch) {
  const renderAdminReports = () => {
    renderAdminJourneyView();
    renderAdminPunchesTable();
  };

  elements.filterSearch.addEventListener("input", renderAdminReports);
  elements.filterDate.addEventListener("change", renderAdminReports);
  elements.filterType.addEventListener("change", renderAdminReports);
  elements.filterStatus.addEventListener("change", renderAdminReports);

  if (elements.journeyDate) {
    elements.journeyDate.addEventListener("change", renderAdminReports);
  }

  if (elements.journeyUserSelect) {
    elements.journeyUserSelect.addEventListener("change", renderAdminJourneyHistoryView);
  }
}

// Modal de Registro Manual
if (elements.btnOpenManualPunch) {
  elements.btnOpenManualPunch.addEventListener("click", async () => {
    elements.manualPunchModal.classList.remove("hidden");
    const now = new Date();
    const dateInput = elements.manualPunchForm.querySelector('input[name="date"]');
    const timeInput = elements.manualPunchForm.querySelector('input[name="time"]');

    elements.manualPunchMessage.classList.add("hidden");
    elements.manualPunchForm.reset();

    dateInput.value = now.toISOString().slice(0, 10);
    timeInput.value = now.toTimeString().slice(0, 8);

    elements.manualPunchUserSelect.disabled = true;
    elements.manualPunchUserSelect.innerHTML = '<option value="">Carregando colaboradores...</option>';

    try {
      await loadAdminUsers({ throwOnError: true });
    } catch (error) {
      console.error(error);
      elements.manualPunchUserSelect.innerHTML = '<option value="">Nao foi possivel carregar colaboradores</option>';
      setMessage(elements.manualPunchMessage, "Nao foi possivel carregar a lista de colaboradores.", "error");
      elements.manualPunchMessage.classList.remove("hidden");
    }
  });
}

if (elements.btnCloseManualPunch) {
  elements.btnCloseManualPunch.addEventListener("click", () => {
    elements.manualPunchModal.classList.add("hidden");
  });
}

window.openEditPunchModal = (punchId) => {
  const punch = state.punches.find(p => p.id === punchId);
  if (!punch) return;

  elements.editPunchForm.querySelector('input[name="punchId"]').value = punchId;
  elements.editPunchUserDisplay.value = `${punch.userName} (${punch.userCode})`;
  
  const localDate = new Date(punch.createdAt);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  elements.editPunchForm.querySelector('input[name="date"]').value = `${year}-${month}-${day}`;
  
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');
  const seconds = String(localDate.getSeconds()).padStart(2, '0');
  elements.editPunchForm.querySelector('input[name="time"]').value = `${hours}:${minutes}:${seconds}`;
  
  elements.editPunchForm.querySelector('select[name="type"]').value = punch.type;
  elements.editPunchForm.querySelector('select[name="status"]').value = punch.status;
  elements.editPunchForm.querySelector('input[name="reason"]').value = punch.reason || "";
  
  if (punch.originalCreatedAt) {
    const origDate = new Date(punch.originalCreatedAt);
    const typeLabels = {
      "in": "Entrada Trab.",
      "interval_in": "Entrada Int.",
      "interval_out": "Saída Int.",
      "out": "Saída Trab."
    };
    elements.editPunchAuditTrail.innerHTML = `
      <strong>Histórico de Auditoria:</strong><br>
      Editado por: ${escapeHtml(punch.editedBy)} em ${new Date(punch.editedAt).toLocaleString("pt-BR")}<br>
      Valores Originais:<br>
      - Data/Hora: ${origDate.toLocaleString("pt-BR")}<br>
      - Tipo: ${typeLabels[punch.originalType] || "Ponto"}<br>
      - Status: ${punch.originalStatus === "approved" ? "Aprovado" : "Recusado"}<br>
      - Justificativa: ${escapeHtml(punch.originalReason || "Nenhuma")}
    `;
    elements.editPunchAuditTrail.classList.remove("hidden");
  } else {
    elements.editPunchAuditTrail.innerHTML = "";
    elements.editPunchAuditTrail.classList.add("hidden");
  }
  
  elements.editPunchMessage.classList.add("hidden");
  elements.editPunchModal.classList.remove("hidden");
};

if (elements.btnCloseEditPunch) {
  elements.btnCloseEditPunch.addEventListener("click", () => {
    elements.editPunchModal.classList.add("hidden");
  });
}

if (elements.editPunchForm) {
  elements.editPunchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage(elements.editPunchMessage, "Salvando alterações...");
    elements.editPunchMessage.classList.remove("hidden");
    
    const form = new FormData(elements.editPunchForm);
    const punchId = form.get("punchId");
    const date = form.get("date");
    const time = form.get("time");
    const type = form.get("type");
    const status = form.get("status");
    const reason = form.get("reason");
    
    const createdAt = new Date(`${date}T${time}`).toISOString();
    
    try {
      await api("/api/admin/punches", {
        method: "PUT",
        body: JSON.stringify({ action: "edit", punchId, createdAt, type, status, reason })
      });
      setMessage(elements.editPunchMessage, "Alterações salvas com sucesso!", "success");
      await loadPunches();
      setTimeout(() => {
        elements.editPunchModal.classList.add("hidden");
      }, 1500);
    } catch (error) {
      setMessage(elements.editPunchMessage, error.message, "error");
    }
  });
}

if (elements.btnCloseEditUser) {
  elements.btnCloseEditUser.addEventListener("click", () => {
    elements.editUserModal.classList.add("hidden");
  });
}

if (elements.editUserForm) {
  elements.editUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage(elements.editUserMessage, "Salvando alterações...");
    elements.editUserMessage.classList.remove("hidden");
    
    const form = new FormData(elements.editUserForm);
    const userId = form.get("userId");
    const name = form.get("name");
    const code = form.get("code");
    const role = form.get("role");
    const pin = form.get("pin");
    
    try {
      await api("/api/admin/users", {
        method: "PUT",
        body: JSON.stringify({ action: "edit", id: userId, name, code, role, pin })
      });
      setMessage(elements.editUserMessage, "Alterações salvas com sucesso!", "success");
      
      if (userId === state.user?.id) {
        const me = await api("/api/me");
        state.user = me.user;
        showApp();
      }
      
      await loadAdminUsers();
      setTimeout(() => {
        elements.editUserModal.classList.add("hidden");
      }, 1500);
    } catch (error) {
      setMessage(elements.editUserMessage, error.message, "error");
    }
  });
}

if (elements.editProfileButton) {
  elements.editProfileButton.addEventListener("click", () => {
    if (!state.user) return;
    elements.selfProfileForm.querySelector('input[name="name"]').value = state.user.name;
    elements.selfProfileForm.querySelector('input[name="pin"]').value = "";
    elements.selfProfileMessage.classList.add("hidden");
    elements.selfProfileModal.classList.remove("hidden");
  });
}

if (elements.btnCloseSelfProfile) {
  elements.btnCloseSelfProfile.addEventListener("click", () => {
    elements.selfProfileModal.classList.add("hidden");
  });
}

if (elements.selfProfileForm) {
  elements.selfProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage(elements.selfProfileMessage, "Salvando alterações...");
    elements.selfProfileMessage.classList.remove("hidden");
    
    const form = new FormData(elements.selfProfileForm);
    const name = form.get("name");
    const pin = form.get("pin");
    
    try {
      const payload = await api("/api/me", {
        method: "PUT",
        body: JSON.stringify({ name, pin })
      });
      state.user = payload.user;
      showApp();
      
      setMessage(elements.selfProfileMessage, "Perfil atualizado com sucesso!", "success");
      setTimeout(() => {
        elements.selfProfileModal.classList.add("hidden");
      }, 1500);
    } catch (error) {
      setMessage(elements.selfProfileMessage, error.message, "error");
    }
  });
}

if (elements.manualPunchForm) {
  elements.manualPunchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage(elements.manualPunchMessage, "Registrando...");
    elements.manualPunchMessage.classList.remove("hidden");
    
    const form = new FormData(elements.manualPunchForm);
    const userId = form.get("userId");
    const date = form.get("date");
    const time = form.get("time");
    const type = form.get("type");
    const reason = form.get("reason");
    
    const createdAt = new Date(`${date}T${time}`).toISOString();
    
    try {
      await api("/api/admin/punches", {
        method: "POST",
        body: JSON.stringify({ userId, type, createdAt, reason })
      });
      setMessage(elements.manualPunchMessage, "Ponto manual registrado com sucesso!", "success");
      await loadPunches();
      setTimeout(() => {
        elements.manualPunchModal.classList.add("hidden");
      }, 1500);
    } catch (error) {
      setMessage(elements.manualPunchMessage, error.message, "error");
    }
  });
}

if (elements.refreshDashboardBtn) {
  elements.refreshDashboardBtn.addEventListener("click", () => loadPunches());
}

if (elements.refreshPunchesBtn) {
  elements.refreshPunchesBtn.addEventListener("click", () => refreshPunchesManually());
}

if (elements.refreshRequestsButton) {
  elements.refreshRequestsButton.addEventListener("click", () => loadPunchRequests());
}

if (elements.newUserForm) {
  elements.newUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(elements.newUserForm);
    elements.newUserMessage.classList.remove("hidden");
    setMessage(elements.newUserMessage, "Cadastrando...");
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          code: form.get("code"),
          pin: form.get("pin"),
          role: form.get("role")
        })
      });
      setMessage(elements.newUserMessage, "Usuário cadastrado com sucesso!", "success");
      elements.newUserForm.reset();
      loadAdminUsers();
    } catch (error) {
      setMessage(elements.newUserMessage, error.message, "error");
    }
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
