const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');
const pharmacopoeiaRoutes = require('../routes/manufacturing/pharmacopoeia');

let mongoServer;
let app;

describe('Ayurvedic Pharmacopoeia Monograph Suite & API Endpoints', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use('/api/pharmacopoeia', pharmacopoeiaRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await PharmacopoeiaEntry.deleteMany({});
  });

  it('GET /api/pharmacopoeia auto-seeds dataset and lists monographs', async () => {
    const res = await request(app).get('/api/pharmacopoeia');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(20);

    const ashwa = res.body.find(item => item.ayurvedicName === 'ASHWAGANDHA');
    expect(ashwa).toBeDefined();
    expect(ashwa.botanicalName).toContain('Withania somnifera');
    expect(ashwa.pharmacopoeialStandard).toBe('API');
  });

  it('GET /api/pharmacopoeia/search allows query by herb name or synonym', async () => {
    // Seed first
    await request(app).get('/api/pharmacopoeia');

    const res = await request(app).get('/api/pharmacopoeia/search?q=Asgandh');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].ayurvedicName).toBe('ASHWAGANDHA');
  });

  it('supports Rasa/Mineral and Animal origin monographs (Shilajit, Gold, Conch Shell, Honey)', async () => {
    await request(app).get('/api/pharmacopoeia');

    const shilajit = await request(app).get('/api/pharmacopoeia/search?q=Shilajit');
    expect(shilajit.status).toBe(200);
    expect(shilajit.body[0].ayurvedicName).toBe('SHILAJIT');

    const swarna = await request(app).get('/api/pharmacopoeia/search?q=Gold');
    expect(swarna.status).toBe(200);
    expect(swarna.body[0].ayurvedicName).toBe('SWARNA (GOLD)');

    const shankha = await request(app).get('/api/pharmacopoeia/search?q=Conch');
    expect(shankha.status).toBe(200);
    expect(shankha.body[0].ayurvedicName).toBe('SHANKHA (CONCH SHELL)');
  });

  it('supports Schedule E1 Shodhana monographs (Vatsanabha, Bhallataka)', async () => {
    await request(app).get('/api/pharmacopoeia');

    const vatsanabha = await request(app).get('/api/pharmacopoeia/search?q=Vatsanabha');
    expect(vatsanabha.status).toBe(200);
    expect(vatsanabha.body[0].ayurvedicName).toBe('VATSANABHA');
    expect(vatsanabha.body[0].description).toContain('Schedule E1');
  });

  it('POST /api/pharmacopoeia allows adding custom monograph entries', async () => {
    const newMonograph = {
      ayurvedicName: 'KUTAJ',
      botanicalName: 'Holarrhena antidysenterica Wall.',
      family: 'Apocynaceae',
      partUsed: 'Stem Bark',
      pharmacopoeialStandard: 'API',
      synonyms: ['Holarrhena', 'Kurchi', 'Indrajav'],
      rasa: ['Tikta', 'Kashaya'],
      virya: 'Sheeta'
    };

    const res = await request(app).post('/api/pharmacopoeia').send(newMonograph);
    expect(res.status).toBe(201);
    expect(res.body.ayurvedicName).toBe('KUTAJ');
    expect(res.body._id).toBeDefined();
  });
});
