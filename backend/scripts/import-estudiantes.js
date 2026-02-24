require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: Falta MONGODB_URI en backend/.env");
  process.exit(1);
}

const estudianteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    grado: { type: String, required: true },
    grupo: { type: String, required: true },
    identificacion: { type: String, required: true, unique: true },
    fechaNacimiento: { type: Date },
    direccion: { type: String },
    telefono: { type: String },
    email: { type: String },
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
        tipo: { type: String, enum: ["falta", "retardo", "salida"], required: true },
        hora: { type: String },
        observacion: { type: String },
        fotoUrl: { type: String },
        registradoPor: { type: String }
      }
    ]
  },
  { timestamps: true }
);

const Estudiante = mongoose.model("Estudiante", estudianteSchema);

function parseArgs(argv) {
  const args = {
    file: "data/plantilla-estudiantes.csv",
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsv(content) {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.replace(/^\uFEFF/, "").trim()
  );

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] || "";
    });
    return { row, lineNumber: index + 2 };
  });

  return { headers, rows };
}

function valueOrEmpty(value) {
  return (value || "").trim();
}

function normalizeGrade(value) {
  return valueOrEmpty(value).replace(/[^\dA-Za-z]/g, "");
}

function normalizeGroup(value) {
  return valueOrEmpty(value).toUpperCase();
}

function parseOptionalDate(value) {
  const raw = valueOrEmpty(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("/");
    const date = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }

  throw new Error(`Fecha invalida: "${raw}". Usa YYYY-MM-DD o DD/MM/YYYY.`);
}

function buildStudent(row) {
  const identificacion = valueOrEmpty(row.identificacion);
  const nombre = valueOrEmpty(row.nombre);
  const grado = normalizeGrade(row.grado);
  const grupo = normalizeGroup(row.grupo);

  if (!identificacion) throw new Error("identificacion es obligatoria.");
  if (!nombre) throw new Error("nombre es obligatorio.");
  if (!grado) throw new Error("grado es obligatorio.");
  if (!grupo) throw new Error("grupo es obligatorio.");

  return {
    identificacion,
    nombre,
    grado,
    grupo,
    fechaNacimiento: parseOptionalDate(row.fechaNacimiento),
    direccion: valueOrEmpty(row.direccion),
    telefono: valueOrEmpty(row.telefono),
    email: valueOrEmpty(row.email),
    padre: {
      nombre: valueOrEmpty(row.padre_nombre),
      telefono: valueOrEmpty(row.padre_telefono),
      email: valueOrEmpty(row.padre_email),
      ocupacion: valueOrEmpty(row.padre_ocupacion)
    },
    madre: {
      nombre: valueOrEmpty(row.madre_nombre),
      telefono: valueOrEmpty(row.madre_telefono),
      email: valueOrEmpty(row.madre_email),
      ocupacion: valueOrEmpty(row.madre_ocupacion)
    },
    tutor: {
      nombre: valueOrEmpty(row.tutor_nombre),
      telefono: valueOrEmpty(row.tutor_telefono),
      email: valueOrEmpty(row.tutor_email),
      parentesco: valueOrEmpty(row.tutor_parentesco)
    }
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(__dirname, "..", args.file);

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: No existe el archivo: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCsv(content);

  const requiredHeaders = ["identificacion", "nombre", "grado", "grupo"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    console.error(`ERROR: Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (const item of rows) {
    try {
      const data = buildStudent(item.row);
      const existing = await Estudiante.findOne({ identificacion: data.identificacion }).select("_id");

      if (existing) {
        if (!args.dryRun) {
          await Estudiante.updateOne({ _id: existing._id }, data, { runValidators: true });
        }
        updated += 1;
      } else {
        if (!args.dryRun) {
          await Estudiante.create(data);
        }
        created += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(`Linea ${item.lineNumber}: ${error.message}`);
    }
  }

  console.log("======================================");
  console.log(args.dryRun ? "IMPORTACION (DRY RUN)" : "IMPORTACION COMPLETADA");
  console.log(`Archivo: ${csvPath}`);
  console.log(`Filas procesadas: ${rows.length}`);
  console.log(`Creados: ${created}`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Errores: ${failed}`);
  if (errors.length) {
    console.log("--------------------------------------");
    errors.forEach((error) => console.log(error));
  }
  console.log("======================================");

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("ERROR FATAL:", error.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // no-op
  }
  process.exit(1);
});
