const path = require('path');

function getRenamedFilename(originalName, type, referenceNo) {
  const ext = path.extname(originalName) || '.jpg';
  const cleanRef = referenceNo ? referenceNo.replace(/[^a-zA-Z0-9-_]/g, '_') : 'DOC';
  const rand = Math.floor(1000 + Math.random() * 9000);
  
  switch (type) {
    case 'batch':
      return `BMR_Doc_${cleanRef}_${rand}${ext}`;
    case 'invoice':
      return `Invoice_RecCopy_${cleanRef}_${rand}${ext}`;
    case 'challan':
      return `Challan_POD_${cleanRef}_${rand}${ext}`;
    default:
      return `Attachment_${cleanRef}_${rand}${ext}`;
  }
}

async function appendDocument(Model, id, docName, docUrl) {
  const doc = await Model.findById(id);
  if (!doc) {
    throw new Error('Document not found');
  }
  
  if (!doc.supportingDocuments) {
    doc.supportingDocuments = [];
  }
  
  doc.supportingDocuments.push({
    name: docName,
    url: docUrl,
    uploadedAt: new Date()
  });
  
  await doc.save();
  return doc;
}

async function removeDocument(Model, id, docUrl) {
  const doc = await Model.findById(id);
  if (!doc) {
    throw new Error('Document not found');
  }
  
  if (doc.supportingDocuments) {
    doc.supportingDocuments = doc.supportingDocuments.filter(d => d.url !== docUrl);
    await doc.save();
  }
  return doc;
}

module.exports = {
  getRenamedFilename,
  appendDocument,
  removeDocument
};
