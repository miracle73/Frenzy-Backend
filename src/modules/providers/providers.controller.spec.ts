import { ProvidersController } from './providers.controller';

describe('ProvidersController', () => {
  let controller: ProvidersController;
  let service: {
    updateSalonDetails: jest.Mock;
    getSalonDetails: jest.Mock;
    getSalonList: jest.Mock;
    getStylistList: jest.Mock;
    getStylistProfile: jest.Mock;
    createStylistProfile: jest.Mock;
    updateStylistProfile: jest.Mock;
    updateStylistBasics: jest.Mock;
    addStylistPortfolioItem: jest.Mock;
    updateStylistAvailability: jest.Mock;
    updateStylistPricing: jest.Mock;
    getStylistAnalytics: jest.Mock;
    getStylistPaymentRecords: jest.Mock;
    getStylistAllTransactions: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    email: 'user@example.com',
    accountType: 'stylist',
  };
  const req = { user } as any;

  beforeEach(() => {
    service = {
      updateSalonDetails: jest.fn(),
      getSalonDetails: jest.fn(),
      getSalonList: jest.fn(),
      getStylistList: jest.fn(),
      getStylistProfile: jest.fn(),
      createStylistProfile: jest.fn(),
      updateStylistProfile: jest.fn(),
      updateStylistBasics: jest.fn(),
      addStylistPortfolioItem: jest.fn(),
      updateStylistAvailability: jest.fn(),
      updateStylistPricing: jest.fn(),
      getStylistAnalytics: jest.fn(),
      getStylistPaymentRecords: jest.fn(),
      getStylistAllTransactions: jest.fn(),
    };
    controller = new ProvidersController(service as any);
  });

  it('updateSalonDetails forwards user and dto', async () => {
    const dto = { business_name: 'Salon' } as any;

    await controller.updateSalonDetails(req, dto);

    expect(service.updateSalonDetails).toHaveBeenCalledWith(user, dto);
  });

  it('getSalonDetails forwards user and optional id', async () => {
    await controller.getSalonDetails(req, 'user-2');

    expect(service.getSalonDetails).toHaveBeenCalledWith(user, 'user-2');
  });

  it('getSalonList delegates to service', async () => {
    await controller.getSalonList();

    expect(service.getSalonList).toHaveBeenCalled();
  });

  it('getStylistList delegates to service', async () => {
    await controller.getStylistList();

    expect(service.getStylistList).toHaveBeenCalled();
  });

  it('getStylistProfile forwards user', async () => {
    await controller.getStylistProfile(req);

    expect(service.getStylistProfile).toHaveBeenCalledWith(user);
  });

  it('createStylistProfile forwards user and dto', async () => {
    const dto = { business_name: 'Stylist' } as any;

    await controller.createStylistProfile(req, dto);

    expect(service.createStylistProfile).toHaveBeenCalledWith(user, dto);
  });

  it('updateStylistProfile forwards user and dto', async () => {
    const dto = { bio: 'New bio' } as any;

    await controller.updateStylistProfile(req, dto);

    expect(service.updateStylistProfile).toHaveBeenCalledWith(user, dto);
  });

  it('updateStylistProfileBasics forwards user and dto', async () => {
    const dto = { bio: 'Basics' } as any;

    await controller.updateStylistProfileBasics(req, dto);

    expect(service.updateStylistBasics).toHaveBeenCalledWith(user, dto);
  });

  it('addStylistPortfolio forwards user and dto', async () => {
    const dto = { imageUrl: 'img.png' } as any;

    await controller.addStylistPortfolio(req, dto);

    expect(service.addStylistPortfolioItem).toHaveBeenCalledWith(user, dto);
  });

  it('updateStylistAvailability forwards user and dto', async () => {
    const dto = { schedule: [] } as any;

    await controller.updateStylistAvailability(req, dto);

    expect(service.updateStylistAvailability).toHaveBeenCalledWith(user, dto);
  });

  it('updateStylistPricing forwards user and dto', async () => {
    const dto = { pricing: [] } as any;

    await controller.updateStylistPricing(req, dto);

    expect(service.updateStylistPricing).toHaveBeenCalledWith(user, dto);
  });

  it('getStylistAnalytics forwards user', async () => {
    await controller.getStylistAnalytics(req);

    expect(service.getStylistAnalytics).toHaveBeenCalledWith(user);
  });

  it('getStylistPaymentRecords forwards user', async () => {
    await controller.getStylistPaymentRecords(req);

    expect(service.getStylistPaymentRecords).toHaveBeenCalledWith(user);
  });

  it('getStylistAllTransactions forwards user', async () => {
    await controller.getStylistAllTransactions(req);

    expect(service.getStylistAllTransactions).toHaveBeenCalledWith(user);
  });
});
