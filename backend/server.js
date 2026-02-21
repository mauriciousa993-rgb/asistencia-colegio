require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  REQUIRED_HEADERS,
  parseCsv,
  buildStudentFromRow
} = require("./utils/estudiantesCsv");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "secreto_super_seguro_2024";

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

function normalizeGrade(value) {
  return String(value || "").trim().replace(/[^\dA-Za-z]/g, "");
}

function normalizeGroup(value) {
  return String(value || "").trim().toUpperCase();
}

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

// ============ CONEXIÓN A MONGODB ============
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((error) => console.error("Error conectando a MongoDB:", error));

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

    const usuario = await Usuario.findOne({ username });
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
          }
          updated += 1;
        } else {
          if (!dryRun) {
            await Estudiante.create(data);
          }
          created += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push(`Linea ${item.lineNumber}: ${error.message}`);
      }
    }

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

    const estudianteEliminado = await Estudiante.findByIdAndDelete(req.params.id);
    if (!estudianteEliminado) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    
    res.json({ message: "Estudiante eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar estudiante" });
  }
});

// ============ ENDPOINTS DE ASISTENCIA ============

app.post("/api/asistencia", autenticarToken, async (req, res) => {
  const { estudianteId, fecha, tipo, hora, observacion, fotoUrl } = req.body;

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

    const fechaRegistro = new Date(fecha);
    if (Number.isNaN(fechaRegistro.getTime())) {
      return res.status(400).json({ error: "Fecha de asistencia invalida" });
    }

    const tipoNormalizado = normalizeAttendanceType(tipo);
    if (!tipoNormalizado) {
      return res.status(400).json({ error: "Tipo de asistencia invalido" });
    }

    const nuevoRegistro = {
      fecha: fechaRegistro,
      tipo: tipoNormalizado,
      hora: typeof hora === "string" ? hora.trim() : "",
      observacion: typeof observacion === "string" ? observacion.trim() : "",
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

    const fechaDesdeDate = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const fechaHastaDate = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;

    const estudiantes = await Estudiante.find(filtro)
      .select("nombre grado grupo identificacion historial");

    const lista = [];
    estudiantes.forEach((estudiante) => {
      (estudiante.historial || []).forEach((registro) => {
        const fechaRegistro = new Date(registro.fecha);
        if (tipoFiltro && normalizeAttendanceType(registro.tipo) !== tipoFiltro) return;
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

    const { fecha, tipo, hora, observacion, fotoUrl } = req.body;

    let fechaFinal = registro.fecha;
    if (typeof fecha === "string" && fecha.trim()) {
      const fechaRegistro = new Date(fecha);
      if (Number.isNaN(fechaRegistro.getTime())) {
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

    const horaFinal = typeof hora === "string" ? hora.trim() : (registro.hora || "");
    const observacionFinal = typeof observacion === "string" ? observacion.trim() : (registro.observacion || "");
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
    ultimoRegistro: historial[0] || null,
    ultimos30dias: {
      total: ultimos30dias.length,
      presentes: presentes30,
      faltas: faltas30,
      retardos: retardos30,
      salidas: salidas30
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
    });

    res.json({
      totalEstudiantes: estudiantes.length,
      totalPresentes,
      totalFaltas,
      totalRetardos,
      totalSalidas,
      totalRegistros
    });
  } catch (error) {
    res.status(500).json({ error: "Error al generar estadísticas" });
  }
});

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
    }
  } catch (error) {
    console.error("Error al inicializar admin:", error);
  }
};

inicializarAdmin();

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
