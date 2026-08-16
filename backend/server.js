require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const {
  REQUIRED_HEADERS,
  parseCsv,
  buildStudentFromRow
} = require("./utils/estudiantesCsv");
const {
  GRADO_FINAL_BACHILLERATO,
  normalizeGrade,
  normalizeGroup,
  normalizeSchoolYear,
  isConsecutiveSchoolYear,
  sugerirAniosLectivos,
  calcularGradoSiguiente,
  construirPlanPromocion,
  contarRegistrosArchivo
} = require("./utils/anioLectivo");

// Logger simple para operaciones críticas
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()}: ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()}: ${msg}`)
};

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "secreto_super_seguro_2024";
const SCHOOL_HOLIDAYS = process.env.SCHOOL_HOLIDAYS || "";
// Colombia es UTC-5: sin este ajuste la "hora limite" se evaluaria con la hora de Londres.
const SCHOOL_UTC_OFFSET_HOURS = Number.isFinite(Number(process.env.SCHOOL_UTC_OFFSET_HOURS))
  ? Number(process.env.SCHOOL_UTC_OFFSET_HOURS)
  : -5;
// Plazo diario para subir la asistencia del dia.
const SCHOOL_CUTOFF_TIME = process.env.SCHOOL_CUTOFF_TIME || "16:00";
const MONGODB_SERVER_SELECTION_TIMEOUT_MS = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000);
const STARTUP_STUDENT_BACKUP = process.env.STARTUP_STUDENT_BACKUP === "true";

// Configuración de CORS
const normalizeOrigin = (origin) => String(origin || "").trim().replace(/\/+$/, "");

const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((value) => value.trim())
];

const allowedOrigins = new Set(
  configuredOrigins
    .filter(Boolean)
    .map((value) => normalizeOrigin(value))
);

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== "false";

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;

  // Permite previews de Vercel para evitar bloqueos por dominio dinamico.
  if (allowVercelPreviews && /\.vercel\.app$/i.test(normalized)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, "..", "frontend", "public");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ============ MODELOS ============

// Schema de Usuario
const usuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nombre: { type: String, required: true },
  rol: { type: String, enum: ["admin", "profesor"], default: "profesor" },
  gradoAsignado: { type: String, default: "" },
  grupoAsignado: { type: String, default: "" },
  fechaCreacion: { type: Date, default: Date.now }
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

// Schema de Estudiante (actualizado con datos de padres)
const estudianteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  grado: { type: String, required: true },
  grupo: { type: String, required: true },
  identificacion: { type: String, required: true, unique: true },
  fechaNacimiento: { type: Date },
  direccion: { type: String },
  telefono: { type: String },
  email: { type: String },
  
  // Datos del padre/madre/tutor
  padre: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    ocupacion: { type: String }
  },
  madre: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    ocupacion: { type: String }
  },
  tutor: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    parentesco: { type: String }
  },
  
  historial: [
    {
      fecha: { type: Date, required: true },
      tipo: { type: String, enum: ["presente", "falta", "retardo", "salida"], required: true },
      // Solo aplica cuando tipo === "salida" (permiso de salida).
      motivoSalida: {
        type: String,
        enum: ["", "deportivo", "enfermedad", "cita_medica", "familiar", "otro"],
        default: ""
      },
      hora: { type: String },
      observacion: { type: String },
      fotoUrl: { type: String },
      registradoPor: { type: String }
    }
  ],
  reportesConvivencia: [
    {
      fecha: { type: Date, required: true },
      categoria: {
        type: String,
        enum: ["convivencia", "disciplinario", "acoso", "agresion", "otro"],
        default: "convivencia"
      },
      gravedad: { type: String, enum: ["tipo1", "tipo2", "tipo3", "baja", "media", "alta"], default: "tipo2" },
      estado: { type: String, enum: ["abierto", "en seguimiento", "cerrado"], default: "abierto" },
      descripcion: { type: String, required: true },
      acciones: { type: String },
      registradoPor: { type: String }
    }
  ]
}, { timestamps: true });

const Estudiante = mongoose.model("Estudiante", estudianteSchema);

// Schema de Año Lectivo (control del cierre y archivo de cada año)
const anioLectivoSchema = new mongoose.Schema({
  anio: { type: String, required: true, unique: true },
  estado: { type: String, enum: ["activo", "archivado"], default: "activo" },
  fechaArchivado: { type: Date },
  archivadoPor: { type: String, default: "" },
  totalEstudiantes: { type: Number, default: 0 },
  totalRegistrosAsistencia: { type: Number, default: 0 },
  totalReportesConvivencia: { type: Number, default: 0 },
  graduados: { type: Number, default: 0 },
  promovidos: { type: Number, default: 0 }
}, { timestamps: true });

const AnioLectivo = mongoose.model("AnioLectivo", anioLectivoSchema);

// Schema de Estudiante Archivado (foto congelada del estudiante al cerrar el año)
const estudianteArchivadoSchema = new mongoose.Schema({
  anioLectivo: { type: String, required: true },
  estudianteOriginalId: { type: mongoose.Schema.Types.ObjectId },
  nombre: { type: String, required: true },
  grado: { type: String, default: "" },
  grupo: { type: String, default: "" },
  identificacion: { type: String, default: "" },
  fechaNacimiento: { type: Date },
  direccion: { type: String, default: "" },
  telefono: { type: String, default: "" },
  email: { type: String, default: "" },
  padre: { type: Object, default: {} },
  madre: { type: Object, default: {} },
  tutor: { type: Object, default: {} },
  historial: { type: Array, default: [] },
  reportesConvivencia: { type: Array, default: [] },
  graduado: { type: Boolean, default: false },
  gradoSiguiente: { type: String, default: "" },
  fechaArchivado: { type: Date, default: Date.now }
}, { timestamps: true });

estudianteArchivadoSchema.index({ anioLectivo: 1, grado: 1, grupo: 1 });
estudianteArchivadoSchema.index({ anioLectivo: 1, identificacion: 1 });

const EstudianteArchivado = mongoose.model("EstudianteArchivado", estudianteArchivadoSchema);

function normalizeSeverity(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "tipo1" || raw === "baja") return "tipo1";
  if (raw === "tipo2" || raw === "media") return "tipo2";
  if (raw === "tipo3" || raw === "alta") return "tipo3";
  return "tipo2";
}

function normalizeTextForComparison(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Devuelve un Date corrido al huso del colegio para poder leerlo con los getters UTC.
function obtenerAhoraLocal(referencia = new Date()) {
  return new Date(referencia.getTime() + (SCHOOL_UTC_OFFSET_HOURS * 60 * 60 * 1000));
}

function finDelDiaLocal(fechaLocal) {
  return new Date(Date.UTC(
    fechaLocal.getUTCFullYear(),
    fechaLocal.getUTCMonth(),
    fechaLocal.getUTCDate(),
    23, 59, 59, 999
  ));
}

// La asistencia se guarda anclada al mediodia UTC del dia escolar: asi el dia
// que se ve en el calendario no cambia por la zona horaria del equipo que registra.
function normalizarFechaAsistencia(fecha) {
  // "2026-08-16" ya es un dia escolar: se toma tal cual, sin convertir husos.
  const soloFecha = String(fecha || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
    const [anio, mes, dia] = soloFecha.split("-").map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0, 0));
  }

  const original = new Date(fecha);
  if (Number.isNaN(original.getTime())) return null;
  const local = obtenerAhoraLocal(original);
  return new Date(Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    12, 0, 0, 0
  ));
}

function parseHoraCorteMinutos(valor) {
  const [horaRaw = "16", minutoRaw = "00"] = String(valor || SCHOOL_CUTOFF_TIME).split(":");
  const hora = Number(horaRaw);
  const minuto = Number(minutoRaw);
  const horaValida = Number.isFinite(hora) && hora >= 0 && hora <= 23 ? hora : 16;
  const minutoValido = Number.isFinite(minuto) && minuto >= 0 && minuto <= 59 ? minuto : 0;
  return (horaValida * 60) + minutoValido;
}

function formatearHoraCorte(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function getMonthKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthRange(monthText) {
  const normalized = String(monthText || "").trim();
  const valid = /^\d{4}-\d{2}$/.test(normalized) ? normalized : getMonthKey(new Date());
  const [yearText, monthTextSafe] = valid.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthTextSafe) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return { monthKey: valid, start, end };
}

function listBusinessDayKeys(startDate, endDate, holidayConfig = null) {
  if (!startDate || !endDate || endDate < startDate) return [];

  const keys = [];
  const current = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
    0, 0, 0, 0
  ));
  const endKeyDate = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    0, 0, 0, 0
  ));

  while (current <= endKeyDate) {
    const day = current.getUTCDay();
    const isBusinessDay = day >= 1 && day <= 5;
    const dayKey = getDateKey(current);
    const isHoliday = isHolidayDay(dayKey, holidayConfig);
    if (isBusinessDay && !isHoliday) {
      keys.push(dayKey);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys;
}

function listHolidayDayKeys(startDate, endDate, holidayConfig = null) {
  if (!startDate || !endDate || endDate < startDate) return [];

  const keys = [];
  const current = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
    0, 0, 0, 0
  ));
  const endKeyDate = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    0, 0, 0, 0
  ));

  while (current <= endKeyDate) {
    const dayKey = getDateKey(current);
    if (isHolidayDay(dayKey, holidayConfig)) {
      keys.push(dayKey);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys;
}

function parseHolidayConfig(rawValue = "") {
  const exactDates = new Set();
  const recurringMonthDays = new Set();
  String(rawValue || "")
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
        exactDates.add(token);
        return;
      }
      if (/^\d{2}-\d{2}$/.test(token)) {
        recurringMonthDays.add(token);
      }
    });
  return { exactDates, recurringMonthDays };
}

function isHolidayDay(dateKey, holidayConfig) {
  if (!dateKey || !holidayConfig) return false;
  if (holidayConfig.exactDates?.has(dateKey)) return true;
  const monthDay = dateKey.slice(5);
  return holidayConfig.recurringMonthDays?.has(monthDay);
}

function hasDuplicateConvivenciaReport(estudiante, candidate, excludeReportId = "") {
  const targetDate = getDateKey(candidate.fecha);
  const targetCategoria = normalizeTextForComparison(candidate.categoria);
  const targetGravedad = normalizeSeverity(candidate.gravedad);
  const targetEstado = normalizeTextForComparison(candidate.estado);
  const targetDescripcion = normalizeTextForComparison(candidate.descripcion);
  const targetAcciones = normalizeTextForComparison(candidate.acciones);

  return (estudiante.reportesConvivencia || []).some((item) => {
    if (excludeReportId && String(item._id) === String(excludeReportId)) return false;
    return (
      getDateKey(item.fecha) === targetDate &&
      normalizeTextForComparison(item.categoria) === targetCategoria &&
      normalizeSeverity(item.gravedad) === targetGravedad &&
      normalizeTextForComparison(item.estado) === targetEstado &&
      normalizeTextForComparison(item.descripcion) === targetDescripcion &&
      normalizeTextForComparison(item.acciones) === targetAcciones
    );
  });
}

function normalizeAttendanceType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "presente" || raw === "falta" || raw === "retardo" || raw === "salida") {
    return raw;
  }
  return "";
}

// Motivos validos de un permiso de salida.
const MOTIVOS_SALIDA = ["deportivo", "enfermedad", "cita_medica", "familiar", "otro"];

function normalizeMotivoSalida(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
  if (raw === "deporte" || raw === "deportiva") return "deportivo";
  if (raw === "medica" || raw === "citamedica") return "cita_medica";
  if (raw === "salud") return "enfermedad";
  return MOTIVOS_SALIDA.includes(raw) ? raw : "";
}

function hasDuplicateAttendanceRecord(estudiante, candidate, excludeRecordId = "") {
  const targetDate = getDateKey(candidate.fecha);
  const targetTipo = normalizeAttendanceType(candidate.tipo);
  const targetHora = normalizeTextForComparison(candidate.hora);
  const targetObservacion = normalizeTextForComparison(candidate.observacion);

  return (estudiante.historial || []).some((item) => {
    if (excludeRecordId && String(item._id) === String(excludeRecordId)) return false;
    return (
      getDateKey(item.fecha) === targetDate &&
      normalizeAttendanceType(item.tipo) === targetTipo &&
      normalizeTextForComparison(item.hora) === targetHora &&
      normalizeTextForComparison(item.observacion) === targetObservacion
    );
  });
}

function getUserScope(reqUser) {
  if (!reqUser || reqUser.rol === "admin") return null;
  return {
    grado: normalizeGrade(reqUser.gradoAsignado),
    grupo: normalizeGroup(reqUser.grupoAsignado)
  };
}

function getScopeFilterOrReject(req, res) {
  const scope = getUserScope(req.user);
  if (!scope) return {};
  if (!scope.grado || !scope.grupo) {
    res.status(403).json({ error: "Tu usuario no tiene grado/grupo asignado. Contacta al administrador." });
    return null;
  }
  return { grado: scope.grado, grupo: scope.grupo };
}

function canAccessStudent(reqUser, estudiante) {
  const scope = getUserScope(reqUser);
  if (!scope) return true;
  if (!scope.grado || !scope.grupo) return false;
  return (
    normalizeGrade(estudiante?.grado) === scope.grado &&
    normalizeGroup(estudiante?.grupo) === scope.grupo
  );
}

// ============ UTILIDADES DE AÑO LECTIVO ============

function esAdmin(req, res) {
  if (req.user?.rol === "admin") return true;
  res.status(403).json({ error: "Solo administradores pueden gestionar el año lectivo." });
  return false;
}

// ============ CONEXIÓN A MONGODB ============
async function conectarMongoDB() {
  if (!MONGODB_URI) {
    throw new Error("Falta la variable MONGODB_URI");
  }

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: MONGODB_SERVER_SELECTION_TIMEOUT_MS
  });

  console.log("MongoDB conectado");
  logger.info("Conexión a MongoDB establecida exitosamente");
}

// Monitorear estado de la conexión
mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB desconectado - posible pérdida de conectividad");
});

mongoose.connection.on("error", (err) => {
  logger.error(`Error en conexión MongoDB: ${err.message}`);
});

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const autenticarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token inválido" });
    }
    req.user = user;
    next();
  });
};

// ============ ENDPOINTS DE AUTENTICACIÓN ============

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    }

    const usuario = await Usuario.findOne({ username })
      .select("_id username password nombre rol gradoAsignado grupoAsignado")
      .lean();
    if (!usuario) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const gradoAsignado = normalizeGrade(usuario.gradoAsignado);
    const grupoAsignado = normalizeGroup(usuario.grupoAsignado);

    const token = jwt.sign(
      {
        id: usuario._id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
        gradoAsignado,
        grupoAsignado
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      usuario: {
        id: usuario._id,
        username: usuario.username,
        nombre: usuario.nombre,
        rol: usuario.rol,
        gradoAsignado,
        grupoAsignado
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Registrar usuario (solo admin)
app.post("/api/usuarios", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden crear usuarios" });
    }

    const {
      username,
      password,
      nombre,
      rol,
      gradoAsignado,
      grupoAsignado
    } = req.body;

    if (!username || !password || !nombre) {
      return res.status(400).json({ error: "username, password y nombre son obligatorios" });
    }

    const rolFinal = rol === "admin" ? "admin" : "profesor";
    const gradoFinal = rolFinal === "admin" ? "" : normalizeGrade(gradoAsignado);
    const grupoFinal = rolFinal === "admin" ? "" : normalizeGroup(grupoAsignado);

    if (rolFinal !== "admin" && (!gradoFinal || !grupoFinal)) {
      return res.status(400).json({ error: "Para usuarios profesor debes asignar grado y grupo" });
    }

    const usuarioExistente = await Usuario.findOne({ username });
    if (usuarioExistente) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const nuevoUsuario = new Usuario({
      username,
      password: hashedPassword,
      nombre,
      rol: rolFinal,
      gradoAsignado: gradoFinal,
      grupoAsignado: grupoFinal
    });

    await nuevoUsuario.save();
    res.status(201).json({ message: "Usuario creado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

app.get("/api/usuarios", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden ver usuarios" });
    }

    const usuarios = await Usuario.find({})
      .select("username nombre rol gradoAsignado grupoAsignado fechaCreacion")
      .sort({ nombre: 1 });

    return res.json(usuarios);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// Actualizar usuario (solo admin)
app.put("/api/usuarios/:id", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden actualizar usuarios" });
    }

    const { id } = req.params;
    const {
      username,
      password,
      nombre,
      rol,
      gradoAsignado,
      grupoAsignado
    } = req.body;

    const usuario = await Usuario.findById(id);
    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Validar campos obligatorios
    if (!username || !nombre) {
      return res.status(400).json({ error: "username y nombre son obligatorios" });
    }

    const rolFinal = rol === "admin" ? "admin" : "profesor";
    const gradoFinal = rolFinal === "admin" ? "" : normalizeGrade(gradoAsignado);
    const grupoFinal = rolFinal === "admin" ? "" : normalizeGroup(grupoAsignado);

    if (rolFinal !== "admin" && (!gradoFinal || !grupoFinal)) {
      return res.status(400).json({ error: "Para usuarios profesor debes asignar grado y grupo" });
    }

    // Verificar si el nuevo username ya existe (si cambió)
    if (username !== usuario.username) {
      const usuarioExistente = await Usuario.findOne({ username });
      if (usuarioExistente) {
        return res.status(400).json({ error: "El nombre de usuario ya existe" });
      }
    }

    // Actualizar campos
    usuario.username = username;
    usuario.nombre = nombre;
    usuario.rol = rolFinal;
    usuario.gradoAsignado = gradoFinal;
    usuario.grupoAsignado = grupoFinal;

    // Solo actualizar password si se proporciona
    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(10);
      usuario.password = await bcrypt.hash(password, salt);
    }

    await usuario.save();
    res.json({ message: "Usuario actualizado exitosamente" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "El nombre de usuario ya existe" });
    }
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

// Eliminar usuario (solo admin)
app.delete("/api/usuarios/:id", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden eliminar usuarios" });
    }

    const { id } = req.params;

    // Prevenir auto-eliminación
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
    }

    const usuario = await Usuario.findByIdAndDelete(id);
    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ message: "Usuario eliminado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

// ============ ENDPOINTS DE SALUD Y MONITOREO ============

// Health check - verificar estado del sistema
app.get("/api/health", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = {
      0: "desconectado",
      1: "conectado",
      2: "conectando",
      3: "desconectando"
    };
    
    // Contar estudiantes en la base de datos
    const countEstudiantes = await Estudiante.countDocuments();
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        state: dbStatus[dbState] || "desconocido",
        estudiantes: countEstudiantes
      },
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error(`Error en health check: ${error.message}`);
    res.status(500).json({ 
      status: "error", 
      error: "No se pudo verificar el estado del sistema" 
    });
  }
});

// ============ ENDPOINTS DE ESTUDIANTES ============

// Obtener todos los estudiantes (con filtros opcionales)
app.get("/api/estudiantes", autenticarToken, async (req, res) => {
  try {
    const { grado, grupo, busqueda } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    let filtro = { ...scopeFilter };
    const gradoNormalizado = normalizeGrade(grado);
    const grupoNormalizado = normalizeGroup(grupo);

    if (gradoNormalizado) {
      if (scopeFilter.grado && scopeFilter.grado !== gradoNormalizado) {
        return res.json([]);
      }
      filtro.grado = gradoNormalizado;
    }

    if (grupoNormalizado) {
      if (scopeFilter.grupo && scopeFilter.grupo !== grupoNormalizado) {
        return res.json([]);
      }
      filtro.grupo = grupoNormalizado;
    }

    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: "i" } },
        { identificacion: { $regex: busqueda, $options: "i" } }
      ];
    }

    const estudiantes = await Estudiante.find(filtro)
      .select("nombre grado grupo identificacion")
      .sort({ nombre: 1 });
    
    res.json(estudiantes);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener estudiantes" });
  }
});

// Importar estudiantes por CSV (solo admin)
app.post("/api/estudiantes/importar-csv", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden importar estudiantes" });
    }

    const { csvContent, dryRun = false } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return res.status(400).json({ error: "Debe enviar csvContent en formato texto" });
    }

    const { headers, rows } = parseCsv(csvContent);
    if (!rows.length) {
      return res.status(400).json({ error: "El CSV no contiene filas para importar" });
    }

    // Validación de seguridad: prevenir importación masiva accidental
    const countActual = await Estudiante.countDocuments();
    if (!dryRun && rows.length > 500 && countActual > 0) {
      logger.warn(`Intento de importación masiva: ${rows.length} registros (actual: ${countActual})`);
      return res.status(400).json({ 
        error: "Importación masiva detectada. Usa dryRun=true primero para validar, o contacta soporte." 
      });
    }

    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      return res.status(400).json({
        error: `Faltan columnas requeridas: ${missingHeaders.join(", ")}`
      });
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const item of rows) {
      try {
        const data = buildStudentFromRow(item.row);
        const existing = await Estudiante.findOne({ identificacion: data.identificacion }).select("_id");

        if (existing) {
          if (!dryRun) {
            await Estudiante.updateOne({ _id: existing._id }, data, { runValidators: true });
            logger.info(`Estudiante actualizado: ${data.identificacion} - ${data.nombre}`);
          }
          updated += 1;
        } else {
          if (!dryRun) {
            await Estudiante.create(data);
            logger.info(`Estudiante creado: ${data.identificacion} - ${data.nombre}`);
          }
          created += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push(`Linea ${item.lineNumber}: ${error.message}`);
      }
    }

    // Log de la operación completa
    logger.info(`Importación CSV completada por ${req.user.username}: ${created} creados, ${updated} actualizados, ${failed} errores (dryRun: ${dryRun})`);

    return res.json({
      message: dryRun ? "Validacion completada (dry run)" : "Importacion completada",
      dryRun: Boolean(dryRun),
      totalFilas: rows.length,
      creados: created,
      actualizados: updated,
      errores: failed,
      detalleErrores: errors.slice(0, 100)
    });
  } catch (error) {
    logger.error(`Error en importación CSV: ${error.message}`);
    return res.status(500).json({ error: "Error al importar CSV" });
  }
});

// Obtener estudiante por ID
app.get("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }
    res.json(estudiante);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener estudiante" });
  }
});

// Crear estudiante
app.post("/api/estudiantes", autenticarToken, async (req, res) => {
  try {
    const estudianteData = { ...req.body };
    const scope = getUserScope(req.user);

    if (scope) {
      if (!scope.grado || !scope.grupo) {
        return res.status(403).json({ error: "Tu usuario no tiene grado/grupo asignado. Contacta al administrador." });
      }

      const gradoPayload = normalizeGrade(estudianteData.grado);
      const grupoPayload = normalizeGroup(estudianteData.grupo);
      if ((gradoPayload && gradoPayload !== scope.grado) || (grupoPayload && grupoPayload !== scope.grupo)) {
        return res.status(403).json({ error: "Solo puedes crear estudiantes de tu grado y grupo asignado" });
      }

      estudianteData.grado = scope.grado;
      estudianteData.grupo = scope.grupo;
    } else {
      estudianteData.grado = normalizeGrade(estudianteData.grado);
      estudianteData.grupo = normalizeGroup(estudianteData.grupo);
    }

    const nuevoEstudiante = new Estudiante(estudianteData);
    await nuevoEstudiante.save();
    res.status(201).json({ message: "Estudiante creado exitosamente", estudiante: nuevoEstudiante });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Ya existe un estudiante con esa identificación" });
    }
    res.status(500).json({ error: "Error al crear estudiante" });
  }
});

// Actualizar estudiante
app.put("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso para actualizar este estudiante" });
    }

    const payload = { ...req.body };
    const scope = getUserScope(req.user);
    if (scope) {
      if (!scope.grado || !scope.grupo) {
        return res.status(403).json({ error: "Tu usuario no tiene grado/grupo asignado. Contacta al administrador." });
      }

      const gradoFinal = normalizeGrade(payload.grado || estudiante.grado);
      const grupoFinal = normalizeGroup(payload.grupo || estudiante.grupo);
      if (gradoFinal !== scope.grado || grupoFinal !== scope.grupo) {
        return res.status(403).json({ error: "Solo puedes gestionar estudiantes de tu grado y grupo asignado" });
      }

      payload.grado = scope.grado;
      payload.grupo = scope.grupo;
    } else {
      if (payload.grado != null) payload.grado = normalizeGrade(payload.grado);
      if (payload.grupo != null) payload.grupo = normalizeGroup(payload.grupo);
    }

    Object.assign(estudiante, payload);
    await estudiante.save();

    res.json({ message: "Estudiante actualizado", estudiante });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Ya existe un estudiante con esa identificacion" });
    }
    res.status(500).json({ error: "Error al actualizar estudiante" });
  }
});

// Eliminar estudiante
app.delete("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden eliminar estudiantes" });
    }

    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    // Log antes de eliminar para auditoría
    logger.warn(`Eliminación de estudiante por ${req.user.username}: ID=${req.params.id}, Nombre=${estudiante.nombre}, Identificación=${estudiante.identificacion}`);

    await Estudiante.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Estudiante eliminado", estudiante: { nombre: estudiante.nombre, identificacion: estudiante.identificacion } });
  } catch (error) {
    logger.error(`Error al eliminar estudiante ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: "Error al eliminar estudiante" });
  }
});

