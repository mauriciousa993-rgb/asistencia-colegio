﻿﻿﻿// ==================== CONFIGURACION ====================
const API_URL = "https://asistencia-colegio.onrender.com/api";


// ==================== ESTADO GLOBAL ====================
let authToken = localStorage.getItem("token");
let usuarioActual = JSON.parse(localStorage.getItem("usuario") || "null");
let estudiantes = [];
let estudianteSeleccionado = null;
let estudiantesSalon = [];
let salonActual = { grado: "", grupo: "" };
let estudiantesConvivencia = [];
let estudiantesPerfil = [];
let convivenciaEstudianteActualId = "";
let convivenciaReporteEditandoId = "";
let reportesConvivenciaActuales = [];
let usuariosSistema = [];
let usuarioEditandoId = "";
let registrosAsistenciaGestion = [];
let cumplimientoProfesoresActual = [];
let cumplimientoContextActual = null;
let registroAsistenciaEditando = { registroId: "", estudianteId: "" };
let toastTimeoutId = null;
let mesCalendarioSalon = "";
let calendarioSalonActual = null;
let aniosLectivosData = null;
let archivoEstudiantesActual = [];
let archivoAnioActual = "";

function normalizarTexto(value) {
  return String(value ?? "").replace(/\u00C2/g, "").trim();
}

function normalizarGrado(value) {
  const limpio = normalizarTexto(value);
  const soloDigitos = limpio.replace(/[^\d]/g, "");
  return soloDigitos || limpio;
}

function normalizarGrupo(value) {
  return normalizarTexto(value).toUpperCase();
}

function formatearGrado(value) {
  const grado = normalizarGrado(value);
  return grado ? `${grado}\u00B0` : "-";
}

function formatearTipoAsistencia(tipo) {
  const value = String(tipo || "").toLowerCase();
  if (value === "salida") return "Permiso";
  if (value === "presente") return "Presente";
  if (value === "falta") return "Falta";
  if (value === "retardo") return "Retardo";
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "-";
}

const MOTIVOS_SALIDA = [
  { valor: "deportivo", etiqueta: "Deportivo", clase: "bg-blue-100 text-blue-800" },
  { valor: "enfermedad", etiqueta: "Enfermedad", clase: "bg-red-100 text-red-800" },
  { valor: "cita_medica", etiqueta: "Cita médica", clase: "bg-teal-100 text-teal-800" },
  { valor: "familiar", etiqueta: "Familiar", clase: "bg-amber-100 text-amber-800" },
  { valor: "otro", etiqueta: "Otro", clase: "bg-slate-100 text-slate-700" }
];

function formatearMotivoSalida(motivo) {
  const encontrado = MOTIVOS_SALIDA.find((item) => item.valor === String(motivo || "").toLowerCase());
  return encontrado ? encontrado.etiqueta : "Sin especificar";
}

function obtenerClaseMotivoSalida(motivo) {
  const encontrado = MOTIVOS_SALIDA.find((item) => item.valor === String(motivo || "").toLowerCase());
  return encontrado ? encontrado.clase : "bg-slate-100 text-slate-500";
}

function construirOpcionesMotivoSalida(seleccionado = "") {
  const opciones = MOTIVOS_SALIDA
    .map((item) => `<option value="${item.valor}"${item.valor === seleccionado ? " selected" : ""}>${item.etiqueta}</option>`)
    .join("");
  return `<option value="">Motivo...</option>${opciones}`;
}

// Etiqueta corta para mostrar junto al tipo de registro.
function formatearTipoConMotivo(tipo, motivoSalida) {
  const etiquetaTipo = formatearTipoAsistencia(tipo);
  if (String(tipo || "").toLowerCase() !== "salida") return etiquetaTipo;
  return `${etiquetaTipo} · ${formatearMotivoSalida(motivoSalida)}`;
}

function normalizarGravedadConvivencia(gravedad) {
  const value = String(gravedad || "").toLowerCase();
  if (value === "tipo1" || value === "baja") return "tipo1";
  if (value === "tipo2" || value === "media") return "tipo2";
  if (value === "tipo3" || value === "alta") return "tipo3";
  return "tipo2";
}

function formatearGravedadConvivencia(gravedad) {
  const value = normalizarGravedadConvivencia(gravedad);
  if (value === "tipo1") return "Tipo 1";
  if (value === "tipo2") return "Tipo 2";
  if (value === "tipo3") return "Tipo 3";
  return "Tipo 2";
}

function obtenerClaseGravedadConvivencia(gravedad) {
  const value = normalizarGravedadConvivencia(gravedad);
  if (value === "tipo3") return "text-red-700";
  if (value === "tipo2") return "text-yellow-700";
  return "text-green-700";
}

function normalizarEstudianteBasico(estudiante) {
  return {
    ...estudiante,
    grado: normalizarGrado(estudiante.grado),
    grupo: normalizarGrupo(estudiante.grupo)
  };
}

function filtrarEstudiantesPorGradoGrupo(lista, grado, grupo) {
  const gradoNormalizado = normalizarGrado(grado);
  const grupoNormalizado = normalizarGrupo(grupo);
  return lista.filter((estudiante) => (
    normalizarGrado(estudiante.grado) === gradoNormalizado &&
    normalizarGrupo(estudiante.grupo) === grupoNormalizado
  ));
}

// ==================== INICIALIZACION ====================
document.addEventListener("DOMContentLoaded", () => {
  if (authToken && usuarioActual) {
    mostrarApp();
  } else {
    mostrarLogin();
  }
  
  inicializarEventos();
});

function inicializarEventos() {
  // Login
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("btn-logout").addEventListener("click", handleLogout);
  
  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => cambiarVista(btn.dataset.view));
  });
  
  // Asistencia
  setupAsistencia();

  // Salones
  setupSalones();
  
  // Estudiantes
  setupEstudiantes();
  
  // Perfil
  setupPerfil();

  // Convivencia
  setupConvivencia();
  
  // Reportes
  setupReportes();

  // Usuarios
  setupUsuarios();

  // Año lectivo
  setupAnioLectivo();
}

function leerJsonSeguro(response) {
  return response.json().catch(() => ({}));
}

function mostrarEstadoLogin(mensaje = "", tipo = "info") {
  const statusMsg = document.getElementById("login-status");
  if (!statusMsg) return;

  if (!mensaje) {
    statusMsg.textContent = "";
    statusMsg.className = "text-sm hidden";
    return;
  }

  const clasesPorTipo = {
    info: "text-sm text-blue-700",
    success: "text-sm text-green-600",
    error: "text-sm text-red-600"
  };

  statusMsg.textContent = mensaje;
  statusMsg.className = clasesPorTipo[tipo] || clasesPorTipo.info;
}

function mostrarToastGlobal(mensaje, tipo = "success") {
  const toast = document.getElementById("global-toast");
  if (!toast || !mensaje) return;

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  const clasesPorTipo = {
    success: "fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg bg-green-100 text-green-800 border border-green-200",
    error: "fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg bg-red-100 text-red-800 border border-red-200",
    info: "fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg bg-blue-100 text-blue-800 border border-blue-200"
  };

  toast.textContent = mensaje;
  toast.className = clasesPorTipo[tipo] || clasesPorTipo.info;

  toastTimeoutId = setTimeout(() => {
    toast.textContent = "";
    toast.className = "hidden fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg";
  }, 3500);
}

function normalizarErrorLogin(error) {
  const mensaje = String(error?.message || "").trim();

  if (error?.name === "AbortError") {
    return "El servidor tardó demasiado en responder. Intenta nuevamente.";
  }

  if (/Failed to fetch/i.test(mensaje) || /NetworkError/i.test(mensaje)) {
    return "No se pudo conectar con el servidor. Si el servicio se está iniciando, espera unos segundos y vuelve a intentar.";
  }

  return mensaje || "Error al iniciar sesion.";
}

// ==================== AUTENTICACION ====================
function mostrarLogin() {
  document.getElementById("login-page").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  mostrarEstadoLogin();
}

function mostrarApp() {
  document.getElementById("login-page").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  const alcance = usuarioActual?.rol !== "admin" && usuarioActual?.gradoAsignado && usuarioActual?.grupoAsignado
    ? ` - ${formatearGrado(usuarioActual.gradoAsignado)} ${normalizarGrupo(usuarioActual.grupoAsignado)}`
    : "";
  document.getElementById("user-name").textContent = `${usuarioActual.nombre} (${usuarioActual.rol})${alcance}`;

  const tabUsuarios = document.getElementById("tab-usuarios");
  if (tabUsuarios) {
    if (usuarioActual?.rol === "admin") {
      tabUsuarios.classList.remove("hidden");
    } else {
      tabUsuarios.classList.add("hidden");
    }
  }

  const tabAnioLectivo = document.getElementById("tab-anio-lectivo");
  if (tabAnioLectivo) {
    if (usuarioActual?.rol === "admin") {
      tabAnioLectivo.classList.remove("hidden");
    } else {
      tabAnioLectivo.classList.add("hidden");
    }
  }

  const btnImportarCsv = document.getElementById("btn-importar-csv");
  if (btnImportarCsv) {
    if (usuarioActual?.rol === "admin") {
      btnImportarCsv.classList.remove("hidden");
    } else {
      btnImportarCsv.classList.add("hidden");
    }
  }
  const mensajeLoginExitoso = sessionStorage.getItem("mensaje-login-exitoso");
  if (mensajeLoginExitoso) {
    sessionStorage.removeItem("mensaje-login-exitoso");
    mostrarToastGlobal(mensajeLoginExitoso, "success");
  }

  requestAnimationFrame(() => {
    cargarEstudiantes();
    cargarEstadisticas();
    cambiarVista("salones");
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const errorMsg = document.getElementById("login-error");
  const submitButton = e.submitter || document.querySelector('#login-form button[type="submit"]');
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  let demoraTimeoutId = null;

  if (submitButton && !submitButton.dataset.originalText) {
    submitButton.dataset.originalText = submitButton.textContent.trim();
  }

  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
  mostrarEstadoLogin("Validando credenciales...", "info");

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Iniciando...";
    submitButton.classList.add("opacity-70", "cursor-not-allowed");
  }

  usernameInput.disabled = true;
  passwordInput.disabled = true;

  demoraTimeoutId = setTimeout(() => {
    mostrarEstadoLogin("Conectando con el servidor... esto puede tardar unos segundos.", "info");
  }, 1500);
  
  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    const data = await leerJsonSeguro(response);
    
    if (!response.ok) {
      throw new Error(data.error || "Error al iniciar sesion");
    }
    
    authToken = data.token;
    usuarioActual = data.usuario;
    
    localStorage.setItem("token", authToken);
    localStorage.setItem("usuario", JSON.stringify(usuarioActual));
    
    sessionStorage.setItem("mensaje-login-exitoso", `Inicio de sesion exitoso. Bienvenido, ${usuarioActual.nombre}.`);
    errorMsg.classList.add("hidden");
    mostrarEstadoLogin("Inicio de sesion exitoso.", "success");
    mostrarApp();
  } catch (error) {
    errorMsg.textContent = normalizarErrorLogin(error);
    errorMsg.classList.remove("hidden");
    mostrarEstadoLogin();
  } finally {
    if (demoraTimeoutId) {
      clearTimeout(demoraTimeoutId);
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || "Iniciar Sesion";
      submitButton.classList.remove("opacity-70", "cursor-not-allowed");
    }

    usernameInput.disabled = false;
    passwordInput.disabled = false;
  }
}

