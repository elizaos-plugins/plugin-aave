import {
  AaveV3Ethereum,
  AaveV3Polygon,
  AaveV3Avalanche,
  AaveV3Arbitrum,
  AaveV3Optimism,
  AaveV3Base,
  AaveV3BNB,
  AaveV3Gnosis,
  AaveV3Metis,
  AaveV3Scroll,
  AaveV3ZkSync,
  AaveV3Sepolia,
  AaveV3Fuji,
  AaveV3ArbitrumSepolia,
  AaveV3OptimismSepolia,
  AaveV3BaseSepolia,
} from '@bgd-labs/aave-address-book';

import { SupportedChain, ChainConfig, CHAIN_CONFIGS } from '../types/chains.js';
import { AaveError, AaveErrorCode } from '../types/index.js';

/**
 * Aave V3 contract addresses for a specific chain
 */
export interface ChainAddresses {
  POOL: string;
  POOL_ADDRESSES_PROVIDER: string;
  AAVE_PROTOCOL_DATA_PROVIDER: string;
  UI_POOL_DATA_PROVIDER?: string;
  WETH_GATEWAY?: string;
  ACL_MANAGER?: string;
  COLLECTOR?: string;
  ORACLE?: string;
}

/**
 * Complete chain context with addresses and configuration
 */
export interface ChainContext {
  chain: SupportedChain;
  config: ChainConfig;
  addresses: ChainAddresses;
}

/**
 * Map of chain names to their official Aave V3 address configurations
 * These come directly from @bgd-labs/aave-address-book - all REAL contract addresses
 */
const CHAIN_ADDRESS_MAP: Record<SupportedChain, ChainAddresses> = {
  // Mainnets
  [SupportedChain.ETHEREUM]: {
    POOL: AaveV3Ethereum.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Ethereum.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Ethereum.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Ethereum.ACL_MANAGER,
    COLLECTOR: AaveV3Ethereum.COLLECTOR,
    ORACLE: AaveV3Ethereum.ORACLE,
  },
  [SupportedChain.POLYGON]: {
    POOL: AaveV3Polygon.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Polygon.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Polygon.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Polygon.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Polygon.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Polygon.ACL_MANAGER,
    COLLECTOR: AaveV3Polygon.COLLECTOR,
    ORACLE: AaveV3Polygon.ORACLE,
  },
  [SupportedChain.AVALANCHE]: {
    POOL: AaveV3Avalanche.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Avalanche.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Avalanche.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Avalanche.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Avalanche.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Avalanche.ACL_MANAGER,
    COLLECTOR: AaveV3Avalanche.COLLECTOR,
    ORACLE: AaveV3Avalanche.ORACLE,
  },
  [SupportedChain.ARBITRUM]: {
    POOL: AaveV3Arbitrum.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Arbitrum.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Arbitrum.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Arbitrum.ACL_MANAGER,
    COLLECTOR: AaveV3Arbitrum.COLLECTOR,
    ORACLE: AaveV3Arbitrum.ORACLE,
  },
  [SupportedChain.OPTIMISM]: {
    POOL: AaveV3Optimism.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Optimism.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Optimism.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Optimism.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Optimism.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Optimism.ACL_MANAGER,
    COLLECTOR: AaveV3Optimism.COLLECTOR,
    ORACLE: AaveV3Optimism.ORACLE,
  },
  [SupportedChain.BASE]: {
    POOL: AaveV3Base.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Base.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Base.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Base.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Base.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Base.ACL_MANAGER,
    COLLECTOR: AaveV3Base.COLLECTOR,
    ORACLE: AaveV3Base.ORACLE,
  },
  [SupportedChain.BNB]: {
    POOL: AaveV3BNB.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3BNB.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3BNB.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3BNB.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3BNB.WETH_GATEWAY,
    ACL_MANAGER: AaveV3BNB.ACL_MANAGER,
    COLLECTOR: AaveV3BNB.COLLECTOR,
    ORACLE: AaveV3BNB.ORACLE,
  },
  [SupportedChain.GNOSIS]: {
    POOL: AaveV3Gnosis.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Gnosis.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Gnosis.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Gnosis.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Gnosis.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Gnosis.ACL_MANAGER,
    COLLECTOR: AaveV3Gnosis.COLLECTOR,
    ORACLE: AaveV3Gnosis.ORACLE,
  },
  [SupportedChain.METIS]: {
    POOL: AaveV3Metis.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Metis.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Metis.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Metis.UI_POOL_DATA_PROVIDER,
    // WETH_GATEWAY: Not available on Metis
    ACL_MANAGER: AaveV3Metis.ACL_MANAGER,
    COLLECTOR: AaveV3Metis.COLLECTOR,
    ORACLE: AaveV3Metis.ORACLE,
  },
  [SupportedChain.SCROLL]: {
    POOL: AaveV3Scroll.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Scroll.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Scroll.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Scroll.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Scroll.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Scroll.ACL_MANAGER,
    COLLECTOR: AaveV3Scroll.COLLECTOR,
    ORACLE: AaveV3Scroll.ORACLE,
  },
  [SupportedChain.ZKSYNC]: {
    POOL: AaveV3ZkSync.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3ZkSync.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3ZkSync.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3ZkSync.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3ZkSync.WETH_GATEWAY,
    ACL_MANAGER: AaveV3ZkSync.ACL_MANAGER,
    COLLECTOR: AaveV3ZkSync.COLLECTOR,
    ORACLE: AaveV3ZkSync.ORACLE,
  },
  // Testnets
  [SupportedChain.SEPOLIA]: {
    POOL: AaveV3Sepolia.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Sepolia.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Sepolia.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3Sepolia.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3Sepolia.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Sepolia.ACL_MANAGER,
    COLLECTOR: AaveV3Sepolia.COLLECTOR,
    ORACLE: AaveV3Sepolia.ORACLE,
  },
  [SupportedChain.FUJI]: {
    POOL: AaveV3Fuji.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3Fuji.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3Fuji.AAVE_PROTOCOL_DATA_PROVIDER,
    // UI_POOL_DATA_PROVIDER: Not available on Fuji
    WETH_GATEWAY: AaveV3Fuji.WETH_GATEWAY,
    ACL_MANAGER: AaveV3Fuji.ACL_MANAGER,
    COLLECTOR: AaveV3Fuji.COLLECTOR,
    ORACLE: AaveV3Fuji.ORACLE,
  },
  [SupportedChain.ARBITRUM_SEPOLIA]: {
    POOL: AaveV3ArbitrumSepolia.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3ArbitrumSepolia.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3ArbitrumSepolia.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3ArbitrumSepolia.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3ArbitrumSepolia.WETH_GATEWAY,
    ACL_MANAGER: AaveV3ArbitrumSepolia.ACL_MANAGER,
    COLLECTOR: AaveV3ArbitrumSepolia.COLLECTOR,
    ORACLE: AaveV3ArbitrumSepolia.ORACLE,
  },
  [SupportedChain.OPTIMISM_SEPOLIA]: {
    POOL: AaveV3OptimismSepolia.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3OptimismSepolia.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3OptimismSepolia.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3OptimismSepolia.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3OptimismSepolia.WETH_GATEWAY,
    ACL_MANAGER: AaveV3OptimismSepolia.ACL_MANAGER,
    COLLECTOR: AaveV3OptimismSepolia.COLLECTOR,
    ORACLE: AaveV3OptimismSepolia.ORACLE,
  },
  [SupportedChain.BASE_SEPOLIA]: {
    POOL: AaveV3BaseSepolia.POOL,
    POOL_ADDRESSES_PROVIDER: AaveV3BaseSepolia.POOL_ADDRESSES_PROVIDER,
    AAVE_PROTOCOL_DATA_PROVIDER: AaveV3BaseSepolia.AAVE_PROTOCOL_DATA_PROVIDER,
    UI_POOL_DATA_PROVIDER: AaveV3BaseSepolia.UI_POOL_DATA_PROVIDER,
    WETH_GATEWAY: AaveV3BaseSepolia.WETH_GATEWAY,
    ACL_MANAGER: AaveV3BaseSepolia.ACL_MANAGER,
    COLLECTOR: AaveV3BaseSepolia.COLLECTOR,
    ORACLE: AaveV3BaseSepolia.ORACLE,
  },
};

