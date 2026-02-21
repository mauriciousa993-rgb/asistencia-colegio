const REQUIRED_HEADERS = ["identificacion", "nombre", "grado", "grupo"];
const HEADER_ALIASES = {
  identificacion: ["identificacion", "id", "codigo", "cod", "documento"],
  nombre: ["nombre", "estudiante", "alumno"],
  grado: ["grado", "curso"],
  grupo: ["grupo", "salon", "seccion"],
  fechaNacimiento: ["fechanacimiento", "fecha_nacimiento", "nacimiento"],
  direccion: ["direccion"],
  telefono: ["telefono", "celular"],
  email: ["email", "correo", "correoelectronico"],
  padre_nombre: ["padre_nombre", "padrenombre", "nombrepadre"],
  padre_telefono: ["padre_telefono", "padretelefono", "telefonopadre"],
  padre_email: ["padre_email", "padreemail", "correopadre"],
  padre_ocupacion: ["padre_ocupacion", "padreocupacion", "ocupacionpadre"],
  madre_nombre: ["madre_nombre", "madrenombre", "nombremadre"],
  madre_telefono: ["madre_telefono", "madretelefono", "telefonomadre"],
  madre_email: ["madre_email", "madreemail", "correomadre"],
  madre_ocupacion: ["madre_ocupacion", "madreocupacion", "ocupacionmadre"],
  tutor_nombre: ["tutor_nombre", "tutornombre", "nombretutor"],
  tutor_telefono: ["tutor_telefono", "tutortelefono", "telefonotutor"],
  tutor_email: ["tutor_email", "tutoremail", "correotutor"],
  tutor_parentesco: ["tutor_parentesco", "tutorparentesco", "parentescotutor"]
};

const ALIAS_LOOKUP = Object.entries(HEADER_ALIASES).reduce((acc, [target, aliases]) => {
  aliases.forEach((alias) => {
    acc[normalizeHeaderToken(alias)] = target;
  });
  return acc;
}, {});

function normalizeHeaderToken(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function resolveHeader(rawHeader, state) {
  const trimmed = String(rawHeader || "").replace(/^\uFEFF/, "").trim();
  const token = normalizeHeaderToken(trimmed);

  // Compatibilidad con archivos de Excel donde vienen dos columnas "G":
  // primera G = grado, segunda G = grupo.
  if (token === "g") {
    if (!state.gAssignedToGrade) {
      state.gAssignedToGrade = true;
      return "grado";
    }
    if (!state.gAssignedToGroup) {
      state.gAssignedToGroup = true;
      return "grupo";
    }
  }

  return ALIAS_LOOKUP[token] || trimmed;
}

function parseCsvLine(line, delimiter = ",") {
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
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsv(content) {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const state = { gAssignedToGrade: false, gAssignedToGroup: false };
  const headers = parseCsvLine(lines[0], delimiter).map((header) => resolveHeader(header, state));

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line, delimiter);
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