function handleLogout() {
  authToken = null;
  usuarioActual = null;
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  mostrarLogin();
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${authToken}`
  };
}

// ==================== MANEJO DE ERRORES DE AUTENTICACION ====================
function manejarErrorAutenticacion(response) {
  if (response.status === 401 || response.status === 403) {
    console.warn("Token inválido o expirado. Redirigiendo al login...");
    authToken = null;
    usuarioActual = null;
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    mostrarLogin();
    alert("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
    return true;
  }
  return false;
}


// ==================== NAVEGACION ====================
function cambiarVista(vista) {
  // Actualizar tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.dataset.view === vista) {
      btn.classList.add("border-blue-600", "text-blue-600");
      btn.classList.remove("border-transparent", "text-slate-600");
    } else {
      btn.classList.remove("border-blue-600", "text-blue-600");
      btn.classList.add("border-transparent", "text-slate-600");
    }
  });
  
  // Mostrar vista
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`view-${vista}`).classList.remove("hidden");
  
  // Cargar datos segun vista
  if (vista === "estudiantes") {
    cargarListaEstudiantes();
  } else if (vista === "salones") {
    actualizarSelectoresSalon();
  } else if (vista === "perfil") {
    actualizarSelectoresPerfil();
  } else if (vista === "convivencia") {
    actualizarSelectoresConvivencia();
  } else if (vista === "reportes") {
    cargarEstadisticas();
    cargarReporteGrupo();
    cargarReportesConvivenciaGestion();
    cargarCumplimientoProfesores();
  } else if (vista === "usuarios") {
    cargarUsuarios();
  } else if (vista === "anio-lectivo") {
    cargarAniosLectivos();
  }
}

// ==================== ASISTENCIA ====================
function setupAsistencia() {
  const buscador = document.getElementById("buscador");
  const sugerencias = document.getElementById("sugerencias");
  const seleccion = document.getElementById("seleccion");
  const form = document.getElementById("form-asistencia");
  const fechaInput = document.getElementById("fecha-asistencia");
  const fotoInput = document.getElementById("foto");
  const preview = document.getElementById("preview");
  const previewImg = document.getElementById("preview-img");

  if (fechaInput && !fechaInput.value) {
    fechaInput.value = obtenerFechaHoy();
  }

  const tipoSelect = document.getElementById("tipo");
  tipoSelect.addEventListener("change", actualizarVisibilidadMotivoSalida);
  actualizarVisibilidadMotivoSalida();

  buscador.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    estudianteSeleccionado = null;
    seleccion.textContent = "";
    
    if (!query) {
      renderSugerencias([]);
      return;
    }
    
    const filtrados = estudiantes.filter(est =>
      est.nombre.toLowerCase().includes(query)
    );
    renderSugerencias(filtrados.slice(0, 6));
  });
  
  function renderSugerencias(lista) {
    sugerencias.innerHTML = "";
    if (lista.length === 0) {
      sugerencias.classList.add("hidden");
      return;
    }
    
    lista.forEach(est => {
      const item = document.createElement("li");
      item.className = "px-4 py-2 hover:bg-blue-50 cursor-pointer";
      item.textContent = `${est.nombre} - ${formatearGrado(est.grado)} ${normalizarGrupo(est.grupo)}`;
      item.addEventListener("click", () => {
        estudianteSeleccionado = est;
        buscador.value = est.nombre;
        sugerencias.classList.add("hidden");
        seleccion.textContent = `Seleccionado: ${est.nombre} (${formatearGrado(est.grado)} ${normalizarGrupo(est.grupo)})`;
      });
      sugerencias.appendChild(item);
    });
    
    sugerencias.classList.remove("hidden");
  }
  
  fotoInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      preview.classList.add("hidden");
      previewImg.src = "";
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      previewImg.src = reader.result;
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
  
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    
    if (!estudianteSeleccionado) {
      mostrarEstado("Selecciona un estudiante antes de guardar.", "red");
      return;
    }
    
    const tipo = document.getElementById("tipo").value;
    const fecha = document.getElementById("fecha-asistencia").value;
    const observacion = document.getElementById("observacion").value.trim();
    const motivoSalida = document.getElementById("motivo-salida").value;
    const fotoUrl = previewImg.src || "";

    if (tipo === "salida" && !observacion) {
      mostrarEstado("La observación es obligatoria para registrar un permiso.", "red");
      return;
    }

    if (tipo === "salida" && !motivoSalida) {
      mostrarEstado("Selecciona el motivo del permiso (deportivo, enfermedad, cita médica, familiar u otro).", "red");
      return;
    }

    try {
      await registrarAsistencia({
        estudianteId: estudianteSeleccionado._id,
        fecha: construirFechaAsistenciaISO(fecha),
        tipo,
        motivoSalida,
        observacion,
        fotoUrl
      });

      mostrarEstado("Registro de asistencia guardado correctamente.", "green");
      form.reset();
      actualizarVisibilidadMotivoSalida();
      preview.classList.add("hidden");
      previewImg.src = "";
    } catch (error) {
      mostrarEstado(error.message, "red");
    }
  });
}

// El motivo solo se pide cuando el registro es un permiso de salida.
function actualizarVisibilidadMotivoSalida() {
  const tipo = document.getElementById("tipo")?.value;
  const bloque = document.getElementById("bloque-motivo-salida");
  const select = document.getElementById("motivo-salida");
  if (!bloque || !select) return;

  if (tipo === "salida") {
    bloque.classList.remove("hidden");
  } else {
    bloque.classList.add("hidden");
    select.value = "";
  }
}

async function registrarAsistencia(payload) {
  const response = await fetch(`${API_URL}/asistencia`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Error al registrar asistencia");
  }

  return data;
}

function mostrarEstado(mensaje, color) {
  const estado = document.getElementById("estado");
  estado.textContent = mensaje;
  estado.className = `text-sm text-${color}-600`;
  setTimeout(() => {
    estado.textContent = "";
  }, 3000);
}

async function cargarEstudiantes() {
  try {
    const response = await fetch(`${API_URL}/estudiantes`, {
      headers: getHeaders()
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "No se pudieron cargar los estudiantes");
    }
    estudiantes = (await response.json()).map((estudiante) => normalizarEstudianteBasico(estudiante));
    actualizarSelectoresSalon();
    actualizarSelectoresPerfil();
    actualizarSelectoresConvivencia();
  } catch (error) {
    console.error("Error al cargar estudiantes:", error);
  }
}

// ==================== SALONES ====================
function setupSalones() {
  const btnCargarSalon = document.getElementById("btn-cargar-salon");
  const btnRegistrarSeleccionados = document.getElementById("btn-registrar-seleccionados");
  const btnRegistrarTodos = document.getElementById("btn-registrar-todos");
  const seleccionarTodos = document.getElementById("seleccionar-todos");
  const tipoGeneral = document.getElementById("salon-tipo");
  const inputFecha = document.getElementById("salon-fecha");

  if (inputFecha && !inputFecha.value) {
    inputFecha.value = obtenerFechaHoy();
  }

  btnCargarSalon.addEventListener("click", cargarEstudiantesSalon);
  btnRegistrarSeleccionados.addEventListener("click", () => registrarAsistenciaSalon(false));
  btnRegistrarTodos.addEventListener("click", () => registrarAsistenciaSalon(true));

  seleccionarTodos.addEventListener("change", (event) => {
    document.querySelectorAll("#tabla-salon .salon-check").forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });

  tipoGeneral.addEventListener("change", (event) => {
    document.querySelectorAll("#tabla-salon .salon-tipo").forEach((select) => {
      select.value = event.target.value;
      const fila = select.closest("tr");
      if (fila) actualizarMotivoFilaSalon(fila);
    });
  });

  document.getElementById("btn-cal-mes-anterior").addEventListener("click", () => cambiarMesCalendarioSalon(-1));
  document.getElementById("btn-cal-mes-siguiente").addEventListener("click", () => cambiarMesCalendarioSalon(1));
  document.getElementById("btn-cerrar-cal-detalle").addEventListener("click", cerrarDetalleDiaCalendario);
}

function actualizarSelectoresSalon() {
  if (!estudiantes.length) return;

  const selectGrado = document.getElementById("salon-grado");
  const selectGrupo = document.getElementById("salon-grupo");
  if (!selectGrado || !selectGrupo) return;

  const grados = [...new Set(estudiantes.map((est) => normalizarGrado(est.grado)).filter(Boolean))].sort((a, b) => {
    const numeroA = Number(a);
    const numeroB = Number(b);
    if (!Number.isNaN(numeroA) && !Number.isNaN(numeroB)) return numeroA - numeroB;
    return a.localeCompare(b, "es");
  });
  const grupos = [...new Set(estudiantes.map((est) => normalizarGrupo(est.grupo)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  const gradoActual = salonActual.grado || selectGrado.value;
  const grupoActual = salonActual.grupo || selectGrupo.value;

  selectGrado.innerHTML = '<option value="">Seleccionar grado</option>';
  grados.forEach((grado) => {
    const option = document.createElement("option");
    option.value = grado;
    option.textContent = formatearGrado(grado);
    selectGrado.appendChild(option);
  });

  selectGrupo.innerHTML = '<option value="">Seleccionar grupo</option>';
  grupos.forEach((grupo) => {
    const option = document.createElement("option");
    option.value = grupo;
    option.textContent = grupo;
    selectGrupo.appendChild(option);
  });

  if (gradoActual && grados.includes(gradoActual)) {
    selectGrado.value = gradoActual;
  }
  if (grupoActual && grupos.includes(grupoActual)) {
    selectGrupo.value = grupoActual;
  }
}

async function cargarEstudiantesSalon() {
  const grado = document.getElementById("salon-grado").value;
  const grupo = document.getElementById("salon-grupo").value;
  const salonContent = document.getElementById("salon-content");
  const salonVacio = document.getElementById("salon-vacio");
  const seleccionarTodos = document.getElementById("seleccionar-todos");

  if (!grado || !grupo) {
    mostrarEstadoSalon("Selecciona grado y grupo para cargar la lista.", "red");
    return;
  }

  try {
    estudiantesSalon = filtrarEstudiantesPorGradoGrupo(estudiantes, grado, grupo);
    salonActual = { grado, grupo };

    document.getElementById("salon-titulo").textContent = `Grado ${formatearGrado(grado)} - Grupo ${normalizarGrupo(grupo)}`;
    document.getElementById("salon-info").textContent = `${estudiantesSalon.length} estudiante(s)`;

    renderTablaSalon(estudiantesSalon);
    seleccionarTodos.checked = false;
    salonVacio.classList.add("hidden");
    salonContent.classList.remove("hidden");
    mesCalendarioSalon = obtenerMesActual();
    cargarCalendarioSalon();

    if (estudiantesSalon.length === 0) {
      mostrarEstadoSalon("Este grado/grupo no tiene estudiantes registrados.", "yellow");
    } else {
      mostrarEstadoSalon("Lista cargada correctamente.", "green");
    }
  } catch (error) {
    console.error("Error al cargar salon:", error);
    mostrarEstadoSalon(error.message, "red");
  }
}

function renderTablaSalon(lista) {
  const tbody = document.getElementById("tabla-salon");
  const tipoPorDefecto = document.getElementById("salon-tipo").value || "falta";
  tbody.innerHTML = "";

  if (!lista.length) {
    tbody.innerHTML = "<tr><td colspan='6' class='px-4 py-4 text-center text-slate-500'>No hay estudiantes en este salon.</td></tr>";
    return;
  }

  lista.forEach((est) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-slate-50";
    tr.dataset.estudianteId = est._id;
    tr.innerHTML = `
      <td class="px-4 py-2">
        <input type="checkbox" class="salon-check w-4 h-4">
      </td>
      <td class="px-4 py-2">${est.nombre}</td>
      <td class="px-4 py-2">${est.identificacion}</td>
      <td class="px-4 py-2 text-center">
        <select class="salon-tipo border border-slate-300 rounded-lg px-2 py-1">
          <option value="presente">Presente</option>
          <option value="falta">Falta</option>
          <option value="retardo">Retardo</option>
          <option value="salida">Permiso</option>
        </select>
      </td>
      <td class="px-4 py-2 text-center">
        <select class="salon-motivo border border-slate-300 rounded-lg px-2 py-1 hidden">
          ${construirOpcionesMotivoSalida()}
        </select>
        <span class="salon-motivo-vacio text-xs text-slate-400">-</span>
      </td>
      <td class="px-4 py-2">
        <input type="text" class="salon-observacion w-full border border-slate-300 rounded-lg px-3 py-1" placeholder="Observacion (opcional)">
      </td>
    `;
    tbody.appendChild(tr);

    const checkbox = tr.querySelector(".salon-check");
    const tipo = tr.querySelector(".salon-tipo");
    tipo.value = tipoPorDefecto;
    tipo.addEventListener("change", () => actualizarMotivoFilaSalon(tr));
    actualizarMotivoFilaSalon(tr);
    checkbox.addEventListener("change", sincronizarCheckboxGeneralSalon);
  });
}

function actualizarMotivoFilaSalon(fila) {
  const tipo = fila.querySelector(".salon-tipo")?.value;
  const motivo = fila.querySelector(".salon-motivo");
  const vacio = fila.querySelector(".salon-motivo-vacio");
  if (!motivo || !vacio) return;

  if (tipo === "salida") {
    motivo.classList.remove("hidden");
    vacio.classList.add("hidden");
  } else {
    motivo.classList.add("hidden");
    motivo.value = "";
    vacio.classList.remove("hidden");
  }
}

function sincronizarCheckboxGeneralSalon() {
  const checkboxes = Array.from(document.querySelectorAll("#tabla-salon .salon-check"));
  const seleccionarTodos = document.getElementById("seleccionar-todos");
  if (!checkboxes.length) {
    seleccionarTodos.checked = false;
    return;
  }
  seleccionarTodos.checked = checkboxes.every((checkbox) => checkbox.checked);
}

async function registrarAsistenciaSalon(registrarTodos) {
  if (!estudiantesSalon.length) {
    mostrarEstadoSalon("Primero carga un grado/grupo con estudiantes.", "red");
    return;
  }

  const filas = Array.from(document.querySelectorAll("#tabla-salon tr[data-estudiante-id]"));
  const filasObjetivo = registrarTodos
    ? filas
    : filas.filter((fila) => fila.querySelector(".salon-check")?.checked);

  if (!filasObjetivo.length) {
    mostrarEstadoSalon("Selecciona al menos un estudiante.", "red");
    return;
  }

  const fechaSeleccionada = document.getElementById("salon-fecha").value;
  const fecha = construirFechaAsistenciaISO(fechaSeleccionada);

  const nombreDeFila = (fila) => fila.querySelector("td:nth-child(2)")?.textContent?.trim() || "sin nombre";

  const filaSinObservacionSalida = filasObjetivo.find((fila) => {
    const tipo = fila.querySelector(".salon-tipo").value;
    const observacion = fila.querySelector(".salon-observacion").value.trim();
    return tipo === "salida" && !observacion;
  });

  if (filaSinObservacionSalida) {
    mostrarEstadoSalon(`Agrega una observación para el permiso de ${nombreDeFila(filaSinObservacionSalida)}.`, "red");
    return;
  }

  const filaSinMotivoSalida = filasObjetivo.find((fila) => {
    const tipo = fila.querySelector(".salon-tipo").value;
    const motivo = fila.querySelector(".salon-motivo")?.value || "";
    return tipo === "salida" && !motivo;
  });

  if (filaSinMotivoSalida) {
    mostrarEstadoSalon(`Selecciona el motivo del permiso de ${nombreDeFila(filaSinMotivoSalida)}.`, "red");
    return;
  }

  const peticiones = filasObjetivo.map((fila) => {
    const tipo = fila.querySelector(".salon-tipo").value;
    const observacion = fila.querySelector(".salon-observacion").value.trim();
    const motivoSalida = fila.querySelector(".salon-motivo")?.value || "";

    return registrarAsistencia({
      estudianteId: fila.dataset.estudianteId,
      fecha,
      tipo,
      motivoSalida,
      observacion,
      fotoUrl: ""
    });
  });

  const resultados = await Promise.allSettled(peticiones);
  const exitosos = resultados.filter((resultado) => resultado.status === "fulfilled").length;
  const fallidos = resultados.length - exitosos;

  resultados.forEach((resultado, index) => {
    if (resultado.status !== "fulfilled") return;
    const fila = filasObjetivo[index];
    fila.querySelector(".salon-check").checked = false;
    fila.querySelector(".salon-observacion").value = "";
  });

  sincronizarCheckboxGeneralSalon();

  // El calendario debe reflejar de una vez que el dia ya quedo registrado.
  if (exitosos) {
    cargarCalendarioSalon();
  }

  if (exitosos && !fallidos) {
    mostrarEstadoSalon(`Registro(s) de asistencia guardado(s): ${exitosos}.`, "green");
    return;
  }

  if (exitosos && fallidos) {
    const primerError = resultados.find((resultado) => resultado.status === "rejected");
    const detalle = primerError?.reason?.message ? ` Primer error: ${primerError.reason.message}` : "";
    mostrarEstadoSalon(`Registro(s) guardados: ${exitosos}. Fallidos: ${fallidos}.${detalle}`, "yellow");
    return;
  }

  const primerError = resultados.find((resultado) => resultado.status === "rejected");
  const detalle = primerError?.reason?.message || "No se pudo registrar asistencia.";
  mostrarEstadoSalon(detalle, "red");
}

// ==================== CALENDARIO DEL SALON ====================
function cambiarMesCalendarioSalon(delta) {
  const [anio, mes] = (mesCalendarioSalon || obtenerMesActual()).split("-").map(Number);
  const nuevaFecha = new Date(anio, (mes - 1) + delta, 1);
  mesCalendarioSalon = `${nuevaFecha.getFullYear()}-${String(nuevaFecha.getMonth() + 1).padStart(2, "0")}`;
  cerrarDetalleDiaCalendario();
  cargarCalendarioSalon();
}

async function cargarCalendarioSalon() {
  const card = document.getElementById("salon-calendario-card");
  if (!card) return;

  if (!salonActual.grado || !salonActual.grupo) {
    card.classList.add("hidden");
    return;
  }

  const params = new URLSearchParams({
    grado: salonActual.grado,
    grupo: salonActual.grupo,
    mes: mesCalendarioSalon || obtenerMesActual()
  });

  try {
    const response = await fetch(`${API_URL}/asistencia/calendario-salon?${params.toString()}`, {
      headers: getHeaders()
    });
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el calendario del salón.");
    }

    calendarioSalonActual = data;
    renderCalendarioSalon(data);
    card.classList.remove("hidden");
  } catch (error) {
    card.classList.add("hidden");
    console.error("Error al cargar calendario del salón:", error);
  }
}

function renderCalendarioSalon(data) {
  const contenedor = document.getElementById("salon-cal-dias");
  const tituloMes = document.getElementById("salon-cal-mes");
  const subtitulo = document.getElementById("salon-cal-subtitulo");
  if (!contenedor) return;

  const [anioTexto, mesTexto] = String(data.mes || obtenerMesActual()).split("-");
  const mesIndice = Number(mesTexto) - 1;
  if (tituloMes) tituloMes.textContent = `${MESES_NOMBRES_CALENDARIO[mesIndice] || ""} ${anioTexto}`;
  if (subtitulo) {
    subtitulo.textContent = `${formatearGrado(data.grado)} ${data.grupo} · hasta las ${data.horaCorte}`;
  }

  contenedor.innerHTML = "";

  // Los dias arrancan en lunes, igual que el calendario de papel.
  const primerDia = new Date(Number(anioTexto), mesIndice, 1).getDay();
  const relleno = (primerDia + 6) % 7;
  for (let i = 0; i < relleno; i++) {
    const vacio = document.createElement("div");
    vacio.className = "aspect-square border-r border-b border-slate-200 bg-slate-50";
    contenedor.appendChild(vacio);
  }

  (data.dias || []).forEach((dia) => {
    const celda = document.createElement("button");
    celda.type = "button";
    celda.className = `aspect-square border-r border-b border-slate-200 flex flex-col items-center justify-center gap-0.5 ${obtenerEstiloDiaCalendario(dia)}`;
    if (dia.esHoy) {
      celda.classList.add("ring-2", "ring-inset", "ring-blue-700");
    }
    celda.innerHTML = `
      <span class="text-[13px] ${dia.esHoy ? "font-bold" : "font-medium"}">${dia.dia}</span>
      ${obtenerIconoDiaCalendario(dia)}
    `;
    celda.addEventListener("click", () => abrirDetalleDiaCalendario(dia));
    contenedor.appendChild(celda);
  });

  renderResumenCalendarioSalon(data);
}

function obtenerEstiloDiaCalendario(dia) {
  if (dia.estado === "festivo") return "bg-amber-300 text-amber-900";
  if (dia.estado === "fin_de_semana") return "bg-slate-200 text-slate-500";
  if (dia.estado === "registrado") return "bg-green-500 text-white";
  if (dia.estado === "faltante") return "bg-red-500 text-white";
  if (dia.estado === "pendiente_hoy") return "bg-blue-400 text-white";
  return "bg-white text-slate-400";
}

function obtenerIconoDiaCalendario(dia) {
  if (dia.estado === "registrado") return '<i class="fas fa-check text-[10px]"></i>';
  if (dia.estado === "faltante") return '<i class="fas fa-xmark text-[10px]"></i>';
  if (dia.estado === "pendiente_hoy") return '<i class="fas fa-clock text-[10px]"></i>';
  return "";
}

function renderResumenCalendarioSalon(data) {
  const contenedor = document.getElementById("salon-cal-resumen");
  if (!contenedor) return;

  const faltantes = (data.diasFaltantes || []).length;
  const hoy = data.hoy;

  let tarjetaHoy = `
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs uppercase font-semibold text-slate-500">Hoy</p>
      <p class="text-lg font-bold text-slate-700">Sin novedad</p>
      <p class="text-sm text-slate-600">Este mes no incluye el día de hoy.</p>
    </div>`;

  if (hoy) {
    const estilos = {
      registrado: ["border-green-300 bg-green-50", "text-green-800", "Asistencia enviada", `${hoy.estudiantesRegistrados} estudiante(s) registrados hoy.`],
      pendiente_hoy: ["border-blue-300 bg-blue-50", "text-blue-800", "Pendiente", `Tienes plazo hasta las ${data.horaCorte} para subir la asistencia.`],
      faltante: ["border-red-300 bg-red-50", "text-red-800", "Vencido", `Se pasó de las ${data.horaCorte} y hoy no se ha registrado asistencia.`],
      festivo: ["border-amber-300 bg-amber-50", "text-amber-800", "Festivo", "Hoy es festivo, no hay que registrar."],
      fin_de_semana: ["border-slate-200 bg-slate-50", "text-slate-700", "Fin de semana", "Hoy no hay clases."]
    };
    const [borde, texto, titulo, detalle] = estilos[hoy.estado] || estilos.fin_de_semana;
    tarjetaHoy = `
      <div class="rounded-lg border ${borde} p-4">
        <p class="text-xs uppercase font-semibold ${texto}">Hoy</p>
        <p class="text-lg font-bold ${texto}">${titulo}</p>
        <p class="text-sm text-slate-600">${detalle}</p>
      </div>`;
  }

  contenedor.innerHTML = `
    ${tarjetaHoy}
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <p class="text-xs uppercase font-semibold text-slate-500">Cumplimiento del mes</p>
      <p class="text-3xl font-bold ${data.cumplimientoPorcentaje >= 100 ? "text-green-600" : "text-slate-800"}">${data.cumplimientoPorcentaje}%</p>
      <p class="text-sm text-slate-600">${data.diasRegistrados} de ${data.diasHabiles} día(s) de clase registrados.</p>
      ${faltantes ? `<p class="text-sm text-red-700 mt-1">Faltan ${faltantes} día(s) por subir.</p>` : '<p class="text-sm text-green-700 mt-1">No hay días pendientes.</p>'}
    </div>
  `;
}

function abrirDetalleDiaCalendario(dia) {
  const panel = document.getElementById("salon-cal-detalle");
  const fecha = document.getElementById("salon-cal-detalle-fecha");
  const tag = document.getElementById("salon-cal-detalle-tag");
  const texto = document.getElementById("salon-cal-detalle-texto");
  if (!panel) return;

  const horaCorte = calendarioSalonActual?.horaCorte || "16:00";
  const detalles = {
    registrado: ["bg-green-100 text-green-800", "Registrada", `Se registró la asistencia de ${dia.estudiantesRegistrados} estudiante(s), ${dia.registros} registro(s) en total.`],
    faltante: ["bg-red-100 text-red-800", "Sin registrar", `Este día de clase no tiene asistencia registrada. El plazo era hasta las ${horaCorte}.`],
    pendiente_hoy: ["bg-blue-100 text-blue-800", "Pendiente", `Todavía no se registra la asistencia de hoy. Hay plazo hasta las ${horaCorte}.`],
    festivo: ["bg-amber-100 text-amber-800", "Festivo", "Día festivo: no se exige registro."],
    fin_de_semana: ["bg-slate-200 text-slate-700", "Fin de semana", "No hay clases este día."],
    futuro: ["bg-slate-100 text-slate-600", "Aún no llega", "Este día todavía no ha llegado."]
  };
  const [claseTag, etiqueta, descripcion] = detalles[dia.estado] || detalles.futuro;

  if (fecha) {
    fecha.textContent = new Date(`${dia.fecha}T00:00:00`).toLocaleDateString("es-CO", {
      day: "numeric", month: "long", year: "numeric"
    });
  }
  if (tag) {
    tag.textContent = etiqueta;
    tag.className = `inline-block text-xs font-semibold px-2 py-1 rounded mb-2 ${claseTag}`;
  }
  if (texto) texto.textContent = descripcion;

  panel.classList.remove("hidden");
}

function cerrarDetalleDiaCalendario() {
  document.getElementById("salon-cal-detalle")?.classList.add("hidden");
}

function mostrarEstadoSalon(mensaje, color) {
  const estado = document.getElementById("salon-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `mt-3 text-sm text-${color}-600`;
}

function obtenerFechaHoy() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function obtenerMesActual() {
  const hoy = obtenerFechaHoy();
  return hoy.slice(0, 7);
}

function obtenerRangoMes(mesTexto) {
  const valor = String(mesTexto || "").trim();
  if (!/^\d{4}-\d{2}$/.test(valor)) {
    return null;
  }
  const [anioTexto, mesTextoSeguro] = valor.split("-");
  const anio = Number(anioTexto);
  const mes = Number(mesTextoSeguro);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return null;
  }
  const inicio = `${valor}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fin = `${valor}-${String(ultimoDia).padStart(2, "0")}`;
  return { inicio, fin };
}

