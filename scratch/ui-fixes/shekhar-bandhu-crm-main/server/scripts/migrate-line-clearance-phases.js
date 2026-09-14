const mongoose = require('mongoose');
require('dotenv').config();
const LineClearance = require('../models/LineClearance');
(async()=>{ try { await mongoose.connect(process.env.MONGO_URI); const col=LineClearance.collection; const indexes=await col.indexes(); const old=indexes.find(i=>i.name && i.name.startsWith('batchId_1') && !i.name.includes('phase')); if(old) { await col.dropIndex(old.name); console.log('Dropped legacy unique line-clearance index:',old.name); } await col.createIndex({batchId:1,phase:1},{unique:true,name:'batchId_1_phase_1'}); console.log('Created phase-aware line-clearance index'); } catch(e){ console.error(e); process.exitCode=1; } finally { await mongoose.disconnect(); }})();