// ============ ENDPOINTS DE AÑO LECTIVO ============

// Listado de años lectivos (archivados + año en curso)
app.get("/api/anios-lectivos", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const [registrados, agrupados, totalEstudiantesActivos] = await Promise.all([
      AnioLectivo.find({}).lean(),
      EstudianteArchivado.aggregate([
        { $group: { _id: "$anioLectivo", totalEstudiantes: { $sum: 1 } } }
      ]),
      Estudiante.countDocuments()
    ]);

    const conteoPorAnio = new Map(
      agrupados.map((item) => [item._id, item.totalEstudiantes])
    );

    const anios = new Map();
    registrados.forEach((item) => {
      anios.set(item.anio, {
        anio: item.anio,
        estado: item.estado,
        fechaArchivado: item.fechaArchivado || null,
        archivadoPor: item.archivadoPor || "",
        totalEstudiantes: conteoPorAnio.get(item.anio) ?? item.totalEstudiantes ?? 0,
        totalRegistrosAsistencia: item.totalRegistrosAsistencia || 0,
        totalReportesConvivencia: item.totalReportesConvivencia || 0,
        graduados: item.graduados || 0,
        promovidos: item.promovidos || 0
      });
    });

    // Años que tienen estudiantes archivados pero no quedaron registrados en la coleccion de años.
    conteoPorAnio.forEach((total, anio) => {
      if (anios.has(anio)) return;
      anios.set(anio, {
        anio,
        estado: "archivado",
        fechaArchivado: null,
        archivadoPor: "",
        totalEstudiantes: total,
        totalRegistrosAsistencia: 0,
        totalReportesConvivencia: 0,
        graduados: 0,
        promovidos: 0
      });
    });

    const lista = Array.from(anios.values()).sort((a, b) => b.anio.localeCompare(a.anio));
    const sugerencia = sugerirAniosLectivos();
    const activo = lista.find((item) => item.estado === "activo");

    return res.json({
      anios: lista,
      archivados: lista.filter((item) => item.estado === "archivado"),
      anioActivo: activo?.anio || sugerencia.anioActual,
      totalEstudiantesActivos,
      sugerencia
    });
  } catch (error) {
    logger.error(`Error al listar años lectivos: ${error.message}`);
    return res.status(500).json({ error: "Error al obtener los años lectivos" });
  }
});