// Se ancla al mediodia UTC para que el dia registrado sea el mismo sin importar
// la zona horaria configurada en el equipo del profesor.
function construirFechaAsistenciaISO(fecha) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) ? fecha : obtenerFechaHoy();
  return `${dia}T12:00:00.000Z`;
}

// ==================== ESTUDIANTES ====================
function setupEstudiantes() {
  document.getElementById("btn-nuevo-estudiante").addEventListener("click", () => {
    document.getElementById("modal-titulo").textContent = "Nuevo Estudiante";
    document.getElementById("form-estudiante").reset();
    document.getElementById("estudiante-id").value = "";
    document.getElementById("modal-estudiante").classList.remove("hidden");
  });
  
  document.getElementById("btn-cerrar-modal").addEventListener("click", cerrarModal);
  document.getElementById("btn-cancelar-modal").addEventListener("click", cerrarModal);
  
  document.getElementById("form-estudiante").addEventListener("submit", handleGuardarEstudiante);

  // Importacion CSV
  document.getElementById("btn-importar-csv").addEventListener("click", abrirModalImportarCsv);
  document.getElementById("btn-cerrar-importar-csv").addEventListener("click", cerrarModalImportarCsv);
  document.getElementById("btn-cancelar-importar-csv").addEventListener("click", cerrarModalImportarCsv);
  document.getElementById("form-importar-csv").addEventListener("submit", handleImportarCsv);
  
  // Filtros
  document.getElementById("filtro-grado").addEventListener("change", cargarListaEstudiantes);
  document.getElementById("filtro-grupo").addEventListener("change", cargarListaEstudiantes);
  document.getElementById("busqueda-estudiante").addEventListener("input", cargarListaEstudiantes);
}

function abrirModalImportarCsv() {
  if (usuarioActual?.rol !== "admin") {
    alert("Solo administradores pueden importar estudiantes.");
    return;
  }
  limpiarResultadoImportacionCsv();
  document.getElementById("form-importar-csv").reset();
  document.getElementById("importar-dry-run").checked = false;
  document.getElementById("modal-importar-csv").classList.remove("hidden");
}

function cerrarModalImportarCsv() {
  document.getElementById("modal-importar-csv").classList.add("hidden");
}

function limpiarResultadoImportacionCsv() {
  const contenedor = document.getElementById("importar-resultado");
  contenedor.classList.add("hidden");
  contenedor.className = "hidden rounded-lg border p-3 text-sm";
  contenedor.innerHTML = "";
}

function obtenerExtensionArchivo(filename) {
  const partes = String(filename || "").toLowerCase().split(".");
  return partes.length > 1 ? partes.pop() : "";
}

async function convertirArchivoImportacionACsv(file) {
  const extension = obtenerExtensionArchivo(file.name);

  if (extension === "csv") {
    return file.text();
  }

  if (extension === "xlsx" || extension === "xls") {
    if (!window.XLSX) {
      throw new Error("No se pudo cargar el lector de Excel. Intenta nuevamente o usa CSV.");
    }

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const primeraHoja = workbook.SheetNames?.[0];

    if (!primeraHoja) {
      throw new Error("El archivo Excel no contiene hojas para importar.");
    }

    const worksheet = workbook.Sheets[primeraHoja];
    return window.XLSX.utils.sheet_to_csv(worksheet, {
      FS: ",",
      RS: "\n",
      blankrows: false
    });
  }

  throw new Error("Formato no soportado. Sube un archivo .csv, .xlsx o .xls.");
}

async function handleImportarCsv(event) {
  event.preventDefault();

  const inputArchivo = document.getElementById("archivo-importar-csv");
  const dryRun = document.getElementById("importar-dry-run").checked;
  const botonProcesar = document.getElementById("btn-procesar-importar-csv");
  const contenedor = document.getElementById("importar-resultado");

  if (!inputArchivo.files || !inputArchivo.files.length) {
    contenedor.className = "rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm";
    contenedor.textContent = "Debes seleccionar un archivo CSV o Excel.";
    contenedor.classList.remove("hidden");
    return;
  }

  try {
    botonProcesar.disabled = true;
    botonProcesar.textContent = "Procesando...";

    const file = inputArchivo.files[0];
    const csvContent = await convertirArchivoImportacionACsv(file);

    const response = await fetch(`${API_URL}/estudiantes/importar-csv`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ csvContent, dryRun })
    });

    if (manejarErrorAutenticacion(response)) {
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Error al importar CSV");
    }


    const errores = data.detalleErrores || [];
    const erroresHtml = errores.length
      ? `<ul class="list-disc pl-5 mt-2">${errores.map((e) => `<li>${e}</li>`).join("")}</ul>`
      : "";

    contenedor.className = "rounded-lg border border-green-200 bg-green-50 text-green-700 p-3 text-sm";
    contenedor.innerHTML = `
      <p><strong>${data.message}</strong></p>
      <p>Filas procesadas: ${data.totalFilas}</p>
      <p>Creados: ${data.creados}</p>
      <p>Actualizados: ${data.actualizados}</p>
      <p>Errores: ${data.errores}</p>
      ${erroresHtml}
    `;
    contenedor.classList.remove("hidden");

    if (!dryRun && (data.creados > 0 || data.actualizados > 0)) {
      await cargarEstudiantes();
      await cargarListaEstudiantes();
    }
  } catch (error) {
    contenedor.className = "rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm";
    contenedor.textContent = error.message;
    contenedor.classList.remove("hidden");
  } finally {
    botonProcesar.disabled = false;
    botonProcesar.textContent = "Procesar archivo";
  }
}

function cerrarModal() {
  document.getElementById("modal-estudiante").classList.add("hidden");
}

async function cargarListaEstudiantes() {
  const grado = document.getElementById("filtro-grado").value;
  const grupo = document.getElementById("filtro-grupo").value;
  const busqueda = document.getElementById("busqueda-estudiante").value;
  
  try {
    const busquedaNormalizada = busqueda.trim().toLowerCase();
    const lista = estudiantes.filter((est) => {
      if (grado && normalizarGrado(est.grado) !== normalizarGrado(grado)) return false;
      if (grupo && normalizarGrupo(est.grupo) !== normalizarGrupo(grupo)) return false;
      if (!busquedaNormalizada) return true;
      const nombre = String(est.nombre || "").toLowerCase();
      const identificacion = String(est.identificacion || "").toLowerCase();
      return nombre.includes(busquedaNormalizada) || identificacion.includes(busquedaNormalizada);
    });
    
    const tbody = document.getElementById("tabla-estudiantes");
    tbody.innerHTML = "";
    
    lista.forEach(est => {
      const tr = document.createElement("tr");
      tr.className = "border-b hover:bg-slate-50";
      tr.innerHTML = `
        <td class="px-4 py-2">${est.nombre}</td>
        <td class="px-4 py-2">${formatearGrado(est.grado)}</td>
        <td class="px-4 py-2">${normalizarGrupo(est.grupo)}</td>
        <td class="px-4 py-2">${est.identificacion}</td>
        <td class="px-4 py-2 text-center">
          <button onclick="verPerfil('${est._id}')" class="text-blue-600 hover:text-blue-800 mr-2" title="Ver perfil">
            <i class="fas fa-eye"></i>
          </button>
          <button onclick="editarEstudiante('${est._id}')" class="text-yellow-600 hover:text-yellow-800 mr-2" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="eliminarEstudiante('${est._id}')" class="text-red-600 hover:text-red-800" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error al cargar estudiantes:", error);
  }
}

async function handleGuardarEstudiante(e) {
  e.preventDefault();
  
  const estudianteData = {
    nombre: document.getElementById("est-nombre").value,
    identificacion: document.getElementById("est-identificacion").value,
    grado: document.getElementById("est-grado").value,
    grupo: document.getElementById("est-grupo").value,
    fechaNacimiento: document.getElementById("est-fecha-nacimiento").value || null,
    direccion: document.getElementById("est-direccion").value || "",
    telefono: document.getElementById("est-telefono").value || "",
    email: document.getElementById("est-email").value || "",
    padre: {
      nombre: document.getElementById("padre-nombre").value || "",
      telefono: document.getElementById("padre-telefono").value || "",
      email: document.getElementById("padre-email").value || "",
      ocupacion: document.getElementById("padre-ocupacion").value || ""
    },
    madre: {
      nombre: document.getElementById("madre-nombre").value || "",
      telefono: document.getElementById("madre-telefono").value || "",
      email: document.getElementById("madre-email").value || "",
      ocupacion: document.getElementById("madre-ocupacion").value || ""
    },
    tutor: {
      nombre: document.getElementById("tutor-nombre").value || "",
      telefono: document.getElementById("tutor-telefono").value || "",
      email: document.getElementById("tutor-email").value || "",
      parentesco: document.getElementById("tutor-parentesco").value || ""
    }
  };
  
  const id = document.getElementById("estudiante-id").value;
  const url = id ? `${API_URL}/estudiantes/${id}` : `${API_URL}/estudiantes`;
  const method = id ? "PUT" : "POST";
  
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(estudianteData)
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Error al guardar");
    }
    
    cerrarModal();
    await cargarEstudiantes();
    await cargarListaEstudiantes();
    mostrarEstado(id ? "Estudiante actualizado" : "Estudiante creado", "green");
  } catch (error) {
    alert(error.message);
  }
}

async function editarEstudiante(id) {
  try {
    const response = await fetch(`${API_URL}/estudiantes/${id}`, {
      headers: getHeaders()
    });
    const est = await response.json();
    
    document.getElementById("modal-titulo").textContent = "Editar Estudiante";
    document.getElementById("estudiante-id").value = est._id;
    document.getElementById("est-nombre").value = est.nombre || "";
    document.getElementById("est-identificacion").value = est.identificacion || "";
    document.getElementById("est-grado").value = normalizarGrado(est.grado || "");
    document.getElementById("est-grupo").value = normalizarGrupo(est.grupo || "");
    document.getElementById("est-fecha-nacimiento").value = est.fechaNacimiento ? est.fechaNacimiento.split("T")[0] : "";
    document.getElementById("est-direccion").value = est.direccion || "";
    document.getElementById("est-telefono").value = est.telefono || "";
    document.getElementById("est-email").value = est.email || "";
    
    // Padre
    document.getElementById("padre-nombre").value = est.padre?.nombre || "";
    document.getElementById("padre-telefono").value = est.padre?.telefono || "";
    document.getElementById("padre-email").value = est.padre?.email || "";
    document.getElementById("padre-ocupacion").value = est.padre?.ocupacion || "";
    
    // Madre
    document.getElementById("madre-nombre").value = est.madre?.nombre || "";
    document.getElementById("madre-telefono").value = est.madre?.telefono || "";
    document.getElementById("madre-email").value = est.madre?.email || "";
    document.getElementById("madre-ocupacion").value = est.madre?.ocupacion || "";
    
    // Tutor
    document.getElementById("tutor-nombre").value = est.tutor?.nombre || "";
    document.getElementById("tutor-telefono").value = est.tutor?.telefono || "";
    document.getElementById("tutor-email").value = est.tutor?.email || "";
    document.getElementById("tutor-parentesco").value = est.tutor?.parentesco || "";
    
    document.getElementById("modal-estudiante").classList.remove("hidden");
  } catch (error) {
    alert("Error al cargar estudiante");
  }
}

async function eliminarEstudiante(id) {
  if (!confirm("Estas seguro de eliminar este estudiante?")) return;
  
  try {
    const response = await fetch(`${API_URL}/estudiantes/${id}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Error al eliminar");
    }
    
    await cargarEstudiantes();
    await cargarListaEstudiantes();
    mostrarEstado("Estudiante eliminado", "green");
  } catch (error) {
    alert(error.message);
  }
}

function verPerfil(id) {
  cambiarVista("perfil");
  buscarPerfil(id);
}

// ==================== PERFIL ====================
function setupPerfil() {
  const buscador = document.getElementById("buscador-perfil");
  const sugerencias = document.getElementById("sugerencias-perfil");
  const btnCargarGrupo = document.getElementById("btn-cargar-perfil-grupo");
  const selectPerfil = document.getElementById("perfil-estudiante-select");
  
  buscador.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    
    if (!query) {
      sugerencias.classList.add("hidden");
      document.getElementById("perfil-content").classList.add("hidden");
      return;
    }
    
    const filtrados = estudiantes.filter(est =>
      est.nombre.toLowerCase().includes(query)
    );
    
    sugerencias.innerHTML = "";
    filtrados.slice(0, 6).forEach(est => {
      const item = document.createElement("li");
      item.className = "px-4 py-2 hover:bg-blue-50 cursor-pointer";
      item.textContent = `${est.nombre} - ${formatearGrado(est.grado)} ${normalizarGrupo(est.grupo)}`;
      item.addEventListener("click", () => {
        buscador.value = est.nombre;
        sugerencias.classList.add("hidden");
        buscarPerfil(est._id);
      });
      sugerencias.appendChild(item);
    });
    sugerencias.classList.remove("hidden");
  });

  if (btnCargarGrupo) {
    btnCargarGrupo.addEventListener("click", cargarEstudiantesPerfilPorGrupo);
  }
  if (selectPerfil) {
    selectPerfil.addEventListener("change", () => {
      if (selectPerfil.value) buscarPerfil(selectPerfil.value);
    });
  }
}

