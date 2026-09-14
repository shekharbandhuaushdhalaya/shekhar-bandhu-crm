const http = require('http');

function postJSON(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting API Verification tests...');
  try {
    // 1. Try to start a batch without warehouseId. Should fail with validation error.
    console.log('1. Testing validation error (missing warehouseId)...');
    const res1 = await postJSON('/api/batch-productions', {
      batchNo: 'TEST-BATCH-001',
      productId: '60c72b2f9b1d8b22a075d52b', // Mock ID
      plannedQty: 100
    });
    console.log(`Response status: ${res1.status}`);
    if (res1.status === 400) {
      console.log('✅ Correctly blocked (returned 400 Bad Request)');
    } else {
      console.error('❌ Failed: Should have returned 400.', res1);
    }
  } catch (err) {
    console.error('❌ Test failed with network error:', err.message);
  }
}

runTests();
