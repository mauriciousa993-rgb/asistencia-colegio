// Valoracion automatica del comportamiento a partir de los llamados de atencion.
// Tipologia del manual de convivencia (Ley 1620 / Decreto 1965):
//   Tipo 1: situaciones leves y esporadicas que afectan el clima escolar.
//   Tipo 2: agresion escolar, acoso o ciberacoso sin incapacidad medica.
//   Tipo 3: presuntos delitos contra la libertad o la integridad.

// Cuanto "pesa" cada llamado de atencion.
const PESO_POR_TIPO = {
  tipo1: 1,
  tipo2: 3,
  tipo3: 6
};

const VALORACIONES = {
  excelente: { valor: "excelente", etiqueta: "Excelente", orden: 1 },
  bueno: { valor: "bueno", etiqueta: "Bueno", orden: 2 },
  aceptable: { valor: "aceptable", etiqueta: "Aceptable", orden: 3 },
  insuficiente: { valor: "insuficiente", etiqueta: "Insuficiente", orden: 4 }
};

// Reglas, en el orden en que se evaluan. La primera que se cumple manda.
const REGLAS = [
  {
    valoracion: "insuficiente",
    cumple: ({ conteo, puntaje }) => conteo.tipo3 > 0 || conteo.tipo2 >= 2 || puntaje >= 6,
    explicar: ({ conteo }) => {
      if (conteo.tipo3 > 0) return "Tiene llamado(s) de atencion Tipo 3.";
      if (conteo.tipo2 >= 2) return "Acumula 2 o mas llamados Tipo 2.";
      return "Acumula demasiados llamados de atencion.";
    }
  },
  {
    valoracion: "aceptable",
    cumple: ({ puntaje }) => puntaje >= 3,
    explicar: () => "Acumula varios llamados de atencion."
  },
  {
    valoracion: "bueno",
    cumple: ({ puntaje }) => puntaje >= 1,
    explicar: () => "Tiene pocos llamados de atencion, todos leves."
  },
  {
    valoracion: "excelente",
    cumple: () => true,
    explicar: () => "No tiene llamados de atencion registrados."
  }
];

function normalizarTipologia(valor) {
  const raw = String(valor || "").trim().toLowerCase();
  if (raw === "tipo1" || raw === "baja" || raw === "1") return "tipo1";
  if (raw === "tipo2" || raw === "media" || raw === "2") return "tipo2";
  if (raw === "tipo3" || raw === "alta" || raw === "3") return "tipo3";
  return "tipo2";
}

function contarLlamadosPorTipo(reportes = []) {
  const conteo = { tipo1: 0, tipo2: 0, tipo3: 0 };
  reportes.forEach((reporte) => {
    conteo[normalizarTipologia(reporte.gravedad)] += 1;
  });
  return conteo;
}

function calcularValoracionComportamiento(reportes = []) {
  const conteo = contarLlamadosPorTipo(reportes);
  const puntaje = (conteo.tipo1 * PESO_POR_TIPO.tipo1)
    + (conteo.tipo2 * PESO_POR_TIPO.tipo2)
    + (conteo.tipo3 * PESO_POR_TIPO.tipo3);

  const regla = REGLAS.find((item) => item.cumple({ conteo, puntaje }));
  const definicion = VALORACIONES[regla.valoracion];

  return {
    valoracion: definicion.valor,
    etiqueta: definicion.etiqueta,
    orden: definicion.orden,
    puntaje,
    totalLlamados: conteo.tipo1 + conteo.tipo2 + conteo.tipo3,
    llamadosPorTipo: conteo,
    explicacion: regla.explicar({ conteo, puntaje })
  };
}

module.exports = {
  PESO_POR_TIPO,
  VALORACIONES,
  normalizarTipologia,
  contarLlamadosPorTipo,
  calcularValoracionComportamiento
};
