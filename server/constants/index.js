const MANUFACTURING_STAGES = [
  'Raw Material Verification & Weighing',
  'Primary Processing (Swasan/Mardan)',
  'Mixing & Blending',
  'Forming (Vati/Gutika)',
  'Drying',
  'QC Testing',
  'Packaging & Labeling'
];

const FORMULATION_BASIS = 100;

const OVERHEAD_DAYS = 1;

const DEFAULT_EXPIRY_YEARS = 3;

const VARIANCE_NEGATIVE_THRESHOLD = -10;
const VARIANCE_POSITIVE_THRESHOLD = 10;

module.exports = {
  MANUFACTURING_STAGES,
  FORMULATION_BASIS,
  OVERHEAD_DAYS,
  DEFAULT_EXPIRY_YEARS,
  VARIANCE_NEGATIVE_THRESHOLD,
  VARIANCE_POSITIVE_THRESHOLD
};