function actualizarSelectoresPerfil() {
  const selectGrado = document.getElementById("perfil-grado");
  const selectGrupo = document.getElementById("perfil-grupo");
  if (!selectGrado || !selectGrupo || !estudiantes.length) return;

  const grados = [...new Set(estudiantes.map((est) => normalizarGrado(est.grado)).filter(Boolean))].sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.localeCompare(b, "es");
  });
  const grupos = [...new Set(estudiantes.map((est) => normalizarGrupo(est.grupo)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  const gradoActual = selectGrado.value;
  const grupoActual = selectGrupo.value;

  selectGrado.innerHTML = '<option value="">Seleccionar grado</option>';
  grados.forEach((grado) => {
    const option = document.createElement("option");
    option.value = grado;
    option.textContent = formatearGrado(grado);
    selectGrado.appendChild(option);
  });

  selectGrupo.innerHTML = '<option value="">Seleccionar grupo</option>';
  grupos.forEach((grupo) => {
    const option = document.createElement("option");
    option.value = grupo;
    option.textContent = grupo;
    selectGrupo.appendChild(option);
  });

  if (gradoActual && grados.includes(gradoActual)) selectGrado.value = gradoActual;
  if (grupoActual && grupos.includes(grupoActual)) selectGrupo.value = grupoActual;
}

async function cargarEstudiantesPerfilPorGrupo() {
  const grado = document.getElementById("perfil-grado").value;
  const grupo = document.getElementById("perfil-grupo").value;
  const selectPerfil = document.getElementById("perfil-estudiante-select");

  if (!grado || !grupo) {
    alert("Selecciona grado y grupo para cargar estudiantes.");
    return;
  }

  try {
    estudiantesPerfil = filtrarEstudiantesPorGradoGrupo(estudiantes, grado, grupo);
    selectPerfil.innerHTML = '<option value="">Selecciona un estudiante</option>';
    estudiantesPerfil.forEach((est) => {
      const option = document.createElement("option");
      option.value = est._id;
      option.textContent = `${est.nombre} - ${est.identificacion}`;
      selectPerfil.appendChild(option);
    });
  } catch (error) {
    alert(error.message);
  }
}

// ==================== CONVIVENCIA ====================
function setupConvivencia() {
  const btnCargar = document.getElementById("btn-cargar-convivencia");
  const btnVer = document.getElementById("btn-ver-convivencia");
  const inputBusqueda = document.getElementById("conv-busqueda");
  const selectEstudiante = document.getElementById("conv-estudiante");
  const formReporte = document.getElementById("form-conv-reporte");
  const inputFechaReporte = document.getElementById("conv-rep-fecha");
  const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion-conv-reporte");

  if (!btnCargar || !btnVer || !inputBusqueda || !selectEstudiante) return;

  if (inputFechaReporte && !inputFechaReporte.value) {
    inputFechaReporte.value = obtenerFechaHoy();
  }

  btnCargar.addEventListener("click", cargarEstudiantesConvivencia);
  btnVer.addEventListener("click", cargarReporteConvivenciaSeleccionado);
  if (formReporte) {
    formReporte.addEventListener("submit", guardarReporteConvivencia);
  }
  if (btnCancelarEdicion) {
    btnCancelarEdicion.addEventListener("click", () => {
      prepararFormularioReporteConvivencia();
      mostrarEstadoReporteConvivencia("Edicion cancelada.", "yellow");
    });
  }

  inputBusqueda.addEventListener("input", () => {
    const query = inputBusqueda.value.trim().toLowerCase();
    const filtrados = estudiantesConvivencia.filter((est) => {
      const nombre = (est.nombre || "").toLowerCase();
      const identificacion = (est.identificacion || "").toLowerCase();
      return nombre.includes(query) || identificacion.includes(query);
    });
    renderOpcionesConvivencia(filtrados);
  });

  selectEstudiante.addEventListener("change", () => {
    if (!selectEstudiante.value) return;
    cargarReporteConvivenciaSeleccionado();
  });
}

function actualizarSelectoresConvivencia() {
  const selectGrado = document.getElementById("conv-grado");
  const selectGrupo = document.getElementById("conv-grupo");
  if (!selectGrado || !selectGrupo || !estudiantes.length) return;

  const grados = [...new Set(estudiantes.map((est) => normalizarGrado(est.grado)).filter(Boolean))].sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.localeCompare(b, "es");
  });
  const grupos = [...new Set(estudiantes.map((est) => normalizarGrupo(est.grupo)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  const gradoActual = selectGrado.value;
  const grupoActual = selectGrupo.value;

  selectGrado.innerHTML = '<option value="">Seleccionar grado</option>';
  grados.forEach((grado) => {
    const option = document.createElement("option");
    option.value = grado;
    option.textContent = formatearGrado(grado);
    selectGrado.appendChild(option);
  });

  selectGrupo.innerHTML = '<option value="">Seleccionar grupo</option>';
  grupos.forEach((grupo) => {
    const option = document.createElement("option");
    option.value = grupo;
    option.textContent = grupo;
    selectGrupo.appendChild(option);
  });

  if (gradoActual && grados.includes(gradoActual)) selectGrado.value = gradoActual;
  if (grupoActual && grupos.includes(grupoActual)) selectGrupo.value = grupoActual;
}

async function cargarEstudiantesConvivencia() {
  const grado = document.getElementById("conv-grado").value;
  const grupo = document.getElementById("conv-grupo").value;
  const inputBusqueda = document.getElementById("conv-busqueda");

  if (!grado || !grupo) {
    mostrarEstadoConvivencia("Selecciona grado y grupo para cargar estudiantes.", "red");
    return;
  }

  try {
    estudiantesConvivencia = filtrarEstudiantesPorGradoGrupo(estudiantes, grado, grupo);
    convivenciaEstudianteActualId = "";
    convivenciaReporteEditandoId = "";
    reportesConvivenciaActuales = [];
    inputBusqueda.value = "";
    renderOpcionesConvivencia(estudiantesConvivencia);
    document.getElementById("conv-content").classList.add("hidden");
    limpiarEstadoReporteConvivencia();

    if (!estudiantesConvivencia.length) {
      mostrarEstadoConvivencia("No hay estudiantes en este grado/grupo.", "yellow");
    } else {
      mostrarEstadoConvivencia(`Se cargaron ${estudiantesConvivencia.length} estudiante(s).`, "green");
    }
  } catch (error) {
    mostrarEstadoConvivencia(error.message, "red");
  }
}

function renderOpcionesConvivencia(lista) {
  const selectEstudiante = document.getElementById("conv-estudiante");
  selectEstudiante.innerHTML = '<option value="">Selecciona un estudiante</option>';

  lista.forEach((est) => {
    const option = document.createElement("option");
    option.value = est._id;
    option.textContent = `${est.nombre} - ${formatearGrado(est.grado)} ${normalizarGrupo(est.grupo)} - ${est.identificacion}`;
    selectEstudiante.appendChild(option);
  });
}

async function cargarReporteConvivenciaSeleccionado() {
  const id = document.getElementById("conv-estudiante").value;
  if (!id) {
    mostrarEstadoConvivencia("Selecciona un estudiante para ver el reporte.", "red");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/perfil/${id}`, { headers: getHeaders() });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el reporte de convivencia.");
    }

    const est = data.estudiante || {};
    convivenciaEstudianteActualId = id;
    reportesConvivenciaActuales = data.reportesConvivencia || [];
    document.getElementById("conv-estudiante-info").innerHTML = `
      <p><strong>Nombre:</strong> ${est.nombre || "-"}</p>
      <p><strong>Grado/Grupo:</strong> ${formatearGrado(est.grado)} ${normalizarGrupo(est.grupo || "-")}</p>
      <p><strong>Identificacion:</strong> ${est.identificacion || "-"}</p>
    `;

    renderReporteConvivenciaEnContenedor(data.reporteConvivencia || null, "conv-reporte-convivencia");
    renderHistorialReportesConvivencia(data.reportesConvivencia || []);
    prepararFormularioReporteConvivencia();
    document.getElementById("conv-content").classList.remove("hidden");
    mostrarEstadoConvivencia("Reporte cargado correctamente.", "green");
  } catch (error) {
    mostrarEstadoConvivencia(error.message, "red");
  }
}

function mostrarEstadoConvivencia(mensaje, color) {
  const estado = document.getElementById("conv-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm text-${color}-600`;
}

function prepararFormularioReporteConvivencia() {
  const form = document.getElementById("form-conv-reporte");
  if (!form) return;
  convivenciaReporteEditandoId = "";
  form.reset();
  const inputFecha = document.getElementById("conv-rep-fecha");
  if (inputFecha) inputFecha.value = obtenerFechaHoy();
  const selectGravedad = document.getElementById("conv-rep-gravedad");
  if (selectGravedad) selectGravedad.value = "tipo2";
  const selectEstado = document.getElementById("conv-rep-estado");
  if (selectEstado) selectEstado.value = "abierto";
  const selectCategoria = document.getElementById("conv-rep-categoria");
  if (selectCategoria) selectCategoria.value = "convivencia";
  actualizarUIEdicionReporteConvivencia();
  limpiarEstadoReporteConvivencia();
}

function actualizarUIEdicionReporteConvivencia() {
  const btnGuardar = document.getElementById("btn-guardar-conv-reporte");
  const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion-conv-reporte");
  if (!btnGuardar || !btnCancelarEdicion) return;

  if (convivenciaReporteEditandoId) {
    btnGuardar.textContent = "Actualizar Reporte";
    btnCancelarEdicion.classList.remove("hidden");
  } else {
    btnGuardar.textContent = "Guardar Reporte";
    btnCancelarEdicion.classList.add("hidden");
  }
}

function formatearFechaParaInput(fecha) {
  if (!fecha) return "";
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cargarReporteEnFormularioConvivencia(reporte) {
  if (!reporte) return;
  convivenciaReporteEditandoId = String(reporte._id || "");
  document.getElementById("conv-rep-fecha").value = formatearFechaParaInput(reporte.fecha) || obtenerFechaHoy();
  document.getElementById("conv-rep-categoria").value = reporte.categoria || "convivencia";
  document.getElementById("conv-rep-gravedad").value = normalizarGravedadConvivencia(reporte.gravedad);
  document.getElementById("conv-rep-estado").value = reporte.estado || "abierto";
  document.getElementById("conv-rep-descripcion").value = reporte.descripcion || "";
  document.getElementById("conv-rep-acciones").value = reporte.acciones || "";
  actualizarUIEdicionReporteConvivencia();
}

function mostrarEstadoReporteConvivencia(mensaje, color) {
  const estado = document.getElementById("conv-reporte-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm text-${color}-600`;
}

function limpiarEstadoReporteConvivencia() {
  const estado = document.getElementById("conv-reporte-estado");
  if (!estado) return;
  estado.textContent = "";
  estado.className = "text-sm";
}

function renderHistorialReportesConvivencia(reportes) {
  const tbody = document.getElementById("conv-historial-reportes");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!reportes.length) {
    tbody.innerHTML = "<tr><td colspan='7' class='px-4 py-4 text-center text-slate-500'>No hay reportes registrados.</td></tr>";
    return;
  }

  reportes.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "border-b";
    const reporteId = String(r._id || "");
    const gravedadClass = obtenerClaseGravedadConvivencia(r.gravedad);
    tr.innerHTML = `
      <td class="px-4 py-2">${r.fecha ? new Date(r.fecha).toLocaleDateString() : "-"}</td>
      <td class="px-4 py-2">${r.categoria || "-"}</td>
      <td class="px-4 py-2 font-medium ${gravedadClass}">${formatearGravedadConvivencia(r.gravedad)}</td>
      <td class="px-4 py-2">${r.estado || "-"}</td>
      <td class="px-4 py-2">${r.descripcion || "-"}</td>
      <td class="px-4 py-2 text-slate-500">${r.registradoPor || "-"}</td>
      <td class="px-4 py-2 text-center whitespace-nowrap">
        <button onclick="editarReporteConvivencia('${reporteId}')" class="text-yellow-600 hover:text-yellow-800 mr-2" title="Editar reporte" ${reporteId ? "" : "disabled"}>
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="eliminarReporteConvivencia('${reporteId}')" class="text-red-600 hover:text-red-800" title="Eliminar reporte" ${reporteId ? "" : "disabled"}>
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editarReporteConvivencia(reporteId) {
  const reporte = reportesConvivenciaActuales.find((r) => String(r._id) === String(reporteId));
  if (!reporte) {
    mostrarEstadoReporteConvivencia("No se encontro el reporte seleccionado.", "red");
    return;
  }

  cargarReporteEnFormularioConvivencia(reporte);
  mostrarEstadoReporteConvivencia("Editando reporte seleccionado.", "yellow");
}

async function eliminarReporteConvivencia(reporteId) {
  if (!convivenciaEstudianteActualId) {
    mostrarEstadoReporteConvivencia("Selecciona un estudiante antes de eliminar reportes.", "red");
    return;
  }
  if (!reporteId) {
    mostrarEstadoReporteConvivencia("No se pudo identificar el reporte a eliminar.", "red");
    return;
  }
  if (!confirm("Estas seguro de eliminar este reporte? Esta accion no se puede deshacer.")) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/convivencia/reportes/${convivenciaEstudianteActualId}/${reporteId}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo eliminar el reporte.");
    }

    if (convivenciaReporteEditandoId === reporteId) {
      prepararFormularioReporteConvivencia();
    }
    mostrarEstadoReporteConvivencia("Reporte eliminado correctamente.", "green");
    await cargarReporteConvivenciaSeleccionado();
  } catch (error) {
    mostrarEstadoReporteConvivencia(error.message, "red");
  }
}

async function guardarReporteConvivencia(event) {
  event.preventDefault();

  const estudianteId = convivenciaEstudianteActualId || document.getElementById("conv-estudiante").value;
  if (!estudianteId) {
    mostrarEstadoReporteConvivencia("Selecciona un estudiante antes de registrar reporte.", "red");
    return;
  }

  const payload = {
    estudianteId,
    fecha: document.getElementById("conv-rep-fecha").value,
    categoria: document.getElementById("conv-rep-categoria").value,
    gravedad: document.getElementById("conv-rep-gravedad").value,
    estado: document.getElementById("conv-rep-estado").value,
    descripcion: document.getElementById("conv-rep-descripcion").value.trim(),
    acciones: document.getElementById("conv-rep-acciones").value.trim()
  };

  if (!payload.descripcion) {
    mostrarEstadoReporteConvivencia("La descripcion del reporte es obligatoria.", "red");
    return;
  }

  const btnGuardar = document.getElementById("btn-guardar-conv-reporte");
  const esEdicion = Boolean(convivenciaReporteEditandoId);
  try {
    btnGuardar.disabled = true;
    btnGuardar.textContent = esEdicion ? "Guardando cambios..." : "Guardando...";

    const endpoint = esEdicion
      ? `${API_URL}/convivencia/reportes/${estudianteId}/${convivenciaReporteEditandoId}`
      : `${API_URL}/convivencia/reportes`;
    const method = esEdicion ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || (esEdicion ? "No se pudo actualizar el reporte." : "No se pudo guardar el reporte."));
    }

    mostrarEstadoReporteConvivencia(esEdicion ? "Reporte actualizado correctamente." : "Reporte guardado correctamente.", "green");
    await cargarReporteConvivenciaSeleccionado();
  } catch (error) {
    mostrarEstadoReporteConvivencia(error.message, "red");
  } finally {
    btnGuardar.disabled = false;
    actualizarUIEdicionReporteConvivencia();
  }
}

async function buscarPerfil(id) {
  try {
    const response = await fetch(`${API_URL}/perfil/${id}`, {
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Error al cargar perfil");
    }
    const est = data.estudiante || {};
    const historial = data.historial || [];
    const resumenAsistencia = data.resumenAsistencia || null;
    const reporteConvivencia = data.reporteConvivencia || null;
    
    document.getElementById("perfil-content").classList.remove("hidden");
    
    // Datos del estudiante
    document.getElementById("perfil-datos-estudiante").innerHTML = `
      <p><strong>Nombre:</strong> ${est.nombre}</p>
      <p><strong>Grado:</strong> ${formatearGrado(est.grado)}</p>
      <p><strong>Grupo:</strong> ${normalizarGrupo(est.grupo)}</p>
      <p><strong>Identificacion:</strong> ${est.identificacion}</p>
      <p><strong>Fecha de Nacimiento:</strong> ${est.fechaNacimiento ? new Date(est.fechaNacimiento).toLocaleDateString() : "No registrada"}</p>
      <p><strong>Direccion:</strong> ${est.direccion || "No registrada"}</p>
      <p><strong>Telefono:</strong> ${est.telefono || "No registrado"}</p>
      <p><strong>Email:</strong> ${est.email || "No registrado"}</p>
    `;
    
    // Datos del padre
    document.getElementById("perfil-datos-padre").innerHTML = est.padre?.nombre ? `
      <p><strong>Nombre:</strong> ${est.padre.nombre}</p>
      <p><strong>Telefono:</strong> ${est.padre.telefono || "No registrado"}</p>
      <p><strong>Email:</strong> ${est.padre.email || "No registrado"}</p>
      <p><strong>Ocupacion:</strong> ${est.padre.ocupacion || "No registrada"}</p>
    ` : "<p class='text-slate-500'>No registrado</p>";
    
    // Datos de la madre
    document.getElementById("perfil-datos-madre").innerHTML = est.madre?.nombre ? `
      <p><strong>Nombre:</strong> ${est.madre.nombre}</p>
      <p><strong>Telefono:</strong> ${est.madre.telefono || "No registrado"}</p>
      <p><strong>Email:</strong> ${est.madre.email || "No registrado"}</p>
      <p><strong>Ocupacion:</strong> ${est.madre.ocupacion || "No registrada"}</p>
    ` : "<p class='text-slate-500'>No registrado</p>";
    
    // Datos del tutor
    document.getElementById("perfil-datos-tutor").innerHTML = est.tutor?.nombre ? `
      <p><strong>Nombre:</strong> ${est.tutor.nombre}</p>
      <p><strong>Telefono:</strong> ${est.tutor.telefono || "No registrado"}</p>
      <p><strong>Email:</strong> ${est.tutor.email || "No registrado"}</p>
      <p><strong>Parentesco:</strong> ${est.tutor.parentesco || "No registrado"}</p>
    ` : "<p class='text-slate-500'>No registrado</p>";
    
    // Historial
    const tbody = document.getElementById("perfil-historial");
    tbody.innerHTML = "";
    
    if (historial && historial.length > 0) {
      historial.forEach(h => {
        const tr = document.createElement("tr");
        tr.className = "border-b";
        const tipoColor =
          h.tipo === "presente"
            ? "text-green-600"
            : h.tipo === "falta"
              ? "text-red-600"
              : h.tipo === "retardo"
                ? "text-yellow-600"
                : "text-purple-600";
        tr.innerHTML = `
          <td class="px-4 py-2">${new Date(h.fecha).toLocaleDateString()}</td>
          <td class="px-4 py-2 font-medium ${tipoColor}">${formatearTipoConMotivo(h.tipo, h.motivoSalida)}</td>
          <td class="px-4 py-2">${h.observacion || "-"}</td>
          <td class="px-4 py-2 text-sm text-slate-500">${h.registradoPor || "-"}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = "<tr><td colspan='4' class='px-4 py-4 text-center text-slate-500'>No hay registros de asistencia</td></tr>";
    }

    renderResumenAsistenciaPerfil(resumenAsistencia);
    renderReporteConvivenciaPerfil(reporteConvivencia);
  } catch (error) {
    console.error("Error al cargar perfil:", error);
  }
}

function renderResumenAsistenciaPerfil(resumen) {
  const contenedor = document.getElementById("perfil-resumen-asistencia");
  if (!contenedor) return;

  if (!resumen) {
    contenedor.innerHTML = "<p class='text-slate-500'>No hay datos de resumen.</p>";
    return;
  }

  const ultimo = resumen.ultimoRegistro
    ? `${new Date(resumen.ultimoRegistro.fecha).toLocaleDateString()} (${resumen.ultimoRegistro.tipo})`
    : "Sin registros";

  contenedor.innerHTML = `
    <p><strong>Total registros:</strong> ${resumen.totalRegistros ?? 0}</p>
    <p><strong>Presentes:</strong> ${resumen.presentes ?? 0}</p>
    <p><strong>Faltas:</strong> ${resumen.faltas ?? 0}</p>
    <p><strong>Retardos:</strong> ${resumen.retardos ?? 0}</p>
    <p><strong>Permisos:</strong> ${resumen.salidas ?? 0}</p>
    ${construirDesglosePermisosHTML(resumen.salidasPorMotivo)}
    <p><strong>Ultimo registro:</strong> ${ultimo}</p>
    <div class="mt-3 pt-3 border-t border-slate-200">
      <p class="font-medium">Ultimos 30 dias</p>
      <p>Registros: ${resumen.ultimos30dias?.total ?? 0}</p>
      <p>Presentes: ${resumen.ultimos30dias?.presentes ?? 0}</p>
      <p>Faltas: ${resumen.ultimos30dias?.faltas ?? 0}</p>
      <p>Retardos: ${resumen.ultimos30dias?.retardos ?? 0}</p>
      <p>Permisos: ${resumen.ultimos30dias?.salidas ?? 0}</p>
    </div>
  `;
}

// Muestra los permisos separados por motivo; se omite si el estudiante no tiene permisos.
function construirDesglosePermisosHTML(salidasPorMotivo) {
  const datos = salidasPorMotivo || {};
  const etiquetas = MOTIVOS_SALIDA
    .filter((motivo) => (datos[motivo.valor] ?? 0) > 0)
    .map((motivo) => `<span class="inline-block text-xs px-2 py-0.5 rounded ${motivo.clase}">${motivo.etiqueta}: ${datos[motivo.valor]}</span>`);

  if (datos.sin_especificar) {
    etiquetas.push(`<span class="inline-block text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">Sin especificar: ${datos.sin_especificar}</span>`);
  }

  if (!etiquetas.length) return "";
  return `<div class="flex flex-wrap gap-1 ml-4 mb-1">${etiquetas.join("")}</div>`;
}

function renderReporteConvivenciaPerfil(reporte) {
  renderReporteConvivenciaEnContenedor(reporte, "perfil-reporte-convivencia");
}

function renderReporteConvivenciaEnContenedor(reporte, contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  if (!reporte) {
    contenedor.innerHTML = "<p class='text-slate-500'>No hay datos de convivencia.</p>";
    return;
  }

  const colorNivel =
    reporte.nivel === "alto" ? "text-red-700" :
    reporte.nivel === "medio" ? "text-yellow-700" :
    "text-green-700";

  const alertasHTML = (reporte.alertas || [])
    .map((alerta) => `<li>${alerta}</li>`)
    .join("");

  const observacionesHTML = (reporte.observacionesRelevantes || [])
    .slice(0, 10)
    .map((obs) => {
      const fecha = obs.fecha ? new Date(obs.fecha).toLocaleDateString() : "-";
      return `<li>${fecha}: ${obs.observacion || "-"} (${formatearTipoAsistencia(obs.tipo)})</li>`;
    })
    .join("");

  contenedor.innerHTML = `
    <p class="text-2xl"><strong>Nivel:</strong> <span class="font-semibold ${colorNivel}">${(reporte.nivel || "bajo").toUpperCase()}</span></p>
    <p><strong>Puntaje de riesgo:</strong> ${reporte.puntajeRiesgo ?? 0}</p>
    <p><strong>Total reportes convivencia:</strong> ${reporte.totalReportesConvivencia ?? 0}</p>
    <p><strong>Reportes abiertos/en seguimiento:</strong> ${reporte.reportesAbiertos ?? 0}</p>
    <div class="mt-3">
      <p class="font-medium">Alertas</p>
      <ul class="list-disc pl-5 text-sm">${alertasHTML || "<li>Sin alertas relevantes de convivencia.</li>"}</ul>
    </div>
    <div class="mt-3">
      <p class="font-medium">Observaciones relevantes</p>
      <ul class="list-disc pl-5 text-sm">${observacionesHTML || "<li>Sin observaciones relevantes.</li>"}</ul>
    </div>
  `;
}

function setupUsuarios() {
  const form = document.getElementById("form-usuario");
  const selectRol = document.getElementById("usuario-rol");
  const btnRecargar = document.getElementById("btn-recargar-usuarios");
  const btnCancelar = document.getElementById("btn-cancelar-edicion-usuario");

  if (!form || !selectRol || !btnRecargar) return;

  form.addEventListener("submit", guardarUsuario);
  selectRol.addEventListener("change", actualizarFormularioUsuarioSegunRol);
  btnRecargar.addEventListener("click", cargarUsuarios);
  if (btnCancelar) {
    btnCancelar.addEventListener("click", cancelarEdicionUsuario);
  }
  actualizarFormularioUsuarioSegunRol();
}

function cancelarEdicionUsuario() {
  usuarioEditandoId = "";

  const form = document.getElementById("form-usuario");
  const btnCrear = document.getElementById("btn-crear-usuario");
  const btnCancelar = document.getElementById("btn-cancelar-edicion-usuario");
  const titulo = document.getElementById("usuario-form-titulo");
  const passwordInput = document.getElementById("usuario-password");

  if (form) form.reset();
  if (btnCrear) btnCrear.textContent = "Crear Usuario";
  if (btnCancelar) btnCancelar.classList.add("hidden");
  if (titulo) titulo.textContent = "Crear Usuario";
  if (passwordInput) {
    passwordInput.placeholder = "";
    passwordInput.required = true;
  }

  actualizarFormularioUsuarioSegunRol();
}

function actualizarFormularioUsuarioSegunRol() {
  const selectRol = document.getElementById("usuario-rol");
  const bloqueAsignacion = document.getElementById("usuario-asignacion-grupo");
  const inputGrado = document.getElementById("usuario-grado");
  const inputGrupo = document.getElementById("usuario-grupo");
  if (!selectRol || !bloqueAsignacion || !inputGrado || !inputGrupo) return;

  const esAdmin = selectRol.value === "admin";
  if (esAdmin) {
    bloqueAsignacion.classList.add("hidden");
    inputGrado.required = false;
    inputGrupo.required = false;
    inputGrado.value = "";
    inputGrupo.value = "";
  } else {
    bloqueAsignacion.classList.remove("hidden");
    inputGrado.required = true;
    inputGrupo.required = true;
  }
}

function mostrarEstadoUsuarios(mensaje, color) {
  const estado = document.getElementById("usuario-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm text-${color}-600`;
}

async function guardarUsuario(event) {
  event.preventDefault();
  if (usuarioActual?.rol !== "admin") {
    mostrarEstadoUsuarios("Solo administradores pueden gestionar usuarios.", "red");
    return;
  }

  const esEdicion = Boolean(usuarioEditandoId);
  const rol = document.getElementById("usuario-rol").value;
  const payload = {
    nombre: document.getElementById("usuario-nombre").value.trim(),
    username: document.getElementById("usuario-username").value.trim(),
    rol,
    gradoAsignado: document.getElementById("usuario-grado").value,
    grupoAsignado: document.getElementById("usuario-grupo").value
  };

  // Solo incluir password si se proporciona (para edición, es opcional)
  const password = document.getElementById("usuario-password").value;
  if (password) {
    payload.password = password;
  }

  if (!payload.nombre || !payload.username) {
    mostrarEstadoUsuarios("Nombre y usuario son obligatorios.", "red");
    return;
  }

  // En creación, la contraseña es obligatoria
  if (!esEdicion && !password) {
    mostrarEstadoUsuarios("La contraseña es obligatoria para nuevos usuarios.", "red");
    return;
  }

  if (rol !== "admin" && (!payload.gradoAsignado || !payload.grupoAsignado)) {
    mostrarEstadoUsuarios("Debes asignar grado y grupo al director de grupo.", "red");
    return;
  }

  const btnCrear = document.getElementById("btn-crear-usuario");
  try {
    btnCrear.disabled = true;
    btnCrear.textContent = esEdicion ? "Guardando..." : "Creando...";

    const url = esEdicion ? `${API_URL}/usuarios/${usuarioEditandoId}` : `${API_URL}/usuarios`;
    const method = esEdicion ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || (esEdicion ? "No se pudo actualizar el usuario." : "No se pudo crear el usuario."));
    }

    // Resetear formulario y estado de edición
    cancelarEdicionUsuario();
    mostrarEstadoUsuarios(esEdicion ? "Usuario actualizado correctamente." : "Usuario creado correctamente.", "green");
    await cargarUsuarios();
  } catch (error) {
    mostrarEstadoUsuarios(error.message, "red");
  } finally {
    btnCrear.disabled = false;
    btnCrear.textContent = esEdicion ? "Guardar Cambios" : "Crear Usuario";
  }
}

function renderTablaUsuarios(usuarios) {
  const tbody = document.getElementById("tabla-usuarios");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!usuarios.length) {
    tbody.innerHTML = "<tr><td colspan='7' class='px-4 py-4 text-center text-slate-500'>No hay usuarios registrados.</td></tr>";
    return;
  }

  usuarios.forEach((usuario) => {
    const usuarioId = String(usuario._id || "");
    const esUsuarioActual = String(usuarioActual?.id) === usuarioId;
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-slate-50";
    tr.innerHTML = `
      <td class="px-4 py-2">${usuario.nombre || "-"}</td>
      <td class="px-4 py-2">${usuario.username || "-"}</td>
      <td class="px-4 py-2">${usuario.rol || "-"}</td>
      <td class="px-4 py-2">${usuario.gradoAsignado ? formatearGrado(usuario.gradoAsignado) : "-"}</td>
      <td class="px-4 py-2">${usuario.grupoAsignado ? normalizarGrupo(usuario.grupoAsignado) : "-"}</td>
      <td class="px-4 py-2">${usuario.fechaCreacion ? new Date(usuario.fechaCreacion).toLocaleDateString() : "-"}</td>
      <td class="px-4 py-2 text-center whitespace-nowrap">
        <button onclick="editarUsuario('${usuarioId}')" class="text-yellow-600 hover:text-yellow-800 mr-2" title="Editar usuario" ${usuarioId ? "" : "disabled"}>
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="eliminarUsuario('${usuarioId}')" class="text-red-600 hover:text-red-800" title="Eliminar usuario" ${usuarioId && !esUsuarioActual ? "" : "disabled"}>
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function editarUsuario(usuarioId) {
  const usuario = usuariosSistema.find((u) => String(u._id) === String(usuarioId));
  if (!usuario) {
    mostrarEstadoUsuarios("No se encontró el usuario seleccionado.", "red");
    return;
  }

  // Cargar datos en el formulario
  usuarioEditandoId = usuarioId;
  document.getElementById("usuario-id").value = usuarioId;
  document.getElementById("usuario-nombre").value = usuario.nombre || "";
  document.getElementById("usuario-username").value = usuario.username || "";
  document.getElementById("usuario-rol").value = usuario.rol || "profesor";
  document.getElementById("usuario-grado").value = usuario.gradoAsignado || "";
  document.getElementById("usuario-grupo").value = usuario.grupoAsignado || "";
  
  // Limpiar campo de contraseña y hacerlo opcional para edición
  const passwordInput = document.getElementById("usuario-password");
  passwordInput.value = "";
  passwordInput.placeholder = "Dejar en blanco para mantener la actual";
  passwordInput.required = false;

  // Actualizar UI
  const btnCrear = document.getElementById("btn-crear-usuario");
  const btnCancelar = document.getElementById("btn-cancelar-edicion-usuario");
  const titulo = document.getElementById("usuario-form-titulo");
  
  if (btnCrear) btnCrear.textContent = "Guardar Cambios";
  if (btnCancelar) btnCancelar.classList.remove("hidden");
  if (titulo) titulo.textContent = "Editar Usuario";
  
  actualizarFormularioUsuarioSegunRol();
  mostrarEstadoUsuarios("Editando usuario seleccionado. Modifica los campos y guarda los cambios.", "yellow");
  
  // Scroll al formulario
  document.getElementById("form-usuario").scrollIntoView({ behavior: "smooth" });
}

async function eliminarUsuario(usuarioId) {
  if (!usuarioId) {
    mostrarEstadoUsuarios("No se pudo identificar el usuario a eliminar.", "red");
    return;
  }

  // Verificar que no sea el usuario actual
  if (String(usuarioActual?.id) === String(usuarioId)) {
    mostrarEstadoUsuarios("No puedes eliminar tu propio usuario.", "red");
    return;
  }

  const usuario = usuariosSistema.find((u) => String(u._id) === String(usuarioId));
  if (!usuario) {
    mostrarEstadoUsuarios("Usuario no encontrado.", "red");
    return;
  }

  if (!confirm(`¿Estás seguro de eliminar al usuario \"${usuario.nombre}\" (${usuario.username})? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/usuarios/${usuarioId}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo eliminar el usuario.");
    }

    mostrarEstadoUsuarios("Usuario eliminado correctamente.", "green");
    await cargarUsuarios();
  } catch (error) {
    mostrarEstadoUsuarios(error.message, "red");
  }
}

