const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SystemSettings = require('../models/SystemSettings');
const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');
const { PHARMACOPOEIA_SEED_DATA } = require('./pharmacopoeiaSeedData');

function escapeRegex(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKey(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// In-memory 24h TTL cache for external GBIF / Gemini dynamic lookups
const LOOKUP_CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Build fast O(1) in-memory alias map and backward-compatible data structures from PHARMACOPOEIA_SEED_DATA
const ALIAS_MAP = new Map();
const HERB_DATABASE = [];
const VERNACULAR_TO_LATIN = {};

function toTitleCase(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/(?:^|\s|-)\S/g, a => a.toUpperCase());
}

function extractBinomial(botanicalStr) {
  if (!botanicalStr) return '';
  const parts = botanicalStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const genus = parts[0];
    const species = parts[1].replace(/[^a-zA-Z]/g, '');
    return `${genus} ${species}`;
  }
  return botanicalStr;
}

for (const seedItem of PHARMACOPOEIA_SEED_DATA) {
  const cleanScientific = extractBinomial(seedItem.botanicalName);
  const titleMatchedName = toTitleCase(seedItem.ayurvedicName);

  const formattedEntry = {
    matchedName: titleMatchedName,
    scientificName: cleanScientific,
    botanicalName: cleanScientific,
    rawBotanicalName: seedItem.botanicalName,
    family: seedItem.family || '',
    partUsed: seedItem.partUsed || 'Whole Plant / Material',
    pharmacopoeialStandard: seedItem.pharmacopoeialStandard || 'API',
    monographRef: seedItem.monographRef || '',
    category: 'Herb',
    synonyms: seedItem.synonyms || [],
    therapeuticUses: seedItem.therapeuticUses || [],
    rasa: seedItem.rasa || [],
    virya: seedItem.virya || '',
    vipaka: seedItem.vipaka || '',
    dosage: seedItem.dosage || ''
  };

  const namesList = [
    seedItem.ayurvedicName.toLowerCase(),
    ...(seedItem.synonyms || []).map(s => s.toLowerCase()),
    seedItem.botanicalName.toLowerCase()
  ];

  HERB_DATABASE.push({
    names: namesList,
    matchedName: seedItem.ayurvedicName,
    scientificName: cleanScientific || seedItem.botanicalName,
    partUsed: seedItem.partUsed,
    pharmacopoeialStandard: seedItem.pharmacopoeialStandard,
    category: 'Herb',
    synonyms: seedItem.synonyms
  });

  // Map ayurvedicName
  const ayurKey = normalizeKey(seedItem.ayurvedicName);
  if (ayurKey && !ALIAS_MAP.has(ayurKey)) ALIAS_MAP.set(ayurKey, formattedEntry);

  // Map botanicalName
  const botKey = normalizeKey(seedItem.botanicalName);
  if (botKey && !ALIAS_MAP.has(botKey)) ALIAS_MAP.set(botKey, formattedEntry);
  const cleanBotKey = normalizeKey(cleanScientific);
  if (cleanBotKey && !ALIAS_MAP.has(cleanBotKey)) ALIAS_MAP.set(cleanBotKey, formattedEntry);

  // Map synonyms & VERNACULAR_TO_LATIN
  if (Array.isArray(seedItem.synonyms)) {
    for (const syn of seedItem.synonyms) {
      const synKey = normalizeKey(syn);
      if (synKey && !ALIAS_MAP.has(synKey)) ALIAS_MAP.set(synKey, formattedEntry);
      VERNACULAR_TO_LATIN[syn.toUpperCase()] = seedItem.botanicalName;
    }
  }
  VERNACULAR_TO_LATIN[seedItem.ayurvedicName.toUpperCase()] = seedItem.botanicalName;
}

// Add extra common vernacular shortcuts
const EXTRA_VERNACULAR_MAP = {
  'LATAKARANJA': 'Caesalpinia bonduc',
  'LATAKARANJU': 'Caesalpinia bonduc',
  'KARANJU': 'Caesalpinia bonduc',
  'VAJRAVALLI': 'Cissus quadrangularis',
  'HADJOD': 'Cissus quadrangularis',
  'HARRA': 'Terminalia chebula',
  'HARAD': 'Terminalia chebula',
  'KALMEGH': 'Andrographis paniculata',
  'BHUNIMBA': 'Andrographis paniculata',
  'GOKSHURA': 'Tribulus terrestris',
  'GOKHRU': 'Tribulus terrestris',
  'JIVANTI': 'Leptadenia reticulata',
  'PASHANABHEDA': 'Bergenia ligulata',
  'PAKHANBHED': 'Bergenia ligulata',
  'MADANAPHALA': 'Catunaregam spinosa',
  'KAMPILLAKA': 'Mallotus philippensis',
  'SAFED MUSLI': 'Chlorophytum borivilianum',
  'VATSANABHA': 'Aconitum ferox',
  'BHALLATAKA': 'Semecarpus anacardium',
  'DHATAKI': 'Woodfordia fruticosa',
  'KATUKA': 'Picrorhiza kurroa',
  'KUTKI': 'Picrorhiza kurroa',
  'MAHUA': 'Madhuca indica',
  'VARUNA': 'Crateva nurvala',
  'KANKOLA': 'Piper cubeba',
  'USHEERA': 'Vetiveria zizanioides',
  'VIDARI': 'Pueraria tuberosa',
  'VIDARIKAND': 'Pueraria tuberosa'
};

