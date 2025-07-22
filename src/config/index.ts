import { parseEther, parseGwei } from "viem";
import { AaveConfig, BigNumber } from "../types";

/**
 * Aave V3 Contract Addresses on Base
 */
export const AAVE_V3_BASE_ADDRESSES = {
  POOL: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  POOL_DATA_PROVIDER: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac",
  PRICE_ORACLE: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
  ACL_MANAGER: "0x43955b0899Ab7232E3a454cf84AedD22Ad46FD33",
  POOL_ADDRESSES_PROVIDER: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  UI_POOL_DATA_PROVIDER: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502",
  WALLET_BALANCE_PROVIDER: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502",
};

/**
 * Aave V3 Contract Addresses on Base Sepolia (Testnet)
 */
export const AAVE_V3_BASE_SEPOLIA_ADDRESSES = {
  POOL: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
  POOL_DATA_PROVIDER: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac",
  PRICE_ORACLE: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
  ACL_MANAGER: "0x43955b0899Ab7232E3a454cf84AedD22Ad46FD33",
  POOL_ADDRESSES_PROVIDER: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  UI_POOL_DATA_PROVIDER: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502",
  WALLET_BALANCE_PROVIDER: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502",
};

/**
 * Common Base L2 Token Addresses
 */
export const BASE_TOKEN_ADDRESSES = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};

/**
 * eMode Categories on Aave V3
 */
export const EMODE_CATEGORIES = {
  NONE: 0,
  STABLECOINS: 1,
  ETH_CORRELATED: 2,
};

/**
 * Default Configuration Values
 */
export const DEFAULT_CONFIG: Partial<AaveConfig> = {
  healthFactorThreshold: 1.5,
  maxGasPrice: parseGwei("50"), // 50 gwei
  retryAttempts: 3,
  monitoringInterval: 30000, // 30 seconds
  flashLoanFeeThreshold: 0.1, // 0.1%
};

/**
 * Gas Limits for Different Operations
 */
export const GAS_LIMITS = {
  SUPPLY: 300000n,
  BORROW: 400000n,
  REPAY: 300000n,
  WITHDRAW: 400000n,
  RATE_SWITCH: 200000n,
  COLLATERAL_TOGGLE: 150000n,
  EMODE_TOGGLE: 200000n,
  FLASH_LOAN: 1000000n,
};

/**
 * Health Factor Thresholds
 */
export const HEALTH_FACTOR_THRESHOLDS = {
  CRITICAL: 1.05,
  WARNING: 1.2,
  SAFE: 1.5,
  VERY_SAFE: 2.0,
};

/**
 * Rate Mode Labels
 */
export const RATE_MODE_LABELS = {
  0: "None",
  1: "Stable",
  2: "Variable",
};

/**
 * Get Aave addresses for the specified network
 */
export function getAaveAddresses(network: "base" | "base-sepolia") {
  return network === "base"
    ? AAVE_V3_BASE_ADDRESSES
    : AAVE_V3_BASE_SEPOLIA_ADDRESSES;
}

/**
 * Create default Aave configuration
 */
export function createDefaultConfig(
  network: "base" | "base-sepolia",
  rpcUrl: string,
): AaveConfig {
  const addresses = getAaveAddresses(network);

  return {
    network,
    rpcUrl,
    aavePoolAddress: addresses.POOL,
    aaveDataProviderAddress: addresses.POOL_DATA_PROVIDER,
    healthFactorThreshold: DEFAULT_CONFIG.healthFactorThreshold!,
    maxGasPrice: DEFAULT_CONFIG.maxGasPrice!,
    retryAttempts: DEFAULT_CONFIG.retryAttempts!,
    monitoringInterval: DEFAULT_CONFIG.monitoringInterval!,
    flashLoanFeeThreshold: DEFAULT_CONFIG.flashLoanFeeThreshold!,
  };
}
