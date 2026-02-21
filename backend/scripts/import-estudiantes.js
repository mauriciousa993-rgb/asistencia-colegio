require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const {
  REQUIRED_HEADERS,
  parseCsv,
  buildStudentFromRow
} = require("../utils/estudiantesCsv");

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
        tipo: { type: String, enum: ["presente", "falta", "retardo", "salida"], required: true },
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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(__dirname, "..", args.file);

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: No existe el archivo: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCsv(content);

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
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
      const data = buildStudentFromRow(item.row);
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
