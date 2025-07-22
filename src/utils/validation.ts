import { BigNumber } from 'bignumber.js';
import { z } from 'zod';
import { isAddress, getAddress } from 'viem';
import {
  InterestRateMode,
  AaveError,
  AaveErrorCode,
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
  AAVE_CONSTANTS,
} from '../types/index.js';

// Re-export types for convenience
export { InterestRateMode } from '../types/index.js';

/**
 * Zod schema for validating Ethereum addresses
 */
export const AddressSchema = z
  .string()
  .refine((val) => isAddress(val), {
    message: 'Invalid Ethereum address format',
  })
  .transform((val) => getAddress(val)); // Normalize to checksum format

/**
 * Zod schema for validating BigNumber amounts
 */
export const BigNumberSchema = z
  .union([
    z.string(),
    z.number(),
    z.instanceof(BigNumber),
  ])
  .transform((val) => {
    if (val instanceof BigNumber) {
      return val;
    }
    try {
      return new BigNumber(val);
    } catch (error) {
      throw new Error(`Invalid number format: ${val}`);
    }
  })
  .refine((val) => val.isFinite() && !val.isNaN(), {
    message: 'Amount must be a valid finite number',
  });

/**
 * Zod schema for validating positive amounts
 */
export const PositiveAmountSchema = BigNumberSchema.refine(
  (val) => val.isGreaterThan(0),
  {
    message: 'Amount must be greater than zero',
  }
);

/**
 * Zod schema for validating non-negative amounts (allows zero)
 */
export const NonNegativeAmountSchema = BigNumberSchema.refine(
  (val) => val.isGreaterThanOrEqualTo(0),
  {
    message: 'Amount must be greater than or equal to zero',
  }
);

/**
 * Zod schema for validating interest rate modes
 */
export const InterestRateModeSchema = z
  .union([
    z.number(),
    z.string(),
    z.nativeEnum(InterestRateMode),
  ])
  .transform((val) => {
    if (typeof val === 'string') {
      const numVal = parseInt(val, 10);
      return numVal;
    }
    return typeof val === 'number' ? val : val;
  })
  .refine(
    (val) => val === InterestRateMode.STABLE || val === InterestRateMode.VARIABLE,
    {
      message: 'Interest rate mode must be 1 (stable) or 2 (variable)',
    }
  );

/**
 * Zod schema for validating asset identifiers (address or symbol)
 */
export const AssetSchema = z
  .string()
  .min(1, 'Asset identifier cannot be empty')
  .refine((val) => {
    // Check if it's a valid address or a reasonable symbol (2-10 chars, alphanumeric)
    return isAddress(val) || /^[A-Za-z0-9]{2,10}$/.test(val);
  }, {
    message: 'Asset must be a valid Ethereum address or symbol (2-10 alphanumeric characters)',
  });

/**
 * Common asset symbols and their typical addresses on mainnet (for reference)
 */
export const COMMON_ASSETS = {
  // Stablecoins
  USDC: '0xA0b86a33E6441a8fb16b3e1B8EB6e90A4d4c0b6b',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  LUSD: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
  
  // Major cryptocurrencies
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  
  // DeFi tokens
  LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  
  // Layer 2 and other tokens
  MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
} as const;

// =============================================================================
// AMOUNT VALIDATION UTILITIES
// =============================================================================

/**
 * Parses various input types to BigNumber
 * @param amount - Input amount (string, number, or BigNumber)
 * @returns Parsed BigNumber
 * @throws AaveError if parsing fails
 */
