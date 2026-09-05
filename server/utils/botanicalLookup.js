const { GoogleGenerativeAI } = require('@google/generative-ai');
const SystemSettings = require('../models/SystemSettings');

// Curated Ayurvedic & Botanical Pharmacopoeia Dictionary (API / AFI Standard)
const BOTANICAL_DICTIONARY = {
  ashwagandha: { botanicalName: 'Withania somnifera', partUsed: 'Root', pharmacopoeialStandard: 'API' },
  tulsi: { botanicalName: 'Ocimum sanctum', partUsed: 'Leaf', pharmacopoeialStandard: 'API' },
  shatavari: { botanicalName: 'Asparagus racemosus', partUsed: 'Tuberous Root', pharmacopoeialStandard: 'API' },
  neem: { botanicalName: 'Azadirachta indica', partUsed: 'Leaf/Bark', pharmacopoeialStandard: 'API' },
  guduchi: { botanicalName: 'Tinospora cordifolia', partUsed: 'Stem', pharmacopoeialStandard: 'API' },
  giloy: { botanicalName: 'Tinospora cordifolia', partUsed: 'Stem', pharmacopoeialStandard: 'API' },
  amla: { botanicalName: 'Phyllanthus emblica', partUsed: 'Fresh/Dry Fruit', pharmacopoeialStandard: 'API' },
  haritaki: { botanicalName: 'Terminalia chebula', partUsed: 'Fruit Pericarp', pharmacopoeialStandard: 'API' },
  bibhitaki: { botanicalName: 'Terminalia bellirica', partUsed: 'Fruit Pericarp', pharmacopoeialStandard: 'API' },
  brahmi: { botanicalName: 'Bacopa monnieri', partUsed: 'Whole Plant', pharmacopoeialStandard: 'API' },
  mulethi: { botanicalName: 'Glycyrrhiza glabra', partUsed: 'Root/Rhizome', pharmacopoeialStandard: 'API' },
  yashtimadhu: { botanicalName: 'Glycyrrhiza glabra', partUsed: 'Root/Rhizome', pharmacopoeialStandard: 'API' },
  pippali: { botanicalName: 'Piper longum', partUsed: 'Fruit', pharmacopoeialStandard: 'API' },
  maricha: { botanicalName: 'Piper nigrum', partUsed: 'Fruit', pharmacopoeialStandard: 'API' },
  blackpepper: { botanicalName: 'Piper nigrum', partUsed: 'Fruit', pharmacopoeialStandard: 'API' },
  shunthi: { botanicalName: 'Zingiber officinale', partUsed: 'Dry Rhizome', pharmacopoeialStandard: 'API' },
  ginger: { botanicalName: 'Zingiber officinale', partUsed: 'Rhizome', pharmacopoeialStandard: 'API' },
  guggulu: { botanicalName: 'Commiphora wightii', partUsed: 'Exudate/Resin', pharmacopoeialStandard: 'API' },
  guggul: { botanicalName: 'Commiphora wightii', partUsed: 'Exudate/Resin', pharmacopoeialStandard: 'API' },
  manjistha: { botanicalName: 'Rubia cordifolia', partUsed: 'Stem/Root', pharmacopoeialStandard: 'API' },
  shankhpushpi: { botanicalName: 'Convolvulus pluricaulis', partUsed: 'Whole Plant', pharmacopoeialStandard: 'API' },
  bhringraj: { botanicalName: 'Eclipta alba', partUsed: 'Whole Plant', pharmacopoeialStandard: 'API' },
  arjuna: { botanicalName: 'Terminalia arjuna', partUsed: 'Stem Bark', pharmacopoeialStandard: 'API' },
  punarnava: { botanicalName: 'Boerhavia diffusa', partUsed: 'Root/Whole Plant', pharmacopoeialStandard: 'API' },
  gokshura: { botanicalName: 'Tribulus terrestris', partUsed: 'Fruit/Root', pharmacopoeialStandard: 'API' },
  kutki: { botanicalName: 'Picrorhiza kurroa', partUsed: 'Rhizome/Root', pharmacopoeialStandard: 'API' },
  vidanga: { botanicalName: 'Embelia ribes', partUsed: 'Fruit', pharmacopoeialStandard: 'API' },
  musta: { botanicalName: 'Cyperus rotundus', partUsed: 'Tuberous Root', pharmacopoeialStandard: 'API' },
  nagarmotha: { botanicalName: 'Cyperus rotundus', partUsed: 'Tuberous Root', pharmacopoeialStandard: 'API' },
  bala: { botanicalName: 'Sida cordifolia', partUsed: 'Root', pharmacopoeialStandard: 'API' },
  vacha: { botanicalName: 'Acorus calamus', partUsed: 'Rhizome', pharmacopoeialStandard: 'API' },
  twak: { botanicalName: 'Cinnamomum verum', partUsed: 'Bark', pharmacopoeialStandard: 'API' },
  cinnamon: { botanicalName: 'Cinnamomum verum', partUsed: 'Bark', pharmacopoeialStandard: 'API' },
  ela: { botanicalName: 'Elettaria cardamomum', partUsed: 'Fruit/Seed', pharmacopoeialStandard: 'API' },
  cardamom: { botanicalName: 'Elettaria cardamomum', partUsed: 'Fruit/Seed', pharmacopoeialStandard: 'API' },
  lavanga: { botanicalName: 'Syzygium aromaticum', partUsed: 'Flower Bud', pharmacopoeialStandard: 'API' },
  clove: { botanicalName: 'Syzygium aromaticum', partUsed: 'Flower Bud', pharmacopoeialStandard: 'API' },
  haridra: { botanicalName: 'Curcuma longa', partUsed: 'Rhizome', pharmacopoeialStandard: 'API' },
  turmeric: { botanicalName: 'Curcuma longa', partUsed: 'Rhizome', pharmacopoeialStandard: 'API' },
  kumkuma: { botanicalName: 'Crocus sativus', partUsed: 'Stigma', pharmacopoeialStandard: 'API' },
  saffron: { botanicalName: 'Crocus sativus', partUsed: 'Stigma', pharmacopoeialStandard: 'API' },
  chandan: { botanicalName: 'Santalum album', partUsed: 'Heartwood', pharmacopoeialStandard: 'API' },
  sandalwood: { botanicalName: 'Santalum album', partUsed: 'Heartwood', pharmacopoeialStandard: 'API' },
  vasaka: { botanicalName: 'Adhatoda vasica', partUsed: 'Leaf', pharmacopoeialStandard: 'API' },
  adulsa: { botanicalName: 'Adhatoda vasica', partUsed: 'Leaf', pharmacopoeialStandard: 'API' },
  kanchanar: { botanicalName: 'Bauhinia variegata', partUsed: 'Stem Bark', pharmacopoeialStandard: 'API' },
  bhallataka: { botanicalName: 'Semecarpus anacardium', partUsed: 'Fruit', pharmacopoeialStandard: 'API' },
  vatsanabha: { botanicalName: 'Aconitum ferox', partUsed: 'Purified Root', pharmacopoeialStandard: 'API' },
  triphala: { botanicalName: 'Emblica, Chebula & Bellirica Mix', partUsed: 'Fruits', pharmacopoeialStandard: 'API' },
  trikatu: { botanicalName: 'Sunthi, Maricha & Pippali Mix', partUsed: 'Rhizome/Fruits', pharmacopoeialStandard: 'API' },
  dashamula: { botanicalName: 'Ten Roots Formulation', partUsed: 'Roots', pharmacopoeialStandard: 'AFI' }
};

