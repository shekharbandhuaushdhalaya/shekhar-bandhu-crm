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

  it('fails closed in production when PUBLIC_FIRM_ID is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_FIRM_ID;
    const findSpy = jest.spyOn(Firm, 'findOne');
    const res = mockResponse();

    await publicTenant({}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Public storefront is not configured' });
    expect(findSpy).not.toHaveBeenCalled();
  });
});
