import { RiskEngine } from './skill/risk.js';
import { ValidatorAgent, ValidationStage } from './skill/validator.js';

const C = {
  r: '\x1b[0m', red: '\x1b[31m', grn: '\x1b[32m', ylw: '\x1b[33m',
  cyn: '\x1b[36m', dim: '\x1b[2m', bld: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ${C.grn}✓${C.r} ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ${C.red}✗${C.r} ${name}`);
    console.log(`    ${C.dim}${err.message}${C.r}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ${C.grn}✓${C.r} ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ${C.red}✗${C.r} ${name}`);
    console.log(`    ${C.dim}${err.message}${C.r}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function createMockWallet(opts = {}) {
  return {
    simulateTransfer: async () => ({
      success: opts.simFail ? false : true,
      logs: [],
      unitsConsumed: 150,
      balanceChange: -0.01,
      error: opts.simFail ? { InstructionError: [0, 'Custom'] } : null,
    }),
    getDailyUsage: () => ({
      spent: opts.spent || 0,
      limit: opts.limit || 1.0,
      remaining: (opts.limit || 1.0) - (opts.spent || 0),
      resetsAt: Date.now() + 86400000,
    }),
  };
}

async function main() {
  console.log();
  console.log(`${C.bld}${C.red}  ◈ CLPAY — Test Suite${C.r}`);
  console.log(`${C.dim}  ${'─'.repeat(50)}${C.r}`);
  console.log();

  console.log(`${C.bld}  Risk Engine${C.r}`);

  const risk = new RiskEngine({ allowlist: ['trusted.sol'], blocklist: ['scam.sol'] });

  await testAsync('allowlisted recipient → score 0', async () => {
    const r = await risk.evaluate({ to: 'trusted.sol', amount: 0.01 }, { success: true });
    assertEq(r.score <= 0.15, true, `Score too high: ${r.score}`);
    assertEq(r.level, 'low');
    assertEq(r.flags.includes('BLOCKLISTED_RECIPIENT'), false);
  });

  await testAsync('blocklisted recipient → score 1.0 + flag', async () => {
    const r = await risk.evaluate({ to: 'scam.sol', amount: 0.01 }, { success: true });
    assert(r.score >= 0.25, `Score too low: ${r.score}`);
    assert(r.flags.includes('BLOCKLISTED_RECIPIENT'));
  });

  await testAsync('unknown recipient → moderate risk + flag', async () => {
    const r = await risk.evaluate({ to: 'random.sol', amount: 0.01 }, { success: true });
    assert(r.score > 0.1, `Score too low: ${r.score}`);
    assert(r.flags.includes('UNKNOWN_RECIPIENT'));
  });

  await testAsync('large amount → LARGE_AMOUNT flag', async () => {
    const r = await risk.evaluate({ to: 'trusted.sol', amount: 1.0 }, { success: true });
    assert(r.flags.includes('LARGE_AMOUNT'), 'Missing LARGE_AMOUNT flag');
  });

  await testAsync('failed simulation → high risk', async () => {
    const r = await risk.evaluate({ to: 'trusted.sol', amount: 0.01 }, { success: false });
    assert(r.score > 0.15, `Score too low for failed sim: ${r.score}`);
    assert(r.flags.includes('SIMULATION_FAILED'));
  });

  await testAsync('no simulation data → NO_SIMULATION flag', async () => {
    const r = await risk.evaluate({ to: 'trusted.sol', amount: 0.01 }, null);
    assert(r.flags.includes('NO_SIMULATION'));
  });

  await testAsync('first interaction → FIRST_INTERACTION flag', async () => {
    const r = await risk.evaluate({ to: 'new-merchant.sol', amount: 0.01 }, { success: true });
    assert(r.flags.includes('FIRST_INTERACTION'));
  });

  await testAsync('recordTransaction tracks history', async () => {
    risk.recordTransaction({ to: 'repeat.sol', amount: 0.01, status: 'approved' });
    risk.recordTransaction({ to: 'repeat.sol', amount: 0.01, status: 'approved' });
    const r = await risk.evaluate({ to: 'repeat.sol', amount: 0.01 }, { success: true });
    assertEq(r.flags.includes('FIRST_INTERACTION'), false, 'Should not be first interaction');
  });

  console.log();
  console.log(`${C.bld}  Validator Agent — Full Pipeline${C.r}`);

  await testAsync('all stages pass → approved', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.01,
      reason: 'API access required for analysis',
      taskContext: 'User needs this resource — it is essential and needed',
    });

    assertEq(result.approved, true, `Expected approved, got rejected: ${result.reason}`);
    assert(result.stages.length >= 4, `Expected 4+ stages, got ${result.stages.length}`);
  });

  await testAsync('simulation fails → rejected at simulation stage', async () => {
    const wallet = createMockWallet({ simFail: true });
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.01,
      reason: 'Test', taskContext: 'Test',
    });

    assertEq(result.approved, false);
    assertEq(result.failedStage, 'simulation');
    assertEq(result.code, 'SIMULATION_FAILED');
  });

  await testAsync('blocklisted recipient → rejected at security stage', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ blocklist: ['evil.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'evil.sol', amount: 0.01,
      reason: 'Test', taskContext: 'Test',
    });

    assertEq(result.approved, false);
    assertEq(result.failedStage, 'security');
    assertEq(result.code, 'BLOCKLISTED');
  });

  await testAsync('exceeds daily limit → rejected at limits stage', async () => {
    const wallet = createMockWallet({ spent: 0.95, limit: 1.0 });
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.1,
      reason: 'Essential resource needed',
      taskContext: 'Critical task requires this',
    });

    assertEq(result.approved, false);
    assertEq(result.failedStage, 'limits');
    assertEq(result.code, 'DAILY_LIMIT');
  });

  await testAsync('stages run in correct order', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.01,
      reason: 'Required resource', taskContext: 'Essential task',
    });

    const stageNames = result.stages.map(s => s.stage);
    assertEq(stageNames[0], 'simulation');
    assertEq(stageNames[1], 'security');
    assertEq(stageNames[2], 'necessity');
    assertEq(stageNames[3], 'limits');
  });

  await testAsync('disabled stages are skipped', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({});
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: false, checkContract: false, evaluateNecessity: false,
    });

    const result = await validator.validate({
      to: 'any.sol', amount: 0.01,
      reason: 'Test', taskContext: 'Test',
    });

    assertEq(result.approved, true);
    assertEq(result.stages.length, 1);
    assertEq(result.stages[0].stage, 'limits');
  });

  console.log();
  console.log(`${C.bld}  Custom Validation Stage${C.r}`);

  await testAsync('custom stage can reject', async () => {
    class BlockEverything extends ValidationStage {
      name = 'block-all';
      async validate() {
        return { pass: false, reason: 'Blocked by custom stage', code: 'CUSTOM_BLOCK' };
      }
    }

    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
      customStages: [new BlockEverything()],
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.01,
      reason: 'Essential', taskContext: 'Needed',
    });

    assertEq(result.approved, false);
    assertEq(result.failedStage, 'block-all');
    assertEq(result.code, 'CUSTOM_BLOCK');
  });

  await testAsync('custom stage can pass and add context', async () => {
    class AuditStage extends ValidationStage {
      name = 'audit';
      async validate() {
        return { pass: true, data: { audited: true, timestamp: Date.now() } };
      }
    }

    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['merchant.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: true, checkContract: true, evaluateNecessity: true,
      customStages: [new AuditStage()],
    });

    const result = await validator.validate({
      to: 'merchant.sol', amount: 0.01,
      reason: 'Required resource', taskContext: 'Essential task',
    });

    assertEq(result.approved, true);
    assert(result.context.audit, 'Custom stage context missing');
    assertEq(result.context.audit.audited, true);
  });

  console.log();
  console.log(`${C.bld}  Necessity Evaluation${C.r}`);

  await testAsync('high necessity keywords → passes', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['m.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: false, checkContract: false, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'm.sol', amount: 0.01,
      reason: 'This resource is essential and required',
      taskContext: 'Critical task that must be completed',
    });

    assertEq(result.approved, true);
    assertEq(result.context.necessity.level, 'high');
  });

  await testAsync('low necessity keywords → still passes (not none)', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['m.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: false, checkContract: false, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'm.sol', amount: 0.01,
      reason: 'This is optional, maybe nice to have',
      taskContext: 'Could be useful',
    });

    assertEq(result.approved, true);
    assertEq(result.context.necessity.level, 'low');
  });

  await testAsync('mixed keywords → medium necessity', async () => {
    const wallet = createMockWallet();
    const riskEng = new RiskEngine({ allowlist: ['m.sol'] });
    const validator = new ValidatorAgent(wallet, riskEng, {
      simulate: false, checkContract: false, evaluateNecessity: true,
    });

    const result = await validator.validate({
      to: 'm.sol', amount: 0.01,
      reason: 'Useful tool for the project',
      taskContext: 'Working on data analysis',
    });

    assertEq(result.approved, true);
    assertEq(result.context.necessity.level, 'medium');
  });

  console.log();
  console.log(`${C.dim}  ${'─'.repeat(50)}${C.r}`);
  const total = passed + failed;
  const color = failed === 0 ? C.grn : C.red;
  console.log(`  ${color}${C.bld}${passed}/${total} passed${C.r}${failed > 0 ? ` ${C.red}(${failed} failed)${C.r}` : ''}`);
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