// Simulación del traslado de grado (no modifica nada)
app.get("/api/anios-lectivos/promocion/preview", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const estudiantes = await Estudiante.find({})
      .select("nombre identificacion grado grupo historial reportesConvivencia")
      .lean();

    const plan = construirPlanPromocion(estudiantes);
    const totales = contarRegistrosArchivo(estudiantes);
    const sugerencia = sugerirAniosLectivos();
    const yaArchivado = await EstudianteArchivado.countDocuments({ anioLectivo: sugerencia.anioActual });

    return res.json({
      ...plan,
      totalRegistrosAsistencia: totales.registros,
      totalReportesConvivencia: totales.reportes,
      gradoFinal: String(GRADO_FINAL_BACHILLERATO),
      sugerencia,
      yaExisteArchivo: yaArchivado > 0
    });
  } catch (error) {
    logger.error(`Error en simulación de promoción: ${error.message}`);
    return res.status(500).json({ error: "Error al generar la simulación de promoción" });
  }
});

// Cierre de año: archiva el año actual y promueve a todos al grado siguiente
app.post("/api/anios-lectivos/promocion", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const { anioLectivo, anioNuevo, confirmacion } = req.body;

    if (String(confirmacion || "").trim().toUpperCase() !== "PROMOVER") {
      return res.status(400).json({ error: "Debes escribir PROMOVER para confirmar el cierre de año." });
    }

    const anioArchivo = normalizeSchoolYear(anioLectivo);
    const anioSiguiente = normalizeSchoolYear(anioNuevo);
    if (!anioArchivo || !anioSiguiente) {
      return res.status(400).json({ error: "Los años lectivos deben tener el formato AAAA-AAAA (ejemplo: 2025-2026)." });
    }
    if (!isConsecutiveSchoolYear(anioArchivo, anioSiguiente)) {
      return res.status(400).json({ error: `El año nuevo debe ser el siguiente a ${anioArchivo} (ejemplo: ${anioArchivo.split("-")[1]}-${Number(anioArchivo.split("-")[1]) + 1}).` });
    }

    const yaArchivado = await EstudianteArchivado.countDocuments({ anioLectivo: anioArchivo });
    if (yaArchivado > 0) {
      return res.status(409).json({
        error: `El año ${anioArchivo} ya está archivado con ${yaArchivado} estudiante(s). No se puede archivar dos veces.`
      });
    }

    const estudiantes = await Estudiante.find({}).lean();
    if (!estudiantes.length) {
      return res.status(400).json({ error: "No hay estudiantes activos para archivar y promover." });
    }

    // Respaldo en disco antes de tocar nada (best effort, la copia real queda en la base de datos).
    await crearBackupEstudiantes();

    const fechaArchivado = new Date();
    const documentosArchivo = estudiantes.map((estudiante) => {
      const { destino, motivo } = calcularGradoSiguiente(estudiante.grado);
      return {
        anioLectivo: anioArchivo,
        estudianteOriginalId: estudiante._id,
        nombre: estudiante.nombre,
        grado: normalizeGrade(estudiante.grado),
        grupo: normalizeGroup(estudiante.grupo),
        identificacion: estudiante.identificacion || "",
        fechaNacimiento: estudiante.fechaNacimiento || null,
        direccion: estudiante.direccion || "",
        telefono: estudiante.telefono || "",
        email: estudiante.email || "",
        padre: estudiante.padre || {},
        madre: estudiante.madre || {},
        tutor: estudiante.tutor || {},
        historial: estudiante.historial || [],
        reportesConvivencia: estudiante.reportesConvivencia || [],
        graduado: motivo === "graduado",
        gradoSiguiente: destino,
        fechaArchivado
      };
    });

    await EstudianteArchivado.insertMany(documentosArchivo);

    // Verificación: solo se borra/promueve si el archivo quedó completo.
    const archivadosReales = await EstudianteArchivado.countDocuments({ anioLectivo: anioArchivo });
    if (archivadosReales !== estudiantes.length) {
      logger.error(`Archivo incompleto para ${anioArchivo}: ${archivadosReales}/${estudiantes.length}. Se cancela la promoción.`);
      return res.status(500).json({
        error: `El archivo del año quedó incompleto (${archivadosReales} de ${estudiantes.length}). No se modificó ningún estudiante. Intenta de nuevo.`
      });
    }

    const idsGraduados = [];
    const operacionesPromocion = [];
    const sinPromover = [];

    estudiantes.forEach((estudiante) => {
      const { destino, motivo } = calcularGradoSiguiente(estudiante.grado);
      if (motivo === "graduado") {
        idsGraduados.push(estudiante._id);
        return;
      }
      if (motivo === "sin_grado") {
        sinPromover.push({
          nombre: estudiante.nombre || "",
          identificacion: estudiante.identificacion || "",
          grado: estudiante.grado || ""
        });
        return;
      }
      operacionesPromocion.push({
        updateOne: {
          filter: { _id: estudiante._id },
          update: {
            $set: {
              grado: destino,
              grupo: normalizeGroup(estudiante.grupo),
              historial: [],
              reportesConvivencia: []
            }
          }
        }
      });
    });

    if (idsGraduados.length) {
      await Estudiante.deleteMany({ _id: { $in: idsGraduados } });
    }
    if (operacionesPromocion.length) {
      await Estudiante.bulkWrite(operacionesPromocion);
    }

    const totales = contarRegistrosArchivo(estudiantes);

    await AnioLectivo.updateOne(
      { anio: anioArchivo },
      {
        $set: {
          estado: "archivado",
          fechaArchivado,
          archivadoPor: req.user.nombre || req.user.username || "",
          totalEstudiantes: estudiantes.length,
          totalRegistrosAsistencia: totales.registros,
          totalReportesConvivencia: totales.reportes,
          graduados: idsGraduados.length,
          promovidos: operacionesPromocion.length
        }
      },
      { upsert: true }
    );

    await AnioLectivo.updateMany(
      { anio: { $ne: anioSiguiente }, estado: "activo" },
      { $set: { estado: "archivado" } }
    );

    await AnioLectivo.updateOne(
      { anio: anioSiguiente },
      { $set: { estado: "activo" }, $setOnInsert: { totalEstudiantes: 0 } },
      { upsert: true }
    );

    const gradoLiberado = await Estudiante.countDocuments({ grado: "6" });

    logger.warn(
      `Cierre de año ejecutado por ${req.user.username}: ${anioArchivo} -> ${anioSiguiente}. ` +
      `Archivados: ${estudiantes.length}, graduados (11°): ${idsGraduados.length}, promovidos: ${operacionesPromocion.length}.`
    );

    return res.json({
      message: `Año ${anioArchivo} archivado y estudiantes promovidos a ${anioSiguiente}.`,
      anioArchivado: anioArchivo,
      anioNuevo: anioSiguiente,
      totalArchivados: estudiantes.length,
      graduados: idsGraduados.length,
      promovidos: operacionesPromocion.length,
      sinPromover,
      totalRegistrosAsistencia: totales.registros,
      totalReportesConvivencia: totales.reportes,
      estudiantesEnSexto: gradoLiberado
    });
  } catch (error) {
    logger.error(`Error en cierre de año lectivo: ${error.message}`);
    return res.status(500).json({ error: "Error al archivar el año y promover estudiantes" });
  }
});

