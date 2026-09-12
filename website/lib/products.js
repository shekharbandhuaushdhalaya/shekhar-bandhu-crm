const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

const CATEGORY_META = {
  'asava & arishta': {
    emoji: '🍶',
    form: 'Self-Fermented Liquid',
    materials: ['Fermented Herbs', 'Gur (Jaggery)'],
    desc: 'Premium self-fermented Ayurvedic herbal liquid preparation.',
    benefits: 'Improves overall digestion, cleanses the gut, and stimulates systemic micro-circulation.',
    usage: 'Take 15-30ml with equal volume of lukewarm water twice daily after meals.'
  },
  'syrups': {
    emoji: '🧪',
    form: 'Liquid Tonic',
    materials: ['Aqueous Herbal Extracts', 'Sugar Base'],
    desc: 'Concentrated herbal liquid syrup designed for quick assimilation.',
    benefits: 'Supports specific organ functions, boosts immune pathways.',
    usage: 'Adults: 10ml twice daily; Children: 5ml twice daily.'
  },
  'medicated oils': {
    emoji: '🧴',
    form: 'Taila (Oil)',
    materials: ['Medicated Sesame Oil', 'Active Botanical Roots'],
    desc: 'Traditional medicated taila prepared using classical taila-paka processes.',
    benefits: 'Provides neuromuscular strength, relieves chronic joint pain, balances Vata dosha.',
    usage: 'Apply lukewarm oil gently on the affected area and massage in circular motions.'
  },
  'vati & guggulu': {
    emoji: '💊',
    form: 'Tablet',
    materials: ['Purified Shuddha Guggulu', 'Herbal Powders'],
    desc: 'Traditional compressed herbal pills formulated with purified therapeutic resins.',
    benefits: 'Excellent for eliminating deep tissue metabolic toxins and supporting joint mobility.',
    usage: '1-2 tablets twice daily after meals with lukewarm water.'
  },
  'avaleha': {
    emoji: '🍯',
    form: 'Herbal Jam',
    materials: ['Fresh Amla Paste', 'Honey & Ghee base'],
    desc: 'Nutritive semi-solid herbal jam packed with antioxidants.',
    benefits: 'Strong respiratory immunity booster, enhances longevity and vitality.',
    usage: 'Take 1-2 teaspoons daily on an empty stomach with warm milk/water.'
  }
};

export function mapProduct(apiProd) {
  const cat = (apiProd.category || apiProd.productType || 'General').toLowerCase();
  const sizeLabel = apiProd.size ? `${apiProd.size}` : 'Standard Pack';
  const meta = CATEGORY_META[cat] || {
    emoji: '🌿',
    form: apiProd.productType || 'Ayurvedic Medicine',
    materials: ['Organic Ayurvedic Herbs'],
    desc: `${apiProd.name} — a premium Ayurvedic formulation.`,
    benefits: 'Formulated using raw materials of the highest purity.',
    usage: 'Take as directed by an Ayurvedic health professional.'
  };

  const stock = typeof apiProd.availableQty === 'number' ? apiProd.availableQty : (typeof apiProd.inventoryQty === 'number' ? apiProd.inventoryQty : 0);

  return {
    _id: apiProd._id,
    name: apiProd.name,
    sku: apiProd.sku,
    price: apiProd.price ?? apiProd.customerPrice?.rate ?? apiProd.mrp ?? 0,
    emoji: meta.emoji,
    category: apiProd.category || 'General',
    description: apiProd.description || meta.desc,
    benefits: apiProd.benefits || meta.benefits,
    materials: meta.materials,
    usageDetails: apiProd.suggestedDosage || meta.usage,
    ingredients: apiProd.ingredients || '',
    size: sizeLabel,
    categoryForm: meta.form,
    specifications: apiProd.weight ? `Net Weight: ${apiProd.weight}.` : `Pack size: ${sizeLabel}`,
    image: apiProd.image || null,
    stockLevel: stock,
    inStock: stock > 0,
    disease: apiProd.disease || '',
    colour: apiProd.colour || '',
    productType: apiProd.productType || '',
    // Pricing & Discount promo fields (set from CRM Pricing page)
    discount: apiProd.pricingSource || apiProd.customerPrice ? 0 : (apiProd.discount ?? apiProd.discountPercent ?? 0),
    discountLabel: apiProd.discountLabel || '',
    websitePromoActive: apiProd.pricingSource || apiProd.customerPrice ? false : (apiProd.websitePromoActive ?? ((apiProd.discountPercent ?? 0) > 0)),
    pricingSource: apiProd.pricingSource || apiProd.customerPrice?.pricingSource || '',
    scheme: apiProd.scheme || null,
    mrp: apiProd.mrp ?? apiProd.price ?? 0,
    rating: apiProd.rating || 0,
    ratingCount: apiProd.ratingCount || 0,
  };
}

export async function fetchProducts() {
  const res = await fetch(`${API_BASE}/api/public/products`);
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  const data = await res.json();
  return data.map(mapProduct);
}

export { API_BASE };
