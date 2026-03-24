import { CLPay } from './skill/clpay.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(icon, msg, color = '') {
  console.log(`  ${color}${icon}${COLORS.reset} ${msg}`);
}

function header(text) {
  console.log();
  console.log(`${COLORS.bold}${COLORS.red}  ◈ ${text}${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${'─'.repeat(50)}${COLORS.reset}`);
}

async function main() {
  console.log();
  console.log(`${COLORS.bold}${COLORS.red}  ╔═══════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.red}  ║          CLPAY — Demo Runner          ║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.red}  ║   Autonomous Payments for Claude      ║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.red}  ╚═══════════════════════════════════════╝${COLORS.reset}`);

  const walletPath = process.argv[2] || './keys/dev-wallet.json';

  header('Initializing CLPAY');
  log('⟡', `Network: devnet`, COLORS.cyan);
  log('⟡', `Wallet: ${walletPath}`, COLORS.cyan);
  log('⟡', `Risk threshold: 0.5`, COLORS.cyan);
  log('⟡', `Per-tx limit: 0.1 SOL`, COLORS.cyan);
  log('⟡', `Daily limit: 1.0 SOL`, COLORS.cyan);

  let clpay;
  try {
    clpay = new CLPay({
      network: 'devnet',
      wallet: walletPath,
      limits: { perTransaction: 0.1, daily: 1.0 },
      riskThreshold: 0.5,
      allowlist: ['11111111111111111111111111111111'],
    });
  } catch (err) {
    log('✗', `Failed to initialize: ${err.message}`, COLORS.red);
    console.log();
    log('💡', `Generate a wallet first:`, COLORS.yellow);
    log('  ', `  node -e "import('@solana/web3.js').then(({Keypair})=>{const k=Keypair.generate();import('fs').then(fs=>{fs.mkdirSync('keys',{recursive:true});fs.writeFileSync('keys/dev-wallet.json',JSON.stringify(Array.from(k.secretKey)));console.log('Created:',k.publicKey.toBase58())})})"`);
    log('  ', `  solana airdrop 2 <YOUR_PUBKEY> --url devnet`);
    console.log();
    process.exit(1);
  }

  clpay.on('validation:stage', (stage, result) => {
    const icon = result.pass ? '✓' : '✗';
    const color = result.pass ? COLORS.green : COLORS.red;
    log(icon, `${stage}: ${result.pass ? 'passed' : result.reason}`, color);
  });

  clpay.on('payment:approved', () => {
    log('◈', 'APPROVED — executing on-chain...', COLORS.green);
  });

  clpay.on('payment:rejected', (_, rejection) => {
    log('◈', `REJECTED — ${rejection.reason}`, COLORS.red);
  });

  header('Checking Balance');
  try {
    const balance = await clpay.getBalance();
    log('◎', `Balance: ${balance.sol} SOL (${balance.lamports} lamports)`, COLORS.green);

    if (balance.sol < 0.01) {
      log('⚠', 'Balance too low for demo. Fund your devnet wallet:', COLORS.yellow);
      log('  ', `  solana airdrop 2 ${clpay.publicKey || 'YOUR_PUBKEY'} --url devnet`);
      clpay.destroy();
      process.exit(0);
    }
  } catch (err) {
    log('✗', `Balance check failed: ${err.message}`, COLORS.red);
    clpay.destroy();
    process.exit(1);
  }

  header('Test 1: Payment to Allowlisted Address');
  log('→', 'Sending 0.001 SOL to System Program (allowlisted)', COLORS.dim);
  const result1 = await clpay.pay({
    to: '11111111111111111111111111111111',
    amount: 0.001,
    reason: 'API access required for data analysis task',
    taskContext: 'User requested market data — this resource is essential and needed',
  });
  log('⟡', `Status: ${result1.status}`, result1.status === 'approved' ? COLORS.green : COLORS.red);
  if (result1.txHash) log('⟡', `TX: ${result1.txHash}`, COLORS.dim);
  if (result1.riskScore !== undefined) log('⟡', `Risk: ${result1.riskScore}`, COLORS.cyan);
  if (result1.necessity) log('⟡', `Necessity: ${result1.necessity}`, COLORS.cyan);

  header('Test 2: Payment to Unknown Address (Higher Risk)');
  log('→', 'Sending 0.001 SOL to random address (not allowlisted)', COLORS.dim);
  const result2 = await clpay.pay({
    to: 'BPFLoaderUpgradeab1e11111111111111111111111',
    amount: 0.001,
    reason: 'Testing unknown recipient behavior',
    taskContext: 'Automated test — resource is needed for verification',
  });
  log('⟡', `Status: ${result2.status}`, result2.status === 'approved' ? COLORS.green : COLORS.red);
  if (result2.riskScore !== undefined) log('⟡', `Risk: ${result2.riskScore}`, COLORS.cyan);
  if (result2.rejection) log('⟡', `Reason: ${result2.rejection.reason}`, COLORS.yellow);

  header('Test 3: Over-Limit Payment');
  log('→', 'Attempting 0.5 SOL (exceeds per-tx limit of 0.1)', COLORS.dim);
  const result3 = await clpay.pay({
    to: '11111111111111111111111111111111',
    amount: 0.5,
    reason: 'Large purchase test',
    taskContext: 'Testing limit enforcement',
  });
  log('⟡', `Status: ${result3.status}`, result3.status === 'approved' ? COLORS.green : COLORS.red);
  if (result3.rejection) log('⟡', `Reason: ${result3.rejection.reason}`, COLORS.yellow);

  header('Test 4: Simulation Only');
  log('→', 'Simulating 0.01 SOL transfer (no execution)', COLORS.dim);
  try {
    const sim = await clpay.simulate({
      to: '11111111111111111111111111111111',
      amount: 0.01,
      reason: 'Simulation test',
    });
    log(sim.success ? '✓' : '✗', `Simulation: ${sim.success ? 'would succeed' : 'would fail'}`, sim.success ? COLORS.green : COLORS.red);
    log('⟡', `Balance change: ${sim.balanceChange} SOL`, COLORS.dim);
    log('⟡', `Compute units: ${sim.unitsConsumed}`, COLORS.dim);
  } catch (err) {
    log('✗', `Simulation error: ${err.message}`, COLORS.red);
  }

  header('Audit Log');
  const history = clpay.getHistory();
  log('📋', `Total transactions: ${history.length}`, COLORS.cyan);
  for (const entry of history) {
    const status = entry.result.status === 'approved' ? `${COLORS.green}✓ approved` : `${COLORS.red}✗ rejected`;
    log('  ', `${status}${COLORS.reset} → ${entry.tx.to.slice(0, 12)}... | ${entry.tx.amount} SOL | ${entry.tx.reason.slice(0, 40)}`, '');
  }

  header('Daily Usage');
  const usage = clpay.getDailyUsage ? null : null;
  log('⟡', `Check complete. Cleaning up...`, COLORS.dim);

  clpay.destroy();
  console.log();
  log('✓', `Demo finished.`, COLORS.green);
  console.log();
}

main().catch((err) => {
  console.error(`${COLORS.red}Fatal: ${err.message}${COLORS.reset}`);
  process.exit(1);
});
