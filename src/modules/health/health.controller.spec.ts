import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns ok status for health', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('returns ready status for readiness', () => {
    expect(controller.ready()).toEqual({ status: 'ready' });
  });
});
