import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CLPay } from './skill/clpay.js';
import { existsSync } from 'fs';

const WALLET_PATH = process.env.CLPAY_WALLET || './keys/dev-wallet.json';
const NETWORK = process.env.CLPAY_NETWORK || 'devnet';
const RISK_THRESHOLD = parseFloat(process.env.CLPAY_RISK_THRESHOLD || '0.5');
const PER_TX_LIMIT = parseFloat(process.env.CLPAY_PER_TX_LIMIT || '0.1');
const DAILY_LIMIT = parseFloat(process.env.CLPAY_DAILY_LIMIT || '1.0');
const ALLOWLIST = (process.env.CLPAY_ALLOWLIST || '').split(',').filter(Boolean);

let clpay = null;

function ensureInit() {
  if (clpay) return;
  if (!existsSync(WALLET_PATH)) {
    throw new Error(`Wallet not found at ${WALLET_PATH}. Set CLPAY_WALLET env or run: node generate-wallet.js`);
  }
  clpay = new CLPay({
    network: NETWORK,
    wallet: WALLET_PATH,
    limits: { perTransaction: PER_TX_LIMIT, daily: DAILY_LIMIT },
    riskThreshold: RISK_THRESHOLD,
    allowlist: ALLOWLIST,
  });
}

const server = new McpServer({
  name: 'clpay',
  version: '1.0.0',
});

server.tool(
  'clpay_pay',
  'Make a payment through the CLPAY validation pipeline. Simulates the transaction, checks security and risk, evaluates necessity, enforces limits, then executes or rejects.',
  {
    to: z.string().describe('Recipient Solana address or .sol domain'),
    amount: z.number().positive().describe('Amount in SOL'),
    reason: z.string().describe('Why this payment is needed (used for necessity evaluation)'),
    taskContext: z.string().describe('Description of the current task (used for necessity evaluation)'),
  },
  async ({ to, amount, reason, taskContext }) => {
    ensureInit();
    const result = await clpay.pay({ to, amount, reason, taskContext });

    const lines = [`Status: ${result.status}`];
    if (result.txHash) lines.push(`Transaction: ${result.txHash}`);
    if (result.riskScore !== undefined) lines.push(`Risk score: ${result.riskScore}`);
    if (result.necessity) lines.push(`Necessity: ${result.necessity}`);
    if (result.rejection) {
      lines.push(`Rejection reason: ${result.rejection.reason}`);
      lines.push(`Rejection code: ${result.rejection.code}`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      isError: result.status === 'rejected',
    };
  }
);

server.tool(
  'clpay_simulate',
  'Simulate a payment without executing it. Shows what would happen on-chain.',
  {
    to: z.string().describe('Recipient Solana address'),
    amount: z.number().positive().describe('Amount in SOL'),
    reason: z.string().describe('Payment reason'),
  },
  async ({ to, amount, reason }) => {
    ensureInit();
    const sim = await clpay.simulate({ to, amount, reason });

    const lines = [
      `Simulation: ${sim.success ? 'WOULD SUCCEED' : 'WOULD FAIL'}`,
      `Balance change: ${sim.balanceChange} SOL`,
      `Compute units: ${sim.unitsConsumed}`,
    ];
    if (sim.error) lines.push(`Error: ${JSON.stringify(sim.error)}`);

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      isError: !sim.success,
    };
  }
);

server.tool(
  'clpay_balance',
  'Check the current CLPAY wallet balance and daily spending status.',
  {},
  async () => {
    ensureInit();
    const balance = await clpay.getBalance();
    const usage = clpay.getHistory();
    const todayApproved = usage.filter(
      e => e.result.status === 'approved' && Date.now() - e.timestamp < 86400000
    );
    const todaySpent = todayApproved.reduce((sum, e) => sum + e.tx.amount, 0);

    return {
      content: [{
        type: 'text',
        text: [
          `Balance: ${balance.sol} SOL`,
          `Daily spent: ${todaySpent.toFixed(4)} / ${DAILY_LIMIT} SOL`,
          `Daily remaining: ${(DAILY_LIMIT - todaySpent).toFixed(4)} SOL`,
          `Per-tx limit: ${PER_TX_LIMIT} SOL`,
          `Network: ${NETWORK}`,
        ].join('\n'),
      }],
    };
  }
);

server.tool(
  'clpay_history',
  'View recent payment history with status, amounts, and reasoning.',
  {
    limit: z.number().optional().default(10).describe('Number of recent transactions to show'),
    status: z.enum(['all', 'approved', 'rejected']).optional().default('all').describe('Filter by status'),
  },
  async ({ limit, status }) => {
    ensureInit();
    const history = clpay.getHistory({ limit, status: status === 'all' ? undefined : status });

    if (history.length === 0) {
      return { content: [{ type: 'text', text: 'No transactions yet.' }] };
    }

    const lines = history.map((entry, i) => {
      const s = entry.result.status === 'approved' ? '✓' : '✗';
      const hash = entry.result.txHash ? ` | tx: ${entry.result.txHash.slice(0, 12)}...` : '';
      return `${i + 1}. ${s} ${entry.result.status} | ${entry.tx.amount} SOL → ${entry.tx.to.slice(0, 16)}...${hash}\n   Reason: ${entry.tx.reason}`;
    });

    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
