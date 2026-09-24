import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// Paleta de diseño Aspire v4
export const ASPIRE_THEME = {
  blue: '#3C64A3',
  lightBlue: '#4D76B2',
  teal: '#008C96',
  cyan: '#0BB7D6',
  yellow: '#FED56D',
  black: '#1D1D1B',
  gray: '#333333',
  bg: '#F8FAFC'
};

// 17 Comunidades Autónomas oficiales de España (sin Ceuta ni Melilla)
export const COMUNIDADES = [
  { id: 'ES61', nombre: 'Andalucía' },
  { id: 'ES24', nombre: 'Aragón' },
  { id: 'ES12', nombre: 'Principado de Asturias' },
  { id: 'ES53', nombre: 'Illes Balears' },
  { id: 'ES70', nombre: 'Canarias' },
  { id: 'ES13', nombre: 'Cantabria' },
  { id: 'ES41', nombre: 'Castilla y León' },
  { id: 'ES42', nombre: 'Castilla-La Mancha' },
  { id: 'ES51', nombre: 'Cataluña' },
  { id: 'ES52', nombre: 'Comunidad Valenciana' },
  { id: 'ES43', nombre: 'Extremadura' },
  { id: 'ES11', nombre: 'Galicia' },
  { id: 'ES30', nombre: 'Comunidad de Madrid' },
  { id: 'ES62', nombre: 'Región de Murcia' },
  { id: 'ES22', nombre: 'Comunidad Foral de Navarra' },
  { id: 'ES21', nombre: 'País Vasco' },
  { id: 'ES23', nombre: 'La Rioja' }
];

export const CCAA_NAME_MAP = COMUNIDADES.reduce((acc, c) => {
  acc[c.id] = c.nombre;
  return acc;
}, {
  ES63: 'Ceuta',
  ES64: 'Melilla'
});

// Diccionario de cadenas (String Interning) para evitar crear millones de strings idénticos en V8
const stringPool = new Map();
const intern = (str) => {
  if (!str) return '';
  const trimmed = String(str).trim();
  let existing = stringPool.get(trimmed);
  if (!existing) {
    stringPool.set(trimmed, trimmed);
    existing = trimmed;
  }
  return existing;
};

// Limpieza y normalización de propiedades conservando solo los campos requeridos
export const normalizeFeatureProperties = (f, index = 0) => {
  const props = f.properties || {};
  const rawArea = props.area || props.AREA || props.nom_area || props.nombre_area || 'Desconocida';
  const rawZbsName = props.n_zbs || props.N_ZBS || props.nom_zbs || props.nombre_zbs || `ZBS_${index}`;
  const rawZbsCode = props.codatzbs || props.CODATZBS || props.cod_zbs || props.COD_ZBS || `NEW-${index}`;

  const cleanCode = intern(String(rawZbsCode).replace(/\.0+$/, '').trim());
  const cleanName = intern(String(rawZbsName).trim());
  const cleanArea = intern(String(rawArea).trim());

  return {
    codatzbs: cleanCode,
    n_zbs: cleanName,
    nombre_zbs_normalizado: cleanName,
    nombre_area_normalizado: cleanArea
  };
};

const pruneCoordinates = (coords) => {
  if (typeof coords[0] === 'number') {
    return [
      Math.round(coords[0] * 100000) / 100000,
      Math.round(coords[1] * 100000) / 100000
    ];
  }
  return coords.map(pruneCoordinates);
};

