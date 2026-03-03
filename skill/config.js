export const DEFAULT_CONFIG = {
  network: 'devnet',
  rpcUrl: null,
  wallet: null,
  limits: {
    perTransaction: 0.1,
    daily: 1.0,
  },
  riskThreshold: 0.5,
  allowlist: [],
  blocklist: [],
  validator: {
    simulate: true,
    checkContract: true,
    evaluateNecessity: true,
    customStages: [],
  },
  logging: {
    level: 'info',
    auditFile: null,
  },
};

const NETWORK_URLS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
};

export function resolveConfig(userConfig) {
  const config = deepMerge(DEFAULT_CONFIG, userConfig);

  if (!config.rpcUrl) {
    config.rpcUrl = NETWORK_URLS[config.network];
  }
  if (!config.rpcUrl) {
    throw new Error(`Unknown network: ${config.network}`);
  }
  if (!config.wallet) {
    throw new Error('Wallet path is required');
  }
  if (config.riskThreshold < 0 || config.riskThreshold > 1) {
    throw new Error('riskThreshold must be between 0 and 1');
  }

  return Object.freeze(config);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