for (const [vKey, vVal] of Object.entries(EXTRA_VERNACULAR_MAP)) {
  VERNACULAR_TO_LATIN[vKey] = vVal;
  const nKey = normalizeKey(vKey);
  if (!ALIAS_MAP.has(nKey)) {
    const matchedSeed = PHARMACOPOEIA_SEED_DATA.find(s => s.botanicalName.toLowerCase().includes(vVal.toLowerCase()));
    if (matchedSeed) {
      ALIAS_MAP.set(nKey, {
        matchedName: matchedSeed.ayurvedicName,
        scientificName: matchedSeed.botanicalName,
        botanicalName: matchedSeed.botanicalName,
        family: matchedSeed.family || '',
        partUsed: matchedSeed.partUsed || 'Whole Plant / Material',
        pharmacopoeialStandard: matchedSeed.pharmacopoeialStandard || 'API',
        monographRef: matchedSeed.monographRef || '',
        category: 'Herb',
        synonyms: matchedSeed.synonyms || []
      });
    }
  }
}

/**
 * High-performance herb resolution function.
 * Lookup Order:
 *  1. In-memory ALIAS_MAP (O(1))
 *  2. MongoDB PharmacopoeiaEntry query
 *  3. GBIF Taxonomy API (if query >= 3 chars)
 *  4. Gemini AI Pharmacognosy Engine
 * 
 * Results from GBIF and Gemini are cached in memory for 24h.
 */
