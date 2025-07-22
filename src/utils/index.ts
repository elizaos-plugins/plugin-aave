import { BigNumber } from "ethers";
import { HEALTH_FACTOR_THRESHOLDS, RATE_MODE_LABELS } from "../config";
import { InterestRateMode } from "../types";

/**
 * Format BigNumber to human readable string
 */
export function formatBigNumber(
  value: BigNumber,
  decimals: number = 18,
): string {
  const divisor = BigNumber.from(10).pow(decimals);
  const quotient = value.div(divisor);
  const remainder = value.mod(divisor);

  if (remainder.isZero()) {
    return quotient.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmedRemainder = remainderStr.replace(/0+$/, "");

  if (trimmedRemainder === "") {
    return quotient.toString();
  }

  return `${quotient.toString()}.${trimmedRemainder}`;
}

/**
 * Parse human readable number to BigNumber
 */
export function parseToBigNumber(
  value: string,
  decimals: number = 18,
): BigNumber {
  const [whole, fraction = ""] = value.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  const combined = whole + paddedFraction;
  return BigNumber.from(combined);
}

/**
 * Calculate health factor risk level
 */
export function getHealthFactorRiskLevel(
  healthFactor: number,
): "CRITICAL" | "WARNING" | "SAFE" | "VERY_SAFE" {
  if (healthFactor <= HEALTH_FACTOR_THRESHOLDS.CRITICAL) {
    return "CRITICAL";
  } else if (healthFactor <= HEALTH_FACTOR_THRESHOLDS.WARNING) {
    return "WARNING";
  } else if (healthFactor <= HEALTH_FACTOR_THRESHOLDS.SAFE) {
    return "SAFE";
  } else {
    return "VERY_SAFE";
  }
}

/**
 * Get human readable rate mode label
 */
export function getRateModeLabel(mode: InterestRateMode): string {
  return RATE_MODE_LABELS[mode] || "Unknown";
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(
  oldValue: number,
  newValue: number,
): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Format percentage with proper decimals
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format APY for display
 */
export function formatAPY(apy: number): string {
  return formatPercentage(apy * 100);
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate positive BigNumber
 */
export function isPositiveBigNumber(value: BigNumber): boolean {
  return value.gt(0);
}

/**
 * Convert seconds to human readable time
 */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Generate transaction summary
 */
export function generateTransactionSummary(
  operation: string,
  asset: string,
  amount: string,
  txHash: string,
): string {
  return `${operation} ${amount} ${asset} - Transaction: ${txHash.slice(0, 10)}...`;
}

/**
 * Calculate liquidation price (simplified)
 */
export function calculateLiquidationPrice(
  collateralValue: BigNumber,
  debtValue: BigNumber,
  liquidationThreshold: number,
): BigNumber {
  if (debtValue.isZero()) return BigNumber.from(0);

  const threshold = BigNumber.from(Math.floor(liquidationThreshold * 10000));
  const liquidationValue = debtValue.mul(10000).div(threshold);

  return liquidationValue;
}

/**
 * Estimate gas cost in ETH
 */
export function estimateGasCost(
  gasLimit: BigNumber,
  gasPrice: BigNumber,
): BigNumber {
  return gasLimit.mul(gasPrice);
}

/**
 * Check if amount is dust (too small to be meaningful)
 */
export function isDustAmount(
  amount: BigNumber,
  decimals: number = 18,
): boolean {
  const dustThreshold = BigNumber.from(10).pow(decimals - 6); // 0.000001 tokens
  return amount.lt(dustThreshold);
}
