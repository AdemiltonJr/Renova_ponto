const state = {
  user: null,
  config: null,
  punches: [],
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
  filterSearch: document.querySelector("#filterSearch"),
  filterDate: document.querySelector("#filterDate"),
  filterType: document.querySelector("#filterType"),
  filterStatus: document.querySelector("#filterStatus"),
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
  requestNotificationPermission();
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
    loadPunches().catch((error) => console.error(error));
    renderAdminPunchesTable();
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
    await loadPunches();
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
    renderAdminPunchesTable();
    renderAdminPersonalPunch();
  } else {
    renderPunches();
  }
}

function renderPunches() {
  if (!state.punches.length) {
    elements.punchList.innerHTML = '<p class="empty">Nenhum registro ainda.</p>';
    updateButtonStates();
    return;
  }

  elements.punchList.innerHTML = state.punches
    .slice(0, 20)
    .map((punch) => {
      const date = new Date(punch.createdAt);
      const typeLabels = {
        "in": "Entrada Trab.",
        "interval_in": "Entrada Int.",
        "interval_out": "Saída Int.",
        "out": "Saída Trab."
      };
      const type = typeLabels[punch.type] || "Ponto";
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
      const typeLabels = {
        "in": "Entrada Trab.",
        "interval_in": "Entrada Int.",
        "interval_out": "Saída Int.",
        "out": "Saída Trab."
      };
      const type = typeLabels[punch.type] || "Ponto";
      const status = punch.status === "approved" ? "Aprovado" : "Recusado";
      const detail = punch.status === "approved"
        ? `${Math.round(punch.distanceMeters || 0)}m da escola`
        : punch.reason || "Registro recusado";
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

async function loadAdminUsers() {
  if (state.user?.role !== "admin") return;
  try {
    const payload = await api("/api/admin/users");
    state.users = payload.users || [];
    renderAdminUsers(state.users);
    populateUserSelect();
  } catch (error) {
    console.error(error);
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
      if ("Notification" in window && Notification.permission === "granted") {
        if (intervalTimerId) clearTimeout(intervalTimerId);
        intervalTimerId = setTimeout(() => {
          new Notification("Escola Renova Ponto", {
            body: "Seu intervalo de 15 minutos acabou!",
            icon: "/logo.webp"
          });
        }, 15 * 60 * 1000);
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
  
  const typeLabels = {
    "in": "Entrada Trab.",
    "interval_in": "Entrada Int.",
    "interval_out": "Saída Int.",
    "out": "Saída Trab."
  };
  
  elements.adminPunchesTableBody.innerHTML = filtered.map(punch => {
    const date = new Date(punch.createdAt);
    const typeLabel = typeLabels[punch.type] || "Ponto";
    const statusLabel = punch.status === "approved" ? "Aprovado" : "Recusado";
    const statusClass = punch.status === "rejected" ? "rejected" : "";
    
    let details = "";
    if (punch.status === "approved") {
      details = punch.distanceMeters !== null ? `${punch.distanceMeters}m da escola` : "Registro Manual";
    } else {
      details = punch.reason || "Fora do raio/sem precisão";
    }
    
    let editedBadge = "";
    if (punch.originalCreatedAt) {
      const origDate = new Date(punch.originalCreatedAt);
      const origTypeLabel = typeLabels[punch.originalType] || "Ponto";
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
        const typeLabels = {
          "in": "Entrada Trab.",
          "interval_in": "Entrada Int.",
          "interval_out": "Saída Int.",
          "out": "Saída Trab."
        };
        const type = typeLabels[punch.type] || "Ponto";
        const status = punch.status === "approved" ? "Aprovado" : "Recusado";
        const detail = punch.status === "approved"
          ? `${Math.round(punch.distanceMeters || 0)}m da escola`
          : punch.reason || "Registro recusado";
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
  stopPunchesAutoRefresh();
  state.user = null;
  state.punches = [];
  showLogin();
});

elements.clockInButton.addEventListener("click", () => punch("in"));
elements.intervalInButton.addEventListener("click", () => punch("interval_in"));
elements.intervalOutButton.addEventListener("click", () => punch("interval_out"));
elements.clockOutButton.addEventListener("click", () => punch("out"));
elements.refreshButton.addEventListener("click", () => loadPunches());

// Event Listeners dos botões de ponto pessoal do Admin
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
  elements.filterSearch.addEventListener("input", () => renderAdminPunchesTable());
  elements.filterDate.addEventListener("change", () => renderAdminPunchesTable());
  elements.filterType.addEventListener("change", () => renderAdminPunchesTable());
  elements.filterStatus.addEventListener("change", () => renderAdminPunchesTable());
}

// Modal de Registro Manual
if (elements.btnOpenManualPunch) {
  elements.btnOpenManualPunch.addEventListener("click", () => {
    elements.manualPunchModal.classList.remove("hidden");
    const now = new Date();
    const dateInput = elements.manualPunchForm.querySelector('input[name="date"]');
    const timeInput = elements.manualPunchForm.querySelector('input[name="time"]');
    
    dateInput.value = now.toISOString().slice(0, 10);
    timeInput.value = now.toTimeString().slice(0, 8);
    
    elements.manualPunchMessage.classList.add("hidden");
    elements.manualPunchForm.reset();
    
    dateInput.value = now.toISOString().slice(0, 10);
    timeInput.value = now.toTimeString().slice(0, 8);
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