async function cargarUsuarios() {
  if (usuarioActual?.rol !== "admin") return;

  try {
    const response = await fetch(`${API_URL}/usuarios`, { headers: getHeaders() });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar los usuarios.");
    }

    usuariosSistema = Array.isArray(data) ? data : [];
    renderTablaUsuarios(usuariosSistema);
  } catch (error) {
    mostrarEstadoUsuarios(error.message, "red");
  }
}

// ==================== REPORTES ====================
function setupReportes() {
  document.getElementById("btn-actualizar-stats").addEventListener("click", () => {
    cargarEstadisticas();
    cargarReporteGrupo();
  });
  
  document.getElementById("btn-generar-reporte").addEventListener("click", cargarReporteGeneral);
  document.getElementById("btn-exportar").addEventListener("click", exportarReporte);
  document.getElementById("btn-cargar-reportes-conv").addEventListener("click", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-busqueda").addEventListener("input", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-grado").addEventListener("change", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-grupo").addEventListener("change", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-estado-filtro").addEventListener("change", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-motivo-filtro").addEventListener("change", cargarReportesConvivenciaGestion);
  document.getElementById("edit-rep-tipo").addEventListener("change", actualizarVisibilidadMotivoEdicion);
  document.getElementById("reportes-conv-fecha-mes").addEventListener("change", () => {
    const fechaDiaInput = document.getElementById("reportes-conv-fecha-dia");
    if (fechaDiaInput) fechaDiaInput.value = "";
    cargarReportesConvivenciaGestion();
    if (usuarioActual?.rol === "admin") {
      cargarCumplimientoProfesores();
    }
  });
  document.getElementById("reportes-conv-fecha-dia").addEventListener("change", () => {
    const fechaDia = document.getElementById("reportes-conv-fecha-dia")?.value || "";
    const mesInput = document.getElementById("reportes-conv-fecha-mes");
    if (mesInput && fechaDia) {
      mesInput.value = fechaDia.slice(0, 7);
    }
    cargarReportesConvivenciaGestion();
    if (usuarioActual?.rol === "admin") {
      cargarCumplimientoProfesores();
    }
  });
  document.getElementById("btn-cargar-alertas-profesores").addEventListener("click", cargarCumplimientoProfesores);
  const reportesConvFechaMes = document.getElementById("reportes-conv-fecha-mes");
  if (reportesConvFechaMes && !reportesConvFechaMes.value) {
    reportesConvFechaMes.value = obtenerMesActual();
  }

  document.getElementById("btn-cerrar-modal-calendario-asistencia").addEventListener("click", cerrarModalCalendarioAsistencia);
  document.getElementById("btn-cerrar-modal-editar-reporte-conv").addEventListener("click", cerrarModalEditarReporteConvivenciaGestion);
  document.getElementById("btn-cancelar-modal-editar-reporte-conv").addEventListener("click", cerrarModalEditarReporteConvivenciaGestion);
  document.getElementById("form-editar-reporte-conv").addEventListener("submit", guardarEdicionReporteConvivenciaGestion);
}

function mostrarEstadoReportesConvivenciaGestion(mensaje, color = "slate") {
  const estado = document.getElementById("reportes-conv-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm mb-3 text-${color}-600`;
}

function mostrarEstadoAlertasProfesores(mensaje, color = "amber") {
  const estado = document.getElementById("reportes-alertas-profesores-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm mb-2 text-${color}-800`;
}

function actualizarResumenAlertasProfesores(data = null) {
  const summary = document.getElementById("reportes-alertas-profesores-summary");
  if (!summary) return;
  if (!data) {
    summary.textContent = "Seguimiento por profesor";
    return;
  }
  const alertas = Number(data.alertasHoraLimite || 0);
  const pendientes = Number(data.pendientesMes || 0);
  summary.textContent = `Seguimiento por profesor (${alertas} alertas, ${pendientes} pendientes)`;
}

function renderCumplimientoProfesores(items) {
  const contenedor = document.getElementById("reportes-alertas-profesores-lista");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  if (!Array.isArray(items) || !items.length) {
    contenedor.innerHTML = "<div class='text-sm text-amber-800'>No hay profesores asignados para mostrar.</div>";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("details");
    const claseEstado = item.alertaHoraLimite
      ? "border-red-300 bg-red-50"
      : (item.faltantes > 0 ? "border-yellow-300 bg-yellow-50" : "border-green-300 bg-green-50");
    const etiquetaEstado = item.alertaHoraLimite
      ? "ALERTA"
      : (item.faltantes > 0 ? "Pendiente" : "Al dia");
    const diasFaltantes = (item.diasFaltantes || []).join(", ");
    const faltantesTexto = item.faltantes > 0
      ? `Le faltan ${item.faltantes} día(s): ${diasFaltantes || "-"}`
      : "Mes al día.";

    card.className = `border rounded-lg ${claseEstado}`;
    card.innerHTML = `
      <summary class="cursor-pointer select-none p-3 flex flex-wrap items-center justify-between gap-2">
        <p class="font-semibold text-slate-800">${item.nombre || "-"} (${formatearGrado(item.grado)} ${item.grupo || "-"})</p>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-700">Cumplimiento ${item.cumplimientoPorcentaje ?? 0}%</span>
          <span class="text-xs font-bold uppercase px-2 py-1 rounded bg-white border border-slate-300">${etiquetaEstado}</span>
        </div>
      </summary>
      <div class="px-3 pb-3 pt-1 border-t border-slate-200">
        <p class="text-sm text-slate-700">Cumplimiento mensual: ${item.cumplimientoPorcentaje ?? 0}% (${item.diasReportados ?? 0}/${item.diasHabilesEsperados ?? 0} días hábiles reportados)</p>
        <p class="text-sm ${item.alertaHoraLimite ? "text-red-700 font-semibold" : "text-slate-700"}">${item.mensajeHoy || "Sin novedades para hoy."}</p>
        <p class="text-sm text-slate-700">${faltantesTexto}</p>
        <button type="button" data-profesor-id="${item.profesorId}" class="btn-ver-calendario-profesor mt-2 text-xs bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800">
          <i class="fas fa-calendar-days"></i> Ver calendario
        </button>
      </div>
    `;
    contenedor.appendChild(card);
    card.querySelector(".btn-ver-calendario-profesor").addEventListener("click", () => {
      abrirCalendarioProfesor(item.profesorId);
    });
  });
}

async function cargarCumplimientoProfesores() {
  const bloque = document.getElementById("reportes-alertas-profesores");
  if (!bloque) return;

  if (usuarioActual?.rol !== "admin") {
    bloque.classList.add("hidden");
    return;
  }
  bloque.classList.remove("hidden");

  try {
    const mes = document.getElementById("reportes-conv-fecha-mes")?.value || obtenerMesActual();
    const params = new URLSearchParams();
    if (mes) params.append("mes", mes);

    const response = await fetch(`${API_URL}/asistencia/cumplimiento-profesores?${params.toString()}`, {
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el estado por profesor.");
    }

    cumplimientoProfesoresActual = Array.isArray(data.profesores) ? data.profesores : [];
    cumplimientoContextActual = {
      mes: data.mes || mes,
      fechaCorteEvaluada: data.fechaCorteEvaluada || null,
      festivosDelMes: Array.isArray(data.festivosDelMes) ? data.festivosDelMes : []
    };
    renderCumplimientoProfesores(cumplimientoProfesoresActual);
    actualizarResumenAlertasProfesores(data);
    mostrarEstadoAlertasProfesores(
      `Mes ${data.mes || mes}: ${data.alertasHoraLimite ?? 0} alerta(s) por hora límite, ${data.pendientesMes ?? 0} profesor(es) con faltantes.`,
      (data.alertasHoraLimite || 0) > 0 ? "red" : "amber"
    );
  } catch (error) {
    cumplimientoProfesoresActual = [];
    renderCumplimientoProfesores([]);
    actualizarResumenAlertasProfesores(null);
    mostrarEstadoAlertasProfesores(error.message, "red");
  }
}

const MESES_NOMBRES_CALENDARIO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function construirCalendarioMensualHTML(item, contexto) {
  const monthKey = contexto?.mes || obtenerMesActual();
  const [anioTexto, mesTexto] = monthKey.split("-");
  const anio = Number(anioTexto);
  const mesIndice = Number(mesTexto) - 1;
  if (!Number.isFinite(anio) || !Number.isFinite(mesIndice)) {
    return "<p class='text-sm text-slate-500'>No se pudo determinar el mes a mostrar.</p>";
  }

  const diasFaltantes = new Set(item.diasFaltantes || []);
  const festivos = new Set(contexto?.festivosDelMes || []);
  const fechaCorte = contexto?.fechaCorteEvaluada ? new Date(contexto.fechaCorteEvaluada) : new Date();
  const fechaCorteKey = getDateKeyLocal(fechaCorte);
  const totalDias = new Date(anio, mesIndice + 1, 0).getDate();

  const nombresColumnas = ["L", "M", "X", "J", "V", "S", "D"];
  let celdas = "";

  const primerDiaSemana = new Date(anio, mesIndice, 1).getDay();
  const offsetLunes = (primerDiaSemana + 6) % 7;
  for (let i = 0; i < offsetLunes; i++) {
    celdas += `<div></div>`;
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const dateKey = `${anioTexto}-${mesTexto.padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const diaSemana = new Date(anio, mesIndice, dia).getDay();
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;

    let clase = "bg-white border border-slate-200 text-slate-500";
    if (festivos.has(dateKey)) {
      clase = "bg-amber-300 text-amber-900";
    } else if (esFinDeSemana) {
      clase = "bg-slate-200 text-slate-500";
    } else if (dateKey > fechaCorteKey) {
      clase = "bg-white border border-slate-200 text-slate-500";
    } else if (diasFaltantes.has(dateKey)) {
      clase = "bg-red-500 text-white";
    } else {
      clase = "bg-green-500 text-white";
    }

    celdas += `<div class="aspect-square flex items-center justify-center rounded text-sm font-medium ${clase}">${dia}</div>`;
  }

  return `
    <p class="text-sm font-medium text-slate-700 mb-2">${item.nombre || "-"} · ${formatearGrado(item.grado)} ${item.grupo || "-"} · ${MESES_NOMBRES_CALENDARIO[mesIndice]} ${anio}</p>
    <div class="grid grid-cols-7 gap-1 text-xs font-semibold text-slate-500 mb-1">
      ${nombresColumnas.map((n) => `<div class="text-center">${n}</div>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-1">
      ${celdas}
    </div>
  `;
}

function getDateKeyLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function abrirCalendarioProfesor(profesorId) {
  const item = cumplimientoProfesoresActual.find((p) => String(p.profesorId) === String(profesorId));
  if (!item) return;

  const titulo = document.getElementById("calendario-asistencia-titulo");
  const grid = document.getElementById("calendario-asistencia-grid");
  if (titulo) titulo.textContent = "Calendario de asistencia";
  if (grid) grid.innerHTML = construirCalendarioMensualHTML(item, cumplimientoContextActual);

  document.getElementById("modal-calendario-asistencia").classList.remove("hidden");
}

function cerrarModalCalendarioAsistencia() {
  document.getElementById("modal-calendario-asistencia").classList.add("hidden");
}

function abrirModalEditarReporteConvivenciaGestion() {
  document.getElementById("modal-editar-reporte-conv").classList.remove("hidden");
}

function cerrarModalEditarReporteConvivenciaGestion() {
  document.getElementById("modal-editar-reporte-conv").classList.add("hidden");
  document.getElementById("edit-rep-estado-msg").textContent = "";
  document.getElementById("edit-rep-estado-msg").className = "text-sm";
  registroAsistenciaEditando = { registroId: "", estudianteId: "" };
}

function renderTablaReportesConvivenciaGestion(reportes) {
  const contenedor = document.getElementById("reportes-conv-lista");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  const fechaMes = document.getElementById("reportes-conv-fecha-mes")?.value || "";
  const fechaDia = document.getElementById("reportes-conv-fecha-dia")?.value || "";
  const vistaSoloMes = Boolean(fechaMes && !fechaDia);

  function normalizarFechaDia(fecha) {
    if (!fecha) return null;
    const parsed = new Date(`${fecha}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fechaFiltroDesde = normalizarFechaDia(fechaDia);
  const fechaFiltroHasta = fechaFiltroDesde ? new Date(fechaFiltroDesde) : null;
  if (fechaFiltroHasta) {
    fechaFiltroHasta.setHours(23, 59, 59, 999);
  }
  function normalizarTexto(valor) {
    return String(valor || "").trim().toLowerCase();
  }
  function compararEstudiantesYFecha(a, b) {
    const nombreA = normalizarTexto(a?.estudianteNombre);
    const nombreB = normalizarTexto(b?.estudianteNombre);
    const cmpNombre = nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    if (cmpNombre !== 0) return cmpNombre;
    const fechaA = a?.fecha ? new Date(a.fecha) : 0;
    const fechaB = b?.fecha ? new Date(b.fecha) : 0;
    return fechaB - fechaA;
  }

  function compararEstudiantes(a, b) {
    const nombreA = normalizarTexto(a?.estudianteNombre);
    const nombreB = normalizarTexto(b?.estudianteNombre);
    return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
  }

  function obtenerClaveDia(fecha) {
    const parsed = new Date(fecha);
    if (Number.isNaN(parsed.getTime())) return "";
    const anio = parsed.getFullYear();
    const mes = String(parsed.getMonth() + 1).padStart(2, "0");
    const dia = String(parsed.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }

  if (!reportes.length) {
    contenedor.innerHTML = "<div class='text-sm text-slate-500 text-center py-4'>No hay registros de asistencia para los filtros aplicados.</div>";
    return;
  }

  const registrosPorSalon = {};
  reportes.forEach((r) => {
    const grado = normalizarGrado(r.grado) || "-";
    const grupo = normalizarGrupo(r.grupo) || "-";
    const llave = `${grado}|${grupo}`;
    if (!registrosPorSalon[llave]) {
      registrosPorSalon[llave] = [];
    }
    registrosPorSalon[llave].push(r);
  });

  const salones = Object.keys(registrosPorSalon).sort((a, b) => {
    const [gradoA, grupoA] = a.split("|");
    const [gradoB, grupoB] = b.split("|");
    const gradoNumA = Number(gradoA);
    const gradoNumB = Number(gradoB);
    const ambosNumericos = !Number.isNaN(gradoNumA) && !Number.isNaN(gradoNumB);
    if (ambosNumericos && gradoNumA !== gradoNumB) return gradoNumA - gradoNumB;
    if (!Number.isNaN(gradoNumA) && Number.isNaN(gradoNumB)) return -1;
    if (Number.isNaN(gradoNumA) && !Number.isNaN(gradoNumB)) return 1;
    if (gradoA !== gradoB) return gradoA.localeCompare(gradoB, "es");
    return grupoA.localeCompare(grupoB, "es");
  });

  salones.forEach((llave) => {
    const registrosSalon = registrosPorSalon[llave]
      .filter((reporte) => {
        if (!fechaFiltroDesde || !reporte?.fecha) return true;
        const fechaReporte = new Date(reporte.fecha);
        if (Number.isNaN(fechaReporte.getTime())) return false;
        return fechaReporte >= fechaFiltroDesde && fechaReporte <= fechaFiltroHasta;
      })
      .slice().sort((a, b) => {
        return compararEstudiantesYFecha(a, b);
      });

    const [grado, grupo] = llave.split("|");
    const detalle = document.createElement("details");
    detalle.className = "border border-slate-200 rounded-lg overflow-hidden";

    const summary = document.createElement("summary");
    summary.className = "cursor-pointer select-none bg-slate-50 px-4 py-3 font-semibold text-slate-800 flex flex-wrap justify-between gap-2 items-center";
    summary.innerHTML = `<span>${formatearGrado(grado)} - Grupo ${grupo}</span><span id="reportes-salon-total-${grado}-${grupo}" class="text-sm font-normal text-slate-600">(${registrosSalon.length} registro(s))</span>`;
    detalle.appendChild(summary);

    const panel = document.createElement("div");
    panel.className = "p-3 border-t border-slate-200 bg-white";
    detalle.appendChild(panel);
    contenedor.appendChild(detalle);

    const totalSalon = panel.parentElement.querySelector(`#reportes-salon-total-${grado}-${grupo}`);

    function construirFilasTabla(registros, ocultarFecha = false) {
      return registros.map((r) => `
        <tr class="border-b hover:bg-slate-50">
          ${ocultarFecha ? "" : `<td class="px-4 py-2">${r.fecha ? new Date(r.fecha).toLocaleDateString() : "-"}</td>`}
          <td class="px-4 py-2">${r.estudianteNombre || "-"}</td>
          <td class="px-4 py-2">${formatearTipoConMotivo(r.tipo, r.motivoSalida)}</td>
          <td class="px-4 py-2">${r.observacion || "-"}</td>
          <td class="px-4 py-2">${r.registradoPor || "-"}</td>
          <td class="px-4 py-2 whitespace-nowrap">
            <button onclick="editarReporteConvivenciaDesdeReportes('${r.registroId}','${r.estudianteId}')" class="text-yellow-600 hover:text-yellow-800 mr-2" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="eliminarReporteConvivenciaDesdeReportes('${r.registroId}','${r.estudianteId}')" class="text-red-600 hover:text-red-800" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `).join("");
    }

    function renderTablaSalonConFiltro() {
      const filtrados = [...registrosSalon];

      totalSalon.textContent = `(${filtrados.length} registro(s))`;
      if (!filtrados.length) {
        panel.innerHTML = "<div class='text-sm text-slate-500 text-center py-4'>No hay registros para la fecha seleccionada.</div>";
        return;
      }

      if (!vistaSoloMes) {
        panel.innerHTML = `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-2 text-left">Fecha</th>
                  <th class="px-4 py-2 text-left">Estudiante</th>
                  <th class="px-4 py-2 text-left">Tipo</th>
                  <th class="px-4 py-2 text-left">Observacion</th>
                  <th class="px-4 py-2 text-left">Registrado por</th>
                  <th class="px-4 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>${construirFilasTabla(filtrados, false)}</tbody>
            </table>
          </div>
        `;
        return;
      }

      const registrosPorDia = {};
      filtrados.forEach((r) => {
        const clave = obtenerClaveDia(r.fecha);
        if (!clave) return;
        if (!registrosPorDia[clave]) registrosPorDia[clave] = [];
        registrosPorDia[clave].push(r);
      });
      const dias = Object.keys(registrosPorDia).sort((a, b) => new Date(a) - new Date(b));
      panel.innerHTML = "";

      dias.forEach((dia) => {
        const registrosDia = (registrosPorDia[dia] || []).slice().sort((a, b) => compararEstudiantes(a, b));
        const bloqueDia = document.createElement("details");
        bloqueDia.className = "border border-slate-200 rounded-lg overflow-hidden mb-2";
        bloqueDia.open = false;
        const fechaTitulo = new Date(`${dia}T00:00:00`).toLocaleDateString();
        bloqueDia.innerHTML = `
          <summary class="cursor-pointer select-none bg-slate-50 px-4 py-2 font-medium text-slate-800 flex justify-between gap-2">
            <span>${fechaTitulo}</span>
            <span class="text-sm text-slate-600">${registrosDia.length} registro(s)</span>
          </summary>
          <div class="p-2 border-t border-slate-200 bg-white overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-2 text-left">Estudiante</th>
                  <th class="px-4 py-2 text-left">Tipo</th>
                  <th class="px-4 py-2 text-left">Observacion</th>
                  <th class="px-4 py-2 text-left">Registrado por</th>
                  <th class="px-4 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>${construirFilasTabla(registrosDia, true)}</tbody>
            </table>
          </div>
        `;
        panel.appendChild(bloqueDia);
      });

      if (!dias.length) {
        panel.innerHTML = "<div class='text-sm text-slate-500 text-center py-4'>No hay registros válidos para agrupar por día.</div>";
      }
    }

    renderTablaSalonConFiltro();
  });
}

async function cargarReportesConvivenciaGestion() {
  try {
    const params = new URLSearchParams();
    const grado = document.getElementById("reportes-conv-grado").value;
    const grupo = document.getElementById("reportes-conv-grupo").value;
    const tipo = document.getElementById("reportes-conv-estado-filtro").value;
    const motivoSalida = document.getElementById("reportes-conv-motivo-filtro").value;
    const fechaMes = document.getElementById("reportes-conv-fecha-mes").value;
    const fechaDia = document.getElementById("reportes-conv-fecha-dia").value;
    const busqueda = document.getElementById("reportes-conv-busqueda").value.trim();

    if (grado) params.append("grado", grado);
    if (grupo) params.append("grupo", grupo);
    if (tipo) params.append("tipo", tipo);
    // Filtrar por motivo solo tiene sentido dentro de los permisos.
    if (motivoSalida) {
      params.set("tipo", "salida");
      params.append("motivoSalida", motivoSalida);
    }
    if (fechaDia) {
      params.append("fechaDesde", fechaDia);
      params.append("fechaHasta", fechaDia);
    } else if (fechaMes) {
      const rangoMes = obtenerRangoMes(fechaMes);
      if (rangoMes) {
        params.append("fechaDesde", rangoMes.inicio);
        params.append("fechaHasta", rangoMes.fin);
      }
    }
    if (busqueda) params.append("busqueda", busqueda);

    const response = await fetch(`${API_URL}/asistencia/registros?${params.toString()}`, {
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar la lista de reportes.");
    }

    registrosAsistenciaGestion = Array.isArray(data) ? data : [];
    renderTablaReportesConvivenciaGestion(registrosAsistenciaGestion);
    mostrarEstadoReportesConvivenciaGestion(`Se encontraron ${registrosAsistenciaGestion.length} registro(s).`, "green");
  } catch (error) {
    renderTablaReportesConvivenciaGestion([]);
    mostrarEstadoReportesConvivenciaGestion(error.message, "red");
  }
}

function editarReporteConvivenciaDesdeReportes(registroId, estudianteId) {
  const reporte = registrosAsistenciaGestion.find((r) => String(r.registroId) === String(registroId) && String(r.estudianteId) === String(estudianteId));
  if (!reporte) {
    mostrarEstadoReportesConvivenciaGestion("No se encontro el registro seleccionado.", "red");
    return;
  }

  registroAsistenciaEditando = { registroId: String(registroId), estudianteId: String(estudianteId) };
  document.getElementById("edit-rep-fecha").value = formatearFechaParaInput(reporte.fecha) || obtenerFechaHoy();
  document.getElementById("edit-rep-tipo").value = reporte.tipo || "presente";
  document.getElementById("edit-rep-motivo").value = reporte.motivoSalida || "";
  document.getElementById("edit-rep-observacion").value = reporte.observacion || "";
  document.getElementById("edit-rep-estado-msg").textContent = "";
  document.getElementById("edit-rep-estado-msg").className = "text-sm";
  actualizarVisibilidadMotivoEdicion();
  abrirModalEditarReporteConvivenciaGestion();
}

function actualizarVisibilidadMotivoEdicion() {
  const tipo = document.getElementById("edit-rep-tipo")?.value;
  const bloque = document.getElementById("edit-rep-bloque-motivo");
  if (!bloque) return;

  if (tipo === "salida") {
    bloque.classList.remove("hidden");
  } else {
    bloque.classList.add("hidden");
    document.getElementById("edit-rep-motivo").value = "";
  }
}

async function eliminarReporteConvivenciaDesdeReportes(registroId, estudianteId) {
  if (!confirm("Estas seguro de eliminar este registro de asistencia? Esta accion no se puede deshacer.")) return;

  try {
    const response = await fetch(`${API_URL}/asistencia/${estudianteId}/${registroId}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo eliminar el registro.");
    }

    mostrarEstadoReportesConvivenciaGestion("Registro eliminado correctamente.", "green");
    await cargarReportesConvivenciaGestion();
  } catch (error) {
    mostrarEstadoReportesConvivenciaGestion(error.message, "red");
  }
}

async function guardarEdicionReporteConvivenciaGestion(event) {
  event.preventDefault();
  const { registroId, estudianteId } = registroAsistenciaEditando;
  if (!registroId || !estudianteId) return;
  const estadoMsg = document.getElementById("edit-rep-estado-msg");
  const btnGuardar = document.getElementById("btn-guardar-modal-editar-reporte-conv");

  const payload = {
    fecha: document.getElementById("edit-rep-fecha").value,
    tipo: document.getElementById("edit-rep-tipo").value,
    motivoSalida: document.getElementById("edit-rep-motivo").value,
    observacion: document.getElementById("edit-rep-observacion").value.trim()
  };
  if (payload.tipo === "salida" && !payload.observacion) {
    estadoMsg.textContent = "La observación es obligatoria para permisos.";
    estadoMsg.className = "text-sm text-red-600";
    return;
  }
  if (payload.tipo === "salida" && !payload.motivoSalida) {
    estadoMsg.textContent = "Selecciona el motivo del permiso.";
    estadoMsg.className = "text-sm text-red-600";
    return;
  }

  try {
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";
    const response = await fetch(`${API_URL}/asistencia/${estudianteId}/${registroId}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo actualizar el registro.");
    }

    estadoMsg.textContent = "Registro actualizado correctamente.";
    estadoMsg.className = "text-sm text-green-600";
    await cargarReportesConvivenciaGestion();
    setTimeout(() => cerrarModalEditarReporteConvivenciaGestion(), 250);
  } catch (error) {
    estadoMsg.textContent = error.message;
    estadoMsg.className = "text-sm text-red-600";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar Cambios";
  }
}

async function cargarEstadisticas() {
  const fechaInicio = document.getElementById("fecha-inicio").value;
  const fechaFin = document.getElementById("fecha-fin").value;
  
  try {
    const params = new URLSearchParams();
    if (fechaInicio) params.append("fechaInicio", fechaInicio);
    if (fechaFin) params.append("fechaFin", fechaFin);
    
    const response = await fetch(`${API_URL}/reportes/estadisticas?${params}`, {
      headers: getHeaders()
    });
    const stats = await response.json();
    
    document.getElementById("stat-estudiantes").textContent = stats.totalEstudiantes;
    document.getElementById("stat-faltas").textContent = stats.totalFaltas;
    document.getElementById("stat-retardos").textContent = stats.totalRetardos;
    document.getElementById("stat-salidas").textContent = stats.totalSalidas;
    renderSalidasPorMotivo(stats.salidasPorMotivo);
  } catch (error) {
    console.error("Error al cargar estadisticas:", error);
  }
}

function renderSalidasPorMotivo(conteo) {
  const contenedor = document.getElementById("stat-salidas-motivos");
  if (!contenedor) return;

  const datos = conteo || {};
  const tarjetas = MOTIVOS_SALIDA.map((motivo) => `
    <div class="rounded-lg ${motivo.clase} p-3 text-center">
      <div class="text-2xl font-bold">${datos[motivo.valor] ?? 0}</div>
      <div class="text-xs font-medium">${motivo.etiqueta}</div>
    </div>
  `);

  if (datos.sin_especificar) {
    tarjetas.push(`
      <div class="rounded-lg bg-slate-100 text-slate-500 p-3 text-center">
        <div class="text-2xl font-bold">${datos.sin_especificar}</div>
        <div class="text-xs font-medium">Sin especificar</div>
      </div>
    `);
  }

  contenedor.innerHTML = tarjetas.join("");
}

async function cargarReporteGrupo() {
  const fechaInicio = document.getElementById("fecha-inicio").value;
  const fechaFin = document.getElementById("fecha-fin").value;
  
  try {
    const params = new URLSearchParams();
    if (fechaInicio) params.append("fechaInicio", fechaInicio);
    if (fechaFin) params.append("fechaFin", fechaFin);
    
    const response = await fetch(`${API_URL}/reportes/por-grupo?${params}`, {
      headers: getHeaders()
    });
    const grupos = await response.json();
    
    const tbody = document.getElementById("reporte-grupo");
    tbody.innerHTML = "";
    
    grupos.forEach(g => {
      const tr = document.createElement("tr");
      tr.className = "border-b hover:bg-slate-50";
      tr.innerHTML = `
        <td class="px-4 py-2">${formatearGrado(g.grado)}</td>
        <td class="px-4 py-2">${normalizarGrupo(g.grupo)}</td>
        <td class="px-4 py-2 text-center">${g.totalEstudiantes}</td>
        <td class="px-4 py-2 text-center text-red-600 font-medium">${g.totalFaltas}</td>
        <td class="px-4 py-2 text-center text-yellow-600 font-medium">${g.totalRetardos}</td>
        <td class="px-4 py-2 text-center text-purple-600 font-medium">${g.totalSalidas}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error al cargar reporte por grupo:", error);
  }
}

async function cargarReporteGeneral() {
  const grado = document.getElementById("reporte-grado").value;
  const fechaInicio = document.getElementById("fecha-inicio").value;
  const fechaFin = document.getElementById("fecha-fin").value;
  
  try {
    const params = new URLSearchParams();
    if (grado) params.append("grado", grado);
    if (fechaInicio) params.append("fechaInicio", fechaInicio);
    if (fechaFin) params.append("fechaFin", fechaFin);
    
    const response = await fetch(`${API_URL}/reportes/general?${params}`, {
      headers: getHeaders()
    });
    const reporte = await response.json();
    
    const tbody = document.getElementById("reporte-general");
    tbody.innerHTML = "";
    
    reporte.forEach(r => {
      const tr = document.createElement("tr");
      tr.className = "border-b hover:bg-slate-50";
      tr.innerHTML = `
        <td class="px-4 py-2">${r.nombre}</td>
        <td class="px-4 py-2">${formatearGrado(r.grado)}</td>
        <td class="px-4 py-2">${normalizarGrupo(r.grupo)}</td>
        <td class="px-4 py-2 text-center text-red-600 font-medium">${r.faltas}</td>
        <td class="px-4 py-2 text-center text-yellow-600 font-medium">${r.retardos}</td>
        <td class="px-4 py-2 text-center text-purple-600 font-medium">${r.salidas}</td>
        <td class="px-4 py-2 text-center font-bold">${r.total}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error al cargar reporte general:", error);
  }
}

function exportarReporte() {
  const rows = document.querySelectorAll("#reporte-general tr");
  if (rows.length === 0) {
    alert("No hay datos para exportar");
    return;
  }
  
  let csv = "Nombre,Grado,Grupo,Faltas,Retardos,Permisos,Total\n";
  
  rows.forEach(row => {
    const cols = row.querySelectorAll("td");
    const rowData = Array.from(cols).map(col => col.textContent).join(",");
    csv += rowData + "\n";
  });
  
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `reporte_asistencia_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

// ==================== AÑO LECTIVO ====================
function setupAnioLectivo() {
  const btnSimular = document.getElementById("btn-simular-promocion");
  if (!btnSimular) return;

  btnSimular.addEventListener("click", simularPromocion);
  document.getElementById("btn-ejecutar-promocion").addEventListener("click", abrirModalConfirmarPromocion);
  document.getElementById("btn-cerrar-confirmar-promocion").addEventListener("click", cerrarModalConfirmarPromocion);
  document.getElementById("btn-cancelar-confirmar-promocion").addEventListener("click", cerrarModalConfirmarPromocion);
  document.getElementById("btn-confirmar-promocion").addEventListener("click", ejecutarPromocion);
  document.getElementById("btn-recargar-anios").addEventListener("click", cargarAniosLectivos);
  document.getElementById("btn-cargar-archivo").addEventListener("click", cargarArchivoEstudiantes);
  document.getElementById("btn-exportar-archivo").addEventListener("click", exportarArchivoCsv);
  document.getElementById("btn-cerrar-perfil-archivado").addEventListener("click", cerrarModalPerfilArchivado);
  document.getElementById("archivo-anio").addEventListener("change", cargarArchivoEstudiantes);
  document.getElementById("archivo-grado").addEventListener("change", cargarArchivoEstudiantes);
  document.getElementById("archivo-grupo").addEventListener("change", cargarArchivoEstudiantes);
  document.getElementById("archivo-busqueda").addEventListener("input", cargarArchivoEstudiantes);
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarEstadoAnioLectivo(mensaje, color = "slate") {
  const estado = document.getElementById("anio-lectivo-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm mb-4 text-${color}-600`;
}

function mostrarEstadoArchivo(mensaje, color = "slate") {
  const estado = document.getElementById("archivo-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `text-sm mb-3 text-${color}-600`;
}

async function cargarAniosLectivos() {
  if (usuarioActual?.rol !== "admin") return;

  try {
    const response = await fetch(`${API_URL}/anios-lectivos`, { headers: getHeaders() });
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar los años lectivos.");
    }

    aniosLectivosData = data;
    renderResumenAniosLectivos(data);

    const inputArchivar = document.getElementById("anio-archivar");
    const inputNuevo = document.getElementById("anio-nuevo");
    if (inputArchivar && !inputArchivar.value) {
      inputArchivar.value = data.anioActivo || data.sugerencia?.anioActual || "";
    }
    if (inputNuevo && !inputNuevo.value) {
      const base = Number(String(inputArchivar?.value || "").split("-")[1]);
      inputNuevo.value = Number.isFinite(base)
        ? `${base}-${base + 1}`
        : (data.sugerencia?.anioNuevo || "");
    }

    const selectAnio = document.getElementById("archivo-anio");
    if (selectAnio) {
      const seleccionPrevia = selectAnio.value;
      const archivados = Array.isArray(data.archivados) ? data.archivados : [];
      selectAnio.innerHTML = archivados.length
        ? archivados.map((item) => `<option value="${escaparHtml(item.anio)}">${escaparHtml(item.anio)} (${item.totalEstudiantes} estudiantes)</option>`).join("")
        : '<option value="">No hay años archivados todavía</option>';

      if (seleccionPrevia && archivados.some((item) => item.anio === seleccionPrevia)) {
        selectAnio.value = seleccionPrevia;
      }
      if (selectAnio.value) {
        cargarArchivoEstudiantes();
      } else {
        archivoEstudiantesActual = [];
        renderTablaArchivo([]);
        mostrarEstadoArchivo("Todavía no hay años archivados. El primer archivo se crea al cerrar el año.", "slate");
      }
    }
  } catch (error) {
    mostrarEstadoAnioLectivo(error.message, "red");
  }
}

function renderResumenAniosLectivos(data) {
  const contenedor = document.getElementById("anios-lectivos-resumen");
  if (!contenedor) return;

  const tarjetas = [
    `<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
       <p class="text-xs uppercase text-blue-700 font-semibold">Año en curso</p>
       <p class="text-2xl font-bold text-blue-800">${escaparHtml(data.anioActivo || "-")}</p>
       <p class="text-sm text-blue-700">${data.totalEstudiantesActivos ?? 0} estudiantes activos</p>
     </div>`
  ];

  (data.archivados || []).forEach((item) => {
    const fecha = item.fechaArchivado ? new Date(item.fechaArchivado).toLocaleDateString() : "-";
    tarjetas.push(`
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs uppercase text-slate-500 font-semibold">Archivado</p>
        <p class="text-2xl font-bold text-slate-800">${escaparHtml(item.anio)}</p>
        <p class="text-sm text-slate-600">${item.totalEstudiantes} estudiantes · ${item.totalRegistrosAsistencia || 0} registros</p>
        <p class="text-xs text-slate-500">Cerrado el ${fecha}${item.archivadoPor ? ` por ${escaparHtml(item.archivadoPor)}` : ""}</p>
      </div>
    `);
  });

  contenedor.innerHTML = tarjetas.join("");
}

async function simularPromocion() {
  if (usuarioActual?.rol !== "admin") return;

  mostrarEstadoAnioLectivo("Calculando simulación...", "slate");
  try {
    const response = await fetch(`${API_URL}/anios-lectivos/promocion/preview`, { headers: getHeaders() });
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudo generar la simulación.");
    }

    renderSimulacionPromocion(data);
    mostrarEstadoAnioLectivo(
      `Simulación lista: ${data.promovidos} estudiante(s) pasan de grado y ${data.graduados} se gradúan de 11°. Nada se ha modificado todavía.`,
      "blue"
    );
  } catch (error) {
    mostrarEstadoAnioLectivo(error.message, "red");
  }
}

function renderSimulacionPromocion(plan) {
  const contenedor = document.getElementById("promocion-simulacion");
  if (!contenedor) return;

  const filas = (plan.movimientos || []).map((item) => {
    const grupos = Object.entries(item.grupos || {})
      .map(([grupo, total]) => `${grupo}: ${total}`)
      .join(" · ");
    let destino = "";
    let clase = "text-slate-700";
    if (item.motivo === "graduado") {
      destino = "Se gradúan (salen de la lista activa)";
      clase = "text-purple-700 font-semibold";
    } else if (item.motivo === "promovido") {
      destino = `Pasan a ${formatearGrado(item.destino)}`;
      clase = "text-green-700 font-semibold";
    } else {
      destino = "Sin grado válido: quedan igual, revísalos";
      clase = "text-red-700 font-semibold";
    }

    return `
      <tr class="border-b">
        <td class="px-3 py-2 font-medium">${escaparHtml(formatearGrado(item.grado))}</td>
        <td class="px-3 py-2 text-center">${item.totalEstudiantes}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${escaparHtml(grupos)}</td>
        <td class="px-3 py-2 ${clase}">${escaparHtml(destino)}</td>
      </tr>
    `;
  }).join("");

  const avisoSinGrado = (plan.sinGrado || []).length
    ? `<p class="mt-3 text-sm text-red-700"><i class="fas fa-circle-exclamation mr-1"></i>${plan.sinGrado.length} estudiante(s) sin grado válido no se van a promover: ${escaparHtml(plan.sinGrado.slice(0, 5).map((e) => e.nombre).join(", "))}${plan.sinGrado.length > 5 ? "..." : ""}</p>`
    : "";

  const avisoArchivo = plan.yaExisteArchivo
    ? `<p class="mt-3 text-sm text-amber-700"><i class="fas fa-triangle-exclamation mr-1"></i>Ya existe un archivo para ${escaparHtml(plan.sugerencia?.anioActual || "")}. Cambia el año a archivar si vas a cerrar otro año.</p>`
    : "";

  contenedor.innerHTML = `
    <p class="font-semibold mb-3">Simulación (todavía no se guarda nada)</p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-3 py-2 text-left">Grado actual</th>
            <th class="px-3 py-2 text-center">Estudiantes</th>
            <th class="px-3 py-2 text-left">Grupos</th>
            <th class="px-3 py-2 text-left">Qué pasa al cerrar el año</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="4" class="px-3 py-4 text-center text-slate-500">No hay estudiantes activos.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="mt-3 text-sm text-slate-600">
      Se archivarán ${plan.totalEstudiantes} estudiante(s), ${plan.totalRegistrosAsistencia || 0} registro(s) de asistencia
      y ${plan.totalReportesConvivencia || 0} reporte(s) de convivencia.
    </p>
    ${avisoSinGrado}
    ${avisoArchivo}
  `;
  contenedor.classList.remove("hidden");
}

function abrirModalConfirmarPromocion() {
  const anioArchivar = document.getElementById("anio-archivar")?.value.trim() || "";
  const anioNuevo = document.getElementById("anio-nuevo")?.value.trim() || "";

  if (!/^\d{4}-\d{4}$/.test(anioArchivar) || !/^\d{4}-\d{4}$/.test(anioNuevo)) {
    mostrarEstadoAnioLectivo("Escribe los dos años en formato AAAA-AAAA (ejemplo: 2025-2026 y 2026-2027).", "red");
    return;
  }

  const detalle = document.getElementById("confirmar-promocion-detalle");
  if (detalle) {
    detalle.innerHTML = `
      <p class="mb-2">Vas a cerrar el año <strong>${escaparHtml(anioArchivar)}</strong> y abrir <strong>${escaparHtml(anioNuevo)}</strong>.</p>
      <ul class="list-disc ml-5 space-y-1">
        <li>Se guarda una copia completa de ${escaparHtml(anioArchivar)} (consultable después).</li>
        <li>Todos suben un grado: 6°&rarr;7°, 7°&rarr;8°, 8°&rarr;9°, 9°&rarr;10°, 10°&rarr;11°.</li>
        <li>Los de 11° se gradúan y salen de la lista activa.</li>
        <li>6° queda vacío para los que llegan de 5°.</li>
        <li>La asistencia del año viejo se limpia en la lista activa.</li>
      </ul>
      <p class="mt-2 font-semibold text-red-700">Esta acción no se puede deshacer desde la aplicación.</p>
    `;
  }

  const texto = document.getElementById("confirmar-promocion-texto");
  if (texto) texto.value = "";
  const estado = document.getElementById("confirmar-promocion-estado");
  if (estado) {
    estado.textContent = "";
    estado.className = "text-sm mb-3";
  }

  document.getElementById("modal-confirmar-promocion").classList.remove("hidden");
}

function cerrarModalConfirmarPromocion() {
  document.getElementById("modal-confirmar-promocion").classList.add("hidden");
}

async function ejecutarPromocion() {
  const anioArchivar = document.getElementById("anio-archivar")?.value.trim() || "";
  const anioNuevo = document.getElementById("anio-nuevo")?.value.trim() || "";
  const confirmacion = (document.getElementById("confirmar-promocion-texto")?.value || "").trim().toUpperCase();
  const estado = document.getElementById("confirmar-promocion-estado");
  const boton = document.getElementById("btn-confirmar-promocion");

  const mostrarEstadoConfirmacion = (mensaje, color) => {
    if (!estado) return;
    estado.textContent = mensaje;
    estado.className = `text-sm mb-3 text-${color}-600`;
  };

  if (confirmacion !== "PROMOVER") {
    mostrarEstadoConfirmacion("Escribe PROMOVER para confirmar.", "red");
    return;
  }

  if (boton) {
    boton.disabled = true;
    boton.classList.add("opacity-60");
  }
  mostrarEstadoConfirmacion("Archivando el año y promoviendo estudiantes. No cierres la ventana...", "slate");

  try {
    const response = await fetch(`${API_URL}/anios-lectivos/promocion`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ anioLectivo: anioArchivar, anioNuevo, confirmacion: "PROMOVER" })
    });
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudo completar el cierre de año.");
    }

    cerrarModalConfirmarPromocion();
    mostrarToastGlobal(data.message || "Año archivado correctamente.", "success");

    const pendientes = (data.sinPromover || []).length
      ? ` ${data.sinPromover.length} estudiante(s) quedaron sin promover por no tener grado válido.`
      : "";
    mostrarEstadoAnioLectivo(
      `Listo: ${data.totalArchivados} estudiante(s) archivados en ${data.anioArchivado}, ` +
      `${data.promovidos} promovidos y ${data.graduados} graduados de 11°. ` +
      `6° quedó con ${data.estudiantesEnSexto} estudiante(s), listo para importar a los de 5°.${pendientes}`,
      "green"
    );

    document.getElementById("promocion-simulacion")?.classList.add("hidden");
    await cargarAniosLectivos();
    await cargarEstudiantes();
    await cargarEstadisticas();
  } catch (error) {
    mostrarEstadoConfirmacion(error.message, "red");
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove("opacity-60");
    }
  }
}

async function cargarArchivoEstudiantes() {
  if (usuarioActual?.rol !== "admin") return;

  const anio = document.getElementById("archivo-anio")?.value || "";
  if (!anio) {
    archivoEstudiantesActual = [];
    renderTablaArchivo([]);
    return;
  }

  const params = new URLSearchParams();
  const grado = document.getElementById("archivo-grado")?.value || "";
  const grupo = document.getElementById("archivo-grupo")?.value || "";
  const busqueda = document.getElementById("archivo-busqueda")?.value.trim() || "";
  if (grado) params.append("grado", grado);
  if (grupo) params.append("grupo", grupo);
  if (busqueda) params.append("busqueda", busqueda);

  mostrarEstadoArchivo("Consultando archivo...", "slate");

  try {
    const response = await fetch(`${API_URL}/anios-lectivos/${encodeURIComponent(anio)}/estudiantes?${params.toString()}`, {
      headers: getHeaders()
    });
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudo consultar el archivo.");
    }

    archivoAnioActual = data.anio || anio;
    archivoEstudiantesActual = Array.isArray(data.estudiantes) ? data.estudiantes : [];
    renderTablaArchivo(archivoEstudiantesActual);
    mostrarEstadoArchivo(`Año ${archivoAnioActual}: ${data.total} estudiante(s) encontrados.`, "slate");
  } catch (error) {
    archivoEstudiantesActual = [];
    renderTablaArchivo([]);
    mostrarEstadoArchivo(error.message, "red");
  }
}

function renderTablaArchivo(lista) {
  const tabla = document.getElementById("tabla-archivo");
  if (!tabla) return;

  if (!lista.length) {
    tabla.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-500">Sin estudiantes para mostrar.</td></tr>';
    return;
  }

  tabla.innerHTML = lista.map((estudiante) => `
    <tr class="border-b hover:bg-slate-50">
      <td class="px-4 py-2">
        ${escaparHtml(estudiante.nombre)}
        ${estudiante.graduado ? '<span class="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Graduado</span>' : ""}
      </td>
      <td class="px-4 py-2">${escaparHtml(estudiante.identificacion)}</td>
      <td class="px-4 py-2">${escaparHtml(formatearGrado(estudiante.grado))}</td>
      <td class="px-4 py-2">${escaparHtml(estudiante.grupo)}</td>
      <td class="px-4 py-2 text-center text-green-700">${estudiante.presentes}</td>
      <td class="px-4 py-2 text-center text-red-700">${estudiante.faltas}</td>
      <td class="px-4 py-2 text-center text-yellow-700">${estudiante.retardos}</td>
      <td class="px-4 py-2 text-center text-purple-700">${estudiante.salidas}</td>
      <td class="px-4 py-2 text-center">${estudiante.totalReportesConvivencia}</td>
      <td class="px-4 py-2 text-center">
        <button data-archivo-id="${escaparHtml(estudiante.id)}" class="btn-ver-archivo text-blue-600 hover:text-blue-800" title="Ver historial">
          <i class="fas fa-eye"></i>
        </button>
      </td>
    </tr>
  `).join("");

  tabla.querySelectorAll(".btn-ver-archivo").forEach((boton) => {
    boton.addEventListener("click", () => verPerfilArchivado(boton.dataset.archivoId));
  });
}

async function verPerfilArchivado(estudianteId) {
  if (!archivoAnioActual || !estudianteId) return;

  const contenedor = document.getElementById("perfil-archivado-contenido");
  const titulo = document.getElementById("perfil-archivado-titulo");
  if (contenedor) contenedor.innerHTML = '<p class="text-slate-500">Cargando...</p>';
  document.getElementById("modal-perfil-archivado").classList.remove("hidden");

  try {
    const response = await fetch(
      `${API_URL}/anios-lectivos/${encodeURIComponent(archivoAnioActual)}/estudiantes/${estudianteId}`,
      { headers: getHeaders() }
    );
    if (manejarErrorAutenticacion(response)) return;
    const data = await leerJsonSeguro(response);
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el historial archivado.");
    }

    const est = data.estudiante || {};
    const resumen = data.resumenAsistencia || {};
    if (titulo) {
      titulo.textContent = `${est.nombre || "-"} · ${formatearGrado(est.grado)} ${est.grupo || ""} · ${data.anioLectivo}`;
    }

    const filasHistorial = (data.historial || []).map((registro) => `
      <tr class="border-b">
        <td class="px-3 py-2">${registro.fecha ? new Date(registro.fecha).toLocaleDateString() : "-"}</td>
        <td class="px-3 py-2">${escaparHtml(formatearTipoConMotivo(registro.tipo, registro.motivoSalida))}</td>
        <td class="px-3 py-2">${escaparHtml(registro.hora || "-")}</td>
        <td class="px-3 py-2">${escaparHtml(registro.observacion || "-")}</td>
        <td class="px-3 py-2">${escaparHtml(registro.registradoPor || "-")}</td>
      </tr>
    `).join("");

    const filasConvivencia = (data.reportesConvivencia || []).map((reporte) => `
      <tr class="border-b">
        <td class="px-3 py-2">${reporte.fecha ? new Date(reporte.fecha).toLocaleDateString() : "-"}</td>
        <td class="px-3 py-2">${escaparHtml(reporte.categoria || "-")}</td>
        <td class="px-3 py-2 ${obtenerClaseGravedadConvivencia(reporte.gravedad)}">${escaparHtml(formatearGravedadConvivencia(reporte.gravedad))}</td>
        <td class="px-3 py-2">${escaparHtml(reporte.estado || "-")}</td>
        <td class="px-3 py-2">${escaparHtml(reporte.descripcion || "-")}</td>
      </tr>
    `).join("");

    contenedor.innerHTML = `
      <div class="rounded-lg border border-slate-200 p-4 bg-slate-50">
        <p><strong>Identificación:</strong> ${escaparHtml(est.identificacion || "-")}</p>
        <p><strong>Grado y grupo en ${escaparHtml(data.anioLectivo)}:</strong> ${escaparHtml(formatearGrado(est.grado))} ${escaparHtml(est.grupo || "")}</p>
        <p><strong>Al cerrar el año:</strong> ${est.graduado ? "Graduado de 11°" : `Pasó a ${escaparHtml(formatearGrado(est.gradoSiguiente))}`}</p>
        <p><strong>Acudiente:</strong> ${escaparHtml(est.padre?.nombre || est.madre?.nombre || est.tutor?.nombre || "No registrado")}</p>
        <p><strong>Teléfono:</strong> ${escaparHtml(est.telefono || est.padre?.telefono || est.madre?.telefono || "-")}</p>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-lg border p-3 text-center"><p class="text-xs text-slate-500">Presentes</p><p class="text-xl font-bold text-green-700">${resumen.presentes ?? 0}</p></div>
        <div class="rounded-lg border p-3 text-center"><p class="text-xs text-slate-500">Faltas</p><p class="text-xl font-bold text-red-700">${resumen.faltas ?? 0}</p></div>
        <div class="rounded-lg border p-3 text-center"><p class="text-xs text-slate-500">Retardos</p><p class="text-xl font-bold text-yellow-700">${resumen.retardos ?? 0}</p></div>
        <div class="rounded-lg border p-3 text-center"><p class="text-xs text-slate-500">Permisos</p><p class="text-xl font-bold text-purple-700">${resumen.salidas ?? 0}</p></div>
      </div>

      ${construirDesglosePermisosHTML(resumen.salidasPorMotivo)}

      <div>
        <h3 class="font-semibold mb-2">Historial de asistencia (${(data.historial || []).length})</h3>
        <div class="overflow-x-auto max-h-64 overflow-y-auto border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">Fecha</th>
                <th class="px-3 py-2 text-left">Tipo</th>
                <th class="px-3 py-2 text-left">Hora</th>
                <th class="px-3 py-2 text-left">Observación</th>
                <th class="px-3 py-2 text-left">Registró</th>
              </tr>
            </thead>
            <tbody>${filasHistorial || '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">Sin registros.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 class="font-semibold mb-2">Reportes de convivencia (${(data.reportesConvivencia || []).length})</h3>
        <div class="overflow-x-auto max-h-64 overflow-y-auto border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">Fecha</th>
                <th class="px-3 py-2 text-left">Categoría</th>
                <th class="px-3 py-2 text-left">Gravedad</th>
                <th class="px-3 py-2 text-left">Estado</th>
                <th class="px-3 py-2 text-left">Descripción</th>
              </tr>
            </thead>
            <tbody>${filasConvivencia || '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">Sin reportes.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    if (contenedor) {
      contenedor.innerHTML = `<p class="text-red-600">${escaparHtml(error.message)}</p>`;
    }
  }
}

function cerrarModalPerfilArchivado() {
  document.getElementById("modal-perfil-archivado").classList.add("hidden");
}

function exportarArchivoCsv() {
  if (!archivoEstudiantesActual.length) {
    mostrarEstadoArchivo("No hay datos para exportar.", "red");
    return;
  }

  const encabezado = "Nombre,Identificacion,Grado,Grupo,Presentes,Faltas,Retardos,Permisos,ReportesConvivencia,Graduado\n";
  const filas = archivoEstudiantesActual.map((estudiante) => [
    `"${String(estudiante.nombre || "").replace(/"/g, '""')}"`,
    estudiante.identificacion || "",
    estudiante.grado || "",
    estudiante.grupo || "",
    estudiante.presentes,
    estudiante.faltas,
    estudiante.retardos,
    estudiante.salidas,
    estudiante.totalReportesConvivencia,
    estudiante.graduado ? "SI" : "NO"
  ].join(",")).join("\n");

  const blob = new Blob([`﻿${encabezado}${filas}`], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `archivo_${archivoAnioActual}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