// Consulta de estudiantes de un año archivado
app.get("/api/anios-lectivos/:anio/estudiantes", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const anio = normalizeSchoolYear(req.params.anio);
    if (!anio) {
      return res.status(400).json({ error: "Año lectivo inválido. Usa el formato AAAA-AAAA." });
    }

    const filtro = { anioLectivo: anio };
    const gradoNormalizado = normalizeGrade(req.query.grado);
    const grupoNormalizado = normalizeGroup(req.query.grupo);
    if (gradoNormalizado) filtro.grado = gradoNormalizado;
    if (grupoNormalizado) filtro.grupo = grupoNormalizado;

    const busqueda = String(req.query.busqueda || "").trim();
    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: "i" } },
        { identificacion: { $regex: busqueda, $options: "i" } }
      ];
    }

    const archivados = await EstudianteArchivado.find(filtro)
      .select("nombre grado grupo identificacion graduado gradoSiguiente historial reportesConvivencia")
      .sort({ grado: 1, grupo: 1, nombre: 1 })
      .lean();

    const lista = archivados.map((estudiante) => {
      const historial = estudiante.historial || [];
      return {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        identificacion: estudiante.identificacion,
        graduado: Boolean(estudiante.graduado),
        gradoSiguiente: estudiante.gradoSiguiente || "",
        presentes: historial.filter((item) => item.tipo === "presente").length,
        faltas: historial.filter((item) => item.tipo === "falta").length,
        retardos: historial.filter((item) => item.tipo === "retardo").length,
        salidas: historial.filter((item) => item.tipo === "salida").length,
        totalRegistros: historial.length,
        totalReportesConvivencia: (estudiante.reportesConvivencia || []).length
      };
    });

    return res.json({ anio, total: lista.length, estudiantes: lista });
  } catch (error) {
    logger.error(`Error al consultar archivo del año: ${error.message}`);
    return res.status(500).json({ error: "Error al consultar los estudiantes archivados" });
  }
});

// Perfil completo de un estudiante archivado
app.get("/api/anios-lectivos/:anio/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const anio = normalizeSchoolYear(req.params.anio);
    if (!anio) {
      return res.status(400).json({ error: "Año lectivo inválido. Usa el formato AAAA-AAAA." });
    }

    const archivado = await EstudianteArchivado.findOne({
      _id: req.params.id,
      anioLectivo: anio
    }).lean();

    if (!archivado) {
      return res.status(404).json({ error: "Estudiante archivado no encontrado" });
    }

    const historial = [...(archivado.historial || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const reportesConvivencia = [...(archivado.reportesConvivencia || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const resumenAsistencia = construirResumenAsistencia(historial);

    return res.json({
      anioLectivo: anio,
      estudiante: {
        id: archivado._id,
        nombre: archivado.nombre,
        grado: archivado.grado,
        grupo: archivado.grupo,
        identificacion: archivado.identificacion,
        fechaNacimiento: archivado.fechaNacimiento,
        direccion: archivado.direccion,
        telefono: archivado.telefono,
        email: archivado.email,
        padre: archivado.padre || {},
        madre: archivado.madre || {},
        tutor: archivado.tutor || {},
        graduado: Boolean(archivado.graduado),
        gradoSiguiente: archivado.gradoSiguiente || ""
      },
      historial,
      reportesConvivencia,
      resumenAsistencia
    });
  } catch (error) {
    logger.error(`Error al consultar perfil archivado: ${error.message}`);
    return res.status(500).json({ error: "Error al consultar el perfil archivado" });
  }
});

// ============ ENDPOINTS DE ASISTENCIA ============

app.post("/api/asistencia", autenticarToken, async (req, res) => {
  const { estudianteId, fecha, tipo, hora, observacion, fotoUrl, motivoSalida } = req.body;

  if (!estudianteId || !fecha || !tipo) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const fechaRegistro = normalizarFechaAsistencia(fecha);
    if (!fechaRegistro) {
      return res.status(400).json({ error: "Fecha de asistencia invalida" });
    }

    const tipoNormalizado = normalizeAttendanceType(tipo);
    if (!tipoNormalizado) {
      return res.status(400).json({ error: "Tipo de asistencia invalido" });
    }
    const observacionNormalizada = typeof observacion === "string" ? observacion.trim() : "";
    if (tipoNormalizado === "salida" && !observacionNormalizada) {
      return res.status(400).json({ error: "La observación es obligatoria para registrar un permiso." });
    }

    const motivoNormalizado = tipoNormalizado === "salida" ? normalizeMotivoSalida(motivoSalida) : "";
    if (tipoNormalizado === "salida" && !motivoNormalizado) {
      return res.status(400).json({ error: "Debes indicar el motivo del permiso (deportivo, enfermedad, cita médica, familiar u otro)." });
    }

    const nuevoRegistro = {
      fecha: fechaRegistro,
      tipo: tipoNormalizado,
      motivoSalida: motivoNormalizado,
      hora: typeof hora === "string" ? hora.trim() : "",
      observacion: observacionNormalizada,
      fotoUrl: typeof fotoUrl === "string" ? fotoUrl : "",
      registradoPor: req.user.nombre
    };

    if (hasDuplicateAttendanceRecord(estudiante, nuevoRegistro)) {
      return res.status(409).json({ error: "Ya existe un registro de asistencia igual para este estudiante en la misma fecha." });
    }

    estudiante.historial.push(nuevoRegistro);

    await estudiante.save();
    res.status(201).json({ message: "Asistencia registrada" });
  } catch (error) {
    res.status(500).json({ error: "Error al registrar asistencia" });
  }
});

app.get("/api/asistencia/registros", autenticarToken, async (req, res) => {
  try {
    const { grado, grupo, busqueda, tipo, fechaDesde, fechaHasta } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    const filtro = { ...scopeFilter };
    const gradoNormalizado = normalizeGrade(grado);
    const grupoNormalizado = normalizeGroup(grupo);

    if (gradoNormalizado) {
      if (scopeFilter.grado && scopeFilter.grado !== gradoNormalizado) return res.json([]);
      filtro.grado = gradoNormalizado;
    }
    if (grupoNormalizado) {
      if (scopeFilter.grupo && scopeFilter.grupo !== grupoNormalizado) return res.json([]);
      filtro.grupo = grupoNormalizado;
    }

    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: "i" } },
        { identificacion: { $regex: busqueda, $options: "i" } }
      ];
    }

    const tipoFiltro = tipo ? normalizeAttendanceType(tipo) : "";
    if (tipo && !tipoFiltro) {
      return res.status(400).json({ error: "Tipo de asistencia invalido" });
    }

    const motivoFiltro = req.query.motivoSalida ? normalizeMotivoSalida(req.query.motivoSalida) : "";
    if (req.query.motivoSalida && !motivoFiltro) {
      return res.status(400).json({ error: "Motivo de permiso invalido" });
    }

    const fechaDesdeDate = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const fechaHastaDate = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;

    const estudiantes = await Estudiante.find(filtro)
      .select("nombre grado grupo identificacion historial");

    const lista = [];
    estudiantes.forEach((estudiante) => {
      (estudiante.historial || []).forEach((registro) => {
        const fechaRegistro = new Date(registro.fecha);
        if (tipoFiltro && normalizeAttendanceType(registro.tipo) !== tipoFiltro) return;
        if (motivoFiltro && normalizeMotivoSalida(registro.motivoSalida) !== motivoFiltro) return;
        if (fechaDesdeDate && fechaRegistro < fechaDesdeDate) return;
        if (fechaHastaDate && fechaRegistro > fechaHastaDate) return;

        lista.push({
          registroId: registro._id,
          estudianteId: estudiante._id,
          estudianteNombre: estudiante.nombre,
          identificacion: estudiante.identificacion,
          grado: estudiante.grado,
          grupo: estudiante.grupo,
          fecha: registro.fecha,
          tipo: normalizeAttendanceType(registro.tipo),
          motivoSalida: normalizeMotivoSalida(registro.motivoSalida),
          hora: registro.hora || "",
          observacion: registro.observacion || "",
          fotoUrl: registro.fotoUrl || "",
          registradoPor: registro.registradoPor || ""
        });
      });
    });

    lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return res.json(lista);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener lista de registros de asistencia" });
  }
});

