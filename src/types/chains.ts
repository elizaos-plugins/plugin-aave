import { BigNumber } from 'bignumber.js';

/**
 * Supported Aave V3 chains with their configurations
 */
export interface ChainConfig {
  /** Chain name */
  name: string;
  /** Chain ID for network identification */
  chainId: number;
  /** Native currency symbol */
  nativeCurrency: string;
  /** Wrapped native token symbol */
  wrappedNative: string;
  /** Default RPC URL (can be overridden by user) */
  defaultRpcUrl: string;
  /** Whether this chain is a testnet */
  isTestnet: boolean;
  /** Popular assets on this chain */
  popularAssets: string[];
}

/**
 * Supported Aave V3 chains
 */
export enum SupportedChain {
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  AVALANCHE = 'avalanche',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  BASE = 'base',
  BNB = 'bnb',
  GNOSIS = 'gnosis',
  METIS = 'metis',
  SCROLL = 'scroll',
  ZKSYNC = 'zksync',
  // Testnets
  SEPOLIA = 'sepolia',
  FUJI = 'fuji',
  ARBITRUM_SEPOLIA = 'arbitrum-sepolia',
  OPTIMISM_SEPOLIA = 'optimism-sepolia',
  BASE_SEPOLIA = 'base-sepolia',
}

/**
 * Chain configurations for all supported Aave V3 networks
 */
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  [SupportedChain.ETHEREUM]: {
    name: 'Ethereum',
    chainId: 1,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://eth.llamarpc.com',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC', 'LINK', 'AAVE'],
  },
  [SupportedChain.POLYGON]: {
    name: 'Polygon',
    chainId: 137,
    nativeCurrency: 'MATIC',
    wrappedNative: 'WMATIC',
    defaultRpcUrl: 'https://polygon-rpc.com',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'DAI', 'WMATIC', 'WETH', 'WBTC', 'AAVE'],
  },
  [SupportedChain.AVALANCHE]: {
    name: 'Avalanche',
    chainId: 43114,
    nativeCurrency: 'AVAX',
    wrappedNative: 'WAVAX',
    defaultRpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'DAI.e', 'WAVAX', 'WETH.e', 'WBTC.e', 'AAVE.e'],
  },
  [SupportedChain.ARBITRUM]: {
    name: 'Arbitrum One',
    chainId: 42161,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://arb1.arbitrum.io/rpc',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC', 'LINK', 'ARB'],
  },
  [SupportedChain.OPTIMISM]: {
    name: 'Optimism',
    chainId: 10,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://mainnet.optimism.io',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC', 'LINK', 'OP'],
  },
  [SupportedChain.BASE]: {
    name: 'Base',
    chainId: 8453,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://mainnet.base.org',
    isTestnet: false,
    popularAssets: ['USDC', 'DAI', 'WETH', 'cbETH', 'AERO'],
  },
  [SupportedChain.BNB]: {
    name: 'BNB Chain',
    chainId: 56,
    nativeCurrency: 'BNB',
    wrappedNative: 'WBNB',
    defaultRpcUrl: 'https://bsc-dataseed1.binance.org',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'WBNB', 'BTCB', 'ETH', 'FDUSD'],
  },
  [SupportedChain.GNOSIS]: {
    name: 'Gnosis Chain',
    chainId: 100,
    nativeCurrency: 'xDAI',
    wrappedNative: 'WXDAI',
    defaultRpcUrl: 'https://rpc.gnosischain.com',
    isTestnet: false,
    popularAssets: ['USDC', 'WXDAI', 'WETH', 'GNO'],
  },
  [SupportedChain.METIS]: {
    name: 'Metis',
    chainId: 1088,
    nativeCurrency: 'METIS',
    wrappedNative: 'WMETIS',
    defaultRpcUrl: 'https://andromeda.metis.io/?owner=1088',
    isTestnet: false,
    popularAssets: ['m.USDC', 'm.USDT', 'm.DAI', 'WMETIS', 'METIS'],
  },
  [SupportedChain.SCROLL]: {
    name: 'Scroll',
    chainId: 534352,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://rpc.scroll.io',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'WETH', 'WBTC'],
  },
  [SupportedChain.ZKSYNC]: {
    name: 'zkSync Era',
    chainId: 324,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://mainnet.era.zksync.io',
    isTestnet: false,
    popularAssets: ['USDC', 'USDT', 'WETH', 'WBTC'],
  },
  // Testnets
  [SupportedChain.SEPOLIA]: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://sepolia.infura.io/v3/demo',
    isTestnet: true,
    popularAssets: ['USDC', 'USDT', 'DAI', 'WETH', 'LINK', 'AAVE'],
  },
  [SupportedChain.FUJI]: {
    name: 'Avalanche Fuji',
    chainId: 43113,
    nativeCurrency: 'AVAX',
    wrappedNative: 'WAVAX',
    defaultRpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    isTestnet: true,
    popularAssets: ['USDC', 'WAVAX', 'WETH.e'],
  },
  [SupportedChain.ARBITRUM_SEPOLIA]: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    isTestnet: true,
    popularAssets: ['USDC', 'WETH'],
  },
  [SupportedChain.OPTIMISM_SEPOLIA]: {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://sepolia.optimism.io',
    isTestnet: true,
    popularAssets: ['USDC', 'WETH'],
  },
  [SupportedChain.BASE_SEPOLIA]: {
    name: 'Base Sepolia',
    chainId: 84532,
    nativeCurrency: 'ETH',
    wrappedNative: 'WETH',
    defaultRpcUrl: 'https://sepolia.base.org',
    isTestnet: true,
    popularAssets: ['USDC', 'WETH'],
  },
};

/**
 * Get chain configuration by name
 */
export function getChainConfig(chain: string): ChainConfig | undefined {
  return CHAIN_CONFIGS[chain as SupportedChain];
}

/**
 * Check if a chain is supported
 */
export function isSupportedChain(chain: string): chain is SupportedChain {
  return Object.values(SupportedChain).includes(chain as SupportedChain);
}

/**
 * Get all mainnet chains
 */
export function getMainnetChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter(config => !config.isTestnet);
}

/**
 * Get all testnet chains
 */
export function getTestnetChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter(config => config.isTestnet);
}