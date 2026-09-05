const mongoose = require('mongoose');

const pharmacopoeiaEntrySchema = new mongoose.Schema({
  ayurvedicName: { type: String, required: true, trim: true, index: true },
  botanicalName: { type: String, required: true, trim: true, index: true },
  family: { type: String, default: '', trim: true },
  partUsed: { type: String, default: '', trim: true },
  pharmacopoeialStandard: {
    type: String,
    enum: ['API', 'AFI', 'IP', 'BP', 'USP', 'House Standard'],
    default: 'API'
  },
  monographRef: { type: String, default: '', trim: true },
  synonyms: [{ type: String, trim: true }],
  therapeuticUses: [{ type: String, trim: true }],
  rasa: [{ type: String, trim: true }],           // Taste (e.g. Tikta, Katu, Kashaya)
  virya: { type: String, default: '', trim: true }, // Potency (e.g. Ushna, Sheeta)
  vipaka: { type: String, default: '', trim: true },// Post-digestive effect (e.g. Madhura, Katu)
  guna: [{ type: String, trim: true }],           // Qualities (e.g. Laghu, Ruksha)
  dosage: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true }
}, { timestamps: true });

pharmacopoeiaEntrySchema.index({
  ayurvedicName: 'text',
  botanicalName: 'text',
  synonyms: 'text'
});

module.exports = mongoose.model('PharmacopoeiaEntry', pharmacopoeiaEntrySchema);