app.get("/api/asistencia/cumplimiento-profesores", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden consultar este reporte." });
    }

    const { mes, horaCorte, festivos } = req.query;
    const { monthKey, start, end } = parseMonthRange(mes);
    const ahora = obtenerAhoraLocal();
    const esMesActual = monthKey === getMonthKey(ahora);
    const finDeHoy = finDelDiaLocal(ahora);
    // Un mes que aun no llega no genera dias faltantes.
    const fechaCorteMes = finDeHoy < end ? finDeHoy : end;
    const holidayConfig = parseHolidayConfig(`${SCHOOL_HOLIDAYS},${String(festivos || "")}`);
    const festivosDelMes = listHolidayDayKeys(start, end, holidayConfig);

    const horaCorteMinutos = parseHoraCorteMinutos(horaCorte);

    const profesores = await Usuario.find({ rol: "profesor" })
      .select("nombre username gradoAsignado grupoAsignado")
      .lean();

    const profesoresValidos = profesores
      .map((profesor) => ({
        ...profesor,
        gradoAsignado: normalizeGrade(profesor.gradoAsignado),
        grupoAsignado: normalizeGroup(profesor.grupoAsignado)
      }))
      .filter((profesor) => profesor.gradoAsignado && profesor.grupoAsignado);

    if (!profesoresValidos.length) {
      const hoyEsFestivo = isHolidayDay(getDateKey(ahora), holidayConfig);
      return res.json({
        mes: monthKey,
        fechaInicio: start,
        fechaFin: end,
        fechaCorteEvaluada: fechaCorteMes,
        horaCorte: formatearHoraCorte(horaCorteMinutos),
        hoyEsFestivo,
        festivosConfigurados: holidayConfig.exactDates.size + holidayConfig.recurringMonthDays.size,
        festivosDelMes,
        totalProfesores: 0,
        alertasHoraLimite: 0,
        pendientesMes: 0,
        profesores: []
      });
    }

    const salonesUnicos = Array.from(new Set(
      profesoresValidos.map((profesor) => `${profesor.gradoAsignado}|${profesor.grupoAsignado}`)
    ))
      .map((llave) => {
        const [grado, grupo] = llave.split("|");
        return { grado, grupo };
      });

    const estudiantes = await Estudiante.find({
      $or: salonesUnicos.map((salon) => ({ grado: salon.grado, grupo: salon.grupo }))
    }).select("grado grupo historial");

    const diasConRegistroPorSalon = {};
    salonesUnicos.forEach((salon) => {
      diasConRegistroPorSalon[`${salon.grado}|${salon.grupo}`] = new Set();
    });

    estudiantes.forEach((estudiante) => {
      const grado = normalizeGrade(estudiante.grado);
      const grupo = normalizeGroup(estudiante.grupo);
      const llaveSalon = `${grado}|${grupo}`;
      const diasRegistrados = diasConRegistroPorSalon[llaveSalon];
      if (!diasRegistrados) return;

      (estudiante.historial || []).forEach((registro) => {
        const fechaRegistro = new Date(registro.fecha);
        if (Number.isNaN(fechaRegistro.getTime())) return;
        if (fechaRegistro < start || fechaRegistro > fechaCorteMes) return;
        const key = getDateKey(fechaRegistro);
        if (key) diasRegistrados.add(key);
      });
    });

    const diasHabilesEsperados = listBusinessDayKeys(start, fechaCorteMes, holidayConfig);
    const hoyKey = getDateKey(ahora);
    const hoyEsHabil = [1, 2, 3, 4, 5].includes(ahora.getUTCDay());
    const hoyEsFestivo = isHolidayDay(hoyKey, holidayConfig);
    const minutosActuales = (ahora.getUTCHours() * 60) + ahora.getUTCMinutes();

    const items = profesoresValidos.map((profesor) => {
      const llaveSalon = `${profesor.gradoAsignado}|${profesor.grupoAsignado}`;
      const diasRegistrados = diasConRegistroPorSalon[llaveSalon] || new Set();
      const diasFaltantes = diasHabilesEsperados.filter((dia) => !diasRegistrados.has(dia));
      const tieneRegistroHoy = diasRegistrados.has(hoyKey);
      const alertaHoraLimite = esMesActual && hoyEsHabil && !hoyEsFestivo && !tieneRegistroHoy && minutosActuales >= horaCorteMinutos;
      const horaCorteTexto = formatearHoraCorte(horaCorteMinutos);

      let estadoHoy = "sin_alerta";
      let mensajeHoy = "No aplica alerta para hoy.";
      if (esMesActual && hoyEsHabil && !hoyEsFestivo) {
        if (tieneRegistroHoy) {
          estadoHoy = "al_dia_hoy";
          mensajeHoy = "Ya registró asistencia del día.";
        } else if (minutosActuales >= horaCorteMinutos) {
          estadoHoy = "alerta_hora_limite";
          mensajeHoy = `No registró asistencia antes de las ${horaCorteTexto}.`;
        } else {
          estadoHoy = "pendiente_antes_de_corte";
          mensajeHoy = `Aún no registra hoy; tiene plazo hasta las ${horaCorteTexto}.`;
        }
      } else if (esMesActual && hoyEsFestivo) {
        estadoHoy = "festivo";
        mensajeHoy = "Hoy es festivo; no se genera alerta.";
      }

      const cumplimiento = diasHabilesEsperados.length
        ? Math.round((diasRegistrados.size / diasHabilesEsperados.length) * 100)
        : 100;

      return {
        profesorId: profesor._id,
        nombre: profesor.nombre,
        username: profesor.username,
        grado: profesor.gradoAsignado,
        grupo: profesor.grupoAsignado,
        mes: monthKey,
        diasHabilesEsperados: diasHabilesEsperados.length,
        diasReportados: diasRegistrados.size,
        diasFaltantes,
        faltantes: diasFaltantes.length,
        cumplimientoPorcentaje: cumplimiento,
        estadoMensual: diasFaltantes.length ? "incompleto" : "al_dia",
        estadoHoy,
        alertaHoraLimite,
        mensajeHoy
      };
    });

    items.sort((a, b) => {
      if (a.alertaHoraLimite !== b.alertaHoraLimite) return a.alertaHoraLimite ? -1 : 1;
      if (a.faltantes !== b.faltantes) return b.faltantes - a.faltantes;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });

    const alertasHoraLimite = items.filter((item) => item.alertaHoraLimite).length;
    const pendientesMes = items.filter((item) => item.faltantes > 0).length;

    return res.json({
      mes: monthKey,
      fechaInicio: start,
      fechaFin: end,
      fechaCorteEvaluada: fechaCorteMes,
      horaCorte: formatearHoraCorte(horaCorteMinutos),
      hoyEsFestivo,
      festivosConfigurados: holidayConfig.exactDates.size + holidayConfig.recurringMonthDays.size,
      totalProfesores: items.length,
      alertasHoraLimite,
      pendientesMes,
      profesores: items
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al generar cumplimiento mensual por profesor." });
  }
});

// Contexto compartido por los calendarios: rango del mes, festivos y hora limite.
function construirContextoCalendario({ mes, horaCorte, festivos }) {
  const { monthKey, start, end } = parseMonthRange(mes);
  const ahora = obtenerAhoraLocal();
  const esMesActual = monthKey === getMonthKey(ahora);
  const finDeHoy = finDelDiaLocal(ahora);
  // Nunca se evalua mas alla de hoy: en un mes futuro ningun dia puede estar "sin subir".
  const fechaCorteMes = finDeHoy < end ? finDeHoy : end;

  return {
    monthKey,
    start,
    end,
    esMesActual,
    hoyKey: getDateKey(ahora),
    fechaCorteKey: getDateKey(fechaCorteMes),
    holidayConfig: parseHolidayConfig(`${SCHOOL_HOLIDAYS},${String(festivos || "")}`),
    horaCorteMinutos: parseHoraCorteMinutos(horaCorte),
    minutosActuales: (ahora.getUTCHours() * 60) + ahora.getUTCMinutes()
  };
}