/**
 * Look up scientific/botanical name, part used, and standard for a raw material.
 * Checks dictionary first, then falls back to Gemini AI if available.
 */
async function getBotanicalInfo(rawMaterialName) {
  if (!rawMaterialName || !rawMaterialName.trim()) {
    return { botanicalName: '', partUsed: '', pharmacopoeialStandard: 'API' };
  }

  const cleanName = rawMaterialName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Check local pharmacopoeial dictionary
  for (const [key, info] of Object.entries(BOTANICAL_DICTIONARY)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return { ...info };
    }
  }

  // 2. AI Fallback (Gemini) if API key exists
  try {
    const sys = await SystemSettings.findOne({ key: 'company_config' }).lean();
    const apiKey = (sys && sys.geminiApiKey && sys.geminiApiKey.trim()) ? sys.geminiApiKey.trim() : process.env.GEMINI_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `You are a pharmacognosy expert for Ayurvedic and herbal raw materials.
Given raw material name: "${rawMaterialName}"
Provide a JSON object containing:
- "botanicalName": Latin binomial scientific name (e.g., "Withania somnifera")
- "partUsed": Plant part used in medicine (e.g., "Root", "Leaf", "Bark", "Fruit", "Rhizome")
- "pharmacopoeialStandard": "API", "AFI", "IP", "BP", or "USP"

Return ONLY valid JSON with no extra commentary or markdown syntax.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(text);
      if (parsed && parsed.botanicalName) {
        return {
          botanicalName: parsed.botanicalName || '',
          partUsed: parsed.partUsed || '',
          pharmacopoeialStandard: parsed.pharmacopoeialStandard || 'API'
        };
      }
    }
  } catch (err) {
    console.error('Botanical AI lookup error:', err.message);
  }

  return { botanicalName: '', partUsed: '', pharmacopoeialStandard: 'API' };
}

module.exports = {
  getBotanicalInfo,
  BOTANICAL_DICTIONARY
};