export const formatZbsDisplayName = (name, code = '') => {
  if (!name && !code) return 'ZBS';
  let str = String(name || code).trim();
  str = str.replace(/^zbs[\s:_-]*/i, '').trim();
  return `ZBS: ${str || code}`;
};

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const rgbToLab = ([r, g, b]) => {
  let rL = r / 255, gL = g / 255, bL = b / 255;
  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  const x = (rL * 0.4124 + gL * 0.3576 + bL * 0.1805) / 0.95047;
  const y = (rL * 0.2126 + gL * 0.7152 + bL * 0.0722) / 1.00000;
  const z = (rL * 0.0193 + gL * 0.1192 + bL * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE = (lab1, lab2) => {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
};

const hslToHex = (h, s, l) => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const geoDistanceKm = (h1, h2) => {
  const lat1 = h1.lat;
  const lon1 = h1.lon;
  const lat2 = h2.lat;
  const lon2 = h2.lon;

  if (!lat1 || !lon1 || !lat2 || !lon2 || isNaN(lat1) || isNaN(lat2) || (lat1 === 0 && lon1 === 0)) {
    return 9999;
  }

  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const MAX_CONTRAST_PALETTE_HEX = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
  '#9a6324', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075',
  '#17becf', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b',
  '#e377c2', '#bcbd22', '#008080', '#b15928', '#6a3d9a', '#33a02c',
  '#ff1493', '#00bfff', '#ff4500', '#2e8b57', '#8a2be2', '#d2691e',
  '#00ced1', '#ff6347', '#059669', '#7c3aed', '#db2777', '#ca8a04'
];

// Generación única fuera del ciclo de renders para ahorrar miles de llamadas y memoria
const STATIC_CANDIDATE_POOL = (() => {
  const pool = [];
  const registeredHex = new Set();

  const addColor = (hex) => {
    const cleanHex = hex.toLowerCase();
    if (!registeredHex.has(cleanHex)) {
      registeredHex.add(cleanHex);
      const rgb = hexToRgb(cleanHex);
      pool.push({ hex: cleanHex, rgb, lab: rgbToLab(rgb) });
    }
  };

  MAX_CONTRAST_PALETTE_HEX.forEach(addColor);
  const goldenAngle = 137.50776405;
  const lightnessLevels = [46, 58, 38, 68, 52, 62, 34, 72];
  const saturationLevels = [92, 85, 98, 78, 100];

  let step = 0;
  while (pool.length < 1300 && step < 10000) {
    const h = (step * goldenAngle) % 360;
    const l = lightnessLevels[step % lightnessLevels.length];
    const s = saturationLevels[Math.floor(step / lightnessLevels.length) % saturationLevels.length];
    addColor(hslToHex(h, s, l));
    step++;
  }
  return pool;
})();

const getRedCategory = (redStr) => {
  if (!redStr) return 'publico';
  const norm = String(redStr)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (norm.includes('ambos') || norm.includes('mixt')) return 'ambos';
  if (norm.includes('privad') || norm.includes('concertad')) return 'privado';
  return 'publico';
};

const checkMatchesRed = (redStr, targetFilter) => {
  const cat = getRedCategory(redStr);
  if (targetFilter === 'ambos') return cat === 'ambos';
  if (targetFilter === 'privados' || targetFilter === 'privado') return cat === 'privado';
  return cat === 'publico';
};

const RAW_ESPECIALIDADES_LIST = [
  "1. Quemados críticos",
  "101. Transporte en ECMO neonatal y pediátrico",
  "11. Reconstrucción de la superficie ocular compleja. Queratoprótesis",
  "13R1. Irradiación total con electrones en micosis fungoide",
  "14R1. Tumores germinales de riesgo alto e intermedio y resistentes a quimioterapia de primera línea en adultos",
  "15R1. Trasplante renal pediátrico",
  "16R1. Trasplante hepático pediátrico",
  "18R1. Trasplante pulmonar pediátrico y adulto",
  "19R1. Trasplante cardio-pulmonar de adultos",
  "2. Reconstrucción del pabellón auricular",
  "20R1. Trasplante cardiaco pediátrico",
  "21R1. Trasplante de páncreas",
  "22. Trasplante de intestino (infantil y adulto)",
  "23R1. Queratoplastia en niños",
  "25. Osteotomía pélvica en displasias de cadera en el adulto",
  "26. Tratamiento de las infecciones osteoarticulares resistentes",
  "27. Ortopedia infantil",
  "28. Reimplantes, incluyendo la mano catastrófica",
  "31. Trasplante de progenitores hematopoyéticos alogénico infantil",
  "32R1. Cardiopatías complejas en pacientes pediátricos",
  "33R1. Cardiopatías congénitas en adultos",
  "34R1. Cirugía reparadora compleja de válvula mitral en adultos",
  "35R2. Arritmias en edad pediátrica",
  "37R1. Cardiopatías familiares",
  "38R1. Cirugía del plexo braquial",
  "39. Epilepsia refractaria",
  "3R1. Glaucoma en la infancia",
  "40R1. Cirugía de los trastornos del movimiento",
  "41R1. Neuromodulación cerebral y medular del dolor neuropático refractario",
  "42R1. Ataxias y paraplejías hereditarias",
  "43R1. Esclerosis múltiple",
  "45. Atención al lesionado medular complejo",
  "46. Neurocirugía pediátrica compleja",
  "49. Enfermedades tropicales importadas",
  "4R1. Alteraciones congénitas del desarrollo ocular y palpebral",
  "50. Enfermedades metabólicas congénitas",
  "51R1. Enfermedades neuromusculares raras",
  "52. Síndromes neurocutáneos genéticos (facomatosis)",
  "53. Enfermedades raras que cursan con trastornos del movimiento",
  "55. Trastornos complejos del sistema nervioso autónomo",
  "56. Neuroblastoma",
  "57. Sarcomas en la infancia",
  "58. Sarcomas y otros tumores musculoesqueléticos en adultos",
  "59. Hipertensión pulmonar compleja",
  "5R1. Tumores orbitarios infantiles",
  "60. Tumores renales con afectación vascular",
  "61. Epidermolisis ampollosa",
  "62. Trastornos hereditarios de la queratinización",
  "63. Complejo extrofia-epispadias (extrofia vesical, epispadias y extrofia de cloaca)",
  "64. Enfermedad renal infantil grave y tratamiento con diálisis",
  "65. Cirugía reconstructiva uretral compleja del adulto",
  "66. Enfermedades glomerulares complejas (niños y adultos)",
  "67. Eritropatología hereditaria",
  "68R1. Coagulopatías congénitas",
  "69. Síndromes de fallo medular congénito",
  "6R1. Tumores intraoculares en la infancia",
  "70. Mastocitosis",
  "71. Patología compleja hipotálamo-hipofisaria (niños y adultos)",
  "73. Enfermedades autoinmunes sistémicas",
  "74. Angiodema hereditario",
  "75. Inmunodeficiencias primarias",
  "76. Enfermedades autoinflamatorias",
  "77. Cirugía vitreoretiniana pediátrica",
  "78. Catarata compleja en niños",
  "79. Distrofias hereditarias de retina",
  "7R1. Tumores intraoculares del adulto",
  "80. Atresia de esófago compleja",
  "81. Enfermedad inflamatoria intestinal pediátrica",
  "82. Trastornos de conducta de alimentación de la primera infancia",
  "83. Hepatopatías complejas pediátricas",
  "84. Tratamiento endoscópico avanzado mediante POEM en acalasia primaria tipo III del adulto",
  "85. Enfermedad vascular hepática compleja en el adulto",
  "86. Drenaje guiado por endoscopia de la obstrucción bilio-pancreática compleja",
  "87. Extracción de electrodos en adultos",
  "88. Cirugía preservadora de la válvula aórtica en adultos",
  "89. Aneurisma intracraneal complejo y revascularización cerebral en adultos",
  "8R1. Descompresión orbitaria en oftalmopatía tiroidea",
  "90. Atención a las malformaciones arteriovenosas cerebrales y a la patología vascular raquimedular",
  "91. Cefaleas y neuralgias craneales refractarias en adultos",
  "92. Malformaciones complejas de la charnela cráneo-cervical en adultos",
  "93. Enfermedades minoritarias en adultos que cursan con trastornos cognitivos",
  "94. Tumores renales pediátricos",
  "95. Cáncer adrenocortical (adultos y niños)",
  "97. Cirugía de resección o reconstrucción esofágica compleja en adultos",
  "98. Tratamiento endoscópico de neoplasias gastrointestinales precoces complejas",
  "99. Tratamiento quirúrgico del cáncer de páncreas de resecabilidad límite en adultos",
  "9R1. Tumores orbitarios del adulto",
  "U.10 Endocrinología",
  "U.100 Transporte sanitario (carretera, aéreo, marítimo)",
  "U.101 Terapias no convencionales",
  "U.11 Nutrición y Dietética",
  "U.12 Geriatría",
  "U.13 Medicina interna",
  "U.14 Nefrología",
  "U.15 Diálisis",
  "U.16 Neumología",
  "U.17 Neurología",
  "U.18 Neurofisiología",
  "U.19 Oncología",
  "U.20 Pediatría",
  "U.21 Cirugía pediátrica",
  "U.22 Cuidados intermedios neonatales",
  "U.23 Cuidados intensivos neonatales",
  "U.24 Reumatología",
  "U.25 Obstetricia",
  "U.26 Ginecología",
  "U.27 Inseminación artificial",
  "U.28 Fecundación in vitro",
  "U.29 Banco de semen",
  "U.3 Enfermería obstétrico-ginecológica (matrona)",
  "U.30 Laboratorio de semen para capacitación espermática",
  "U.31 Banco de embriones",
  "U.32 Recuperación de oocitos",
  "U.33 Planificación familiar",
  "U.34 Interrupción voluntaria del embarazo",
  "U.35 Anestesia y Reanimación",
  "U.36 Tratamiento del dolor",
  "U.37 Medicina intensiva",
  "U.38 Quemados",
  "U.39 Angiología y Cirugía Vascular",
  "U.4 Podología",
  "U.40 Cirugía cardiaca",
  "U.41 Hemodinámica",
  "U.42 Cirugía torácica",
  "U.43 Cirugía general y digestivo",
  "U.44 Odontología/Estomatología",
  "U.45 Cirugía maxilofacial",
  "U.46 Cirugía plástica y reparadora",
  "U.47 Cirugía estética",
  "U.48 Medicina estética",
  "U.49 Neurocirugía",
  "U.5 Vacunación",
  "U.50 Oftalmología",
  "U.51 Cirugía refractiva",
  "U.52 Otorrinolaringología",
  "U.53 Urología",
  "U.54 Litotricia renal",
  "U.55 Cirugía ortopédica y Traumatología",
  "U.56 Lesionados medulares",
  "U.57 Rehabilitación",
  "U.58 Hidrología",
  "U.59 Fisioterapia",
  "U.6 Alergología",
  "U.60 Terapia ocupacional",
  "U.61 Logopedia",
  "U.62 Foniatría",
  "U.63 Cirugía mayor ambulatoria",
  "U.64 Cirugía menor ambulatoria",
  "U.65 Hospital de día",
  "U.66 Atención sanitaria domiciliaria",
  "U.67 Cuidados paliativos",
  "U.69 Psiquiatría",
  "U.7 Cardiología",
  "U.70 Psicología clínica",
  "U.71 Atención sanitaria a drogodependientes",
  "U.75 Inmunología",
  "U.77 Anatomía patológica",
  "U.78 Genética",
  "U.79 Hematología clínica",
  "U.8 Dermatología",
  "U.81 Extracción de sangre para donación",
  "U.82 Servicio de transfusión",
  "U.84 Depósito de medicamentos",
  "U.85 Farmacología clínica",
  "U.86 Radioterapia",
  "U.87 Medicina nuclear",
  "U.88 Radiodiagnóstico",
  "U.9 Aparato digestivo",
  "U.90 Medicina preventiva",
  "U.900 Otras unidades asistenciales",
  "U.91 Medicina de la educación física y el deporte",
  "U.92 Medicina hiperbárica",
  "U.93 Extracción de órganos",
  "U.94 Trasplante de órganos",
  "U.95 Obtención de tejidos",
  "U.96 Implantación de tejidos",
  "U.97 Banco de tejidos",
  "U.98 Medicina aeronáutica",
  "U.99 Medicina del trabajo"
];

const parseSpecialty = (str) => {
  const isU = str.startsWith('U.');
  let numVal = 0, code = '', name = '';

  if (isU) {
    const match = str.match(/^U\.(\d+)\s*(.*)$/);
    if (match) {
      numVal = parseInt(match[1], 10);
      code = `U.${match[1]}`;
      name = match[2] || '';
    }
  } else {
    const match = str.match(/^(\d+)(R\d+)?\.\s*(.*)$/);
    if (match) {
      numVal = parseInt(match[1], 10);
      code = `${match[1]}${match[2] || ''}`;
      name = match[3] || '';
    }
  }

  return {
    raw: str.trim(),
    isU,
    numVal,
    code,
    name: name.trim(),
    category: isU ? 'Unidades Asistenciales (RD 1277/2003)' : 'Patologías / CSUR'
  };
};

const SORTED_ESPECIALIDADES = [...RAW_ESPECIALIDADES_LIST]
  .map(parseSpecialty)
  .sort((a, b) => {
    if (a.isU !== b.isU) return a.isU ? 1 : -1;
    if (a.numVal !== b.numVal) return a.numVal - b.numVal;
    return a.code.localeCompare(b.code);
  });

const CSUR_COUNT = SORTED_ESPECIALIDADES.filter((e) => !e.isU).length;
const UX_COUNT = SORTED_ESPECIALIDADES.filter((e) => e.isU).length;

const normalizeEspKey = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const getCanonicalKey = (str) => {
  if (!str) return '';
  const norm = normalizeEspKey(str);
  const match = norm.match(/^(\d+r?\d*|u\d+)/);
  return match ? match[1] : norm;
};

const TAB_DESCRIPTIONS = {
  todas: {
    title: 'Catálogo Completo SNS',
    subtitle: 'CSUR + Unidades RD 1277/2003',
    desc: 'Muestra la totalidad de prestaciones: tanto las 101 patologías y técnicas de alta especialización CSUR como todas las unidades asistenciales U.X tipificadas a nivel nacional.'
  },
  csur: {
    title: 'CSUR (Centros, Servicios y Unidades de Referencia)',
    subtitle: 'Designación Ministerial (Códigos 1 al 101)',
    desc: 'Atención a patologías complejas, técnicas diagnósticas y procedimientos de alta especialización acreditados por el Ministerio de Sanidad para garantizar la equidad asistencial en todo el SNS.'
  },
  unidades: {
    title: 'Unidades Asistenciales (RD 1277/2003)',
    subtitle: 'Especialidades Hospitalarias y Ambulatorias (U.X)',
    desc: 'Clasificación y definición oficial de las unidades asistenciales y especialidades del Sistema Nacional de Salud (U.13 Medicina Interna, U.20 Pediatría, U.7 Cardiología, etc.).'
  }
};

const INITIAL_SAMPLE_CENTROS = [
  { codatzbs: intern('12601'), hosp: intern('HOSPITAL UNIVERSITARIO VIRGEN DEL ROCIO'), red: intern('Ambos'), lat: 37.3570507, lon: -5.9791912 },
  { codatzbs: intern('12801'), hosp: intern('HOSPITAL CLINICO UNIVERSITARIO VIRGEN DE LA ARRIXACA'), red: intern('Ambos'), lat: 37.934206, lon: -1.162941 },
  { codatzbs: intern('130101'), hosp: intern('HOSPITAL UNIVERSITARIO CRUCES'), red: intern('Ambos'), lat: 43.2808631, lon: -2.9836477 },
  { codatzbs: intern('150103'), hosp: intern('HOSPITAL UNIVERSITARIO Y POLITECNICO LA FE'), red: intern('Ambos'), lat: 39.444613, lon: -0.3727106 },
  { codatzbs: intern('150118'), hosp: intern('HOSPITAL UNIVERSITARIO 12 DE OCTUBRE'), red: intern('Ambos'), lat: 40.3764449, lon: -3.6969452 },
  { codatzbs: intern('150402'), hosp: intern('HOSPITAL UNIVERSITARIO RAMON Y CAJAL'), red: intern('Ambos'), lat: 40.4874997, lon: -3.6968814 }
];

const INITIAL_FALLBACK_ZBS = [
  {
    type: 'Feature',
    properties: { codatzbs: intern('150118'), n_zbs: intern('ZBS Villaverde - 12 de Octubre'), ccaa_id: 'ES30', ccaa_origen: 'Comunidad de Madrid' },
    geometry: { type: 'Polygon', coordinates: [[[-3.72, 40.36], [-3.68, 40.36], [-3.68, 40.39], [-3.72, 40.39], [-3.72, 40.36]]] }
  },
  {
    type: 'Feature',
    properties: { codatzbs: intern('150402'), n_zbs: intern('ZBS Fuencarral - Ramón y Cajal'), ccaa_id: 'ES30', ccaa_origen: 'Comunidad de Madrid' },
    geometry: { type: 'Polygon', coordinates: [[[-3.71, 40.47], [-3.67, 40.47], [-3.67, 40.50], [-3.71, 40.50], [-3.71, 40.47]]] }
  },
  {
    type: 'Feature',
    properties: { codatzbs: intern('12601'), n_zbs: intern('ZBS Sevilla Sur - Virgen del Rocío'), ccaa_id: 'ES61', ccaa_origen: 'Andalucía' },
    geometry: { type: 'Polygon', coordinates: [[[-6.00, 37.34], [-5.96, 37.34], [-5.96, 37.37], [-6.00, 37.37], [-6.00, 37.34]]] }
  },
  {
    type: 'Feature',
    properties: { codatzbs: intern('130101'), n_zbs: intern('ZBS Barakaldo - Cruces'), ccaa_id: 'ES21', ccaa_origen: 'País Vasco' },
    geometry: { type: 'Polygon', coordinates: [[[-2.99, 43.27], [-2.96, 43.27], [-2.96, 43.30], [-2.99, 43.30], [-2.99, 43.27]]] }
  }
];

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLibreReady, setMapLibreReady] = useState(false);

  // Almacén estático para las geometrías de las ZBS (sin clonaciones innecesarias)
  const baseFeaturesRef = useRef(INITIAL_FALLBACK_ZBS);
  // Referencia al mapa de asignación actual para consultas O(1) en hover/clic sin duplicar objetos
  const activeZbsLookupRef = useRef(new Map());
  // Diccionario global de coordenadas de hospitales (única instancia en memoria)
  const hospCoordsRef = useRef(new Map([
    [intern('HOSPITAL UNIVERSITARIO VIRGEN DEL ROCIO'), [37.3570507, -5.9791912]],
    [intern('HOSPITAL CLINICO UNIVERSITARIO VIRGEN DE LA ARRIXACA'), [37.934206, -1.162941]],
    [intern('HOSPITAL UNIVERSITARIO CRUCES'), [43.2808631, -2.9836477]],
    [intern('HOSPITAL UNIVERSITARIO Y POLITECNICO LA FE'), [39.444613, -0.3727106]],
    [intern('HOSPITAL UNIVERSITARIO 12 DE OCTUBRE'), [40.3764449, -3.6969452]],
    [intern('HOSPITAL UNIVERSITARIO RAMON Y CAJAL'), [40.4874997, -3.6968814]]
  ]));

  const [csvIndexMap, setCsvIndexMap] = useState(() => {
    const map = new Map();
    const defaultKey = getCanonicalKey('50. Enfermedades metabólicas congénitas');
    map.set(defaultKey, INITIAL_SAMPLE_CENTROS);
    return map;
  });

  const [loadingGeoJSON, setLoadingGeoJSON] = useState(false);
  const [loadedCCAAInfo, setLoadedCCAAInfo] = useState({ loadedCount: 0, totalFeatures: INITIAL_FALLBACK_ZBS.length });
  const [dataSourceType, setDataSourceType] = useState('cargando'); // 'parquet' | 'csv' | 'muestra'

  const [selectedSpecialty, setSelectedSpecialty] = useState(
    SORTED_ESPECIALIDADES.find((e) => e.code === '50') || SORTED_ESPECIALIDADES[0]
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState('todas');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [selectedFeatureInfo, setSelectedFeatureInfo] = useState(null);
  const [activeHospitalHighlight, setActiveHospitalHighlight] = useState(null);
  const [redFilter, setRedFilter] = useState('publicos');
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);

  useEffect(() => {
    if (window.maplibregl) {
      setMapLibreReady(true);
      return;
    }

    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
    script.async = true;
    script.onload = () => setMapLibreReady(true);
    document.head.appendChild(script);
  }, []);

  // Carga preferente de huff_centros.parquet (ultra-ligero en memoria) con fallback a CSV
  useEffect(() => {
    let isSubscribed = true;

    const getColIndex = (colNames, patterns) => {
      return colNames.findIndex((name) => {
        const lower = String(name).toLowerCase().trim();
        return patterns.some((p) => lower === p || lower.includes(p));
      });
    };

    const tryLoadParquet = async () => {
      const parquetCandidates = [
        '/data/huff/huff_centros.parquet',
        'data/huff/huff_centros.parquet',
        './data/huff/huff_centros.parquet',
        `${window.location.origin}/data/huff/huff_centros.parquet`
      ];

      for (const url of parquetCandidates) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/html')) continue;

            const arrayBuffer = await res.arrayBuffer();
            if (!isSubscribed || !arrayBuffer || arrayBuffer.byteLength < 500) continue;

            // Importación dinámica de hyparquet (pure JS, zero dependencies, <15KB)
            let parquetReadModule;
            try {
              parquetReadModule = await import('https://cdn.jsdelivr.net/npm/hyparquet/+esm');
            } catch (_) {
              try {
                parquetReadModule = await import('https://unpkg.com/hyparquet/src/hyparquet.min.js');
              } catch (e) {
                console.warn('No se pudo cargar el módulo hyparquet desde CDN:', e);
                return false;
              }
            }

            const { parquetRead, parquetMetadata, parquetSchema } = parquetReadModule;
            if (!parquetRead || !parquetMetadata) continue;

            const metadata = parquetMetadata(arrayBuffer);
            const schema = parquetSchema(metadata);
            const colNames = (schema.children || []).map((c) => c.element.name);

            const idxCod = getColIndex(colNames, ['codatzbs', 'cod_zbs', 'cod']);
            const idxHosp = getColIndex(colNames, ['hosp', 'hospital', 'centro']);
            const idxEsp = getColIndex(colNames, ['especialidad', 'esp']);
            const idxRed = getColIndex(colNames, ['red', 'tipo_red']);
            const idxLat = getColIndex(colNames, ['lat', 'latitude']);
            const idxLon = getColIndex(colNames, ['lon', 'longitude']);
            const idxGeoref = getColIndex(colNames, ['georef', 'point']);

            const newIndexMap = new Map();
            const coordsMap = hospCoordsRef.current;

            await parquetRead({
              file: arrayBuffer,
              onComplete: (rows) => {
                if (!Array.isArray(rows)) return;
                for (let i = 0; i < rows.length; i++) {
                  const row = rows[i];
                  const rawEsp = idxEsp !== -1 ? row[idxEsp] : '';
                  const canonKey = getCanonicalKey(rawEsp);

                  if (canonKey) {
                    const rawCod = idxCod !== -1 ? String(row[idxCod] ?? '').replace(/\.0+$/, '').trim() : '';
                    const rawHosp = idxHosp !== -1 ? String(row[idxHosp] ?? '').trim() : '';
                    const rawRed = idxRed !== -1 ? String(row[idxRed] ?? '').trim() : 'Publico';

                    const hosp = intern(rawHosp);
                    const codatzbs = intern(rawCod);
                    const red = intern(rawRed);

                    if (hosp && !coordsMap.has(hosp)) {
                      let lat = 0, lon = 0;
                      if (idxLat !== -1 && idxLon !== -1) {
                        lat = Number(row[idxLat]);
                        lon = Number(row[idxLon]);
                      }
                      if ((isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) && idxGeoref !== -1) {
                        const match = String(row[idxGeoref] || '').match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
                        if (match) {
                          lon = parseFloat(match[1]);
                          lat = parseFloat(match[2]);
                        }
                      }
                      if (!isNaN(lat) && !isNaN(lon) && lat !== 0) {
                        coordsMap.set(hosp, [lat, lon]);
                      }
                    }

                    let list = newIndexMap.get(canonKey);
                    if (!list) {
                      list = [];
                      newIndexMap.set(canonKey, list);
                    }
                    list.push({ codatzbs, hosp, red });
                  }
                }
              }
            });

            if (isSubscribed && newIndexMap.size > 0) {
              setCsvIndexMap(newIndexMap);
              setDataSourceType('parquet');
              return true;
            }
          }
        } catch (err) {
          console.warn('Intento con Parquet falló en', url, err);
        }
      }
      return false;
    };



    const loadData = async () => {
      const parquetSuccess = await tryLoadParquet();
    };

    loadData();
    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    setLoadingGeoJSON(true);

    const loadAllCCAAGeoJSONs = async () => {
      const collected = [];
      let globalIndex = 0;
      let validCount = 0;
      const batchSize = 3;

      for (let i = 0; i < COMUNIDADES.length; i += batchSize) {
        if (!isSubscribed) return;
        const batch = COMUNIDADES.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(async (ccaa) => {
            try {
              const url = `./data/2024/ZBS_4258_${ccaa.id}_all_original.geojson`;
              const res = await fetch(url);
              if (!res.ok) return null;
              const json = await res.json();
              return { ccaaId: ccaa.id, name: ccaa.nombre, json };
            } catch (_) {
              return null;
            }
          })
        );

        batchResults.forEach((fileResult) => {
          if (!fileResult || !fileResult.json || !Array.isArray(fileResult.json.features)) return;
          validCount++;

          const features = fileResult.json.features;
          for (let fIdx = 0; fIdx < features.length; fIdx++) {
            const feat = features[fIdx];
            globalIndex++;
            const norm = normalizeFeatureProperties(feat, globalIndex);

            // Optimización de geometría y poda drástica de atributos innecesarios del shapefile
            const optimizedGeometry = feat.geometry ? {
              type: feat.geometry.type,
              coordinates: pruneCoordinates(feat.geometry.coordinates)
            } : feat.geometry;

            collected.push({
              type: 'Feature',
              id: norm.codatzbs,
              geometry: optimizedGeometry,
              properties: {
                codatzbs: norm.codatzbs,
                n_zbs: norm.n_zbs,
                nombre_area_normalizado: norm.nombre_area_normalizado,
                ccaa_origen: fileResult.name,
                ccaa_id: fileResult.ccaaId
              }
            });
          }

          // Liberación explícita del JSON masivo descargado
          fileResult.json = null;
        });

        if (isSubscribed) {
          setLoadedCCAAInfo({
            loadedCount: validCount,
            totalFeatures: collected.length
          });
        }
      }

      if (isSubscribed && collected.length > 0) {
        baseFeaturesRef.current = collected;
        setLoadedCCAAInfo({
          loadedCount: validCount,
          totalFeatures: collected.length
        });
      }
      setLoadingGeoJSON(false);
    };

    loadAllCCAAGeoJSONs();
    return () => {
      isSubscribed = false;
    };
  }, []);

  const activeSpecialtyData = useMemo(() => {
    const canonKey =  getCanonicalKey(selectedSpecialty.raw);

    let rows = csvIndexMap.get(canonKey);
    if (!rows || rows.length === 0) {
      rows = INITIAL_SAMPLE_CENTROS;
    }

    const zbsMap = new Map();
    const hospitalsMap = new Map();
    const coordsMap = hospCoordsRef.current;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cod = r.codatzbs;
      const hosp = r.hosp;
      const red = r.red;
      const cat = getRedCategory(red);

      const assignObj = { hosp, red, redCategory: cat, isPrivado: cat === 'privado' };

      if (!zbsMap.has(cod)) {
        zbsMap.set(cod, { publico: null, privado: null, ambos: null, general: null });
      }
      const curr = zbsMap.get(cod);
      if (!curr.general) curr.general = assignObj;
      if (cat === 'ambos') curr.ambos = assignObj;
      else if (cat === 'privado') curr.privado = assignObj;
      else curr.publico = assignObj;

      let hospRecord = hospitalsMap.get(hosp);
      if (!hospRecord) {
        const coords = coordsMap.get(hosp) || [0, 0];
        hospRecord = {
          nombre: hosp,
          lat: coords[0],
          lon: coords[1],
          red,
          redCategory: cat,
          isPrivado: cat === 'privado',
          redsSet: new Set([cat])
        };
        hospitalsMap.set(hosp, hospRecord);
      } else {
        hospRecord.redsSet.add(cat);
      }
    }

    return { zbsMap, hospitalsMap };
  }, [csvIndexMap, selectedSpecialty]);

  const filteredSpecialties = useMemo(() => {
    return SORTED_ESPECIALIDADES.filter((item) => {
      const matchesSearch = item.raw.toLowerCase().includes(searchFilter.toLowerCase());
      if (activeTab === 'csur') return matchesSearch && !item.isU;
      if (activeTab === 'unidades') return matchesSearch && item.isU;
      return matchesSearch;
    });
  }, [searchFilter, activeTab]);

  const hospitalColorMapping = useMemo(() => {
    const rawHospitals = Array.from(activeSpecialtyData.hospitalsMap.values());
    const candidates = STATIC_CANDIDATE_POOL;
    const colors = {};
    const hospitalsList = [];
    const usedHexSet = new Set();

    rawHospitals.forEach((hosp) => {
      let neighbors = 0;
      rawHospitals.forEach((other) => {
        if (hosp.nombre !== other.nombre && geoDistanceKm(hosp, other) < 40) {
          neighbors++;
        }
      });
      hosp._densityScore = neighbors * 100;
    });

    const sorted = [...rawHospitals].sort((a, b) => b._densityScore - a._densityScore);
    const assigned = [];

    for (let i = 0; i < sorted.length; i++) {
      const hosp = sorted[i];
      let bestCandidate = null;
      let minPenalty = Infinity;

      for (let j = 0; j < candidates.length; j++) {
        const cand = candidates[j];
        if (usedHexSet.has(cand.hex)) continue;
        let penalty = 0;

        for (let k = 0; k < assigned.length; k++) {
          const other = assigned[k];
          const dKm = geoDistanceKm(hosp, other);
          if (dKm > 140) continue;

          const dE = deltaE(cand.lab, other.lab);
          if (dKm < 15) {
            if (dE < 52) penalty += Math.pow(52 - dE, 3) * 600;
            penalty += Math.max(0, 45 - dE) * 50;
          } else if (dKm < 40) {
            if (dE < 40) penalty += Math.pow(40 - dE, 2) * 120;
            penalty += Math.max(0, 35 - dE) * 25;
          } else if (dKm < 85) {
            if (dE < 26) penalty += Math.pow(26 - dE, 2) * 20;
          }
        }

        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestCandidate = cand;
          if (penalty === 0) break;
        }
      }

      if (!bestCandidate) {
        bestCandidate = candidates.find((c) => !usedHexSet.has(c.hex)) || candidates[i % candidates.length];
      }

      usedHexSet.add(bestCandidate.hex);
      assigned.push({ ...hosp, hex: bestCandidate.hex, lab: bestCandidate.lab });
      colors[hosp.nombre] = bestCandidate.hex;
      hospitalsList.push({ ...hosp, color: bestCandidate.hex });
    }

    const countsByFilter = {
      publicos: new Map(),
      privados: new Map(),
      ambos: new Map()
    };

    const zbsLookup = new Map();
    activeSpecialtyData.zbsMap.forEach((assignRecord, cod) => {
      const getCol = (name) => (!name ? '#cbd5e1' : colors[name] || '#1d4ed8');

      // 1. Asignación exclusiva para Públicos
      const pubAssign = assignRecord.publico || (assignRecord.general && assignRecord.general.redCategory === 'publico' ? assignRecord.general : null);
      let pubObj = null;
      if (pubAssign && pubAssign.hosp) {
        pubObj = { ...pubAssign, hosp_asignado: pubAssign.hosp, color: getCol(pubAssign.hosp) };
        countsByFilter.publicos.set(pubAssign.hosp, (countsByFilter.publicos.get(pubAssign.hosp) || 0) + 1);
      }

      // 2. Asignación exclusiva para Privados
      const privAssign = assignRecord.privado || (assignRecord.general && assignRecord.general.redCategory === 'privado' ? assignRecord.general : null);
      let privObj = null;
      if (privAssign && privAssign.hosp) {
        privObj = { ...privAssign, hosp_asignado: privAssign.hosp, color: getCol(privAssign.hosp) };
        countsByFilter.privados.set(privAssign.hosp, (countsByFilter.privados.get(privAssign.hosp) || 0) + 1);
      }

      // 3. Asignación exclusiva para Ambos (exactamente 1 hospital por ZBS)
      const ambAssign = assignRecord.ambos || assignRecord.general || assignRecord.publico || assignRecord.privado;
      let ambObj = null;
      if (ambAssign && ambAssign.hosp) {
        ambObj = { ...ambAssign, hosp_asignado: ambAssign.hosp, color: getCol(ambAssign.hosp) };
        countsByFilter.ambos.set(ambAssign.hosp, (countsByFilter.ambos.get(ambAssign.hosp) || 0) + 1);
      }

      zbsLookup.set(cod, {
        publico: pubObj,
        privado: privObj,
        ambos: ambObj
      });
    });

    return { colors, hospitalsList, zbsLookup, countsByFilter };
  }, [activeSpecialtyData]);

  // Mantenemos sincronizada la referencia rápida para los eventos del mapa
  useEffect(() => {
    activeZbsLookupRef.current = hospitalColorMapping.zbsLookup;
  }, [hospitalColorMapping.zbsLookup]);

  const redStats = useMemo(() => {
    const counts = hospitalColorMapping.countsByFilter;
    return {
      publicos: counts.publicos ? counts.publicos.size : 0,
      privados: counts.privados ? counts.privados.size : 0,
      ambos: counts.ambos ? counts.ambos.size : 0,
      total: hospitalColorMapping.hospitalsList.length
    };
  }, [hospitalColorMapping.countsByFilter, hospitalColorMapping.hospitalsList]);

  const filteredHospitalsList = useMemo(() => {
    const activeCounts = hospitalColorMapping.countsByFilter[redFilter] || new Map();

    return hospitalColorMapping.hospitalsList
      .map((h) => ({
        ...h,
        countZBS: activeCounts.get(h.nombre) || 0
      }))
      .filter((h) => {
        if (h.countZBS === 0) return false;

        if (hospitalSearch.trim()) {
          const q = hospitalSearch.toLowerCase();
          const matchName = h.nombre.toLowerCase().includes(q);
          const matchNet = h.red && h.red.toLowerCase().includes(q);
          if (!matchName && !matchNet) return false;
        }
        return true;
      })
      .sort((a, b) => b.countZBS - a.countZBS);
  }, [hospitalColorMapping, redFilter, hospitalSearch]);

  const totalAssignedZBS = useMemo(() => {
    return filteredHospitalsList.reduce((acc, h) => acc + h.countZBS, 0);
  }, [filteredHospitalsList]);

  const syncZBSFeatureStates = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('zbs-source')) return;

    const { zbsLookup } = hospitalColorMapping;

    // Reseteo instantáneo de estados en GPU
    try {
      map.removeFeatureState({ source: 'zbs-source' });
    } catch (_) {}

    zbsLookup.forEach((record, cod) => {
      let assignment = null;
      if (redFilter === 'ambos') {
        assignment = record.ambos;
      } else if (redFilter === 'privados') {
        assignment = record.privado;
      } else {
        assignment = record.publico;
      }

      if (assignment) {
        map.setFeatureState(
          { source: 'zbs-source', id: cod },
          {
            color: assignment.color,
            hosp_asignado: assignment.hosp_asignado,
            is_assigned: true
          }
        );
      }
    });
  }, [hospitalColorMapping, redFilter]);

  const dynamicPointsGeoJSON = useMemo(() => {
    const validPoints = filteredHospitalsList.filter(
      (h) => h.lat !== 0 && h.lon !== 0 && !isNaN(h.lat) && !isNaN(h.lon)
    );

    const currentShape = redFilter === 'privados' ? 'triangle' : redFilter === 'ambos' ? 'diamond' : 'circle';
    const currentIconName = redFilter === 'privados' ? 'marker-triangle' : redFilter === 'ambos' ? 'marker-diamond' : 'marker-circle';

    return {
      type: 'FeatureCollection',
      features: validPoints.map((h) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [h.lon, h.lat]
        },
        properties: {
          nombre: h.nombre,
          color: h.color,
          red: h.red,
          redCategory: h.redCategory,
          isPrivado: h.isPrivado,
          shape: currentShape,
          icon_name: currentIconName,
          countZBS: h.countZBS,
          lat: h.lat,
          lon: h.lon
        }
      }))
    };
  }, [filteredHospitalsList, redFilter]);

  useEffect(() => {
    if (!mapLibreReady || !mapContainer.current || mapRef.current) return;

    try {
      const map = new window.maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
        center: [-5.8, 36.2],
        zoom: 4.65
      });

      mapRef.current = map;

      map.on('load', () => {
        setupMapLayers(map);
        setMapLoaded(true);
      });

      map.addControl(new window.maplibregl.NavigationControl(), 'top-right');
    } catch (err) {
      console.error('Error al inicializar MapLibre:', err);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapLibreReady]);

  const setupMapLayers = (map) => {
    if (!map) return;

    const createMarkerSDF = (type) => {
      const size = 48;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#ffffff';

      if (type === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(size / 2, 5);
        ctx.lineTo(size - 5, size - 8);
        ctx.lineTo(5, size - 8);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(size / 2, 4);
        ctx.lineTo(size - 4, size / 2);
        ctx.lineTo(size / 2, size - 4);
        ctx.lineTo(4, size / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      return ctx.getImageData(0, 0, size, size);
    };

    if (!map.hasImage('marker-triangle')) {
      map.addImage('marker-triangle', createMarkerSDF('triangle'), { sdf: true });
    }
    if (!map.hasImage('marker-circle')) {
      map.addImage('marker-circle', createMarkerSDF('circle'), { sdf: true });
    }
    if (!map.hasImage('marker-diamond')) {
      map.addImage('marker-diamond', createMarkerSDF('diamond'), { sdf: true });
    }

    if (!map.getSource('zbs-source')) {
      map.addSource('zbs-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: baseFeaturesRef.current },
        promoteId: 'codatzbs'
      });

      map.addLayer({
        id: 'zbs-polygons-fill',
        type: 'fill',
        source: 'zbs-source',
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'color'], '#cbd5e1'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'is_assigned'], false],
            0.72,
            0.18
          ]
        }
      });

      map.addLayer({
        id: 'zbs-polygons-line',
        type: 'line',
        source: 'zbs-source',
        paint: {
          'line-color': ASPIRE_THEME.black,
          'line-width': 1.1,
          'line-opacity': 0.78
        }
      });
    }

    if (!map.getSource('hospitals-source')) {
      map.addSource('hospitals-source', {
        type: 'geojson',
        data: dynamicPointsGeoJSON
      });

      map.addLayer({
        id: 'hospitals-shadow',
        type: 'circle',
        source: 'hospitals-source',
        paint: {
          'circle-radius': 14,
          'circle-color': ASPIRE_THEME.black,
          'circle-opacity': 0.35,
          'circle-translate': [0, 2],
          'circle-blur': 0.7
        }
      });

      map.addLayer({
        id: 'hospitals-badge-bg',
        type: 'circle',
        source: 'hospitals-source',
        paint: {
          'circle-radius': 12,
          'circle-color': '#ffffff',
          'circle-stroke-color': ASPIRE_THEME.black,
          'circle-stroke-width': 2.0,
          'circle-opacity': 1.0
        }
      });

      map.addLayer({
        id: 'hospitals-symbol',
        type: 'symbol',
        source: 'hospitals-source',
        layout: {
          'icon-image': ['get', 'icon_name'],
          'icon-size': 0.44,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: {
          'icon-color': ['get', 'color']
        }
      });

      map.addLayer({
        id: 'hospitals-labels',
        type: 'symbol',
        source: 'hospitals-source',
        minzoom: 8.5,
        layout: {
          'text-field': ['get', 'nombre'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-max-width': 12
        },
        paint: {
          'text-color': ASPIRE_THEME.black,
          'text-halo-color': '#ffffff',
          'text-halo-width': 2.5
        }
      });
    }

    const hoverPopup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10
    });

    map.on('mousemove', 'zbs-polygons-fill', (e) => {
      if (!e.features || !e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features[0].properties;
      const name = formatZbsDisplayName(p.n_zbs, p.codatzbs);
      
      const record = activeZbsLookupRef.current.get(p.codatzbs);
      const hosp = record ? (
        record.ambos?.hosp_asignado || record.publico?.hosp_asignado || record.privado?.hosp_asignado || ''
      ) : '';

      const hospHtml = hosp ? `<div style="color:${ASPIRE_THEME.blue};font-weight:600;margin-top:2px;">🏥 ${hosp}</div>` : '';
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:system-ui,sans-serif;font-size:11px;font-weight:700;color:${ASPIRE_THEME.black};line-height:1.25;">${name}${hospHtml}</div>`)
        .addTo(map);
    });

    map.on('mouseleave', 'zbs-polygons-fill', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    map.on('click', 'zbs-polygons-fill', (e) => {
      if (!e.features || !e.features.length) return;
      const p = e.features[0].properties;
      const record = activeZbsLookupRef.current.get(p.codatzbs);

      let assignment = null;
      if (record) {
        assignment = record.ambos || record.publico || record.privado || record.general;
      }

      const hospName = assignment?.hosp_asignado || '';
      const hospColor = assignment?.color || '#cbd5e1';
      const hospRed = assignment?.red || '';

      const hospMatch = hospitalColorMapping.hospitalsList.find(
        (h) => h.nombre.toLowerCase() === hospName.toLowerCase()
      );

      const ccaaNombre = p.ccaa_origen || CCAA_NAME_MAP[p.ccaa_id] || p.ccaa_id || '';

      setSelectedFeatureInfo({
        tipo: 'zbs',
        codatzbs: p.codatzbs,
        n_zbs: formatZbsDisplayName(p.n_zbs, p.codatzbs),
        nombre_area_normalizado: p.nombre_area_normalizado || 'Área SNS',
        ccaa_origen: ccaaNombre,
        ccaa_nombre: ccaaNombre,
        ccaa_id: p.ccaa_id,
        hosp_asignado: hospName,
        color: hospColor,
        red: hospRed,
        redCategory: getRedCategory(hospRed),
        isPrivado: hospMatch ? hospMatch.isPrivado : hospRed === 'Privado',
        is_assigned: Boolean(assignment),
        lat: hospMatch?.lat,
        lon: hospMatch?.lon
      });

      if (hospName) {
        setActiveHospitalHighlight(hospName);
      }
    });

    const handleHospitalClick = (e) => {
      if (!e.features || !e.features.length) return;
      const p = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates;

      const hospMatch = filteredHospitalsList.find((h) => h.nombre === p.nombre);
      const activeCount = hospMatch ? hospMatch.countZBS : (p.countZBS || 0);

      setSelectedFeatureInfo({
        tipo: 'hospital',
        nombre: p.nombre,
        color: p.color,
        red: p.red,
        redCategory: p.redCategory || getRedCategory(p.red),
        isPrivado: p.isPrivado,
        shape: p.shape,
        lat: coords[1],
        lon: coords[0],
        countZBS: activeCount
      });
      setActiveHospitalHighlight(p.nombre);
      map.flyTo({ center: coords, zoom: 11, duration: 800 });
    };

    map.on('click', 'hospitals-symbol', handleHospitalClick);
    map.on('click', 'hospitals-badge-bg', handleHospitalClick);
    map.on('mouseenter', 'hospitals-badge-bg', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'hospitals-badge-bg', () => { map.getCanvas().style.cursor = ''; });
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('zbs-source');
    if (source && baseFeaturesRef.current.length > 0) {
      source.setData({
        type: 'FeatureCollection',
        features: baseFeaturesRef.current
      });
      syncZBSFeatureStates();
    }
  }, [mapLoaded, loadedCCAAInfo.loadedCount]);

  useEffect(() => {
    if (mapLoaded) {
      syncZBSFeatureStates();
    }
  }, [mapLoaded, syncZBSFeatureStates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (map.getSource('hospitals-source')) {
      map.getSource('hospitals-source').setData(dynamicPointsGeoJSON);
    }
  }, [dynamicPointsGeoJSON, mapLoaded]);

  // Resaltado de hospital acelerado por GPU sin re-triangular el GeoJSON de polígonos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const targetHosp = activeHospitalHighlight || '___NONE___';

    if (map.getLayer('zbs-polygons-fill')) {
      map.setPaintProperty('zbs-polygons-fill', 'fill-opacity', [
        'case',
        ['==', ['feature-state', 'hosp_asignado'], targetHosp],
        0.95,
        ['boolean', ['feature-state', 'is_assigned'], false],
        0.70,
        0.18
      ]);
    }

    if (map.getLayer('zbs-polygons-line')) {
      map.setPaintProperty('zbs-polygons-line', 'line-width', [
        'case',
        ['==', ['feature-state', 'hosp_asignado'], targetHosp],
        3.0,
        1.1
      ]);
    }

    if (map.getLayer('hospitals-badge-bg')) {
      map.setPaintProperty('hospitals-badge-bg', 'circle-radius', [
        'case',
        ['==', ['get', 'nombre'], targetHosp],
        16,
        12
      ]);
      map.setPaintProperty('hospitals-badge-bg', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'nombre'], targetHosp],
        2.8,
        2.0
      ]);
    }

    if (map.getLayer('hospitals-shadow')) {
      map.setPaintProperty('hospitals-shadow', 'circle-radius', [
        'case',
        ['==', ['get', 'nombre'], targetHosp],
        18,
        14
      ]);
    }

    if (map.getLayer('hospitals-symbol')) {
      map.setLayoutProperty('hospitals-symbol', 'icon-size', [
        'case',
        ['==', ['get', 'nombre'], targetHosp],
        0.62,
        0.44
      ]);
    }
  }, [activeHospitalHighlight, mapLoaded]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100vw',
        height: '100vh',
        padding: '1rem',
        gap: '1rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
        backgroundColor: ASPIRE_THEME.bg,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* PANEL LATERAL: SELECTOR DE ESPECIALIDADES */}
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          width: '410px',
          flexShrink: 0,
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0
          }}
        >
          {/* Cabecera con Logotipo y Título SNS */}
          <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '0.6rem', marginBottom: '0.8rem' }}>
            <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
              <img
                src="main_logo.png"
                alt="Logo"
                style={{
                  maxHeight: '160px',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }}
                onError={(e) => {
                  if (!e.currentTarget.dataset.retried) {
                    e.currentTarget.dataset.retried = 'true';
                    e.currentTarget.src = '/main_logo.png';
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <h2 style={{ margin: '0', fontSize: '1.05rem', color: ASPIRE_THEME.black, fontWeight: '700' }}>
                Servicios o unidades SNS
              </h2>
              <button
                onClick={() => setShowMethodologyModal(true)}
                title="Ver metodología de cálculo de asignación hospitalaria"
                style={{
                  background: 'rgba(60, 100, 163, 0.08)',
                  border: `1px solid rgba(60, 100, 163, 0.3)`,
                  color: ASPIRE_THEME.blue,
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.68rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'background-color 0.15s ease'
                }}
              >
                <span>ℹ️</span> Metodología
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  backgroundColor: loadingGeoJSON ? 'rgba(254, 213, 109, 0.25)' : 'rgba(60, 100, 163, 0.1)',
                  color: loadingGeoJSON ? '#8a6200' : ASPIRE_THEME.blue,
                  border: `1px solid ${loadingGeoJSON ? 'rgba(254, 213, 109, 0.6)' : 'rgba(60, 100, 163, 0.25)'}`,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: '600'
                }}
              >
                {loadingGeoJSON ? 'Cargando 17 CCAA...' : `${loadedCCAAInfo.totalFeatures} ZBS (${loadedCCAAInfo.loadedCount} CCAA)`}
              </span>
              <span
                style={{
                  fontSize: '0.63rem',
                  backgroundColor: dataSourceType === 'parquet' ? 'rgba(0, 140, 150, 0.12)' : 'rgba(77, 118, 178, 0.12)',
                  color: dataSourceType === 'parquet' ? ASPIRE_THEME.teal : ASPIRE_THEME.lightBlue,
                  border: `1px solid ${dataSourceType === 'parquet' ? 'rgba(0, 140, 150, 0.3)' : 'rgba(77, 118, 178, 0.25)'}`,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: '600'
                }}
                title={dataSourceType === 'parquet' ? 'Datos cargados desde archivo columnar comprimido huff_centros.parquet' : 'Datos cargados desde archivo CSV'}
              >
                {dataSourceType === 'parquet' ? '⚡ Parquet' : dataSourceType === 'csv' ? '📄 CSV' : 'Cargando...'}
              </span>
            </div>
          </div>

          {/* Especialidad Activa con gradiente Aspire */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(60, 100, 163, 0.08) 0%, rgba(11, 183, 214, 0.06) 100%)',
              border: '1px solid rgba(60, 100, 163, 0.25)',
              borderRadius: '8px',
              padding: '0.75rem',
              marginBottom: '0.8rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <span
                style={{
                  background: ASPIRE_THEME.blue,
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontFamily: 'monospace'
                }}
              >
                {selectedSpecialty.code}
              </span>
              <span style={{ fontSize: '0.74rem', color: ASPIRE_THEME.lightBlue, fontWeight: '600' }}>
                {selectedSpecialty.category}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: ASPIRE_THEME.black, lineHeight: '1.3' }}>
              {selectedSpecialty.name || selectedSpecialty.raw}
            </div>
          </div>

          {/* Pestañas de Filtro Aspire con Tooltip Explicativo */}
          <div
            style={{ position: 'relative', marginBottom: '0.6rem' }}
            onMouseLeave={() => setHoveredTab(null)}
          >
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '8px'
              }}
            >
              <button
                onClick={() => setActiveTab('todas')}
                onMouseEnter={() => setHoveredTab('todas')}
                title="Catálogo Completo SNS: Todas las especialidades y patologías registradas"
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '0.4rem 0.2rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'todas' ? ASPIRE_THEME.blue : 'transparent',
                  color: activeTab === 'todas' ? '#ffffff' : ASPIRE_THEME.gray,
                  boxShadow: activeTab === 'todas' ? '0 1px 3px rgba(60, 100, 163, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Todas ({SORTED_ESPECIALIDADES.length})
              </button>
              <button
                onClick={() => setActiveTab('csur')}
                onMouseEnter={() => setHoveredTab('csur')}
                title={`CSUR (1-101): ${CSUR_COUNT} centros, servicios y unidades de referencia acreditados`}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '0.4rem 0.2rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'csur' ? ASPIRE_THEME.blue : 'transparent',
                  color: activeTab === 'csur' ? '#ffffff' : ASPIRE_THEME.gray,
                  boxShadow: activeTab === 'csur' ? '0 1px 3px rgba(60, 100, 163, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                CSUR ({CSUR_COUNT})
              </button>
              <button
                onClick={() => setActiveTab('unidades')}
                onMouseEnter={() => setHoveredTab('unidades')}
                title={`U.X (RD 1277/2003): ${UX_COUNT} unidades asistenciales especializadas`}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '0.4rem 0.2rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'unidades' ? ASPIRE_THEME.blue : 'transparent',
                  color: activeTab === 'unidades' ? '#ffffff' : ASPIRE_THEME.gray,
                  boxShadow: activeTab === 'unidades' ? '0 1px 3px rgba(60, 100, 163, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                U.X ({UX_COUNT})
              </button>
            </div>

            {/* Tarjeta flotante de ayuda al pasar el ratón */}
            {hoveredTab && TAB_DESCRIPTIONS[hoveredTab] && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  backgroundColor: '#ffffff',
                  border: `1.5px solid ${ASPIRE_THEME.blue}`,
                  borderRadius: '8px',
                  padding: '0.65rem 0.75rem',
                  boxShadow: '0 10px 25px -3px rgba(29, 29, 27, 0.18)',
                  pointerEvents: 'none',
                  animation: 'fadeIn 0.15s ease-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: '700', color: ASPIRE_THEME.blue }}>
                    {TAB_DESCRIPTIONS[hoveredTab].title}
                  </span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      background: 'rgba(60, 100, 163, 0.1)',
                      color: ASPIRE_THEME.blue,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontWeight: '600'
                    }}
                  >
                    SNS
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: ASPIRE_THEME.lightBlue, fontWeight: '600', marginBottom: '4px' }}>
                  {TAB_DESCRIPTIONS[hoveredTab].subtitle}
                </div>
                <p style={{ margin: 0, fontSize: '0.7rem', color: ASPIRE_THEME.gray, lineHeight: '1.35' }}>
                  {TAB_DESCRIPTIONS[hoveredTab].desc}
                </p>
              </div>
            )}
          </div>

          {/* Buscador de especialidades */}
          <div style={{ marginBottom: '0.6rem' }}>
            <input
              type="text"
              placeholder="Buscar especialidad..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                outline: 'none',
                backgroundColor: '#ffffff',
                color: ASPIRE_THEME.black
              }}
            />
          </div>

          {/* Lista Ordenada */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              paddingRight: '4px',
              border: '1px solid #f1f5f9',
              borderRadius: '8px',
              padding: '4px',
              marginBottom: '0.6rem'
            }}
          >
            {filteredSpecialties.map((esp) => {
              const isSelected = selectedSpecialty.raw === esp.raw;
              return (
                <button
                  key={esp.raw}
                  onClick={() => {
                    setSelectedSpecialty(esp);
                    setActiveHospitalHighlight(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    textAlign: 'left',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '7px',
                    border: isSelected ? `1px solid ${ASPIRE_THEME.blue}` : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? ASPIRE_THEME.blue : '#ffffff',
                    color: isSelected ? '#ffffff' : ASPIRE_THEME.gray,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span
                    style={{
                      padding: '2px 5px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : ASPIRE_THEME.gray,
                      flexShrink: 0
                    }}
                  >
                    {esp.code}
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '600' : '500',
                      lineHeight: '1.3',
                      wordBreak: 'break-word',
                      flex: 1
                    }}
                  >
                    {esp.name || esp.raw}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Pie del panel lateral */}
          <div
            style={{
              borderTop: '1px solid #e2e8f0',
              paddingTop: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ fontSize: '0.7rem', color: ASPIRE_THEME.gray }}>
              Base Cartográfica ZBS
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                color: ASPIRE_THEME.teal,
                backgroundColor: 'rgba(0, 140, 150, 0.1)',
                padding: '2px 7px',
                borderRadius: '4px',
                fontWeight: '600',
                border: '1px solid rgba(0, 140, 150, 0.25)'
              }}
            >
              ● 17 CCAA Integradas
            </span>
          </div>
        </div>

        {/* Panel Inferior: Inspección */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '1.1rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0',
            maxHeight: '260px',
            overflowY: 'auto'
          }}
        >
          <h2
            style={{
              margin: '0 0 0.6rem 0',
              fontSize: '0.95rem',
              color: ASPIRE_THEME.black,
              borderBottom: '2px solid #f1f5f9',
              paddingBottom: '0.3rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>Inspección de Asignación</span>
            {selectedFeatureInfo && (
              <span style={{ fontSize: '0.68rem', color: ASPIRE_THEME.gray, fontWeight: 'normal' }}>
                {selectedFeatureInfo.tipo === 'zbs' ? 'Zona Básica (ZBS)' : 'Hospital (Centro)'}
              </span>
            )}
          </h2>

          {selectedFeatureInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div
                style={{
                  background: ASPIRE_THEME.bg,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  borderLeft: `5px solid ${selectedFeatureInfo.color || '#cbd5e1'}`
                }}
              >
                <span style={{ display: 'block', fontSize: '0.65rem', color: ASPIRE_THEME.gray, fontWeight: 'bold' }}>
                  CENTRO ASIGNADO
                </span>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: ASPIRE_THEME.black,
                    fontWeight: '700',
                    display: 'block',
                    marginTop: '2px'
                  }}
                >
                  {selectedFeatureInfo.hosp_asignado || selectedFeatureInfo.nombre || 'Sin asignación para esta especialidad'}
                </span>
                {selectedFeatureInfo.lat && selectedFeatureInfo.lon ? (
                  <span style={{ fontSize: '0.7rem', color: ASPIRE_THEME.blue, marginTop: '3px', display: 'block', fontFamily: 'monospace' }}>
                    Lat: {Number(selectedFeatureInfo.lat).toFixed(5)} • Lon: {Number(selectedFeatureInfo.lon).toFixed(5)}
                  </span>
                ) : null}
                {selectedFeatureInfo.red && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backgroundColor:
                          selectedFeatureInfo.redCategory === 'privado'
                            ? 'rgba(254, 213, 109, 0.25)'
                            : selectedFeatureInfo.redCategory === 'ambos'
                            ? 'rgba(11, 183, 214, 0.15)'
                            : 'rgba(0, 140, 150, 0.12)',
                        color:
                          selectedFeatureInfo.redCategory === 'privado'
                            ? '#8a6200'
                            : selectedFeatureInfo.redCategory === 'ambos'
                            ? '#087c91'
                            : ASPIRE_THEME.teal,
                        border: `1px solid ${
                          selectedFeatureInfo.redCategory === 'privado'
                            ? 'rgba(254, 213, 109, 0.7)'
                            : selectedFeatureInfo.redCategory === 'ambos'
                            ? 'rgba(11, 183, 214, 0.35)'
                            : 'rgba(0, 140, 150, 0.3)'
                        }`
                      }}
                    >
                      {selectedFeatureInfo.redCategory === 'privado'
                        ? '▲ Red Privada / Concertada'
                        : selectedFeatureInfo.redCategory === 'ambos'
                        ? '◆ Red Ambos / Mixta'
                        : '● Red Pública / SNS'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: ASPIRE_THEME.gray }}>({selectedFeatureInfo.red})</span>
                  </div>
                )}
              </div>

              {selectedFeatureInfo.tipo === 'zbs' && (
                <div style={{ background: '#f1f5f9', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.68rem', color: ASPIRE_THEME.gray, fontWeight: 'bold' }}>
                      Código ZBS: {selectedFeatureInfo.codatzbs}
                    </span>
                    {(selectedFeatureInfo.ccaa_nombre || selectedFeatureInfo.ccaa_origen || CCAA_NAME_MAP[selectedFeatureInfo.ccaa_id]) && (
                      <span style={{ fontSize: '0.66rem', background: '#e2e8f0', color: ASPIRE_THEME.black, padding: '2px 6px', borderRadius: '4px', fontWeight: '600', flexShrink: 0 }}>
                        {selectedFeatureInfo.ccaa_nombre || selectedFeatureInfo.ccaa_origen || CCAA_NAME_MAP[selectedFeatureInfo.ccaa_id]}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.82rem', color: ASPIRE_THEME.black, fontWeight: '600', display: 'block', marginTop: '2px' }}>
                    {formatZbsDisplayName(selectedFeatureInfo.n_zbs, selectedFeatureInfo.codatzbs)}
                  </span>
                  {selectedFeatureInfo.nombre_area_normalizado && (
                    <span style={{ fontSize: '0.7rem', color: ASPIRE_THEME.gray, display: 'block', marginTop: '2px' }}>
                      Área: {selectedFeatureInfo.nombre_area_normalizado}
                    </span>
                  )}
                </div>
              )}

              {selectedFeatureInfo.tipo === 'hospital' && (
                <div style={{ background: '#f1f5f9', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: ASPIRE_THEME.gray }}>
                    Zonas Básicas asignadas a este centro: <strong style={{ color: ASPIRE_THEME.black }}>{selectedFeatureInfo.countZBS} ZBS</strong>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                color: ASPIRE_THEME.gray,
                padding: '0.6rem',
                border: '2px dashed #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.78rem'
              }}
            >
              Haz clic en una Zona Básica o en un Hospital para ver su asignación directa y coordenadas.
            </div>
          )}
        </div>
      </aside>

      {/* MAPA PRINCIPAL: MAPLIBRE GL */}
      <main
        style={{
          flex: 1,
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid #e2e8f0',
          height: '100%'
        }}
      >
        {loadingGeoJSON && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '60px',
              zIndex: 10,
              background: 'rgba(255, 255, 255, 0.95)',
              border: `1px solid ${ASPIRE_THEME.lightBlue}`,
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              color: ASPIRE_THEME.black,
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
            }}
          >
            {`Cargando cartografía (${loadedCCAAInfo.loadedCount}/17 CCAA)...`}
          </div>
        )}

        {/* Chip Superior: Especialidad Activa */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(4px)',
            padding: '8px 14px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
            border: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '520px'
          }}
        >
          <span
            style={{
              background: ASPIRE_THEME.blue,
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}
          >
            {selectedSpecialty.code}
          </span>
          <span
            style={{
              fontSize: '0.82rem',
              color: ASPIRE_THEME.black,
              fontWeight: '600',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {selectedSpecialty.name || selectedSpecialty.raw}
          </span>
        </div>

        {/* LEYENDA DINÁMICA DE HOSPITALES Y ZBS ASIGNADAS (DERECHA) */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '4%',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(6px)',
            padding: '12px 14px',
            borderRadius: '12px',
            boxShadow: '0 6px 16px -2px rgba(0,0,0,0.12)',
            border: '1px solid #cbd5e1',
            fontSize: '0.74rem',
            color: ASPIRE_THEME.gray,
            width: '390px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}
        >
          {/* Cabecera y Contador */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: '700', color: ASPIRE_THEME.black, fontSize: '0.8rem', display: 'block' }}>
                {redFilter === 'publicos' ? 'Red Pública' : redFilter === 'privados' ? 'Red Privada' : 'Red Ambos / Mixta'} ({filteredHospitalsList.length} centros)
              </span>
              <span style={{ fontSize: '0.67rem', color: ASPIRE_THEME.lightBlue, fontWeight: '600' }}>
                {totalAssignedZBS} ZBS asignadas
              </span>
            </div>
            <span
              style={{
                fontSize: '0.65rem',
                color:
                  redFilter === 'publicos'
                    ? ASPIRE_THEME.teal
                    : redFilter === 'privados'
                    ? '#8a6200'
                    : '#087c91',
                backgroundColor:
                  redFilter === 'publicos'
                    ? 'rgba(0, 140, 150, 0.12)'
                    : redFilter === 'privados'
                    ? 'rgba(254, 213, 109, 0.25)'
                    : 'rgba(11, 183, 214, 0.15)',
                border: `1px solid ${
                  redFilter === 'publicos'
                    ? 'rgba(0, 140, 150, 0.3)'
                    : redFilter === 'privados'
                    ? 'rgba(254, 213, 109, 0.7)'
                    : 'rgba(11, 183, 214, 0.35)'
                }`,
                padding: '2px 7px',
                borderRadius: '4px',
                fontWeight: '700'
              }}
            >
              {redFilter === 'publicos' ? '● Círculos' : redFilter === 'privados' ? '▲ Triángulos' : '◆ Rombos'}
            </span>
          </div>

          {/* Selector de Red: Públicos vs Privados vs Ambos con paleta Aspire */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '8px',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '8px'
            }}
          >
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                onClick={() => setRedFilter('publicos')}
                style={{
                  flex: 1,
                  border: redFilter === 'publicos' ? `1px solid ${ASPIRE_THEME.teal}` : '1px solid transparent',
                  padding: '0.42rem 0.2rem',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: redFilter === 'publicos' ? 'rgba(0, 140, 150, 0.12)' : '#ffffff',
                  color: redFilter === 'publicos' ? ASPIRE_THEME.teal : ASPIRE_THEME.gray,
                  boxShadow: redFilter === 'publicos' ? '0 1px 3px rgba(0, 140, 150, 0.2)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>●</span> Públicos ({redStats.publicos})
              </button>
              <button
                onClick={() => setRedFilter('privados')}
                style={{
                  flex: 1,
                  border: redFilter === 'privados' ? '1px solid #d99b00' : '1px solid transparent',
                  padding: '0.42rem 0.2rem',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: redFilter === 'privados' ? 'rgba(254, 213, 109, 0.25)' : '#ffffff',
                  color: redFilter === 'privados' ? '#8a6200' : ASPIRE_THEME.gray,
                  boxShadow: redFilter === 'privados' ? '0 1px 3px rgba(254, 213, 109, 0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>▲</span> Privados ({redStats.privados})
              </button>
              <button
                onClick={() => setRedFilter('ambos')}
                style={{
                  flex: 1,
                  border: redFilter === 'ambos' ? `1px solid ${ASPIRE_THEME.cyan}` : '1px solid transparent',
                  padding: '0.42rem 0.2rem',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: redFilter === 'ambos' ? 'rgba(11, 183, 214, 0.15)' : '#ffffff',
                  color: redFilter === 'ambos' ? '#087c91' : ASPIRE_THEME.gray,
                  boxShadow: redFilter === 'ambos' ? '0 1px 3px rgba(11, 183, 214, 0.2)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>◆</span> Ambos ({redStats.ambos})
              </button>
            </div>

            {/* Input Buscador de Hospital */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar por centro o red..."
                value={hospitalSearch}
                onChange={(e) => setHospitalSearch(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.74rem',
                  outline: 'none',
                  backgroundColor: '#ffffff',
                  color: ASPIRE_THEME.black
                }}
              />
              {hospitalSearch && (
                <button
                  onClick={() => setHospitalSearch('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: ASPIRE_THEME.gray,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}
                  title="Limpiar búsqueda"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Lista de Hospitales con ajuste de línea multilínea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
            {filteredHospitalsList.length === 0 ? (
              <div style={{ textAlign: 'center', color: ASPIRE_THEME.gray, padding: '1rem', fontSize: '0.72rem' }}>
                No se encontraron centros para la categoría y filtro actual.
              </div>
            ) : (
              filteredHospitalsList.map((hosp) => {
                const isSelected = activeHospitalHighlight === hosp.nombre;

                return (
                  <div
                    key={hosp.nombre}
                    onClick={() => {
                      setActiveHospitalHighlight(isSelected ? null : hosp.nombre);
                      if (mapRef.current && hosp.lon && hosp.lat && !isNaN(hosp.lon) && !isNaN(hosp.lat)) {
                        mapRef.current.flyTo({ center: [hosp.lon, hosp.lat], zoom: 9.5, duration: 800 });
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      padding: '5px 6px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(60, 100, 163, 0.09)' : 'transparent',
                      border: isSelected ? `1px solid ${ASPIRE_THEME.blue}` : '1px solid #f1f5f9',
                      gap: '2px',
                      transition: 'all 0.1s ease'
                    }}
                    title={`Haz clic para centrar en ${hosp.nombre}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#ffffff',
                          border: `1.5px solid ${ASPIRE_THEME.black}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: '1px'
                        }}
                      >
                        {redFilter === 'privados' ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 0,
                              height: 0,
                              borderLeft: '5.5px solid transparent',
                              borderRight: '5.5px solid transparent',
                              borderBottom: `11px solid ${hosp.color}`,
                              marginTop: '-2px'
                            }}
                            title="Centro Privado"
                          />
                        ) : redFilter === 'ambos' ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              backgroundColor: hosp.color,
                              transform: 'rotate(45deg)'
                            }}
                            title="Red Ambos"
                          />
                        ) : (
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              backgroundColor: hosp.color,
                              borderRadius: '50%',
                              display: 'inline-block'
                            }}
                            title="Centro Público"
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontWeight: isSelected ? '700' : '500',
                          lineHeight: '1.3',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          color: isSelected ? ASPIRE_THEME.blue : ASPIRE_THEME.black,
                          flex: 1
                        }}
                      >
                        {hosp.nombre}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: ASPIRE_THEME.gray,
                          background: '#f1f5f9',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          flexShrink: 0,
                          alignSelf: 'flex-start',
                          marginTop: '2px'
                        }}
                      >
                        {hosp.countZBS} ZBS
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Contenedor del lienzo MapLibre */}
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {}
        {showMethodologyModal && (
          <div
            onClick={() => setShowMethodologyModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(29, 29, 27, 0.55)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              boxSizing: 'border-box'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #cbd5e1',
                boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.22)',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '85vh',
                overflowY: 'auto',
                padding: '1.5rem',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              {/* Encabezado del Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.8rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.15rem' }}>📐</span>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: ASPIRE_THEME.black, fontWeight: '700' }}>
                      Metodología de Asignación ZBS ➔ Hospital
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.76rem', color: ASPIRE_THEME.lightBlue, fontWeight: '600' }}>
                    Modelo probabilístico de atracción espacial (Huff) y Cartera de Servicios SNS
                  </span>
                </div>
                <button
                  onClick={() => setShowMethodologyModal(false)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: ASPIRE_THEME.gray,
                    fontWeight: 'bold',
                    fontSize: '1rem'
                  }}
                  title="Cerrar ventana"
                >
                  ×
                </button>
              </div>

              {/* Contenido Explicativo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.8rem', color: ASPIRE_THEME.gray, lineHeight: '1.5' }}>
                
                {/* 1. Modelo de Huff */}
                <div style={{ background: ASPIRE_THEME.bg, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: ASPIRE_THEME.blue, fontWeight: '700', marginBottom: '4px' }}>
                    <span>1. Modelo Gravitacional de Huff</span>
                  </div>
                  <p style={{ margin: 0 }}>
                    La asignación de cada <strong>Zona Básica de Salud (ZBS)</strong> a un centro hospitalario se calcula mediante una formulación del <em>modelo gravitacional de Huff</em>. El modelo estima la probabilidad interactiva de que la población adscrita a una ZBS acuda a un centro $j$ en función de su capacidad de atracción y la fricción del desplazamiento:
                  </p>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', margin: '6px 0', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.78rem', color: ASPIRE_THEME.black }}>
                    P<sub>ij</sub> = ( S<sub>j</sub> / d<sub>ij</sub><sup>β</sup> ) / Σ<sub>k</sub> ( S<sub>k</sub> / d<sub>ik</sub><sup>β</sup> )
                  </div>
                  <ul style={{ margin: '4px 0 0 1rem', padding: 0 }}>
                    <li><strong>S<sub>j</sub> (Atracción):</strong> Dimensión del centro hospitalario, complejidad tecnológica y nivel asistencial.</li>
                    <li><strong>d<sub>ij</sub> (Fricción espacial):</strong> Distancia geodésica / tiempo estimado entre el centroide poblacional de la ZBS y el hospital.</li>
                    <li><strong>β (Parámetro de impedancia):</strong> Coeficiente calibrado para reflejar la sensibilidad de los pacientes a la lejanía.</li>
                  </ul>
                </div>

                {/* 2. Filtro por Cartera y Acreditación de Referencia */}
                <div style={{ background: ASPIRE_THEME.bg, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: ASPIRE_THEME.teal, fontWeight: '700', marginBottom: '4px' }}>
                    <span>2. Cartera Específica: CSUR vs. RD 1277/2003</span>
                  </div>
                  <p style={{ margin: 0 }}>
                    Para cada especialidad seleccionada, el conjunto de centros candidatos admisibles en el cálculo se restringe exclusivamente a aquellos con <strong>acreditación o unidad activa certificada</strong>:
                  </p>
                  <ul style={{ margin: '4px 0 0 1rem', padding: 0 }}>
                    <li><strong>CSUR (Códigos 1 al 101):</strong> Únicamente compiten los centros designados formalmente como Centros, Servicios y Unidades de Referencia por el Ministerio de Sanidad. ZBS alejadas se asignan al CSUR correspondiente aunque se encuentre fuera de su Comunidad Autónoma.</li>
                    <li><strong>Unidades U.X (RD 1277/2003):</strong> Servicios estándar hospitalarios y ambulatorios, donde prima la proximidad dentro de las áreas de salud de cada comunidad autónoma.</li>
                  </ul>
                </div>

                {/* 3. Desagregación por Red Asistencial */}
                <div style={{ background: ASPIRE_THEME.bg, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8a6200', fontWeight: '700', marginBottom: '4px' }}>
                    <span>3. Desagregación por Red Asistencial</span>
                  </div>
                  <p style={{ margin: 0 }}>
                    El visor computa y almacena la asignación óptima de forma independiente para cada red:
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(0, 140, 150, 0.1)', color: ASPIRE_THEME.teal, border: '1px solid rgba(0, 140, 150, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                      ● Red Pública (SNS)
                    </span>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(254, 213, 109, 0.25)', color: '#8a6200', border: '1px solid rgba(254, 213, 109, 0.7)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                      ▲ Red Privada / Concertada
                    </span>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(11, 183, 214, 0.15)', color: '#087c91', border: '1px solid rgba(11, 183, 214, 0.35)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                      ◆ Red Mixta / Ambos
                    </span>
                  </div>
                </div>

                {/* 4. Asignación Cartográfica */}
                <div style={{ background: ASPIRE_THEME.bg, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: ASPIRE_THEME.black, fontWeight: '700', marginBottom: '4px' }}>
                    <span>4. Base Cartográfica</span>
                  </div>
                  <p style={{ margin: 0 }}>
                    Las fronteras espaciales corresponden al mapa oficial 2024 de las <strong>17 Comunidades Autónomas</strong> integradas individualmente con la identificación oficial <code>codatzbs</code> y <code>n_zbs</code>. Cada ZBS adquiere el color representativo del hospital al que ha sido asignada.
                  </p>
                </div>
              </div>

              {/* Botón de cierre */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
                <button
                  onClick={() => setShowMethodologyModal(false)}
                  style={{
                    backgroundColor: ASPIRE_THEME.blue,
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}