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
let registrosAsistenciaGestion = [];
let registroAsistenciaEditando = { registroId: "", estudianteId: "" };

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
}

// ==================== AUTENTICACION ====================
function mostrarLogin() {
  document.getElementById("login-page").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
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

  const btnImportarCsv = document.getElementById("btn-importar-csv");
  if (btnImportarCsv) {
    if (usuarioActual?.rol === "admin") {
      btnImportarCsv.classList.remove("hidden");
    } else {
      btnImportarCsv.classList.add("hidden");
    }
  }
  cargarEstudiantes();
  cargarEstadisticas();
  cambiarVista("salones");
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const errorMsg = document.getElementById("login-error");
  
  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Error al iniciar sesion");
    }
    
    authToken = data.token;
    usuarioActual = data.usuario;
    
    localStorage.setItem("token", authToken);
    localStorage.setItem("usuario", JSON.stringify(usuarioActual));
    
    errorMsg.classList.add("hidden");
    mostrarApp();
  } catch (error) {
    errorMsg.textContent = error.message;
    errorMsg.classList.remove("hidden");
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
  } else if (vista === "usuarios") {
    cargarUsuarios();
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
    const hora = document.getElementById("hora").value;
    const observacion = document.getElementById("observacion").value;
    const fotoUrl = previewImg.src || "";
    
    try {
      await registrarAsistencia({
        estudianteId: estudianteSeleccionado._id,
        fecha: construirFechaAsistenciaISO(fecha, hora),
        tipo,
        hora,
        observacion,
        fotoUrl
      });
      
      mostrarEstado("Asistencia registrada correctamente.", "green");
      form.reset();
      preview.classList.add("hidden");
      previewImg.src = "";
    } catch (error) {
      mostrarEstado(error.message, "red");
    }
  });
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
  const inputHora = document.getElementById("salon-hora");

  if (inputFecha && !inputFecha.value) {
    inputFecha.value = obtenerFechaHoy();
  }
  if (inputHora && !inputHora.value) {
    inputHora.value = obtenerHoraActual();
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
    });
  });
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
    tbody.innerHTML = "<tr><td colspan='5' class='px-4 py-4 text-center text-slate-500'>No hay estudiantes en este salon.</td></tr>";
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
      <td class="px-4 py-2">
        <input type="text" class="salon-observacion w-full border border-slate-300 rounded-lg px-3 py-1" placeholder="Observacion (opcional)">
      </td>
    `;
    tbody.appendChild(tr);

    const checkbox = tr.querySelector(".salon-check");
    const tipo = tr.querySelector(".salon-tipo");
    tipo.value = tipoPorDefecto;
    checkbox.addEventListener("change", sincronizarCheckboxGeneralSalon);
  });
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
  const hora = document.getElementById("salon-hora").value || obtenerHoraActual();
  const fecha = construirFechaAsistenciaISO(fechaSeleccionada, hora);

  const peticiones = filasObjetivo.map((fila) => {
    const tipo = fila.querySelector(".salon-tipo").value;
    const observacion = fila.querySelector(".salon-observacion").value.trim();

    return registrarAsistencia({
      estudianteId: fila.dataset.estudianteId,
      fecha,
      tipo,
      hora,
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

  if (exitosos && !fallidos) {
    mostrarEstadoSalon(`Se registraron ${exitosos} asistencia(s) correctamente.`, "green");
    return;
  }

  if (exitosos && fallidos) {
    const primerError = resultados.find((resultado) => resultado.status === "rejected");
    const detalle = primerError?.reason?.message ? ` Primer error: ${primerError.reason.message}` : "";
    mostrarEstadoSalon(`Registrados: ${exitosos}. Fallidos: ${fallidos}.${detalle}`, "yellow");
    return;
  }

  const primerError = resultados.find((resultado) => resultado.status === "rejected");
  const detalle = primerError?.reason?.message || "No se pudo registrar asistencia.";
  mostrarEstadoSalon(detalle, "red");
}

function mostrarEstadoSalon(mensaje, color) {
  const estado = document.getElementById("salon-estado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `mt-3 text-sm text-${color}-600`;
}

function obtenerHoraActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
}

function obtenerFechaHoy() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function construirFechaAsistenciaISO(fecha, hora) {
  if (!fecha) {
    return new Date().toISOString();
  }

  const horaNormalizada = hora || "00:00";
  const fechaHoraLocal = new Date(`${fecha}T${horaNormalizada}:00`);
  if (!Number.isNaN(fechaHoraLocal.getTime())) {
    return fechaHoraLocal.toISOString();
  }

  return new Date().toISOString();
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
          <td class="px-4 py-2 font-medium ${tipoColor}">${formatearTipoAsistencia(h.tipo)}</td>
          <td class="px-4 py-2">${h.hora || "-"}</td>
          <td class="px-4 py-2">${h.observacion || "-"}</td>
          <td class="px-4 py-2 text-sm text-slate-500">${h.registradoPor || "-"}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = "<tr><td colspan='5' class='px-4 py-4 text-center text-slate-500'>No hay registros de asistencia</td></tr>";
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

  if (!form || !selectRol || !btnRecargar) return;

  form.addEventListener("submit", guardarUsuario);
  selectRol.addEventListener("change", actualizarFormularioUsuarioSegunRol);
  btnRecargar.addEventListener("click", cargarUsuarios);
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
  document.getElementById("reportes-conv-fecha-desde").addEventListener("change", cargarReportesConvivenciaGestion);
  document.getElementById("reportes-conv-fecha-hasta").addEventListener("change", cargarReportesConvivenciaGestion);

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
  const tbody = document.getElementById("tabla-reportes-conv");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!reportes.length) {
    tbody.innerHTML = "<tr><td colspan='9' class='px-4 py-4 text-center text-slate-500'>No hay registros de asistencia para los filtros aplicados.</td></tr>";
    return;
  }

  reportes.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-slate-50";
    tr.innerHTML = `
      <td class="px-4 py-2">${r.fecha ? new Date(r.fecha).toLocaleDateString() : "-"}</td>
      <td class="px-4 py-2">${r.hora || "-"}</td>
      <td class="px-4 py-2">${r.estudianteNombre || "-"}</td>
      <td class="px-4 py-2">${formatearGrado(r.grado)}</td>
      <td class="px-4 py-2">${normalizarGrupo(r.grupo)}</td>
      <td class="px-4 py-2">${formatearTipoAsistencia(r.tipo)}</td>
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
    `;
    tbody.appendChild(tr);
  });
}

async function cargarReportesConvivenciaGestion() {
  try {
    const params = new URLSearchParams();
    const grado = document.getElementById("reportes-conv-grado").value;
    const grupo = document.getElementById("reportes-conv-grupo").value;
    const tipo = document.getElementById("reportes-conv-estado-filtro").value;
    const fechaDesde = document.getElementById("reportes-conv-fecha-desde").value;
    const fechaHasta = document.getElementById("reportes-conv-fecha-hasta").value;
    const busqueda = document.getElementById("reportes-conv-busqueda").value.trim();

    if (grado) params.append("grado", grado);
    if (grupo) params.append("grupo", grupo);
    if (tipo) params.append("tipo", tipo);
    if (fechaDesde) params.append("fechaDesde", fechaDesde);
    if (fechaHasta) params.append("fechaHasta", fechaHasta);
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
  document.getElementById("edit-rep-hora").value = reporte.hora || "";
  document.getElementById("edit-rep-observacion").value = reporte.observacion || "";
  document.getElementById("edit-rep-estado-msg").textContent = "";
  document.getElementById("edit-rep-estado-msg").className = "text-sm";
  abrirModalEditarReporteConvivenciaGestion();
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

  const payload = {
    fecha: document.getElementById("edit-rep-fecha").value,
    tipo: document.getElementById("edit-rep-tipo").value,
    hora: document.getElementById("edit-rep-hora").value,
    observacion: document.getElementById("edit-rep-observacion").value.trim()
  };

  const estadoMsg = document.getElementById("edit-rep-estado-msg");
  const btnGuardar = document.getElementById("btn-guardar-modal-editar-reporte-conv");
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
  } catch (error) {
    console.error("Error al cargar estadisticas:", error);
  }
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