// Por cada dia del mes: cuantos registros hay y a cuantos estudiantes distintos cubren.
function agruparRegistrosPorDia(estudiantes, start, end) {
  const registrosPorDia = new Map();
  estudiantes.forEach((estudiante) => {
    (estudiante.historial || []).forEach((registro) => {
      const fechaRegistro = new Date(registro.fecha);
      if (Number.isNaN(fechaRegistro.getTime())) return;
      if (fechaRegistro < start || fechaRegistro > end) return;
      const dayKey = getDateKey(fechaRegistro);
      if (!dayKey) return;
      if (!registrosPorDia.has(dayKey)) {
        registrosPorDia.set(dayKey, { registros: 0, estudiantes: new Set() });
      }
      const detalle = registrosPorDia.get(dayKey);
      detalle.registros += 1;
      detalle.estudiantes.add(String(estudiante._id));
    });
  });
  return registrosPorDia;
}

function construirDiasCalendario(registrosPorDia, contexto) {
  const { start, holidayConfig, hoyKey, fechaCorteKey, horaCorteMinutos, minutosActuales } = contexto;
  const totalDias = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
    0
  )).getUTCDate();

  const dias = [];
  for (let numeroDia = 1; numeroDia <= totalDias; numeroDia++) {
    const fechaDia = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), numeroDia));
    const dayKey = getDateKey(fechaDia);
    const diaSemana = fechaDia.getUTCDay();
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    const esFestivo = isHolidayDay(dayKey, holidayConfig);
    const detalle = registrosPorDia.get(dayKey);

    let estado;
    if (esFestivo) {
      estado = "festivo";
    } else if (esFinDeSemana) {
      estado = "fin_de_semana";
    } else if (detalle) {
      estado = "registrado";
    } else if (dayKey > fechaCorteKey) {
      estado = "futuro";
    } else if (dayKey === hoyKey && minutosActuales < horaCorteMinutos) {
      estado = "pendiente_hoy";
    } else {
      estado = "faltante";
    }

    dias.push({
      fecha: dayKey,
      dia: numeroDia,
      diaSemana,
      estado,
      esHoy: dayKey === hoyKey,
      registros: detalle ? detalle.registros : 0,
      estudiantesRegistrados: detalle ? detalle.estudiantes.size : 0
    });
  }
  return dias;
}

function resumirDiasCalendario(dias) {
  const diasHabiles = dias.filter((dia) => ["registrado", "faltante", "pendiente_hoy"].includes(dia.estado));
  const diasRegistrados = dias.filter((dia) => dia.estado === "registrado");
  const diasFaltantes = dias.filter((dia) => dia.estado === "faltante");

  return {
    diasHabiles: diasHabiles.length,
    diasRegistrados: diasRegistrados.length,
    diasFaltantes: diasFaltantes.map((dia) => dia.fecha),
    cumplimientoPorcentaje: diasHabiles.length
      ? Math.round((diasRegistrados.length / diasHabiles.length) * 100)
      : 100
  };
}

// Calendario mensual del salon: que dias ya se subio la asistencia y cuales estan pendientes.
app.get("/api/asistencia/calendario-salon", autenticarToken, async (req, res) => {
  try {
    const { grado, grupo, mes, horaCorte, festivos } = req.query;

    let gradoFinal = normalizeGrade(grado);
    let grupoFinal = normalizeGroup(grupo);

    const scope = getUserScope(req.user);
    if (scope) {
      if (!scope.grado || !scope.grupo) {
        return res.status(403).json({ error: "Tu usuario no tiene grado/grupo asignado. Contacta al administrador." });
      }
      if ((gradoFinal && gradoFinal !== scope.grado) || (grupoFinal && grupoFinal !== scope.grupo)) {
        return res.status(403).json({ error: "Solo puedes ver el calendario de tu grado y grupo asignado." });
      }
      gradoFinal = scope.grado;
      grupoFinal = scope.grupo;
    }

    if (!gradoFinal || !grupoFinal) {
      return res.status(400).json({ error: "Debes indicar grado y grupo para ver el calendario." });
    }

    const contexto = construirContextoCalendario({ mes, horaCorte, festivos });

    const estudiantes = await Estudiante.find({ grado: gradoFinal, grupo: grupoFinal })
      .select("historial")
      .lean();

    const registrosPorDia = agruparRegistrosPorDia(estudiantes, contexto.start, contexto.end);
    const dias = construirDiasCalendario(registrosPorDia, contexto);
    const resumen = resumirDiasCalendario(dias);
    const diaHoy = dias.find((dia) => dia.fecha === contexto.hoyKey) || null;

    return res.json({
      grado: gradoFinal,
      grupo: grupoFinal,
      mes: contexto.monthKey,
      horaCorte: formatearHoraCorte(contexto.horaCorteMinutos),
      totalEstudiantes: estudiantes.length,
      dias,
      ...resumen,
      hoy: contexto.esMesActual && diaHoy
        ? {
          fecha: diaHoy.fecha,
          estado: diaHoy.estado,
          yaVencioElPlazo: contexto.minutosActuales >= contexto.horaCorteMinutos,
          registros: diaHoy.registros,
          estudiantesRegistrados: diaHoy.estudiantesRegistrados
        }
        : null
    });
  } catch (error) {
    logger.error(`Error al generar calendario del salón: ${error.message}`);
    return res.status(500).json({ error: "Error al generar el calendario del salón" });
  }
});

// Tablero mensual: el calendario de todos los salones del colegio en una sola vista.
app.get("/api/asistencia/calendarios-mes", autenticarToken, async (req, res) => {
  try {
    if (!esAdmin(req, res)) return;

    const { mes, horaCorte, festivos } = req.query;
    const contexto = construirContextoCalendario({ mes, horaCorte, festivos });

    const [estudiantes, profesores] = await Promise.all([
      Estudiante.find({}).select("grado grupo historial").lean(),
      Usuario.find({ rol: "profesor" }).select("nombre gradoAsignado grupoAsignado").lean()
    ]);

    const profesorPorSalon = new Map();
    profesores.forEach((profesor) => {
      const grado = normalizeGrade(profesor.gradoAsignado);
      const grupo = normalizeGroup(profesor.grupoAsignado);
      if (!grado || !grupo) return;
      const llave = `${grado}|${grupo}`;
      const nombres = profesorPorSalon.get(llave) || [];
      nombres.push(profesor.nombre);
      profesorPorSalon.set(llave, nombres);
    });

    // Los salones salen de los estudiantes: asi aparecen todos, tengan profesor asignado o no.
    const estudiantesPorSalon = new Map();
    estudiantes.forEach((estudiante) => {
      const grado = normalizeGrade(estudiante.grado);
      const grupo = normalizeGroup(estudiante.grupo);
      if (!grado || !grupo) return;
      const llave = `${grado}|${grupo}`;
      if (!estudiantesPorSalon.has(llave)) {
        estudiantesPorSalon.set(llave, []);
      }
      estudiantesPorSalon.get(llave).push(estudiante);
    });

    const salones = Array.from(estudiantesPorSalon.entries()).map(([llave, listaEstudiantes]) => {
      const [grado, grupo] = llave.split("|");
      const registrosPorDia = agruparRegistrosPorDia(listaEstudiantes, contexto.start, contexto.end);
      const dias = construirDiasCalendario(registrosPorDia, contexto);
      const resumen = resumirDiasCalendario(dias);
      const diaHoy = dias.find((dia) => dia.fecha === contexto.hoyKey) || null;

      return {
        grado,
        grupo,
        profesores: profesorPorSalon.get(llave) || [],
        totalEstudiantes: listaEstudiantes.length,
        dias,
        ...resumen,
        estadoHoy: contexto.esMesActual && diaHoy ? diaHoy.estado : "",
        estudiantesRegistradosHoy: diaHoy ? diaHoy.estudiantesRegistrados : 0
      };
    });

    salones.sort((a, b) => {
      const gradoA = Number(a.grado);
      const gradoB = Number(b.grado);
      if (Number.isFinite(gradoA) && Number.isFinite(gradoB) && gradoA !== gradoB) return gradoA - gradoB;
      if (a.grado !== b.grado) return String(a.grado).localeCompare(String(b.grado), "es");
      return String(a.grupo).localeCompare(String(b.grupo), "es");
    });

    const alDia = salones.filter((salon) => !salon.diasFaltantes.length).length;
    const pendientesHoy = salones.filter((salon) => salon.estadoHoy === "faltante").length;
    const totalFaltantes = salones.reduce((total, salon) => total + salon.diasFaltantes.length, 0);

    return res.json({
      mes: contexto.monthKey,
      horaCorte: formatearHoraCorte(contexto.horaCorteMinutos),
      festivosDelMes: listHolidayDayKeys(contexto.start, contexto.end, contexto.holidayConfig),
      totalSalones: salones.length,
      salonesAlDia: alDia,
      salonesConPendientes: salones.length - alDia,
      salonesSinRegistrarHoy: pendientesHoy,
      totalDiasFaltantes: totalFaltantes,
      salones
    });
  } catch (error) {
    logger.error(`Error al generar el tablero de calendarios: ${error.message}`);
    return res.status(500).json({ error: "Error al generar los calendarios del mes" });
  }
});

