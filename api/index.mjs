// server/createApp.ts
import express from "express";
import fetch2 from "node-fetch";

// server/adminRouter.ts
import { Router } from "express";

// server/adminAuth.ts
import { randomBytes } from "node:crypto";
var sessions = /* @__PURE__ */ new Map();
function prune() {
  const now = Date.now();
  for (const [token, exp] of sessions) {
    if (now > exp) sessions.delete(token);
  }
}
function createAdminSession() {
  prune();
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1e3);
  return token;
}
function validateAdminToken(token) {
  if (!token) return false;
  prune();
  const exp = sessions.get(token);
  if (!exp || Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function revokeAdminToken(token) {
  sessions.delete(token);
}

// server/db.ts
import { createClient } from "@libsql/client";
var client;
function getTursoClient() {
  if (client !== void 0) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    client = null;
    return null;
  }
  client = createClient({ url, authToken });
  return client;
}

// server/refreshPaperLinks.ts
import fetch from "node-fetch";

// src/syllabusCatalog.ts
var BASE_PAPERS_URL = "https://pastpapers.papacambridge.com/directories/CAIE/CAIE-pastpapers/upload/";
function isEnglishLanguageSubjectLabel(label) {
  const t = label.trim();
  if (/^english\b/i.test(t)) return true;
  if (/english \(as a second language\)/i.test(t)) return true;
  if (/^world literature\b/i.test(t)) return true;
  return false;
}
function isNonEnglishLanguageSyllabus({ label }) {
  if (isEnglishLanguageSubjectLabel(label)) return false;
  const t = label.trim();
  return NON_ENGLISH_LANGUAGE_PATTERNS.some((re) => re.test(t));
}
var NON_ENGLISH_LANGUAGE_PATTERNS = [
  /^Spanish Literature\s*[-–]/i,
  /^French Literature\s*[-–]/i,
  /^Hindi Literature\s*[-–]/i,
  /^French Language & Literature/i,
  /^German Language & Literature/i,
  /^French Language/i,
  /^German Language/i,
  /^French[-–]/i,
  /^German[-–]/i,
  /^Afrikaans\s*[-–]/i,
  /^Arabic\s*[-–]/i,
  /^Bahasa\s/i,
  /^Bengali\s*[-–]/i,
  /^Chinese\s*[-–]/i,
  /^Czech\s*[-–]/i,
  /^Dutch\s*[-–]/i,
  /^French\s*[-–(]/i,
  /^German\s*[-–(]/i,
  /^Greek\s*[-–]/i,
  /^Hindi\s*[-–]/i,
  /^Indonesian\s*[-–]/i,
  /^Italian\s*[-–]/i,
  /^Japanese\s*[-–]/i,
  /^Kazakh\s*[-–]/i,
  /^Korean\s*[-–]/i,
  /^Latin\s*[-–]/i,
  /^Malay\s*[-–]/i,
  /^Marathi\s*[-–]/i,
  /^Nepali\s*[-–]/i,
  /^Portuguese\s*[-–]/i,
  /^Russian\s*[-–]/i,
  /^Sanskrit\s*[-–]/i,
  /^Spanish\s*[-–(]/i,
  /^Swahili\s*[-–]/i,
  /^Tamil\s*[-–]/i,
  /^Telugu\s*[-–]/i,
  /^Thai\s*[-–]/i,
  /^Turkish\s*[-–]/i,
  /^Urdu\s*[-–]/i,
  /^Vietnamese\s*[-–]/i,
  /^IsiZulu\s*[-–]/i,
  /^Setswana\s*[-–]/i,
  /^Sinhala\s*[-–]/i
];
function filterEnglishMediumSyllabuses(options) {
  return options.filter((o) => !isNonEnglishLanguageSyllabus(o));
}
var IGCSE_SYLLABUS_OPTIONS_ALL = [
  { label: "Accounting - 0452", code: "0452" },
  { label: "Accounting - 0985", code: "0985" },
  { label: "Afrikaans - 0512", code: "0512" },
  { label: "Afrikaans - 0548", code: "0548" },
  { label: "Agriculture - 0600", code: "0600" },
  { label: "Arabic - 0508", code: "0508" },
  { label: "Arabic - 0527", code: "0527", unavailable: true },
  { label: "Arabic - 0544", code: "0544" },
  { label: "Arabic - 7180 - UK", code: "7180" },
  { label: "Arabic - 7184", code: "7184" },
  { label: "Art and Design - 0400", code: "0400" },
  { label: "Art and Design - 0415", code: "0415" },
  { label: "Art-and-Design - 0989", code: "0989" },
  { label: "Bahasa Indonesia - 0538", code: "0538" },
  { label: "Bangladesh Studies - 0449", code: "0449" },
  { label: "Biology - 0438", code: "0438" },
  { label: "Biology - 0610", code: "0610" },
  { label: "Biology - 0970", code: "0970" },
  { label: "Business Studies - 0450", code: "0450" },
  { label: "Business-Studies-0986-UK", code: "0986" },
  { label: "Chemistry - 0439", code: "0439" },
  { label: "Chemistry - 0620", code: "0620" },
  { label: "Chemistry-0971-UK", code: "0971" },
  { label: "Child Development - 0637", code: "0637" },
  { label: "Chinese - 0509", code: "0509" },
  { label: "Chinese - 0523", code: "0523" },
  { label: "Chinese - 0534", code: "0534", unavailable: true },
  { label: "Chinese - 0547", code: "0547" },
  { label: "Computer Science - 0478", code: "0478" },
  { label: "Computer Science - 0984", code: "0984" },
  { label: "Computer Studies - 0420", code: "0420" },
  { label: "Computer Studies - 0441", code: "0441", unavailable: true },
  { label: "Czech - First Language - 0514", code: "0514" },
  { label: "Design and Technology - 0445", code: "0445" },
  { label: "Design and technology - 0979", code: "0979" },
  { label: "Development Studies - 0453", code: "0453" },
  { label: "Drama - 0411", code: "0411" },
  { label: "Drama - 0428", code: "0428" },
  { label: "Drama - 0994", code: "0994" },
  { label: "Dutch - 0503", code: "0503" },
  { label: "Dutch - 0515", code: "0515" },
  { label: "Economics - 0437", code: "0437", unavailable: true },
  { label: "Economics - 0455", code: "0455" },
  { label: "Economics - 0987", code: "0987" },
  { label: "English - 0427", code: "0427" },
  { label: "English - 0476", code: "0476" },
  { label: "English - 0477", code: "0477" },
  { label: "English - 0486", code: "0486" },
  { label: "English - 0500", code: "0500" },
  { label: "English - 0510", code: "0510" },
  { label: "English - 0511", code: "0511" },
  { label: "English - 0522", code: "0522" },
  { label: "English - 0524", code: "0524" },
  { label: "English - 0526", code: "0526", unavailable: true },
  { label: "English - 0627", code: "0627" },
  { label: "English - 0772", code: "0772" },
  { label: "English - 0990", code: "0990" },
  { label: "English - 0991", code: "0991" },
  { label: "English - 0993", code: "0993" },
  { label: "English -0475", code: "0475" },
  { label: "English (as a Second Language)-0465", code: "0465" },
  { label: "English-0472", code: "0472" },
  { label: "English-0992", code: "0992" },
  { label: "Enterprise - 0454", code: "0454" },
  { label: "Environmental Management - 0680", code: "0680" },
  { label: "Food and Nutrition - 0648", code: "0648" },
  { label: "French - 0501", code: "0501" },
  { label: "French - 0520", code: "0520" },
  { label: "French - 0528", code: "0528" },
  { label: "French - Foreign Language (UK) (0685)", code: "0685" },
  { label: "French-7156", code: "7156" },
  { label: "Geography - 0460", code: "0460" },
  { label: "Geography - 0976", code: "0976" },
  { label: "German - 0505", code: "0505" },
  { label: "German - 0525", code: "0525" },
  { label: "German - 0529", code: "0529", unavailable: true },
  { label: "German - 0677", code: "0677" },
  { label: "German-7159-UK", code: "7159" },
  { label: "Global Perspectives - 0426", code: "0426" },
  { label: "Global Perspectives - 0457", code: "0457" },
  { label: "Greek - 0536", code: "0536", unavailable: true },
  { label: "Greek - 0543", code: "0543" },
  { label: "Hindi - 0549", code: "0549" },
  { label: "History - 0416", code: "0416" },
  { label: "History - 0470", code: "0470" },
  { label: "History - 0977", code: "0977" },
  { label: "History - American - 0409", code: "0409" },
  { label: "ICT- 0417", code: "0417" },
  { label: "India Studies - 0447", code: "0447" },
  { label: "Indonesian - 0545", code: "0545" },
  { label: "Information and Communication Technology (9-1) - 0983", code: "0983" },
  { label: "IsiZulu - 0531", code: "0531" },
  { label: "Islamiyat - 0493", code: "0493" },
  { label: "Italian - 0535", code: "0535" },
  { label: "Italian - 7164", code: "7164" },
  { label: "Japanese - 0507", code: "0507" },
  { label: "Japanese - 0519", code: "0519" },
  { label: "Kazakh - 0532", code: "0532" },
  { label: "Korean - 0521", code: "0521" },
  { label: "Latin - 0480", code: "0480" },
  { label: "Malay - 0546", code: "0546" },
  { label: "Malay - First Language - 0696", code: "0696" },
  { label: "Marine Science Maldives only - 0697", code: "0697" },
  { label: "Mathematics - 0444", code: "0444" },
  { label: "Mathematics - 0459", code: "0459" },
  { label: "Mathematics - 0580", code: "0580" },
  { label: "Mathematics - 0581", code: "0581" },
  { label: "Mathematics - 0606", code: "0606" },
  { label: "Mathematics - 0607", code: "0607" },
  { label: "Mathematics - 0626", code: "0626" },
  { label: "Mathematics - 0980", code: "0980" },
  { label: "Music - 0410", code: "0410" },
  { label: "Music - 0429", code: "0429" },
  { label: "Music-0978-UK", code: "0978" },
  { label: "Pakistan Studies - 0448", code: "0448" },
  { label: "Physical Education - 0413", code: "0413" },
  { label: "Physical Science - 0652", code: "0652" },
  { label: "Physical-Education - 0995", code: "0995" },
  { label: "Physics - 0443", code: "0443" },
  { label: "Physics - 0625", code: "0625" },
  { label: "Physics - 0972", code: "0972" },
  { label: "Portuguese - 0504", code: "0504" },
  { label: "Portuguese - 0540", code: "0540" },
  { label: "Religious Studies - 0490", code: "0490" },
  { label: "Russian - 0516", code: "0516" },
  { label: "Sanskrit - 0499", code: "0499" },
  { label: "Science - 0653", code: "0653" },
  { label: "Sciences - 0442", code: "0442" },
  { label: "Sciences - 0654", code: "0654" },
  { label: "Sciences - 0973", code: "0973" },
  { label: "Setswana - First Language - 0698", code: "0698" },
  { label: "Sociology -0495", code: "0495" },
  { label: "Spanish - 0678", code: "0678" },
  { label: "Spanish - 0474", code: "0474" },
  { label: "Spanish - 0502", code: "0502" },
  { label: "Spanish - 0530", code: "0530" },
  { label: "Spanish - 0533", code: "0533" },
  { label: "Spanish - 0537", code: "0537" },
  { label: "Spanish - 7160", code: "7160" },
  { label: "Spanish Literature - 0488", code: "0488" },
  { label: "Swahili - 0262", code: "0262" },
  { label: "Thai - 0518", code: "0518" },
  { label: "Travel and Tourism - 0471", code: "0471" },
  { label: "Turkish - 0513", code: "0513" },
  { label: "Twenty-First Century Science - 0608", code: "0608" },
  { label: "Urdu - 0539", code: "0539" },
  { label: "Vietnamese - First Language - 0695", code: "0695" },
  { label: "World Literature - 0408", code: "0408" }
];
var IGCSE_SYLLABUS_OPTIONS = filterEnglishMediumSyllabuses(IGCSE_SYLLABUS_OPTIONS_ALL);
var OLEVEL_SYLLABUS_OPTIONS_ALL = [
  { label: "Accounting - 7707", code: "7707" },
  { label: "Agriculture - 5038", code: "5038" },
  { label: "Arabic - 3180", code: "3180" },
  { label: "Art - 6010", code: "6010" },
  { label: "Art and Design - 6090", code: "6090" },
  { label: "Bangladesh Studies - 7094", code: "7094" },
  { label: "Bengali - 3204", code: "3204" },
  { label: "Biblical Studies - 2035", code: "2035" },
  { label: "Biology - 5090", code: "5090" },
  { label: "Business Studies - 7115", code: "7115" },
  { label: "CDT Design and Communication - 7048", code: "7048" },
  { label: "Chemistry - 5070", code: "5070" },
  { label: "Commerce - 7100", code: "7100" },
  { label: "Commercial Studies - 7101", code: "7101" },
  { label: "Computer Science - 2210", code: "2210" },
  { label: "Computer Studies - 7010", code: "7010" },
  { label: "Design and Communication - 7048", code: "7048" },
  { label: "Design and Technology - 6043", code: "6043" },
  { label: "Economics - 2281", code: "2281" },
  { label: "English Language - 1123", code: "1123" },
  { label: "Environmental Management - 5014", code: "5014" },
  { label: "Fashion and Fabrics - 6050", code: "6050" },
  { label: "Fashion and Textiles - 6130", code: "6130" },
  { label: "Food and Nutrition - 6065", code: "6065" },
  { label: "French - 3015", code: "3015" },
  { label: "Geography - 2217", code: "2217" },
  { label: "German - 3025", code: "3025" },
  { label: "Global Perspectives - 2069", code: "2069" },
  { label: "Hindi - 3195", code: "3195" },
  { label: "Hinduism - 2055", code: "2055" },
  { label: "History - 2147", code: "2147" },
  { label: "History (Modern World Affairs) - 2134", code: "2134" },
  { label: "History World Affairs, 1917-1991 - 2158", code: "2158" },
  { label: "Human and Social Biology - 5096", code: "5096" },
  { label: "Islamic Religion and Culture - 2056", code: "2056" },
  { label: "Islamic Studies - 2068", code: "2068" },
  { label: "Islamiyat - 2058", code: "2058" },
  { label: "Literature in English - 2010", code: "2010" },
  { label: "Marine Science - 5180", code: "5180" },
  { label: "Mathematics D (Calculator Version) - 4024", code: "4024" },
  { label: "Mathematics - Additional - 4037", code: "4037" },
  { label: "Nepali - 3202", code: "3202" },
  { label: "Pakistan Studies - 2059", code: "2059" },
  { label: "Physics - 5054", code: "5054" },
  { label: "Principles of Accounts - 7110", code: "7110" },
  { label: "Religious Studies - 2048", code: "2048" },
  { label: "Science - Combined - 5129", code: "5129" },
  { label: "Setswana - 3158", code: "3158" },
  { label: "Sinhala - 3205", code: "3205" },
  { label: "Sociology - 2251", code: "2251" },
  { label: "Spanish - 3035", code: "3035" },
  { label: "Statistics - 4040", code: "4040" },
  { label: "Swahili - 3162", code: "3162" },
  { label: "Tamil - 3206", code: "3206" },
  { label: "Tamil - 3226", code: "3226" },
  { label: "Travel and Tourism - 7096", code: "7096" },
  { label: "Urdu - 3247", code: "3247" },
  { label: "Urdu - 3248", code: "3248" }
];
var OLEVEL_SYLLABUS_OPTIONS = filterEnglishMediumSyllabuses(OLEVEL_SYLLABUS_OPTIONS_ALL);
var ALEVEL_SYLLABUS_OPTIONS_ALL = [
  { label: "Accounting - 9706", code: "9706" },
  { label: "Afrikaans - 8679", code: "8679" },
  { label: "Afrikaans - 8779", code: "8779" },
  { label: "Afrikaans - 9679", code: "9679" },
  { label: "Applied ICT - 9713", code: "9713" },
  { label: "Arabic - 8680", code: "8680" },
  { label: "Arabic - 9680", code: "9680" },
  { label: "Art and Design - 9704", code: "9704" },
  { label: "Art and Design - 9479", code: "9479" },
  { label: "Biblical Studies - 9484", code: "9484" },
  { label: "Biology - 9184", code: "9184" },
  { label: "Biology - 9700", code: "9700" },
  { label: "Business Studies - 9707", code: "9707" },
  { label: "Business - 9609", code: "9609" },
  { label: "Cambridge International Project Qualification - 9980", code: "9980" },
  { label: "Chemistry - 9185", code: "9185" },
  { label: "Chemistry - 9701", code: "9701" },
  { label: "Chinese - 8238", code: "8238" },
  { label: "Chinese - 8669", code: "8669" },
  { label: "Chinese - 8681", code: "8681" },
  { label: "Chinese - 9715", code: "9715" },
  { label: "Chinese - 9868", code: "9868" },
  { label: "Classical Studies - 9274", code: "9274" },
  { label: "Computer Science - 9608", code: "9608" },
  { label: "Computer Science (first exam 2021) - 9618", code: "9618" },
  { label: "Computing - 9691", code: "9691" },
  { label: "Design and Technology - 9481", code: "9481" },
  { label: "Design and Technology - 9705", code: "9705" },
  { label: "Design and Textiles - 9631", code: "9631" },
  { label: "Divinity - 9011", code: "9011" },
  { label: "Divinity - 8041", code: "8041" },
  { label: "Drama - 9482", code: "9482" },
  { label: "Economics - 9708", code: "9708" },
  { label: "English - 8274", code: "8274" },
  { label: "English - 8287", code: "8287" },
  { label: "English - 8693", code: "8693" },
  { label: "English - 8695", code: "8695" },
  { label: "English - 9093", code: "9093" },
  { label: "English Literature - 9276", code: "9276" },
  { label: "English Literature - 9695", code: "9695" },
  { label: "English General Paper - 8021", code: "8021" },
  { label: "Environmental Management - 8291", code: "8291" },
  { label: "Food Studies - 9336", code: "9336" },
  { label: "French - 8277", code: "8277", unavailable: true },
  { label: "French - 8682", code: "8682" },
  { label: "French - 9281", code: "9281", unavailable: true },
  { label: "French - 9716", code: "9716" },
  { label: "French Language AS only - 8028", code: "8028" },
  { label: "French Literature - 8670", code: "8670" },
  { label: "French Language & Literature - 9898", code: "9898" },
  { label: "General Paper - 8001", code: "8001" },
  { label: "General Paper - 8004", code: "8004" },
  { label: "Geography - 9278", code: "9278", unavailable: true },
  { label: "Geography - 9696", code: "9696" },
  { label: "German - 8027", code: "8027" },
  { label: "German - 8683", code: "8683" },
  { label: "German - 9717", code: "9717" },
  { label: "German Language & Literature - 9897", code: "9897" },
  { label: "Global Perspectives - 8275", code: "8275" },
  { label: "Global Perspectives - 8987", code: "8987" },
  { label: "Global Perspectives and Research - 9239", code: "9239" },
  { label: "Hindi - 8687", code: "8687" },
  { label: "Hindi - 9687", code: "9687" },
  { label: "Hindi Literature - 8675", code: "8675" },
  { label: "Hinduism - 9014", code: "9014" },
  { label: "Hinduism - 9487", code: "9487" },
  { label: "Hinduism - 8058", code: "8058" },
  { label: "History - 9279", code: "9279" },
  { label: "History - 9389", code: "9389" },
  { label: "History - 9489", code: "9489" },
  { label: "History - 9697", code: "9697" },
  { label: "Information Technology - 9626", code: "9626" },
  { label: "Islamic Studies - 9013", code: "9013" },
  { label: "Islamic Studies - 8053", code: "8053" },
  { label: "Islamic Studies - 9488", code: "9488" },
  { label: "Japanese - 8281", code: "8281" },
  { label: "Law - 9084", code: "9084" },
  { label: "Marathi - 8688", code: "8688" },
  { label: "Marathi - 9688", code: "9688" },
  { label: "Marine Science - 9693", code: "9693" },
  { label: "Mathematics - 9231", code: "9231" },
  { label: "Mathematics - 9280", code: "9280" },
  { label: "Mathematics - 9709", code: "9709" },
  { label: "Media Studies - 9607", code: "9607" },
  { label: "Music - 9385", code: "9385", unavailable: true },
  { label: "Music - 9483", code: "9483" },
  { label: "Music - 9703", code: "9703" },
  { label: "Music - 8663", code: "8663" },
  { label: "Nepal Studies - 8024", code: "8024" },
  { label: "Physical Education - 9396", code: "9396" },
  { label: "Physical Science - 8780", code: "8780" },
  { label: "Physics - 9702", code: "9702" },
  { label: "Portuguese - 8672", code: "8672" },
  { label: "Portuguese - 8684", code: "8684" },
  { label: "Portuguese - 9718", code: "9718" },
  { label: "Psychology - 9698", code: "9698" },
  { label: "Psychology - 9990", code: "9990" },
  { label: "Sociology - 9699", code: "9699" },
  { label: "Spanish - 8022", code: "8022" },
  { label: "Spanish - 8278", code: "8278" },
  { label: "Spanish - 8279", code: "8279", unavailable: true },
  { label: "Spanish - 8673", code: "8673" },
  { label: "Spanish - 8685", code: "8685" },
  { label: "Spanish - 9282", code: "9282", unavailable: true },
  { label: "Spanish - 9719", code: "9719" },
  { label: "Spanish - 8665", code: "8665" },
  { label: "Spanish - 9844", code: "9844" },
  { label: "Sport & Physical Education - 8386", code: "8386" },
  { label: "Tamil - 9689", code: "9689" },
  { label: "Tamil - 8689", code: "8689" },
  { label: "Telugu - 8690", code: "8690" },
  { label: "Telugu - 9690", code: "9690" },
  { label: "Thinking Skills - 9694", code: "9694" },
  { label: "Travel and Tourism - 9395", code: "9395" },
  { label: "Urdu - 8686", code: "8686" },
  { label: "Urdu - 9676", code: "9676" },
  { label: "Urdu - 9686", code: "9686" }
];
var ALEVEL_SYLLABUS_OPTIONS = filterEnglishMediumSyllabuses(ALEVEL_SYLLABUS_OPTIONS_ALL);
var SYLLABUS_BY_LEVEL = {
  igcse: IGCSE_SYLLABUS_OPTIONS,
  olevel: OLEVEL_SYLLABUS_OPTIONS,
  alevel: ALEVEL_SYLLABUS_OPTIONS
};

// src/lib/paperLinkConstants.ts
var SESSION_CODES = ["M", "S", "W"];
var VARIANT_CODES = [
  "01",
  "02",
  "03",
  "11",
  "12",
  "13",
  "21",
  "22",
  "23",
  "31",
  "32",
  "33",
  "41",
  "42",
  "43",
  "51",
  "52",
  "53",
  "61",
  "62",
  "63"
];
var MIN_YEAR = 2017;
var MAX_YEAR = 2026;

// server/papaCambridgePdfResponse.ts
function pathBasename(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
function finalUrlMatchesExpectedPastPaperPdf(requestUrl, responseUrl) {
  try {
    const req = new URL(requestUrl);
    const res = new URL(responseUrl);
    const want = pathBasename(req.pathname).toLowerCase();
    const got = pathBasename(res.pathname).toLowerCase();
    if (!want.endsWith(".pdf") || want.length < 5) return false;
    if (want !== got) return false;
    if (!req.pathname.includes("/upload/") || !res.pathname.includes("/upload/")) return false;
    const host = res.hostname.toLowerCase();
    if (!host.includes("papacambridge")) return false;
    return true;
  } catch {
    return false;
  }
}

// server/refreshPaperLinks.ts
function isTransientTursoError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|socket hang up|pipeline failed/i.test(msg);
}
async function batchWriteWithRetry(db, batch, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await db.batch(batch, "write");
      return;
    } catch (e) {
      last = e;
      if (!isTransientTursoError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}
function buildQpFilename(syllabusCode, session, yy, variant) {
  return `${syllabusCode}_${session.toLowerCase()}${yy}_qp_${variant}.pdf`;
}
function qpUrl(filename) {
  return `${BASE_PAPERS_URL}${filename}`;
}
function msFilenameFromQp(filename) {
  return filename.replace(/_qp_/i, "_ms_");
}
function isLikelyPdfPrefix(b) {
  return b.length >= 5 && b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70 && b[4] === 45;
}
async function readFirstBytes(res, n) {
  const body = res.body;
  if (!body) {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab).slice(0, n);
  }
  const chunks = [];
  let total = 0;
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      const r = body;
      if (typeof r.destroy === "function") r.destroy();
      resolve();
    };
    const onData = (chunk) => {
      const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      chunks.push(b);
      total += b.length;
      if (total >= n) finish();
    };
    const onEnd = () => finish();
    const onError = (e) => {
      if (settled) return;
      settled = true;
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      reject(e);
    };
    body.on("data", onData);
    body.once("end", onEnd);
    body.once("error", onError);
  });
  const merged = Buffer.concat(chunks);
  return new Uint8Array(merged.subarray(0, Math.min(n, merged.length)));
}
async function checkUrlExists(url) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  const fetchOpts = (extra) => ({
    method: extra.method,
    redirect: "follow",
    headers: extra.headers,
    signal: AbortSignal.timeout(2e4)
  });
  async function verifyPdf(res, requestUrl) {
    const st = res.status;
    if (st !== 200 && st !== 206) {
      return { ok: false, status: st, error: `HTTP ${st}` };
    }
    const finalUrl = res.url || requestUrl;
    if (!finalUrlMatchesExpectedPastPaperPdf(requestUrl, finalUrl)) {
      return { ok: false, status: st, error: "redirected away from upload PDF (invalid link)" };
    }
    const prefix = await readFirstBytes(res, 8);
    if (isLikelyPdfPrefix(prefix)) {
      return { ok: true, status: st, error: null };
    }
    return { ok: false, status: st, error: "not a PDF" };
  }
  try {
    let getRes = await fetch(
      url,
      fetchOpts({
        method: "GET",
        headers: {
          ...headers,
          Range: "bytes=0-7"
        }
      })
    );
    if (getRes.status === 416) {
      getRes = await fetch(url, fetchOpts({ method: "GET", headers }));
    }
    return verifyPdf(getRes, url);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "network error"
    };
  }
}
var UPSERT_CHECK = `
INSERT INTO paper_link_check (
  qualification_level, syllabus_code, year, session_code, variant, paper_type,
  filename, url, is_available, http_status, last_checked_at, last_error, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
ON CONFLICT(qualification_level, syllabus_code, year, session_code, variant, paper_type)
DO UPDATE SET
  url = excluded.url,
  filename = excluded.filename,
  is_available = excluded.is_available,
  http_status = excluded.http_status,
  last_checked_at = datetime('now'),
  last_error = excluded.last_error,
  updated_at = datetime('now')
`;
var INSERT_EXPECTED = `
INSERT OR IGNORE INTO expected_paper_slot (
  qualification_level, syllabus_code, year, session_code, variant, expect_qp, expect_ms
) VALUES (?, ?, ?, ?, ?, 1, 1)
`;
var UPSERT_SYLLABUS_REFRESH = `
INSERT INTO syllabus_catalog_refresh (qualification_level, syllabus_code, last_refresh_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(qualification_level, syllabus_code) DO UPDATE SET last_refresh_at = datetime('now')
`;
function estimateRefreshUrlCount(params) {
  const syllabi = resolveSyllabi(params);
  const years = MAX_YEAR - MIN_YEAR + 1;
  return syllabi.length * years * SESSION_CODES.length * VARIANT_CODES.length * 2;
}
function resolveSyllabi(params) {
  const out = [];
  const want = new Set(params.syllabusCodes.filter(Boolean));
  const filterAll = want.size === 0;
  for (const level of params.qualificationLevels) {
    const list = SYLLABUS_BY_LEVEL[level] ?? [];
    for (const item of list) {
      if (item.unavailable) continue;
      if (!filterAll && !want.has(item.code)) continue;
      out.push({ code: item.code, level });
    }
  }
  return out;
}
function buildSyllabusRefreshStatements(syllabi) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const s of syllabi) {
    const k = `${s.level}:${s.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      sql: UPSERT_SYLLABUS_REFRESH,
      args: [s.level, s.code]
    });
  }
  return out;
}
async function runLinkRefresh(db, params, onProgress) {
  const t0 = Date.now();
  const syllabi = resolveSyllabi(params);
  if (syllabi.length === 0) {
    return {
      urlsChecked: 0,
      qpAvailable: 0,
      msAvailable: 0,
      qpMissing: 0,
      msMissing: 0,
      errors: 0,
      durationMs: Date.now() - t0
    };
  }
  const y0 = MIN_YEAR;
  const y1 = MAX_YEAR;
  const tasks = [];
  for (const { code, level } of syllabi) {
    for (let year = y0; year <= y1; year += 1) {
      const yy = String(year).slice(-2);
      for (const session of SESSION_CODES) {
        for (const variant of VARIANT_CODES) {
          const qpFile = buildQpFilename(code, session, yy, variant);
          const msFile = msFilenameFromQp(qpFile);
          const qpU = qpUrl(qpFile);
          const msU = qpUrl(msFile);
          tasks.push({
            expectedArgs: [level, code, year, session, variant],
            row: {
              qualification_level: level,
              syllabus_code: code,
              year,
              session_code: session,
              variant,
              paper_type: "qp",
              filename: qpFile,
              url: qpU,
              is_available: 0,
              http_status: 0,
              last_error: null
            }
          });
          tasks.push({
            expectedArgs: [level, code, year, session, variant],
            row: {
              qualification_level: level,
              syllabus_code: code,
              year,
              session_code: session,
              variant,
              paper_type: "ms",
              filename: msFile,
              url: msU,
              is_available: 0,
              http_status: 0,
              last_error: null
            }
          });
        }
      }
    }
  }
  const total = tasks.length;
  let done = 0;
  let qpAvailable = 0;
  let msAvailable = 0;
  let qpMissing = 0;
  let msMissing = 0;
  let errors = 0;
  const CONCURRENCY = 1e3;
  const syllabusRefreshStmts = buildSyllabusRefreshStatements(syllabi);
  async function runOne(task) {
    const { row } = task;
    const check = await checkUrlExists(row.url);
    row.is_available = check.ok ? 1 : 0;
    row.http_status = check.status;
    row.last_error = check.error;
  }
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const slice = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map((t) => runOne(t)));
    for (const t of slice) {
      const r = t.row;
      const ok = r.is_available === 1;
      if (r.paper_type === "qp") {
        if (ok) qpAvailable += 1;
        else qpMissing += 1;
      } else {
        if (ok) msAvailable += 1;
        else msMissing += 1;
      }
      if (!ok && r.http_status === 0) errors += 1;
    }
    done += slice.length;
    onProgress?.(done, total);
    const batch = [];
    for (const t of slice) {
      const [level, code, year, session, variant] = t.expectedArgs;
      batch.push({
        sql: INSERT_EXPECTED,
        args: [level, code, year, session, variant]
      });
      const r = t.row;
      batch.push({
        sql: UPSERT_CHECK,
        args: [
          r.qualification_level,
          r.syllabus_code,
          r.year,
          r.session_code,
          r.variant,
          r.paper_type,
          r.filename,
          r.url,
          r.is_available,
          r.http_status,
          r.last_error
        ]
      });
    }
    for (const stmt of syllabusRefreshStmts) {
      batch.push(stmt);
    }
    await batchWriteWithRetry(db, batch);
  }
  return {
    urlsChecked: total,
    qpAvailable,
    msAvailable,
    qpMissing,
    msMissing,
    errors,
    durationMs: Date.now() - t0
  };
}

// server/adminRouter.ts
var QUAL_SET = /* @__PURE__ */ new Set(["igcse", "olevel", "alevel"]);
var SAFE_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
async function deleteAllRowsFromAllTables(db) {
  const listed = await db.execute({
    sql: `SELECT name FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
            AND name NOT LIKE 'libsql%'`,
    args: []
  });
  const names = [];
  for (const row of listed.rows) {
    const n = Array.isArray(row) ? row[0] : row.name;
    if (n == null || n === "") continue;
    const s = String(n);
    if (!SAFE_TABLE.test(s)) continue;
    names.push(s);
  }
  if (names.length === 0) return;
  await db.execute("PRAGMA foreign_keys = OFF");
  try {
    await db.batch(
      names.map((n) => ({ sql: `DELETE FROM "${n}"`, args: [] })),
      "write"
    );
    if (names.includes("caie_variant")) {
      const placeholders = VARIANT_CODES.map(() => "(?)").join(",");
      await db.execute({
        sql: `INSERT INTO caie_variant (code) VALUES ${placeholders}`,
        args: [...VARIANT_CODES]
      });
    }
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }
}
function parseAuth(req) {
  const h = req.headers.authorization;
  if (!h) return void 0;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim();
}
var router = Router();
router.post("/login", (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: "ADMIN_PASSWORD is not set on the server." });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password." });
  }
  const token = createAdminSession();
  return res.json({ ok: true, token });
});
router.post("/logout", (req, res) => {
  const token = parseAuth(req);
  if (token) revokeAdminToken(token);
  return res.json({ ok: true });
});
router.get("/last-refreshes", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.status(503).json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
  try {
    const r = await db.execute({
      sql: "SELECT qualification_level, syllabus_code, last_refresh_at FROM syllabus_catalog_refresh",
      args: []
    });
    const rows = r.rows;
    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("[ADMIN_LAST_REFRESHES]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed."
    });
  }
});
router.post("/estimate", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const body = req.body ?? {};
  const levels = Array.isArray(body.qualificationLevels) ? body.qualificationLevels : [];
  const validLevels = levels.filter((x) => QUAL_SET.has(x));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];
  const params = {
    qualificationLevels: validLevels,
    syllabusCodes
  };
  try {
    const estimatedUrls = estimateRefreshUrlCount(params);
    return res.json({ ok: true, estimatedUrls, params });
  } catch (e) {
    console.error("[ADMIN_ESTIMATE]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Estimate failed."
    });
  }
});
router.post("/clear-catalog", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.status(503).json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
  try {
    await deleteAllRowsFromAllTables(db);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN_CLEAR_CATALOG]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Clear failed."
    });
  }
});
router.post("/refresh", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.status(503).json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
  const body = req.body ?? {};
  const levels = Array.isArray(body.qualificationLevels) ? body.qualificationLevels : [];
  const validLevels = levels.filter((x) => QUAL_SET.has(x));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];
  const params = {
    qualificationLevels: validLevels,
    syllabusCodes
  };
  try {
    const stats = await runLinkRefresh(db, params);
    return res.json({ ok: true, stats, params });
  } catch (e) {
    console.error("[ADMIN_REFRESH]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Refresh failed."
    });
  }
});
var adminRouter_default = router;

// server/catalogApi.ts
import { Router as Router2 } from "express";
var QUAL_SET2 = /* @__PURE__ */ new Set(["igcse", "olevel", "alevel"]);
var SESSION_LETTERS = /* @__PURE__ */ new Set(["M", "S", "W"]);
var router2 = Router2();
router2.get("/refreshed-syllabi", async (req, res) => {
  const qual = typeof req.query.qualificationLevel === "string" ? req.query.qualificationLevel.trim() : "";
  if (!qual) {
    return res.status(400).json({ error: "qualificationLevel is required." });
  }
  if (!QUAL_SET2.has(qual)) {
    return res.status(400).json({ error: "Invalid qualificationLevel." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.json({ ok: true, codes: null, catalogConfigured: false });
  }
  try {
    const r = await db.execute({
      sql: "SELECT syllabus_code FROM syllabus_catalog_refresh WHERE qualification_level = ? ORDER BY syllabus_code",
      args: [qual]
    });
    const codes = [];
    for (const row of r.rows) {
      const c = Array.isArray(row) ? row[0] : row.syllabus_code;
      if (c != null && c !== "") codes.push(String(c));
    }
    return res.json({ ok: true, codes, catalogConfigured: true });
  } catch (e) {
    console.error("[CATALOG_REFRESHED_SYLLABI]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed."
    });
  }
});
function parseYear(q, fallback) {
  const n = typeof q === "string" ? parseInt(q.trim(), 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
router2.get("/qp-variants", async (req, res) => {
  const qual = typeof req.query.qualificationLevel === "string" ? req.query.qualificationLevel.trim() : "";
  const code = typeof req.query.syllabusCode === "string" ? req.query.syllabusCode.trim() : "";
  if (!qual || !code) {
    return res.status(400).json({ error: "qualificationLevel and syllabusCode are required." });
  }
  if (!QUAL_SET2.has(qual)) {
    return res.status(400).json({ error: "Invalid qualificationLevel." });
  }
  const rawSessions = typeof req.query.sessions === "string" ? req.query.sessions.trim() : "";
  const sessionList = rawSessions.split(",").map((s) => s.trim().toUpperCase()).filter((s) => SESSION_LETTERS.has(s));
  const sessionsForQuery = sessionList.length > 0 ? sessionList : ["M", "S", "W"];
  const y0 = parseYear(req.query.startYear, MIN_YEAR);
  const y1 = parseYear(req.query.endYear, MAX_YEAR);
  const yearLo = Math.max(MIN_YEAR, Math.min(y0, y1));
  const yearHi = Math.min(MAX_YEAR, Math.max(y0, y1));
  const db = getTursoClient();
  if (!db) {
    return res.json({ hasCatalogData: false, variants: null });
  }
  try {
    const chk = await db.execute({
      sql: "SELECT 1 AS ok FROM paper_link_check WHERE qualification_level = ? AND syllabus_code = ? LIMIT 1",
      args: [qual, code]
    });
    const hasAnyRow = (chk.rows?.length ?? 0) > 0;
    if (!hasAnyRow) {
      return res.json({ hasCatalogData: false, variants: null });
    }
    const inPlaceholders = sessionsForQuery.map(() => "?").join(", ");
    const yearSpan = yearHi - yearLo + 1;
    const r = await db.execute({
      sql: `SELECT variant FROM paper_link_check
            WHERE qualification_level = ? AND syllabus_code = ? AND paper_type = 'qp' AND is_available = 1
            AND session_code IN (${inPlaceholders})
            AND year BETWEEN ? AND ?
            GROUP BY variant
            HAVING COUNT(DISTINCT year) = ?
            ORDER BY variant`,
      args: [qual, code, ...sessionsForQuery, yearLo, yearHi, yearSpan]
    });
    const rows = r.rows;
    const variants = [];
    for (const row of rows) {
      const v = Array.isArray(row) ? row[0] : row.variant;
      if (v != null && v !== "") variants.push(String(v));
    }
    return res.json({ hasCatalogData: true, variants });
  } catch (e) {
    console.error("[CATALOG_QP_VARIANTS]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed."
    });
  }
});
var catalogApi_default = router2;

// server/createApp.ts
function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", catalogApi_default);
  app.use("/api/admin", adminRouter_default);
  app.get("/api/proxy-pdf", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("URL is required");
    try {
      const response = await fetch2(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://papers.xtremepape.rs/"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch from source: ${response.status} ${response.statusText}`);
      }
      const finalUrl = response.url || url;
      if (!finalUrlMatchesExpectedPastPaperPdf(url, finalUrl)) {
        throw new Error(
          "The URL redirected away from the past paper file (invalid or missing PDF on PapaCambridge)."
        );
      }
      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
        console.warn(`[PROXY-PDF] Unexpected content-type: ${contentType}`);
      }
      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      if (uint8Array[0] !== 37 || uint8Array[1] !== 80 || uint8Array[2] !== 68 || uint8Array[3] !== 70) {
        throw new Error(
          "The source URL did not return a valid PDF file. It might be blocked or the link might be invalid."
        );
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(Buffer.from(uint8Array));
    } catch (error) {
      console.error("[PROXY_ERROR]", { url, error });
      res.status(500).send(`Error fetching PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });
  return app;
}

// server/vercel-handler.ts
var vercel_handler_default = createApp();
export {
  vercel_handler_default as default
};
