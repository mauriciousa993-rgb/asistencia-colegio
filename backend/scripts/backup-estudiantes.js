require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: Falta MONGODB_URI en backend/.env");
  process.exit(1);
}

// Schema simplificado solo para backup
const estudianteSchema = new mongoose.Schema({
  nombre: String,
  grado: String,
  grupo: String,
  identificacion: String,
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

async function crearBackup() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Conectado a MongoDB");

    const estudiantes = await Estudiante.find({}).lean();
    
    if (estudiantes.length === 0) {
      console.log("No hay estudiantes para respaldar");
      await mongoose.disconnect();
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(__dirname, "..", "data", "backups");
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `backup-estudiantes-${timestamp}.json`);
    
    const backupData = {
      fechaCreacion: new Date().toISOString(),
      totalEstudiantes: estudiantes.length,
      estudiantes: estudiantes
    };

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Backup creado exitosamente:`);
    console.log(`   Archivo: ${backupPath}`);
    console.log(`   Estudiantes: ${estudiantes.length}`);
    console.log(`   Fecha: ${new Date().toLocaleString()}`);

    // Listar backups existentes
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("backup-estudiantes-"))
      .sort()
      .reverse();

    console.log(`\n📁 Backups disponibles (${backups.length}):`);
    backups.slice(0, 5).forEach((backup, i) => {
      const stats = fs.statSync(path.join(backupDir, backup));
      console.log(`   ${i + 1}. ${backup} (${(stats.size / 1024).toFixed(1)} KB)`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error creando backup:", error.message);
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
  crearBackup();
}

module.exports = { crearBackup };