async function resolveHerbDetails(queryName) {
  if (!queryName || !queryName.trim()) {
    return {
      query: '',
      matchedName: '',
      scientificName: '',
      botanicalName: '',
      partUsed: '',
      pharmacopoeialStandard: 'API',
      category: 'Herb',
      synonyms: []
    };
  }

  const cleanKey = normalizeKey(queryName);
  if (!cleanKey) {
    return {
      query: queryName,
      matchedName: queryName.trim().toUpperCase(),
      scientificName: '',
      botanicalName: '',
      partUsed: '',
      pharmacopoeialStandard: 'API',
      category: 'Herb',
      synonyms: []
    };
  }

  // 1. Check O(1) In-Memory Seed Alias Map
  if (ALIAS_MAP.has(cleanKey)) {
    const hit = ALIAS_MAP.get(cleanKey);
    return {
      query: queryName,
      ...hit
    };
  }

  // Substring / word token match against in-memory ALIAS_MAP
  let bestMatch = null;
  let maxMatchLength = 0;

  for (const [mapKey, mapEntry] of ALIAS_MAP.entries()) {
    if (mapKey.length >= 3 && cleanKey.includes(mapKey)) {
      if (mapKey.length > maxMatchLength) {
        maxMatchLength = mapKey.length;
        bestMatch = mapEntry;
      }
    } else if (cleanKey.length >= 5 && mapKey.length >= cleanKey.length && mapKey.startsWith(cleanKey)) {
      if (mapKey.length > maxMatchLength) {
        maxMatchLength = mapKey.length;
        bestMatch = mapEntry;
      }
    }
  }

  if (bestMatch) {
    return {
      query: queryName,
      ...bestMatch
    };
  }

  // Check TTL cache for previous GBIF/Gemini dynamic resolutions
  const cached = LOOKUP_CACHE.get(cleanKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // 2. Search PharmacopoeiaEntry MongoDB model
  try {
    const escaped = escapeRegex(queryName.trim());
    const dbMatch = await PharmacopoeiaEntry.findOne({
      $or: [
        { ayurvedicName: { $regex: new RegExp(escaped, 'i') } },
        { botanicalName: { $regex: new RegExp(escaped, 'i') } },
        { synonyms: { $regex: new RegExp(escaped, 'i') } }
      ]
    }).lean();

    if (dbMatch) {
      const res = {
        query: queryName,
        matchedName: dbMatch.ayurvedicName,
        scientificName: dbMatch.botanicalName,
        botanicalName: dbMatch.botanicalName,
        partUsed: dbMatch.partUsed,
        pharmacopoeialStandard: dbMatch.pharmacopoeialStandard || 'API',
        monographRef: dbMatch.monographRef || '',
        category: 'Herb',
        synonyms: dbMatch.synonyms || [],
        therapeuticUses: dbMatch.therapeuticUses || [],
        rasa: dbMatch.rasa || [],
        virya: dbMatch.virya || '',
        vipaka: dbMatch.vipaka || '',
        dosage: dbMatch.dosage || ''
      };
      LOOKUP_CACHE.set(cleanKey, { data: res, timestamp: Date.now() });
      return res;
    }
  } catch (err) {
    // Non-blocking DB catch
  }

  // 3. Search GBIF Open Public REST API (only for queries >= 3 characters)
  if (cleanKey.length >= 3) {
    try {
      const gbifResult = await lookupGbifTaxonomy(queryName);
      if (gbifResult && gbifResult.scientificName) {
        const res = {
          query: queryName,
          matchedName: queryName.trim().toUpperCase(),
          scientificName: gbifResult.scientificName,
          botanicalName: gbifResult.scientificName,
          family: gbifResult.family || '',
          partUsed: 'Herb/Plant Material',
          pharmacopoeialStandard: 'API',
          category: 'Herb',
          synonyms: gbifResult.synonyms || [],
          source: 'GBIF Taxonomy API'
        };
        LOOKUP_CACHE.set(cleanKey, { data: res, timestamp: Date.now() });
        return res;
      }
    } catch (err) {
      // Non-blocking GBIF catch
    }
  }

  // 4. Gemini AI fallback if not in pre-loaded database or GBIF
  try {
    const sys = await SystemSettings.findOne({ key: 'company_config' }).select('+geminiApiKey').lean();
    const apiKey = (sys && sys.geminiApiKey && sys.geminiApiKey.trim()) ? sys.geminiApiKey.trim() : process.env.GEMINI_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      const prompt = `You are a pharmacognosy expert for Ayurvedic, herbal, and botanical raw materials.
User entered herb/raw material name: "${queryName}"

Respond with ONLY a valid JSON object with the following fields:
- "matchedName": Official standardized common English/Ayurvedic name (e.g. "Ashwagandha")
- "scientificName": Latin binomial botanical/scientific name (e.g. "Withania somnifera")
- "partUsed": Plant part used in medicine (e.g., "Root", "Leaf", "Bark", "Fruit", "Rhizome")
- "pharmacopoeialStandard": "API", "AFI", "IP", "BP", or "USP"
- "category": "Dry Herb", "Fresh Herb", "Excipient", "Volatile Oil", or "Plant Concentrate"
- "synonyms": Array of 2-4 alternative common/regional names or English names

Do NOT include any extra text, markdown formatting or backticks outside the JSON.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(text);

      if (parsed && (parsed.scientificName || parsed.matchedName)) {
        const res = {
          query: queryName,
          matchedName: parsed.matchedName || queryName.trim().toUpperCase(),
          scientificName: parsed.scientificName || '',
          botanicalName: parsed.scientificName || '',
          partUsed: parsed.partUsed || '',
          pharmacopoeialStandard: parsed.pharmacopoeialStandard || 'API',
          category: parsed.category || 'Herb',
          synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : []
        };
        LOOKUP_CACHE.set(cleanKey, { data: res, timestamp: Date.now() });
        return res;
      }
    }
  } catch (err) {
    console.error('Herb Resolution AI Lookup Error:', err.message);
  }

  const fallback = {
    query: queryName,
    matchedName: queryName.trim().toUpperCase(),
    scientificName: '',
    botanicalName: '',
    partUsed: '',
    pharmacopoeialStandard: 'API',
    category: 'Herb',
    synonyms: []
  };
  return fallback;
}

/**
 * Helper to query GBIF (Global Biodiversity Information Facility) Open Public REST API
 */
function lookupGbifTaxonomy(queryTerm) {
  return new Promise((resolve) => {
    const upperQuery = (queryTerm || '').trim().toUpperCase();
    const latinTerm = VERNACULAR_TO_LATIN[upperQuery] || queryTerm;

    const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(latinTerm)}`;

    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && (json.canonicalName || json.scientificName) && json.matchType !== 'NONE') {
            return resolve({
              scientificName: json.canonicalName || json.scientificName,
              family: json.family || '',
              genus: json.genus || '',
              synonyms: [json.species, json.family].filter(Boolean)
            });
          }
        } catch (e) {
          // parse error
        }
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Backward compatibility wrapper
 */
async function getBotanicalInfo(rawMaterialName) {
  const res = await resolveHerbDetails(rawMaterialName);
  return {
    botanicalName: res.scientificName || res.botanicalName,
    partUsed: res.partUsed,
    pharmacopoeialStandard: res.pharmacopoeialStandard
  };
}

module.exports = {
  resolveHerbDetails,
  getBotanicalInfo,
  lookupGbifTaxonomy,
  HERB_DATABASE
};
