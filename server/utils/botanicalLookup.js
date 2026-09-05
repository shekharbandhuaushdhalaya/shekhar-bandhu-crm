const { GoogleGenerativeAI } = require('@google/generative-ai');
const SystemSettings = require('../models/SystemSettings');

const HERB_DATABASE = [
  {
    "names": [
      "ashwagandha",
      "asgandh",
      "asgand",
      "indian ginseng",
      "winter cherry",
      "withania"
    ],
    "matchedName": "Ashwagandha",
    "scientificName": "Withania somnifera",
    "partUsed": "Root",
    "pharmacopoeialStandard": "API",
    "category": "Herb",
    "synonyms": [
      "Asgandh",
      "Indian Ginseng",
      "Winter Cherry",
      "Withania"
    ]
  },
  {
    "names": [
      "tulsi",
      "tulsy",
      "holy basil",
      "surasa",
      "vrinda"
    ],
    "matchedName": "Tulsi",
    "scientificName": "Ocimum sanctum",
    "partUsed": "Leaf",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Holy Basil",
      "Surasa",
      "Vrinda",
      "Ocimum tenuiflorum"
    ]
  },
  {
    "names": [
      "shatavari",
      "satavari",
      "shatamull",
      "asparagus racemosus"
    ],
    "matchedName": "Shatavari",
    "scientificName": "Asparagus racemosus",
    "partUsed": "Tuberous Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Satavari",
      "Shatamull",
      "Wild Asparagus"
    ]
  },
  {
    "names": [
      "neem",
      "nimba",
      "margosa",
      "azadirachta indica"
    ],
    "matchedName": "Neem",
    "scientificName": "Azadirachta indica",
    "partUsed": "Leaf/Bark",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Nimba",
      "Margosa Tree",
      "Indian Lilac"
    ]
  },
  {
    "names": [
      "guduchi",
      "giloy",
      "gilo",
      "amrita",
      "tinospora cordifolia"
    ],
    "matchedName": "Guduchi",
    "scientificName": "Tinospora cordifolia",
    "partUsed": "Stem",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Giloy",
      "Gilo",
      "Amrita",
      "Heart-leaved Moonseed"
    ]
  },
  {
    "names": [
      "amla",
      "amalaki",
      "avla",
      "aonla",
      "indian gooseberry",
      "phyllanthus emblica",
      "emblica officinalis"
    ],
    "matchedName": "Amla",
    "scientificName": "Phyllanthus emblica",
    "partUsed": "Fresh/Dry Fruit",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Amalaki",
      "Indian Gooseberry",
      "Emblica officinalis"
    ]
  },
  {
    "names": [
      "haritaki",
      "harra",
      "harad",
      "harde",
      "harr",
      "harar",
      "chebulic myrobalan",
      "terminalia chebula"
    ],
    "matchedName": "Haritaki",
    "scientificName": "Terminalia chebula",
    "partUsed": "Fruit Pericarp",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Harra",
      "Harad",
      "Harde",
      "Chebulic Myrobalan",
      "Abhaya",
      "Pathya"
    ]
  },
  {
    "names": [
      "bibhitaki",
      "baheda",
      "beleric myrobalan",
      "terminalia bellirica"
    ],
    "matchedName": "Bibhitaki",
    "scientificName": "Terminalia bellirica",
    "partUsed": "Fruit Pericarp",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Baheda",
      "Beleric Myrobalan",
      "Aksha"
    ]
  },
  {
    "names": [
      "brahmi",
      "water hyssop",
      "bacopa monnieri"
    ],
    "matchedName": "Brahmi",
    "scientificName": "Bacopa monnieri",
    "partUsed": "Whole Plant",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Water Hyssop",
      "Jalanimba",
      "Bacopa"
    ]
  },
  {
    "names": [
      "mulethi",
      "yashtimadhu",
      "licorice",
      "liquorice",
      "glycyrrhiza glabra"
    ],
    "matchedName": "Yashtimadhu",
    "scientificName": "Glycyrrhiza glabra",
    "partUsed": "Root/Rhizome",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Mulethi",
      "Licorice",
      "Sweetwood"
    ]
  },
  {
    "names": [
      "pippali",
      "piper longum",
      "long pepper"
    ],
    "matchedName": "Pippali",
    "scientificName": "Piper longum",
    "partUsed": "Fruit",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Long Pepper",
      "Magadhi"
    ]
  },
  {
    "names": [
      "maricha",
      "kali mirch",
      "black pepper",
      "piper nigrum"
    ],
    "matchedName": "Maricha",
    "scientificName": "Piper nigrum",
    "partUsed": "Fruit",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Kali Mirch",
      "Black Pepper",
      "Vellaja"
    ]
  },
  {
    "names": [
      "shunthi",
      "sonth",
      "dry ginger",
      "zingiber officinale"
    ],
    "matchedName": "Shunthi",
    "scientificName": "Zingiber officinale",
    "partUsed": "Dry Rhizome",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Sonth",
      "Dry Ginger",
      "Nagara"
    ]
  },
  {
    "names": [
      "guggulu",
      "guggul",
      "commiphora wightii",
      "indian bdellium"
    ],
    "matchedName": "Guggulu",
    "scientificName": "Commiphora wightii",
    "partUsed": "Exudate/Resin",
    "pharmacopoeialStandard": "API",
    "category": "Plant Concentrate",
    "synonyms": [
      "Guggul",
      "Indian Bdellium",
      "Purified Resin"
    ]
  },
  {
    "names": [
      "manjistha",
      "rubia cordifolia",
      "indian madder"
    ],
    "matchedName": "Manjistha",
    "scientificName": "Rubia cordifolia",
    "partUsed": "Stem/Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Indian Madder",
      "Aruna"
    ]
  },
  {
    "names": [
      "shankhpushpi",
      "convolvulus pluricaulis"
    ],
    "matchedName": "Shankhpushpi",
    "scientificName": "Convolvulus pluricaulis",
    "partUsed": "Whole Plant",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "Speedwheel",
      "Ksheerapushpi"
    ]
  },
  {
    "names": [
      "bhringraj",
      "eclipta alba",
      "eclipta prostrata",
      "false daisy"
    ],
    "matchedName": "Bhringraj",
    "scientificName": "Eclipta alba",
    "partUsed": "Whole Plant",
    "pharmacopoeialStandard": "API",
    "category": "Fresh Herb",
    "synonyms": [
      "False Daisy",
      "Keshraja"
    ]
  },
  {
    "names": [
      "arjuna",
      "terminalia arjuna"
    ],
    "matchedName": "Arjuna",
    "scientificName": "Terminalia arjuna",
    "partUsed": "Stem Bark",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Arjun Bark",
      "Kukubha"
    ]
  },
  {
    "names": [
      "punarnava",
      "boerhavia diffusa",
      "spreading hogweed"
    ],
    "matchedName": "Punarnava",
    "scientificName": "Boerhavia diffusa",
    "partUsed": "Root/Whole Plant",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Spreading Hogweed",
      "Shothaghni"
    ]
  },
  {
    "names": [
      "gokshura",
      "tribulus terrestris",
      "puncture vine"
    ],
    "matchedName": "Gokshura",
    "scientificName": "Tribulus terrestris",
    "partUsed": "Fruit/Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Puncture Vine",
      "Gokhru",
      "Trikanta"
    ]
  },
  {
    "names": [
      "kutki",
      "picrorhiza kurroa"
    ],
    "matchedName": "Kutki",
    "scientificName": "Picrorhiza kurroa",
    "partUsed": "Rhizome/Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Katuka",
      "Picrorhiza"
    ]
  },
  {
    "names": [
      "haridra",
      "haldi",
      "turmeric",
      "curcuma longa"
    ],
    "matchedName": "Haridra",
    "scientificName": "Curcuma longa",
    "partUsed": "Rhizome",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Haldi",
      "Turmeric",
      "Nisha"
    ]
  },
  {
    "names": [
      "chandan",
      "sandalwood",
      "santalum album"
    ],
    "matchedName": "Chandan",
    "scientificName": "Santalum album",
    "partUsed": "Heartwood",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Sandalwood",
      "Shrikhanda"
    ]
  },
  {
    "names": [
      "vajravalli",
      "asthisamharaka",
      "hadjod",
      "had jora",
      "cissus quadrangularis",
      "bone setter"
    ],
    "matchedName": "Vajravalli",
    "scientificName": "Cissus quadrangularis",
    "partUsed": "Stem",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Asthisamharaka",
      "Hadjod",
      "Bone Setter",
      "Asthisrnkhala"
    ]
  },
  {
    "names": [
      "akarkara",
      "pellitory root",
      "akarakarabha",
      "anacyclus"
    ],
    "matchedName": "AKARKARA",
    "scientificName": "Anacyclus pyrethrum",
    "partUsed": "Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Akarkara",
      "Pellitory Root",
      "Akarakarabha",
      "Anacyclus"
    ]
  },
  {
    "names": [
      "agnimantha",
      "arani",
      "premna",
      "tarkari",
      "dashamula tree"
    ],
    "matchedName": "AGNIMANTHA",
    "scientificName": "Premna integrifolia L.",
    "partUsed": "Root Bark",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Arani",
      "Premna",
      "Tarkari",
      "Dashamula Tree"
    ]
  },
  {
    "names": [
      "safed musli",
      "safed moosli",
      "white musli",
      "swetha musli",
      "shedheveli",
      "chlorophytum"
    ],
    "matchedName": "SAFED MUSLI",
    "scientificName": "Chlorophytum borivilianum Santapau & R.R.Fern.",
    "partUsed": "Tuberous Root",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Safed Moosli",
      "White Musli",
      "Swetha Musli",
      "Shedheveli"
    ]
  },
  {
    "names": [
      "jyotishmati",
      "malkangani",
      "intellect tree",
      "staff tree",
      "jyotishmati oil",
      "celastrus"
    ],
    "matchedName": "JYOTISHMATI",
    "scientificName": "Celastrus paniculatus Willd.",
    "partUsed": "Seed / Seed Oil",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Malkangani",
      "Intellect Tree",
      "Staff Tree",
      "Jyotishmati Oil"
    ]
  },
  {
    "names": [
      "kalonji",
      "black seed",
      "upakunchika",
      "black cumin",
      "nigella"
    ],
    "matchedName": "KALONJI",
    "scientificName": "Nigella sativa L.",
    "partUsed": "Seed",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Black Seed",
      "Upakunchika",
      "Black Cumin",
      "Nigella"
    ]
  },
  {
    "names": [
      "majuphal",
      "oak gall",
      "manjakani",
      "mayaphal",
      "oak apple",
      "quercus"
    ],
    "matchedName": "MAJUPHAL",
    "scientificName": "Quercus infectoria Olivier",
    "partUsed": "Insect Gall",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Oak Gall",
      "Manjakani",
      "Mayaphal",
      "Oak Apple"
    ]
  },
  {
    "names": [
      "jamun",
      "jambu",
      "java plum",
      "jamun seed",
      "jambula",
      "syzygium"
    ],
    "matchedName": "JAMUN",
    "scientificName": "Syzygium cumini",
    "partUsed": "Seed Kernel / Bark",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Jambu",
      "Java Plum",
      "Jamun Seed",
      "Jambula"
    ]
  },
  {
    "names": [
      "hing",
      "asafoetida",
      "hingu",
      "devil’s dung",
      "shodhita hingu",
      "ferula"
    ],
    "matchedName": "HING",
    "scientificName": "Ferula foetida Regel / Ferula narthex Boiss.",
    "partUsed": "Purified Oleo-Gum Resin (Shodhita Hingu)",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Asafoetida",
      "Hingu",
      "Devil’s Dung",
      "Shodhita Hingu"
    ]
  },
  {
    "names": [
      "alsi",
      "flaxseed",
      "linseed",
      "atasi",
      "uma",
      "linum"
    ],
    "matchedName": "ALSI",
    "scientificName": "Linum usitatissimum L.",
    "partUsed": "Seed / Seed Oil",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Flaxseed",
      "Linseed",
      "Atasi",
      "Uma"
    ]
  },
  {
    "names": [
      "kali jeeri",
      "kalijiri",
      "somaraji",
      "bitter cumin",
      "krimighna",
      "centratherum"
    ],
    "matchedName": "KALI JEERI",
    "scientificName": "Centratherum anthelminticum",
    "partUsed": "Seed",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Kalijiri",
      "Somaraji",
      "Bitter Cumin",
      "Krimighna"
    ]
  },
  {
    "names": [
      "ulatkambal",
      "devil’s cotton",
      "pivari",
      "abroma"
    ],
    "matchedName": "ULATKAMBAL",
    "scientificName": "Abroma augusta",
    "partUsed": "Root Bark",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Devil’s Cotton",
      "Ulatkambal",
      "Pivari"
    ]
  },
  {
    "names": [
      "putrajeevak",
      "putranjiva",
      "child life tree",
      "pavitra"
    ],
    "matchedName": "PUTRAJEEVAK",
    "scientificName": "Putranjiva roxburghii Wall.",
    "partUsed": "Seed Kernel",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Putranjiva",
      "Child Life Tree",
      "Pavitra"
    ]
  },
  {
    "names": [
      "chironji",
      "charoli",
      "buchanania",
      "priyala"
    ],
    "matchedName": "CHIRONJI",
    "scientificName": "Buchanania lanzan Spreng.",
    "partUsed": "Seed Kernel",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Charoli",
      "Buchanania",
      "Priyala"
    ]
  },
  {
    "names": [
      "gunja",
      "rosary pea",
      "ratti",
      "raktika",
      "abrus"
    ],
    "matchedName": "GUNJA",
    "scientificName": "Abrus precatorius L.",
    "partUsed": "Purified Seed (Shodhita)",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Rosary Pea",
      "Ratti",
      "Raktika"
    ]
  },
  {
    "names": [
      "kalihari",
      "flame lily",
      "gloriosa",
      "langali",
      "agnishikha"
    ],
    "matchedName": "KALIHARI",
    "scientificName": "Gloriosa superba L.",
    "partUsed": "Purified Tuber / Seed (Shodhita)",
    "pharmacopoeialStandard": "API",
    "category": "Dry Herb",
    "synonyms": [
      "Flame Lily",
      "Gloriosa",
      "Langali",
      "Agnishikha"
    ]
  }
];


 * High-performance herb resolution function.
 * Accepts any query string (herb name / alias / Hindi name / scientific name),
 * returns standardized common name, Latin scientific name, part used, standard, and synonyms.
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

  const cleanQuery = queryName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Search PharmacopoeiaEntry MongoDB model
  try {
    const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');
    const dbMatch = await PharmacopoeiaEntry.findOne({
      $or: [
        { ayurvedicName: { $regex: new RegExp(queryName.trim(), 'i') } },
        { botanicalName: { $regex: new RegExp(queryName.trim(), 'i') } },
        { synonyms: { $regex: new RegExp(queryName.trim(), 'i') } }
      ]
    }).lean();

    if (dbMatch) {
      return {
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
    }
  } catch (err) {
    // Ignore DB search error, proceed to fallback
  }

  // 2. Search Local HERB_DATABASE array using alias/name matching
  for (const herb of HERB_DATABASE) {
    for (const alias of herb.names) {
      const cleanAlias = alias.replace(/[^a-z0-9]/g, '');
      if (cleanQuery === cleanAlias || cleanQuery.includes(cleanAlias) || cleanAlias.includes(cleanQuery)) {
        return {
          query: queryName,
          matchedName: herb.matchedName,
          scientificName: herb.scientificName,
          botanicalName: herb.scientificName,
          partUsed: herb.partUsed,
          pharmacopoeialStandard: herb.pharmacopoeialStandard,
          category: herb.category,
          synonyms: herb.synonyms
        };
      }
    }
  }

  // 3. Search GBIF (Global Biodiversity Information Facility) Open Public REST API
  try {
    const gbifResult = await lookupGbifTaxonomy(queryName);
    if (gbifResult && gbifResult.scientificName) {
      return {
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
    }
  } catch (err) {
    // Non-blocking GBIF API fallback catch
  }

  // 4. Gemini AI fallback if not in pre-loaded database or GBIF
  try {
    const sys = await SystemSettings.findOne({ key: 'company_config' }).select('+geminiApiKey').lean();
    const apiKey = (sys && sys.geminiApiKey && sys.geminiApiKey.trim()) ? sys.geminiApiKey.trim() : process.env.GEMINI_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
        return {
          query: queryName,
          matchedName: parsed.matchedName || queryName.trim().toUpperCase(),
          scientificName: parsed.scientificName || '',
          botanicalName: parsed.scientificName || '',
          partUsed: parsed.partUsed || '',
          pharmacopoeialStandard: parsed.pharmacopoeialStandard || 'API',
          category: parsed.category || 'Herb',
          synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : []
        };
      }
    }
  } catch (err) {
    console.error('Herb Resolution AI Lookup Error:', err.message);
  }

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

/**
 * Helper to query GBIF (Global Biodiversity Information Facility) Open Public REST API
 */
function lookupGbifTaxonomy(queryTerm) {
  return new Promise((resolve) => {
    const https = require('https');
    const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(queryTerm)}`;

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
