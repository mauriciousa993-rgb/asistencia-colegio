// Utilidades del cierre de año lectivo: normalizacion de grados,
// calculo del grado siguiente y armado del plan de promocion.

// Ultimo grado del colegio: al cerrar el año estos estudiantes se graduan.
const GRADO_FINAL_BACHILLERATO = 11;

function normalizeGrade(value) {
  return String(value || "").trim().replace(/[^\dA-Za-z]/g, "");
}

function normalizeGroup(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSchoolYear(value) {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  return /^\d{4}-\d{4}$/.test(raw) ? raw : "";
}

function isConsecutiveSchoolYear(anioActual, anioNuevo) {
  const [inicioActual, finActual] = anioActual.split("-").map(Number);
  const [inicioNuevo, finNuevo] = anioNuevo.split("-").map(Number);
  return (
    finActual === inicioActual + 1 &&
    finNuevo === inicioNuevo + 1 &&
    inicioNuevo === inicioActual + 1
  );
}

// A mitad de año (junio en adelante) el año lectivo por cerrar es el que ya termino.
function sugerirAniosLectivos(referencia = new Date()) {
  const anio = referencia.getFullYear();
  const mes = referencia.getMonth() + 1;
  const inicioActual = mes >= 6 ? anio - 1 : anio - 2;
  return {
    anioActual: `${inicioActual}-${inicioActual + 1}`,
    anioNuevo: `${inicioActual + 1}-${inicioActual + 2}`
  };
}

function calcularGradoSiguiente(grado) {
  const numero = Number(normalizeGrade(grado));
  if (!Number.isFinite(numero) || numero <= 0) {
    return { destino: "", motivo: "sin_grado" };
  }
  if (numero >= GRADO_FINAL_BACHILLERATO) {
    return { destino: "", motivo: "graduado" };
  }
  return { destino: String(numero + 1), motivo: "promovido" };
}

function construirPlanPromocion(estudiantes) {
  const porGrado = new Map();
  let graduados = 0;
  let promovidos = 0;
  const sinGrado = [];

  estudiantes.forEach((estudiante) => {
    const grado = normalizeGrade(estudiante.grado);
    const grupo = normalizeGroup(estudiante.grupo);
    const { destino, motivo } = calcularGradoSiguiente(grado);

    if (motivo === "graduado") graduados += 1;
    if (motivo === "promovido") promovidos += 1;
    if (motivo === "sin_grado") {
      sinGrado.push({
        nombre: estudiante.nombre || "",
        identificacion: estudiante.identificacion || "",
        grado: estudiante.grado || "",
        grupo: estudiante.grupo || ""
      });
    }

    const llave = grado || "(sin grado)";
    if (!porGrado.has(llave)) {
      porGrado.set(llave, {
        grado: llave,
        destino,
        motivo,
        totalEstudiantes: 0,
        grupos: {}
      });
    }

    const fila = porGrado.get(llave);
    fila.totalEstudiantes += 1;
    const llaveGrupo = grupo || "-";
    fila.grupos[llaveGrupo] = (fila.grupos[llaveGrupo] || 0) + 1;
  });

  // Los grados van de menor a mayor; lo que no tenga grado valido queda de ultimo.
  const movimientos = Array.from(porGrado.values()).sort((a, b) => {
    const numeroA = Number(a.grado);
    const numeroB = Number(b.grado);
    const validoA = Number.isFinite(numeroA);
    const validoB = Number.isFinite(numeroB);
    if (validoA && validoB) return numeroA - numeroB;
    if (validoA) return -1;
    if (validoB) return 1;
    return String(a.grado).localeCompare(String(b.grado), "es");
  });

  return {
    totalEstudiantes: estudiantes.length,
    graduados,
    promovidos,
    sinGrado,
    movimientos
  };
}

function contarRegistrosArchivo(estudiantes) {
  return estudiantes.reduce((acumulado, estudiante) => ({
    registros: acumulado.registros + (estudiante.historial || []).length,
    reportes: acumulado.reportes + (estudiante.reportesConvivencia || []).length
  }), { registros: 0, reportes: 0 });
}

module.exports = {
  GRADO_FINAL_BACHILLERATO,
  normalizeGrade,
  normalizeGroup,
  normalizeSchoolYear,
  isConsecutiveSchoolYear,
  sugerirAniosLectivos,
  calcularGradoSiguiente,
  construirPlanPromocion,
  contarRegistrosArchivo
};
