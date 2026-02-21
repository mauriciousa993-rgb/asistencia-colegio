const REQUIRED_HEADERS = ["identificacion", "nombre", "grado", "grupo"];

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

function buildStudentFromRow(row) {
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

module.exports = {
  REQUIRED_HEADERS,
  parseCsv,
  buildStudentFromRow
};