export function parseAmount(amount: string | number | BigNumber): BigNumber {
  try {
    const result = BigNumberSchema.parse(amount);
    return result;
  } catch (error) {
    throw createValidationError(
      `Invalid amount format: ${amount}`,
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Validates that an amount is positive and finite
 * @param amount - Amount to validate
 * @param fieldName - Name of the field for error messages
 * @returns true if valid
 * @throws AaveError if invalid
 */
export function validateAmount(
  amount: string | number | BigNumber,
  fieldName: string = 'amount'
): boolean {
  try {
    PositiveAmountSchema.parse(amount);
    return true;
  } catch (error) {
    throw createValidationError(
      `Invalid ${fieldName}: must be a positive number`,
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if an amount is valid without throwing
 * @param amount - Amount to check
 * @returns true if valid, false otherwise
 */
export function isValidAmount(amount: unknown): amount is BigNumber {
  try {
    PositiveAmountSchema.parse(amount);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses amount to BigNumber with decimals consideration
 * @param amount - Amount as string or number
 * @param decimals - Token decimals (default: 18)
 * @returns BigNumber in token's smallest unit
 */
export function parseAmountToBigNumber(
  amount: string | number,
  decimals: number = 18
): BigNumber {
  const parsedAmount = parseAmount(amount);
  const multiplier = new BigNumber(10).pow(decimals);
  return parsedAmount.multipliedBy(multiplier);
}

/**
 * Formats BigNumber amount for display
 * @param amount - Amount in smallest token units
 * @param decimals - Token decimals (default: 18)
 * @param displayDecimals - Number of decimals to show (default: 6)
 * @returns Formatted string
 */
export function formatAmount(
  amount: BigNumber,
  decimals: number = 18,
  displayDecimals: number = 6
): string {
  const divisor = new BigNumber(10).pow(decimals);
  const formatted = amount.dividedBy(divisor);
  return formatted.toFixed(displayDecimals, BigNumber.ROUND_DOWN);
}

// =============================================================================
// ASSET VALIDATION UTILITIES
// =============================================================================

/**
 * Validates and normalizes asset identifier
 * @param asset - Asset address or symbol
 * @returns Normalized asset identifier
 * @throws AaveError if invalid
 */
export function validateAsset(asset: string): string {
  try {
    const result = AssetSchema.parse(asset);
    return normalizeAsset(result);
  } catch (error) {
    throw createValidationError(
      `Invalid asset identifier: ${asset}`,
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if asset identifier is valid without throwing
 * @param asset - Asset to check
 * @returns true if valid
 */
export function isValidAsset(asset: unknown): asset is string {
  try {
    AssetSchema.parse(asset);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes asset identifier (addresses to checksum, symbols to uppercase)
 * @param asset - Asset identifier
 * @returns Normalized asset identifier
 */
export function normalizeAsset(asset: string): string {
  if (isAddress(asset)) {
    return getAddress(asset); // Returns checksum address
  }
  return asset.toUpperCase();
}

/**
 * Resolves asset symbol to known address (if available)
 * @param asset - Asset symbol or address
 * @returns Resolved address or original if not found
 */
export function resolveAssetAddress(asset: string): string {
  const normalized = normalizeAsset(asset);
  
  if (isAddress(normalized)) {
    return normalized;
  }
  
  // Try to resolve from common assets
  const knownAddress = COMMON_ASSETS[normalized as keyof typeof COMMON_ASSETS];
  return knownAddress || normalized;
}

// =============================================================================
// ADDRESS VALIDATION UTILITIES
// =============================================================================

/**
 * Validates Ethereum address format
 * @param address - Address to validate
 * @param fieldName - Field name for error messages
 * @returns Checksum address
 * @throws AaveError if invalid
 */
export function validateAddress(
  address: string,
  fieldName: string = 'address'
): string {
  try {
    return AddressSchema.parse(address);
  } catch (error) {
    throw createValidationError(
      `Invalid ${fieldName}: must be a valid Ethereum address`,
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if string is a valid Ethereum address
 * @param address - Address to check
 * @returns true if valid
 */
export function isValidAddress(address: unknown): address is string {
  try {
    AddressSchema.parse(address);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// RATE MODE VALIDATION UTILITIES
// =============================================================================

/**
 * Validates interest rate mode
 * @param mode - Rate mode to validate
 * @returns Validated InterestRateMode
 * @throws AaveError if invalid
 */
export function validateInterestRateMode(mode: unknown): InterestRateMode {
  try {
    return InterestRateModeSchema.parse(mode);
  } catch (error) {
    throw createValidationError(
      'Invalid interest rate mode: must be 1 (stable) or 2 (variable)',
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if rate mode is valid without throwing
 * @param mode - Rate mode to check
 * @returns true if valid
 */
export function isValidRateMode(mode: unknown): mode is InterestRateMode {
  try {
    InterestRateModeSchema.parse(mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets human-readable rate mode name
 * @param mode - Interest rate mode
 * @returns Rate mode name
 */
export function getRateModeName(mode: InterestRateMode): string {
  switch (mode) {
    case InterestRateMode.STABLE:
      return 'Stable';
    case InterestRateMode.VARIABLE:
      return 'Variable';
    default:
      return 'Unknown';
  }
}

// =============================================================================
// PARAMETER VALIDATION UTILITIES
// =============================================================================

/**
 * Zod schema for supply parameters
 */
export const SupplyParamsSchema = z.object({
  asset: AssetSchema.transform(normalizeAsset),
  amount: PositiveAmountSchema,
  user: AddressSchema,
  onBehalfOf: AddressSchema.optional(),
  referralCode: z.number().min(0).max(65535).optional().default(0),
});

/**
 * Validates supply operation parameters
 * @param params - Supply parameters
 * @returns Validated parameters
 * @throws AaveError if invalid
 */
export function validateSupplyParams(params: Partial<SupplyParams>): SupplyParams {
  try {
    const validated = SupplyParamsSchema.parse(params);
    return {
      ...validated,
      onBehalfOf: validated.onBehalfOf || validated.user,
    } as SupplyParams;
  } catch (error) {
    throw createValidationError(
      'Invalid supply parameters',
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Zod schema for withdraw parameters
 */
export const WithdrawParamsSchema = z.object({
  asset: AssetSchema.transform(normalizeAsset),
  amount: NonNegativeAmountSchema, // Allow zero for max withdrawal
  user: AddressSchema,
  to: AddressSchema.optional(),
});

/**
 * Validates withdraw operation parameters
 * @param params - Withdraw parameters
 * @returns Validated parameters
 * @throws AaveError if invalid
 */
export function validateWithdrawParams(params: Partial<WithdrawParams>): WithdrawParams {
  try {
    const validated = WithdrawParamsSchema.parse(params);
    return {
      ...validated,
      to: validated.to || validated.user,
    } as WithdrawParams;
  } catch (error) {
    throw createValidationError(
      'Invalid withdraw parameters',
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Zod schema for borrow parameters
 */
export const BorrowParamsSchema = z.object({
  asset: AssetSchema.transform(normalizeAsset),
  amount: PositiveAmountSchema,
  interestRateMode: InterestRateModeSchema,
  user: AddressSchema,
  onBehalfOf: AddressSchema.optional(),
  referralCode: z.number().min(0).max(65535).optional().default(0),
});

/**
 * Validates borrow operation parameters
 * @param params - Borrow parameters
 * @returns Validated parameters
 * @throws AaveError if invalid
 */
export function validateBorrowParams(params: Partial<BorrowParams>): BorrowParams {
  try {
    const validated = BorrowParamsSchema.parse(params);
    return {
      ...validated,
      onBehalfOf: validated.onBehalfOf || validated.user,
    } as BorrowParams;
  } catch (error) {
    throw createValidationError(
      'Invalid borrow parameters',
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Zod schema for repay parameters
 */
export const RepayParamsSchema = z.object({
  asset: AssetSchema.transform(normalizeAsset),
  amount: NonNegativeAmountSchema, // Allow zero for max repay
  interestRateMode: InterestRateModeSchema,
  user: AddressSchema,
  onBehalfOf: AddressSchema.optional(),
});

/**
 * Validates repay operation parameters
 * @param params - Repay parameters
 * @returns Validated parameters
 * @throws AaveError if invalid
 */
export function validateRepayParams(params: Partial<RepayParams>): RepayParams {
  try {
    const validated = RepayParamsSchema.parse(params);
    return {
      ...validated,
      onBehalfOf: validated.onBehalfOf || validated.user,
    } as RepayParams;
  } catch (error) {
    throw createValidationError(
      'Invalid repay parameters',
      AaveErrorCode.INVALID_PARAMETERS,
      error instanceof Error ? error : undefined
    );
  }
}

// =============================================================================
// BIGUMBER HELPERS
// =============================================================================

/**
 * Checks if amount represents "maximum" (withdraw all, repay all)
 * @param amount - Amount to check
 * @returns true if amount is maximum
 */
export function isMaxAmount(amount: BigNumber): boolean {
  return amount.isEqualTo(AAVE_CONSTANTS.MAX_UINT256);
}

/**
 * Creates maximum amount constant
 * @returns Maximum BigNumber value
 */
export function getMaxAmount(): BigNumber {
  return AAVE_CONSTANTS.MAX_UINT256;
}

/**
 * Converts percentage to basis points (for Aave)
 * @param percentage - Percentage value (e.g., 5.5 for 5.5%)
 * @returns Basis points (e.g., 550 for 5.5%)
 */
export function percentageToBasisPoints(percentage: number): BigNumber {
  return new BigNumber(percentage).multipliedBy(100);
}

/**
 * Converts basis points to percentage
 * @param basisPoints - Basis points value
 * @returns Percentage value
 */
export function basisPointsToPercentage(basisPoints: BigNumber): BigNumber {
  return basisPoints.dividedBy(100);
}

/**
 * Calculates APY from rate (assuming rate is per second)
 * @param rate - Rate per second
 * @returns APY as percentage
 */
export function calculateAPY(rate: BigNumber): BigNumber {
  const ratePerSecond = rate.dividedBy(AAVE_CONSTANTS.RAY);
  const compounded = ratePerSecond.plus(1).pow(AAVE_CONSTANTS.SECONDS_PER_YEAR.toNumber());
  return compounded.minus(1).multipliedBy(100);
}

// =============================================================================
// ERROR CREATION UTILITIES
// =============================================================================

/**
 * Creates a generic error
 * @param message - Error message
 * @param code - Error code
 * @param cause - Original error
 * @param context - Additional context
 * @returns AaveError instance
 */
export function createError(
  message: string,
  code: AaveErrorCode = AaveErrorCode.UNKNOWN,
  cause?: Error,
  context?: Record<string, any>
): AaveError {
  return new AaveError(message, code, cause, context);
}

/**
 * Creates a validation-specific error
 * @param message - Error message
 * @param code - Error code
 * @param cause - Original error
 * @param context - Additional context
 * @returns AaveError instance
 */
export function createValidationError(
  message: string,
  code: AaveErrorCode = AaveErrorCode.INVALID_PARAMETERS,
  cause?: Error,
  context?: Record<string, any>
): AaveError {
  return createError(message, code, cause, {
    ...context,
    type: 'validation',
  });
}

/**
 * Creates an amount validation error with helpful context
 * @param amount - The invalid amount
 * @param requirement - What the amount should be
 * @param fieldName - Name of the amount field
 * @returns AaveError instance
 */
export function createAmountError(
  amount: unknown,
  requirement: string,
  fieldName: string = 'amount'
): AaveError {
  return createValidationError(
    `Invalid ${fieldName}: ${requirement}`,
    AaveErrorCode.INVALID_PARAMETERS,
    undefined,
    {
      field: fieldName,
      value: amount,
      requirement,
    }
  );
}

/**
 * Creates an asset validation error
 * @param asset - The invalid asset
 * @param requirement - What the asset should be
 * @returns AaveError instance
 */
export function createAssetError(
  asset: unknown,
  requirement: string = 'must be a valid Ethereum address or asset symbol'
): AaveError {
  return createValidationError(
    `Invalid asset: ${requirement}`,
    AaveErrorCode.ASSET_NOT_SUPPORTED,
    undefined,
    {
      field: 'asset',
      value: asset,
      requirement,
    }
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validates multiple parameters at once
 * @param validations - Array of validation functions
 * @returns true if all validations pass
 * @throws First encountered validation error
 */
export function validateAll(validations: Array<() => boolean | void>): boolean {
  for (const validation of validations) {
    validation();
  }
  return true;
}

/**
 * Validates operation-specific constraints
 * @param operation - Operation type
 * @param params - Operation parameters
 * @returns true if valid
 * @throws AaveError if constraints violated
 */
export function validateOperationConstraints(
  operation: 'supply' | 'withdraw' | 'borrow' | 'repay',
  params: any
): boolean {
  switch (operation) {
    case 'supply':
      if (params.amount && isMaxAmount(params.amount)) {
        throw createValidationError(
          'Supply amount cannot be maximum value',
          AaveErrorCode.INVALID_PARAMETERS
        );
      }
      break;
      
    case 'withdraw':
      // Max amount is allowed for withdraw (withdraw all)
      break;
      
    case 'borrow':
      if (params.amount && isMaxAmount(params.amount)) {
        throw createValidationError(
          'Borrow amount cannot be maximum value',
          AaveErrorCode.INVALID_PARAMETERS
        );
      }
      break;
      
    case 'repay':
      // Max amount is allowed for repay (repay all debt)
      break;
      
    default:
      throw createValidationError(
        `Unknown operation: ${operation}`,
        AaveErrorCode.INVALID_PARAMETERS
      );
  }
  
  return true;
}

/**
 * Type guard for checking if a value is a BigNumber
 * @param value - Value to check
 * @returns true if value is BigNumber
 */
export function isBigNumber(value: unknown): value is BigNumber {
  return value instanceof BigNumber;
}

/**
 * Safe conversion to BigNumber with validation
 * @param value - Value to convert
 * @param defaultValue - Default value if conversion fails
 * @returns BigNumber or default
 */
export function toBigNumberSafe(
  value: unknown,
  defaultValue: BigNumber = new BigNumber(0)
): BigNumber {
  try {
    return parseAmount(value as string | number | BigNumber);
  } catch {
    return defaultValue;
  }
}

/**
 * Validates that an amount doesn't exceed a maximum
 * @param amount - Amount to check
 * @param maximum - Maximum allowed amount
 * @param fieldName - Field name for error messages
 * @returns true if valid
 * @throws AaveError if amount exceeds maximum
 */
export function validateMaxAmount(
  amount: BigNumber,
  maximum: BigNumber,
  fieldName: string = 'amount'
): boolean {
  if (amount.isGreaterThan(maximum)) {
    throw createAmountError(
      amount.toString(),
      `must not exceed ${formatAmount(maximum)}`,
      fieldName
    );
  }
  return true;
}

/**
 * Validates that an amount meets a minimum requirement
 * @param amount - Amount to check
 * @param minimum - Minimum required amount
 * @param fieldName - Field name for error messages
 * @returns true if valid
 * @throws AaveError if amount is below minimum
 */
export function validateMinAmount(
  amount: BigNumber,
  minimum: BigNumber,
  fieldName: string = 'amount'
): boolean {
  if (amount.isLessThan(minimum)) {
    throw createAmountError(
      amount.toString(),
      `must be at least ${formatAmount(minimum)}`,
      fieldName
    );
  }
  return true;
}