app.put("/api/asistencia/:estudianteId/:registroId", autenticarToken, async (req, res) => {
  try {
    const { estudianteId, registroId } = req.params;
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const registro = estudiante.historial.id(registroId);
    if (!registro) {
      return res.status(404).json({ error: "Registro de asistencia no encontrado" });
    }

    const { fecha, tipo, hora, observacion, fotoUrl, motivoSalida } = req.body;

    let fechaFinal = registro.fecha;
    if (typeof fecha === "string" && fecha.trim()) {
      const fechaRegistro = normalizarFechaAsistencia(fecha);
      if (!fechaRegistro) {
        return res.status(400).json({ error: "Fecha de asistencia invalida" });
      }
      fechaFinal = fechaRegistro;
    }

    let tipoFinal = normalizeAttendanceType(registro.tipo);
    if (typeof tipo === "string" && tipo.trim()) {
      tipoFinal = normalizeAttendanceType(tipo);
      if (!tipoFinal) {
        return res.status(400).json({ error: "Tipo de asistencia invalido" });
      }
    }
    const observacionFinal = typeof observacion === "string" ? observacion.trim() : (registro.observacion || "");
    if (tipoFinal === "salida" && !observacionFinal) {
      return res.status(400).json({ error: "La observación es obligatoria para registrar un permiso." });
    }

    let motivoFinal = "";
    if (tipoFinal === "salida") {
      motivoFinal = typeof motivoSalida === "string" && motivoSalida.trim()
        ? normalizeMotivoSalida(motivoSalida)
        : normalizeMotivoSalida(registro.motivoSalida);
      if (!motivoFinal) {
        return res.status(400).json({ error: "Debes indicar el motivo del permiso (deportivo, enfermedad, cita médica, familiar u otro)." });
      }
    }

    const horaFinal = typeof hora === "string" ? hora.trim() : (registro.hora || "");
    const fotoUrlFinal = typeof fotoUrl === "string" ? fotoUrl : (registro.fotoUrl || "");

    if (hasDuplicateAttendanceRecord(estudiante, {
      fecha: fechaFinal,
      tipo: tipoFinal,
      hora: horaFinal,
      observacion: observacionFinal
    }, registro._id)) {
      return res.status(409).json({ error: "Ya existe otro registro de asistencia igual para este estudiante en la misma fecha." });
    }

    registro.fecha = fechaFinal;
    registro.tipo = tipoFinal;
    registro.motivoSalida = motivoFinal;
    registro.hora = horaFinal;
    registro.observacion = observacionFinal;
    registro.fotoUrl = fotoUrlFinal;

    await estudiante.save();
    return res.json({
      message: "Registro de asistencia actualizado",
      registro
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al actualizar registro de asistencia" });
  }
});

app.delete("/api/asistencia/:estudianteId/:registroId", autenticarToken, async (req, res) => {
  try {
    const { estudianteId, registroId } = req.params;
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const indexRegistro = estudiante.historial.findIndex((item) => String(item._id) === String(registroId));
    if (indexRegistro === -1) {
      return res.status(404).json({ error: "Registro de asistencia no encontrado" });
    }

    estudiante.historial.splice(indexRegistro, 1);
    await estudiante.save();

    return res.json({ message: "Registro de asistencia eliminado" });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar registro de asistencia" });
  }
});

// ============ ENDPOINTS DE CONVIVENCIA ============

app.post("/api/convivencia/reportes", autenticarToken, async (req, res) => {
  try {
    const {
      estudianteId,
      fecha,
      categoria = "convivencia",
      gravedad = "tipo2",
      estado = "abierto",
      descripcion,
      acciones = ""
    } = req.body;

    if (!estudianteId || !descripcion) {
      return res.status(400).json({ error: "estudianteId y descripcion son obligatorios" });
    }

    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const fechaReporte = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(fechaReporte.getTime())) {
      return res.status(400).json({ error: "Fecha de reporte invalida" });
    }

    const nuevoReporte = {
      fecha: fechaReporte,
      categoria,
      gravedad: normalizeSeverity(gravedad),
      estado,
      descripcion,
      acciones,
      registradoPor: req.user.nombre
    };

    if (hasDuplicateConvivenciaReport(estudiante, nuevoReporte)) {
      return res.status(409).json({ error: "Ya existe un reporte igual para este estudiante en la misma fecha." });
    }

    estudiante.reportesConvivencia.push(nuevoReporte);
    await estudiante.save();

    return res.status(201).json({
      message: "Reporte de convivencia registrado",
      reporte: estudiante.reportesConvivencia[estudiante.reportesConvivencia.length - 1]
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al registrar reporte de convivencia" });
  }
});

app.get("/api/convivencia/reportes/:estudianteId", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.estudianteId)
      .select("nombre grado grupo identificacion reportesConvivencia");

    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const reportesConvivencia = [...(estudiante.reportesConvivencia || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return res.json({
      estudiante: {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        identificacion: estudiante.identificacion
      },
      reportesConvivencia
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener reportes de convivencia" });
  }
});

app.get("/api/convivencia/reportes", autenticarToken, async (req, res) => {
  try {
    const { grado, grupo, busqueda, estado, categoria, fechaDesde, fechaHasta } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    const filtro = { ...scopeFilter };
    const gradoNormalizado = normalizeGrade(grado);
    const grupoNormalizado = normalizeGroup(grupo);

    if (gradoNormalizado) {
      if (scopeFilter.grado && scopeFilter.grado !== gradoNormalizado) return res.json([]);
      filtro.grado = gradoNormalizado;
    }
    if (grupoNormalizado) {
      if (scopeFilter.grupo && scopeFilter.grupo !== grupoNormalizado) return res.json([]);
      filtro.grupo = grupoNormalizado;
    }

    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: "i" } },
        { identificacion: { $regex: busqueda, $options: "i" } }
      ];
    }

    const estadoFiltro = normalizeTextForComparison(estado);
    const categoriaFiltro = normalizeTextForComparison(categoria);
    const fechaDesdeDate = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const fechaHastaDate = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;

    const estudiantes = await Estudiante.find(filtro)
      .select("nombre grado grupo identificacion reportesConvivencia");

    const lista = [];
    estudiantes.forEach((estudiante) => {
      (estudiante.reportesConvivencia || []).forEach((reporte) => {
        const fechaReporte = new Date(reporte.fecha);
        if (estadoFiltro && normalizeTextForComparison(reporte.estado) !== estadoFiltro) return;
        if (categoriaFiltro && normalizeTextForComparison(reporte.categoria) !== categoriaFiltro) return;
        if (fechaDesdeDate && fechaReporte < fechaDesdeDate) return;
        if (fechaHastaDate && fechaReporte > fechaHastaDate) return;

        lista.push({
          reporteId: reporte._id,
          estudianteId: estudiante._id,
          estudianteNombre: estudiante.nombre,
          identificacion: estudiante.identificacion,
          grado: estudiante.grado,
          grupo: estudiante.grupo,
          fecha: reporte.fecha,
          categoria: reporte.categoria || "convivencia",
          gravedad: normalizeSeverity(reporte.gravedad),
          estado: reporte.estado || "abierto",
          descripcion: reporte.descripcion || "",
          acciones: reporte.acciones || "",
          registradoPor: reporte.registradoPor || ""
        });
      });
    });

    lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return res.json(lista);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener lista de reportes de convivencia" });
  }
});

app.put("/api/convivencia/reportes/:estudianteId/:reporteId", autenticarToken, async (req, res) => {
  try {
    const { estudianteId, reporteId } = req.params;
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const reporte = estudiante.reportesConvivencia.id(reporteId);
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    const {
      fecha,
      categoria,
      gravedad,
      estado,
      descripcion,
      acciones
    } = req.body;

    if (typeof descripcion === "string" && !descripcion.trim()) {
      return res.status(400).json({ error: "La descripcion del reporte es obligatoria" });
    }
    if (descripcion == null && !reporte.descripcion) {
      return res.status(400).json({ error: "La descripcion del reporte es obligatoria" });
    }

    if (typeof fecha === "string" && fecha.trim()) {
      const fechaReporte = new Date(fecha);
      if (Number.isNaN(fechaReporte.getTime())) {
        return res.status(400).json({ error: "Fecha de reporte invalida" });
      }
      reporte.fecha = fechaReporte;
    }

    const categoriaFinal = typeof categoria === "string" && categoria.trim() ? categoria : reporte.categoria;
    const gravedadFinal = typeof gravedad === "string" && gravedad.trim() ? normalizeSeverity(gravedad) : normalizeSeverity(reporte.gravedad);
    const estadoFinal = typeof estado === "string" && estado.trim() ? estado : reporte.estado;
    const descripcionFinal = typeof descripcion === "string" ? descripcion.trim() : reporte.descripcion;
    const accionesFinal = typeof acciones === "string" ? acciones.trim() : reporte.acciones;
    const fechaFinal = reporte.fecha;

    if (hasDuplicateConvivenciaReport(estudiante, {
      fecha: fechaFinal,
      categoria: categoriaFinal,
      gravedad: gravedadFinal,
      estado: estadoFinal,
      descripcion: descripcionFinal,
      acciones: accionesFinal
    }, reporte._id)) {
      return res.status(409).json({ error: "Ya existe otro reporte igual para este estudiante en la misma fecha." });
    }

    reporte.categoria = categoriaFinal;
    reporte.gravedad = gravedadFinal;
    reporte.estado = estadoFinal;
    reporte.descripcion = descripcionFinal;
    reporte.acciones = accionesFinal;

    await estudiante.save();
    return res.json({
      message: "Reporte de convivencia actualizado",
      reporte
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al actualizar reporte de convivencia" });
  }
});

app.delete("/api/convivencia/reportes/:estudianteId/:reporteId", autenticarToken, async (req, res) => {
  try {
    const { estudianteId, reporteId } = req.params;
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const indexReporte = estudiante.reportesConvivencia.findIndex((item) => String(item._id) === String(reporteId));
    if (indexReporte === -1) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    estudiante.reportesConvivencia.splice(indexReporte, 1);
    await estudiante.save();

    return res.json({ message: "Reporte de convivencia eliminado" });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar reporte de convivencia" });
  }
});

function contarSalidasPorMotivo(historial = []) {
  const conteo = MOTIVOS_SALIDA.reduce((acc, motivo) => ({ ...acc, [motivo]: 0 }), { sin_especificar: 0 });
  historial.forEach((registro) => {
    if (normalizeAttendanceType(registro.tipo) !== "salida") return;
    const motivo = normalizeMotivoSalida(registro.motivoSalida);
    if (motivo) {
      conteo[motivo] += 1;
    } else {
      conteo.sin_especificar += 1;
    }
  });
  return conteo;
}

function construirResumenAsistencia(historial) {
  const ahora = new Date();
  const fechaCorte30 = new Date(ahora);
  fechaCorte30.setDate(fechaCorte30.getDate() - 30);

  const totalRegistros = historial.length;
  const presentes = historial.filter((h) => h.tipo === "presente").length;
  const faltas = historial.filter((h) => h.tipo === "falta").length;
  const retardos = historial.filter((h) => h.tipo === "retardo").length;
  const salidas = historial.filter((h) => h.tipo === "salida").length;

  const ultimos30dias = historial.filter((h) => new Date(h.fecha) >= fechaCorte30);
  const presentes30 = ultimos30dias.filter((h) => h.tipo === "presente").length;
  const faltas30 = ultimos30dias.filter((h) => h.tipo === "falta").length;
  const retardos30 = ultimos30dias.filter((h) => h.tipo === "retardo").length;
  const salidas30 = ultimos30dias.filter((h) => h.tipo === "salida").length;

  return {
    totalRegistros,
    presentes,
    faltas,
    retardos,
    salidas,
    salidasPorMotivo: contarSalidasPorMotivo(historial),
    ultimoRegistro: historial[0] || null,
    ultimos30dias: {
      total: ultimos30dias.length,
      presentes: presentes30,
      faltas: faltas30,
      retardos: retardos30,
      salidas: salidas30,
      salidasPorMotivo: contarSalidasPorMotivo(ultimos30dias)
    }
  };
}

function construirReporteConvivencia(historial, resumenAsistencia, reportesConvivencia = []) {
  const palabrasClave = /pelea|agres|acoso|bully|insulto|violencia|indisciplina|irrespeto|conflicto|disciplina/i;
  const observacionesHistorial = historial
    .filter((h) => h.observacion && palabrasClave.test(h.observacion))
    .map((h) => ({
      fecha: h.fecha,
      tipo: h.tipo,
      observacion: h.observacion,
      registradoPor: h.registradoPor || "",
      fuente: "asistencia"
    }));

  const observacionesReportes = reportesConvivencia.map((r) => ({
    fecha: r.fecha,
    tipo: r.categoria || "convivencia",
    observacion: r.descripcion,
    registradoPor: r.registradoPor || "",
    gravedad: normalizeSeverity(r.gravedad),
    estado: r.estado || "abierto",
    fuente: "reporte"
  }));

  const observacionesRelevantes = [...observacionesReportes, ...observacionesHistorial]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 15);

  const reportesAltos30 = reportesConvivencia.filter((r) => {
    const fecha = new Date(r.fecha);
    return !Number.isNaN(fecha.getTime()) &&
      fecha >= new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) &&
      normalizeSeverity(r.gravedad) === "tipo3";
  }).length;

  const reportesConvivencia30 = reportesConvivencia.filter((r) => {
    const fecha = new Date(r.fecha);
    return !Number.isNaN(fecha.getTime()) && fecha >= new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
  }).length;

  const reportesAbiertos = reportesConvivencia.filter((r) => (r.estado || "") !== "cerrado").length;

  const faltas30 = resumenAsistencia.ultimos30dias.faltas;
  const retardos30 = resumenAsistencia.ultimos30dias.retardos;
  const salidas30 = resumenAsistencia.ultimos30dias.salidas;
  const incidentesConvivencia = observacionesRelevantes.length;

  const puntajeRiesgo =
    (faltas30 * 3) +
    (retardos30 * 1) +
    (salidas30 * 2) +
    (incidentesConvivencia * 3) +
    (reportesAltos30 * 5) +
    (reportesAbiertos * 2);

  let nivel = "bajo";
  if (puntajeRiesgo >= 25) nivel = "alto";
  else if (puntajeRiesgo >= 12) nivel = "medio";

  const alertas = [];
  if (faltas30 >= 3) alertas.push("Acumula 3 o mas faltas en los ultimos 30 dias.");
  if (retardos30 >= 5) alertas.push("Acumula 5 o mas retardos en los ultimos 30 dias.");
  if (salidas30 >= 3) alertas.push("Acumula 3 o mas permisos en los ultimos 30 dias.");
  if (reportesConvivencia30 > 0) alertas.push(`Tiene ${reportesConvivencia30} reporte(s) de convivencia en los ultimos 30 dias.`);
  if (reportesAbiertos > 0) alertas.push(`Tiene ${reportesAbiertos} reporte(s) de convivencia abiertos/en seguimiento.`);
  if (alertas.length === 0) alertas.push("Sin alertas relevantes de convivencia.");

  return {
    nivel,
    puntajeRiesgo,
    alertas,
    observacionesRelevantes,
    totalReportesConvivencia: reportesConvivencia.length,
    reportesAbiertos
  };
}

