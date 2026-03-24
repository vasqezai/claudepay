import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { mkdirSync, writeFileSync } from 'fs';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

async function main() {
  console.log();
  console.log(`${COLORS.bold}${COLORS.red}  ◈ CLPAY — Wallet Generator${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${'─'.repeat(40)}${COLORS.reset}`);

  mkdirSync('keys', { recursive: true });

  const keypair = Keypair.generate();
  const pubkey = keypair.publicKey.toBase58();
  const secretArray = Array.from(keypair.secretKey);

  writeFileSync('keys/dev-wallet.json', JSON.stringify(secretArray));

  console.log(`  ${COLORS.green}✓${COLORS.reset} Wallet created`);
  console.log(`  ${COLORS.cyan}⟡${COLORS.reset} Public key: ${COLORS.bold}${pubkey}${COLORS.reset}`);
  console.log(`  ${COLORS.cyan}⟡${COLORS.reset} Saved to: keys/dev-wallet.json`);
  console.log();

  console.log(`${COLORS.bold}${COLORS.red}  ◈ Requesting devnet airdrop...${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${'─'.repeat(40)}${COLORS.reset}`);

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  try {
    const sig = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    console.log(`  ${COLORS.green}✓${COLORS.reset} Airdrop requested: 2 SOL`);
    console.log(`  ${COLORS.dim}  tx: ${sig}${COLORS.reset}`);

    console.log(`  ${COLORS.yellow}⟡${COLORS.reset} Waiting for confirmation...`);
    await connection.confirmTransaction(sig, 'confirmed');

    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`  ${COLORS.green}✓${COLORS.reset} Confirmed! Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (err) {
    console.log(`  ${COLORS.red}✗${COLORS.reset} Airdrop failed: ${err.message}`);
    console.log(`  ${COLORS.yellow}⟡${COLORS.reset} Devnet faucet might be rate-limited. Try again in a minute.`);
    console.log(`  ${COLORS.yellow}⟡${COLORS.reset} Or use: https://faucet.solana.com (paste your pubkey)`);
  }

  console.log();
  console.log(`  ${COLORS.bold}Now run:${COLORS.reset} node demo.js`);
  console.log();
}

main().catch(console.error);