/**
 * Resolve chain context including configuration and contract addresses
 */
export function resolveChainContext(chainName: string): ChainContext {
  // Normalize chain name
  const normalizedChain = chainName.toLowerCase().trim() as SupportedChain;
  
  // Validate chain is supported
  if (!Object.values(SupportedChain).includes(normalizedChain)) {
    throw new AaveError(
      `Unsupported chain: ${chainName}. Supported chains: ${Object.values(SupportedChain).join(', ')}`,
      AaveErrorCode.INVALID_PARAMETERS
    );
  }

  // Get chain configuration
  const config = CHAIN_CONFIGS[normalizedChain];
  if (!config) {
    throw new AaveError(
      `Chain configuration not found for: ${chainName}`,
      AaveErrorCode.INVALID_PARAMETERS
    );
  }

  // Get contract addresses
  const addresses = CHAIN_ADDRESS_MAP[normalizedChain];
  if (!addresses) {
    throw new AaveError(
      `Aave V3 contracts not available on chain: ${chainName}`,
      AaveErrorCode.INVALID_PARAMETERS
    );
  }

  return {
    chain: normalizedChain,
    config,
    addresses,
  };
}

/**
 * Get RPC URL for a chain with user override support
 */
export function resolveRpcUrl(chainContext: ChainContext, userRpcUrl?: string): string {
  // Use user-provided RPC URL if available
  if (userRpcUrl) {
    return userRpcUrl;
  }

  // Use default RPC URL for the chain
  return chainContext.config.defaultRpcUrl;
}

/**
 * Get all available chains (for CLI/UI display)
 */
export function getAllSupportedChains(): Array<{ chain: SupportedChain; config: ChainConfig }> {
  return Object.entries(CHAIN_CONFIGS).map(([chain, config]) => ({
    chain: chain as SupportedChain,
    config,
  }));
}

/**
 * Get popular assets for a specific chain
 */
export function getPopularAssetsForChain(chain: SupportedChain): string[] {
  const config = CHAIN_CONFIGS[chain];
  return config ? config.popularAssets : [];
}

/**
 * Check if a chain has Aave V3 deployment
 */
export function hasAaveV3Deployment(chain: string): boolean {
  const normalizedChain = chain.toLowerCase() as SupportedChain;
  return normalizedChain in CHAIN_ADDRESS_MAP;
}