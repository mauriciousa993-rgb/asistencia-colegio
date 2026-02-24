require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: Falta MONGODB_URI en backend/.env");
  process.exit(1);
}

// Schema simplificado
const estudianteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  grado: { type: String, required: true },
  grupo: { type: String, required: true },
  identificacion: { type: String, required: true, unique: true },
  fechaNacimiento: Date,
  direccion: String,
  telefono: String,
  email: String,
  padre: {
    nombre: String,
    telefono: String,
    email: String,
    ocupacion: String
  },
  madre: {
    nombre: String,
    telefono: String,
    email: String,
    ocupacion: String
  },
  tutor: {
    nombre: String,
    telefono: String,
    email: String,
    parentesco: String
  },
  historial: Array,
  reportesConvivencia: Array
}, { timestamps: true });

const Estudiante = mongoose.model("Estudiante", estudianteSchema);

function parseArgs(argv) {
  const args = {
    file: null,
    dryRun: false,
    force: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force") {
      args.force = true;
    }
  }

  return args;
}

async function listarBackups() {
  const backupDir = path.join(__dirname, "..", "data", "backups");
  if (!fs.existsSync(backupDir)) {
    console.log("No existe directorio de backups");
    return [];
  }

  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith("backup-estudiantes-"))
    .sort()
    .reverse();
}

async function restaurarBackup() {
  const args = parseArgs(process.argv.slice(2));

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    // Si no se especifica archivo, mostrar lista
    if (!args.file) {
      const backups = await listarBackups();
      if (backups.length === 0) {
        console.log("❌ No hay backups disponibles");
        await mongoose.disconnect();
        return;
      }

      console.log("📁 Backups disponibles:");
      backups.forEach((backup, i) => {
        const stats = fs.statSync(path.join(__dirname, "..", "data", "backups", backup));
        console.log(`   ${i + 1}. ${backup} (${(stats.size / 1024).toFixed(1)} KB)`);
      });
      console.log("\nUso: node scripts/restore-estudiantes.js --file <nombre-del-backup> [--dry-run]");
      await mongoose.disconnect();
      return;
    }

    // Resolver ruta del backup
    let backupPath = args.file;
    if (!path.isAbsolute(backupPath)) {
      backupPath = path.join(__dirname, "..", "data", "backups", args.file);
    }

    if (!fs.existsSync(backupPath)) {
      console.error(`❌ No existe el archivo: ${backupPath}`);
      await mongoose.disconnect();
      return;
    }

    // Leer backup
    console.log(`📂 Leyendo backup: ${backupPath}`);
    const backupContent = fs.readFileSync(backupPath, "utf8");
    const backupData = JSON.parse(backupContent);

    const estudiantes = backupData.estudiantes || backupData;
    console.log(`📊 Backup contiene ${estudiantes.length} estudiantes`);
    console.log(`   Fecha del backup: ${backupData.fechaCreacion || "Desconocida"}`);

    // Verificar estudiantes actuales
    const countActual = await Estudiante.countDocuments();
    console.log(`📊 Estudiantes actuales en BD: ${countActual}`);

    if (countActual > 0 && !args.force && !args.dryRun) {
      console.log("\n⚠️  ADVERTENCIA: Ya existen estudiantes en la base de datos");
      console.log("    Usa --force para sobrescribir o --dry-run para simular");
      await mongoose.disconnect();
      return;
    }

    // Confirmar restauración
    if (!args.dryRun) {
      console.log(`\n🔄 Restaurando ${estudiantes.length} estudiantes...`);
    } else {
      console.log(`\n🔍 SIMULACIÓN (dry-run): Se restaurarían ${estudiantes.length} estudiantes`);
    }

    let creados = 0;
    let actualizados = 0;
    let errores = 0;

    for (const estData of estudiantes) {
      try {
        // Remover _id y __v para evitar conflictos
        const { _id, __v, ...cleanData } = estData;

        const existing = await Estudiante.findOne({ identificacion: cleanData.identificacion });

        if (existing) {
          if (!args.dryRun) {
            await Estudiante.updateOne({ _id: existing._id }, cleanData);
          }
          actualizados++;
        } else {
          if (!args.dryRun) {
            await Estudiante.create(cleanData);
          }
          creados++;
        }
      } catch (error) {
        console.error(`   ❌ Error con ${estData.identificacion}: ${error.message}`);
        errores++;
      }
    }

    console.log(`\n✅ Resultado (${args.dryRun ? "simulado" : "real"}):`);
    console.log(`   Creados: ${creados}`);
    console.log(`   Actualizados: ${actualizados}`);
    console.log(`   Errores: ${errores}`);

    if (!args.dryRun) {
      const countFinal = await Estudiante.countDocuments();
      console.log(`\n📊 Total estudiantes en BD: ${countFinal}`);
    }

    await mongoose.disconnect();
    console.log("\n👋 Desconectado de MongoDB");

  } catch (error) {
    console.error("❌ Error:", error.message);
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  restaurarBackup();
}

module.exports = { restaurarBackup };
