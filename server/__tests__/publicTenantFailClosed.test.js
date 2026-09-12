const Firm = require('../models/Firm');
const { publicTenant } = require('../middleware/publicTenant');

function mockResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('publicTenant production isolation', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPublicFirmId = process.env.PUBLIC_FIRM_ID;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalPublicFirmId === undefined) delete process.env.PUBLIC_FIRM_ID;
    else process.env.PUBLIC_FIRM_ID = originalPublicFirmId;
    jest.restoreAllMocks();
  });

  it('fails closed when no active firm is found', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_FIRM_ID;
    jest.spyOn(Firm, 'findOne').mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    const res = mockResponse();

    await publicTenant({}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Public storefront is not configured' });
  });
});