app.get("/api/perfil/:id", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    if (!canAccessStudent(req.user, estudiante)) {
      return res.status(403).json({ error: "No tienes acceso a este estudiante" });
    }

    const historialAnual = [...estudiante.historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const reportesConvivencia = [...(estudiante.reportesConvivencia || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const resumenAsistencia = construirResumenAsistencia(historialAnual);
    const reporteConvivencia = construirReporteConvivencia(historialAnual, resumenAsistencia, reportesConvivencia);

    res.json({
      estudiante: {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        identificacion: estudiante.identificacion,
        fechaNacimiento: estudiante.fechaNacimiento,
        direccion: estudiante.direccion,
        telefono: estudiante.telefono,
        email: estudiante.email,
        padre: estudiante.padre,
        madre: estudiante.madre,
        tutor: estudiante.tutor
      },
      historial: historialAnual,
      reportesConvivencia,
      resumenAsistencia,
      reporteConvivencia
    });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ============ ENDPOINTS DE REPORTES ============

// Reporte general de asistencia
app.get("/api/reportes/general", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin, grado, grupo } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    let filtro = { ...scopeFilter };
    const gradoNormalizado = normalizeGrade(grado);
    const grupoNormalizado = normalizeGroup(grupo);

    if (gradoNormalizado) {
      if (scopeFilter.grado && scopeFilter.grado !== gradoNormalizado) {
        return res.json([]);
      }
      filtro.grado = gradoNormalizado;
    }
    if (grupoNormalizado) {
      if (scopeFilter.grupo && scopeFilter.grupo !== grupoNormalizado) {
        return res.json([]);
      }
      filtro.grupo = grupoNormalizado;
    }

    const estudiantes = await Estudiante.find(filtro);
    
    const reporte = estudiantes.map(estudiante => {
      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      const faltas = historialFiltrado.filter(h => h.tipo === "falta").length;
      const retardos = historialFiltrado.filter(h => h.tipo === "retardo").length;
      const salidas = historialFiltrado.filter(h => h.tipo === "salida").length;
      const presentes = historialFiltrado.filter(h => h.tipo === "presente").length;

      return {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        presentes,
        faltas,
        retardos,
        salidas,
        total: faltas + retardos + salidas
      };
    });

    res.json(reporte);
  } catch (error) {
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// Reporte por grado/grupo
app.get("/api/reportes/por-grupo", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    const estudiantes = await Estudiante.find(scopeFilter);
    
    const grupos = {};
    
    estudiantes.forEach(estudiante => {
      const key = `${estudiante.grado}-${estudiante.grupo}`;
      if (!grupos[key]) {
        grupos[key] = {
          grado: estudiante.grado,
          grupo: estudiante.grupo,
          totalEstudiantes: 0,
          totalPresentes: 0,
          totalFaltas: 0,
          totalRetardos: 0,
          totalSalidas: 0
        };
      }
      grupos[key].totalEstudiantes++;

      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      grupos[key].totalPresentes += historialFiltrado.filter(h => h.tipo === "presente").length;
      grupos[key].totalFaltas += historialFiltrado.filter(h => h.tipo === "falta").length;
      grupos[key].totalRetardos += historialFiltrado.filter(h => h.tipo === "retardo").length;
      grupos[key].totalSalidas += historialFiltrado.filter(h => h.tipo === "salida").length;
    });

    res.json(Object.values(grupos));
  } catch (error) {
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// Estadísticas generales
app.get("/api/reportes/estadisticas", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    const scopeFilter = getScopeFilterOrReject(req, res);
    if (scopeFilter === null) return;

    const estudiantes = await Estudiante.find(scopeFilter);
    
    let totalFaltas = 0;
    let totalRetardos = 0;
    let totalSalidas = 0;
    let totalPresentes = 0;
    let totalRegistros = 0;
    const salidasPorMotivo = MOTIVOS_SALIDA.reduce(
      (acc, motivo) => ({ ...acc, [motivo]: 0 }),
      { sin_especificar: 0 }
    );

    estudiantes.forEach(estudiante => {
      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      totalPresentes += historialFiltrado.filter(h => h.tipo === "presente").length;
      totalFaltas += historialFiltrado.filter(h => h.tipo === "falta").length;
      totalRetardos += historialFiltrado.filter(h => h.tipo === "retardo").length;
      totalSalidas += historialFiltrado.filter(h => h.tipo === "salida").length;
      totalRegistros += historialFiltrado.length;

      const conteoMotivos = contarSalidasPorMotivo(historialFiltrado);
      Object.keys(salidasPorMotivo).forEach((motivo) => {
        salidasPorMotivo[motivo] += conteoMotivos[motivo] || 0;
      });
    });

    res.json({
      totalEstudiantes: estudiantes.length,
      totalPresentes,
      totalFaltas,
      totalRetardos,
      totalSalidas,
      salidasPorMotivo,
      totalRegistros
    });
  } catch (error) {
    res.status(500).json({ error: "Error al generar estadísticas" });
  }
});

// Función para crear backup de estudiantes
const crearBackupEstudiantes = async () => {
  try {
    const estudiantes = await Estudiante.find({}, { __v: 0 }).lean();
    const backupPath = path.join(__dirname, "data", `backup-estudiantes-${new Date().toISOString().split("T")[0]}.json`);
    
    // Asegurar que existe la carpeta data
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(backupPath, JSON.stringify(estudiantes, null, 2));
    logger.info(`Backup de estudiantes creado: ${estudiantes.length} registros en ${backupPath}`);
    return backupPath;
  } catch (error) {
    logger.error(`Error creando backup: ${error.message}`);
    return null;
  }
};

// Inicializar usuario admin por defecto si no existe
const inicializarAdmin = async () => {
  try {
    const adminExistente = await Usuario.findOne({ username: "admin" });
    if (!adminExistente) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("admin123", salt);
      
      const admin = new Usuario({
        username: "admin",
        password: hashedPassword,
        nombre: "Administrador",
        rol: "admin"
      });
      
      await admin.save();
      console.log("Usuario admin creado: admin / admin123");
      logger.info("Usuario admin inicial creado");
    }
    
    // Ejecutar backup al inicio solo si se habilita por variable de entorno
    if (STARTUP_STUDENT_BACKUP) {
      const countEstudiantes = await Estudiante.countDocuments();
      if (countEstudiantes > 0) {
        await crearBackupEstudiantes();
      }
    }
  } catch (error) {
    console.error("Error al inicializar admin:", error);
    logger.error(`Error en inicialización: ${error.message}`);
  }
};

async function iniciarServidor() {
  await conectarMongoDB();
  await inicializarAdmin();

  app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
    logger.info(`Servidor iniciado en puerto ${PORT}`);
  });
}

iniciarServidor().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  logger.error(`Fallo al iniciar el servidor: ${error.message}`);
  process.exit(1);
});
