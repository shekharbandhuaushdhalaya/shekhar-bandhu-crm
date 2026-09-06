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
    if (pharmacopoeiaRoutes.ensureSeedSynced) {
      await pharmacopoeiaRoutes.ensureSeedSynced();
    }
  });

  it('does NOT invoke countDocuments on GET /api/pharmacopoeia or /search requests', async () => {
    const countSpy = jest.spyOn(PharmacopoeiaEntry, 'countDocuments');
    await request(app).get('/api/pharmacopoeia');
    await request(app).get('/api/pharmacopoeia/search?q=Tulsi');
    expect(countSpy).not.toHaveBeenCalled();
    countSpy.mockRestore();
  });

  it('GET /api/pharmacopoeia lists monographs from seeded database', async () => {
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

  it('handles regex special characters safely without throwing', async () => {
    await request(app).get('/api/pharmacopoeia');
    const res = await request(app).get('/api/pharmacopoeia/search?q=Ashwa(gandha+.*');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('does not trigger bulkWrite when collection is already populated', async () => {
    await request(app).get('/api/pharmacopoeia');
    const spy = jest.spyOn(PharmacopoeiaEntry, 'bulkWrite');

    await request(app).get('/api/pharmacopoeia');
    await request(app).get('/api/pharmacopoeia/search?q=Tulsi');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('GET /api/pharmacopoeia paginates to 50 by default and returns all when all=true', async () => {
    await request(app).get('/api/pharmacopoeia');

    const defaultRes = await request(app).get('/api/pharmacopoeia');
    expect(defaultRes.status).toBe(200);
    expect(defaultRes.body.length).toBeLessThanOrEqual(50);

    const allRes = await request(app).get('/api/pharmacopoeia?all=true');
    expect(allRes.status).toBe(200);
    expect(allRes.body.length).toBeGreaterThan(100);
  });

  it('POST /api/pharmacopoeia/import-to-raw-materials with importAll:true executes without throwing', async () => {
    await request(app).get('/api/pharmacopoeia');

    const res = await request(app).post('/api/pharmacopoeia/import-to-raw-materials').send({ importAll: true });
    expect(res.status).toBe(200);
    expect(res.body.importedCount).toBeDefined();
  }, 15000);
});
