const schemas = require('../validation/schemas');

describe('Product schema', () => {
  test('accepts valid product', () => {
    const r = schemas.productSchema.safeParse({
      name: 'Test Product',
      sku: 'TEST-001',
      price: 100,
    });
    expect(r.success).toBe(true);
    expect(r.data.name).toBe('Test Product');
  });

  test('rejects missing name', () => {
    const r = schemas.productSchema.safeParse({ sku: 'TEST-001' });
    expect(r.success).toBe(false);
  });

  test('applies defaults', () => {
    const r = schemas.productSchema.safeParse({
      name: 'Test',
      sku: 'TEST-001',
    });
    expect(r.success).toBe(true);
    expect(r.data.price).toBe(0);
    expect(r.data.category).toBe('General');
  });
});

describe('Customer schema', () => {
  test('accepts valid customer', () => {
    const r = schemas.customerSchema.safeParse({ name: 'Test Customer' });
    expect(r.success).toBe(true);
  });

  test('rejects empty name', () => {
    const r = schemas.customerSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
  });

  test('accepts cash_ledger', () => {
    const r = schemas.customerSchema.safeParse({
      name: 'Cash Customer',
      recordTracking: 'cash_ledger',
    });
    expect(r.success).toBe(true);
  });

  test('rejects invalid recordTracking', () => {
    const r = schemas.customerSchema.safeParse({
      name: 'Bad',
      recordTracking: 'invalid',
    });
    expect(r.success).toBe(false);
  });
});

describe('Invoice schema', () => {
  test('accepts sale invoice', () => {
    const r = schemas.invoiceSchema.safeParse({
      type: 'sale',
      items: [],
    });
    expect(r.success).toBe(true);
  });

  test('accepts new fields (cartageAmount, QR, etc.)', () => {
    const r = schemas.invoiceSchema.safeParse({
      type: 'sale',
      cartageAmount: 50,
      subTotal: 1000,
      grandTotal: 1180,
      partyGstin: '09ABCDE1234F1Z5',
      qrCode: 'upi://pay?pa=test@upi',
    });
    expect(r.success).toBe(true);
  });
});

describe('Order schema', () => {
  test('accepts valid order', () => {
    const r = schemas.orderSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9999999999',
      shippingAddress: '123 Main St',
      items: [{ productId: '507f1f77bcf86cd799439011', name: 'Item', qty: 1, price: 100 }],
      totalAmount: 100,
    });
    expect(r.success).toBe(true);
  });

  test('rejects missing email', () => {
    const r = schemas.orderSchema.safeParse({
      name: 'John',
      phone: '9999999999',
      shippingAddress: 'addr',
      items: [{ productId: '507f1f77bcf86cd799439011', name: 'Item', qty: 1, price: 100 }],
      totalAmount: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe('StockMovement schema', () => {
  test('accepts with items', () => {
    const r = schemas.stockMovementSchema.safeParse({
      direction: 'out',
      type: 'sale',
      items: [{ productName: 'Test', qty: 10 }],
    });
    expect(r.success).toBe(true);
  });

  test('rejects empty items', () => {
    const r = schemas.stockMovementSchema.safeParse({
      direction: 'in',
      type: 'purchase',
      items: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('validate middleware rejects bad data', () => {
  test('returns 400 on invalid body', async () => {
    const { validate } = require('../middleware/validate');
    const schema = schemas.productSchema;

    const req = { body: { name: '' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Validation failed' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next on valid body', async () => {
    const { validate } = require('../middleware/validate');
    const schema = schemas.productSchema;

    const req = { body: { name: 'Test', sku: 'T-1' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.price).toBe(0); // default applied
  });
});
