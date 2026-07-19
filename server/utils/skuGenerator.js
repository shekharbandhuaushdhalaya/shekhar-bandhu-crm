const TYPE_ABBR_MAP = {
  'asava': 'ASV',
  'arishta': 'ARI',
  'asava & arishta': 'ASV',
  'vati': 'VAT',
  'guggulu': 'GUG',
  'vati & guggulu': 'VAT',
  'medicated oils': 'OIL',
  'medicated oil': 'OIL',
  'syrups': 'SYR',
  'syrup': 'SYR',
  'churna': 'CHU',
  'avaleha': 'AVA',
  'tablets': 'TAB',
  'tablet': 'TAB',
  'capsules': 'CAP',
  'capsule': 'CAP',
  'ointment': 'OIN',
  'drops': 'DROP',
  'eye drops': 'EDR',
  'oil': 'OIL',
};

const SHAPE_ABBR = {
  'round': 'ROU',
  'flat': 'FLA',
  'jar': 'JAR',
  'oval': 'OVA',
  'square': 'SQU',
  'rectangular': 'REC',
  'capsule': 'CAP',
  'drop': 'DROP',
};

function abbreviateType(productType) {
  if (!productType) return 'GEN';
  const key = productType.trim().toLowerCase();
  return TYPE_ABBR_MAP[key] || key.slice(0, 3).toUpperCase();
}

function abbreviateName(name) {
  if (!name || !name.trim()) return 'PROD';
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 ]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }

  let abbr = '';
  // For multi-word names, take first letter of each word (up to 4 chars)
  for (const w of words) {
    const first = w[0].toUpperCase();
    if (!abbr.includes(first)) abbr += first;
    if (abbr.length >= 4) break;
  }
  if (abbr.length < 2) {
    abbr = words[0].slice(0, 3).toUpperCase();
  }
  return abbr;
}

function abbreviateSize(size) {
  if (!size) return '000';
  const numeric = size.replace(/[^0-9]/g, '');
  return numeric.slice(0, 3) || '000';
}

function abbreviateShape(shape) {
  if (!shape) return 'STD';
  const key = shape.trim().toLowerCase();
  return SHAPE_ABBR[key] || key.slice(0, 3).toUpperCase();
}

function generateSku(product) {
  const type = abbreviateType(product.productType);
  const name = abbreviateName(product.name);
  const size = abbreviateSize(product.size);
  const shape = abbreviateShape(product.shape);
  return `${type}-${name}-${size}-${shape}`;
}

module.exports = { generateSku, abbreviateType, abbreviateName, abbreviateSize, abbreviateShape };