import { BigNumber } from 'bignumber.js';

/**
 * Aave V3 Interest Rate Mode enumeration
 * Defines the type of interest rate for borrowing operations
 */
export enum InterestRateMode {
  /** Stable interest rate mode */
  STABLE = 1,
  /** Variable interest rate mode */
  VARIABLE = 2,
}

/**
 * Aave Error Code enumeration
 * Standardized error codes for Aave operations
 */
export enum AaveErrorCode {
  /** Unknown or unhandled error */
  UNKNOWN = 'UNKNOWN',
  /** Insufficient balance for operation */
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  /** Insufficient collateral for borrowing */
  INSUFFICIENT_COLLATERAL = 'INSUFFICIENT_COLLATERAL',
  /** Asset not supported by Aave */
  ASSET_NOT_SUPPORTED = 'ASSET_NOT_SUPPORTED',
  /** Borrowing not enabled for asset */
  BORROWING_NOT_ENABLED = 'BORROWING_NOT_ENABLED',
  /** Stable borrowing not enabled for asset */
  STABLE_BORROWING_NOT_ENABLED = 'STABLE_BORROWING_NOT_ENABLED',
  /** Position would be liquidated */
  HEALTH_FACTOR_TOO_LOW = 'HEALTH_FACTOR_TOO_LOW',
  /** Contract interaction failed */
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  /** Invalid parameters provided */
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  /** User already has stable rate loan */
  USER_HAS_STABLE_RATE_LOAN = 'USER_HAS_STABLE_RATE_LOAN',
  /** Amount exceeds maximum allowed */
  AMOUNT_TOO_HIGH = 'AMOUNT_TOO_HIGH',
  /** Pool is paused */
  POOL_PAUSED = 'POOL_PAUSED',
  /** Reserve is frozen */
  RESERVE_FROZEN = 'RESERVE_FROZEN',
  /** Reserve is not active */
  RESERVE_INACTIVE = 'RESERVE_INACTIVE',
  /** Service initialization failed */
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  /** Connection to protocol failed */
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  /** Service not initialized */
  SERVICE_NOT_INITIALIZED = 'SERVICE_NOT_INITIALIZED',
  /** Wallet not connected */
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  /** Transaction generation failed */
  TRANSACTION_GENERATION_FAILED = 'TRANSACTION_GENERATION_FAILED',
  /** Supply operation failed */
  SUPPLY_FAILED = 'SUPPLY_FAILED',
  /** Withdraw operation failed */
  WITHDRAW_FAILED = 'WITHDRAW_FAILED',
  /** Borrow operation failed */
  BORROW_FAILED = 'BORROW_FAILED',
  /** Repay operation failed */
  REPAY_FAILED = 'REPAY_FAILED',
  /** Data fetch operation failed */
  DATA_FETCH_FAILED = 'DATA_FETCH_FAILED',
  /** Asset not found */
  ASSET_NOT_FOUND = 'ASSET_NOT_FOUND',
  /** Unsupported asset */
  UNSUPPORTED_ASSET = 'UNSUPPORTED_ASSET',
  /** No borrowing capacity */
  NO_BORROW_CAPACITY = 'NO_BORROW_CAPACITY',
  /** Unsupported operation on this chain */
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
}

/**
 * Custom error class for Aave operations
 */
export class AaveError extends Error {
  /** Error code for programmatic handling */
  public readonly code: AaveErrorCode;
  /** Original error that caused this error */
  public readonly cause?: Error;
  /** Additional context about the error */
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: AaveErrorCode = AaveErrorCode.UNKNOWN,
    cause?: Error,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AaveError';
    this.code = code;
    this.cause = cause;
    this.context = context;
  }
}

/**
 * Configuration for Aave V3 Protocol
 */
export interface AaveConfig {
  /** Network name */
  network: string;
  /** RPC URL for blockchain connection */
  rpcUrl: string;
  /** Pool contract address */
  poolAddress: string;
  /** Pool data provider contract address */
  poolDataProviderAddress: string;
  /** UI Pool data provider contract address */
  uiPoolDataProviderAddress: string;
  /** WETH Gateway contract address */
  wethGatewayAddress: string;
  /** Chain ID for the network */
  chainId?: number;
  /** Optional private key for transactions */
  privateKey?: string;
  /** Gas limit multiplier (default: 1.2) */
  gasLimitMultiplier?: number;
  /** Max fee per gas in wei */
  maxFeePerGas?: string;
  /** Max priority fee per gas in wei */
  maxPriorityFeePerGas?: string;
}

/**
 * Parameters for supply operation
 */
export interface SupplyParams {
  /** Asset address to supply */
  asset: string;
  /** Amount to supply (in asset decimals) */
  amount: BigNumber;
  /** User address performing the supply */
  user: string;
  /** Address to receive aTokens (usually same as user) */
  onBehalfOf?: string;
  /** Referral code for supply operation */
  referralCode?: number;
}

/**
 * Result of a supply operation
 */
export interface SupplyResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Transaction hash */
  transactionHash?: string;
  /** Amount supplied */
  suppliedAmount: BigNumber;
  /** aToken amount received */
  aTokenAmount: BigNumber;
  /** New aToken balance after supply */
  newATokenBalance: BigNumber;
  /** Gas used for the transaction */
  gasUsed?: BigNumber;
  /** Error information if operation failed */
  error?: AaveError;
}

/**
 * Parameters for withdraw operation
 */
export interface WithdrawParams {
  /** Asset address to withdraw */
  asset: string;
  /** Amount to withdraw (in asset decimals, use MAX_UINT256 for max) */
  amount: BigNumber;
  /** User address performing the withdraw */
  user: string;
  /** Address to receive withdrawn assets */
  to?: string;
}

/**
 * Result of a withdraw operation
 */
export interface WithdrawResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Transaction hash */
  transactionHash?: string;
  /** Amount withdrawn */
  amountWithdrawn: BigNumber;
  /** Remaining aToken balance after withdraw */
  remainingATokenBalance: BigNumber;
  /** New health factor after withdrawal */
  newHealthFactor?: number;
  /** Gas used for the transaction */
  gasUsed?: BigNumber;
  /** Error information if operation failed */
  error?: AaveError;
}

/**
 * Parameters for borrow operation
 */
export interface BorrowParams {
  /** Asset address to borrow */
  asset: string;
  /** Amount to borrow (in asset decimals) */
  amount: BigNumber;
  /** Interest rate mode (stable or variable) */
  interestRateMode: InterestRateMode;
  /** User address performing the borrow */
  user: string;
  /** Address to receive borrowed assets */
  onBehalfOf?: string;
  /** Referral code for borrow operation */
  referralCode?: number;
}

/**
 * Result of a borrow operation
 */
export interface BorrowResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Transaction hash */
  transactionHash?: string;
  /** Amount borrowed */
  amountBorrowed: BigNumber;
  /** Interest rate mode used */
  interestRateMode: InterestRateMode;
  /** Current borrow APY at time of borrowing */
  currentBorrowAPY: number;
  /** Health factor after borrowing */
  newHealthFactor: number;
  /** Gas used for the transaction */
  gasUsed?: BigNumber;
  /** Error information if operation failed */
  error?: AaveError;
}

/**
 * Parameters for repay operation
 */
export interface RepayParams {
  /** Asset address to repay */
  asset: string;
  /** Amount to repay (in asset decimals, use MAX_UINT256 for full repay) */
  amount: BigNumber;
  /** Interest rate mode of the debt being repaid */
  interestRateMode: InterestRateMode;
  /** User address performing the repay */
  user: string;
  /** Address whose debt is being repaid */
  onBehalfOf?: string;
}

/**
 * Result of a repay operation
 */
export interface RepayResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Transaction hash */
  transactionHash?: string;
  /** Amount repaid */
  amountRepaid: BigNumber;
  /** Interest rate mode of repaid debt */
  interestRateMode: InterestRateMode;
  /** Remaining total debt balance */
  remainingDebt: BigNumber;
  /** Health factor after repaying */
  newHealthFactor: number;
  /** Gas used for the transaction */
  gasUsed?: BigNumber;
  /** Optional approval transaction hash */
  approvalTransactionHash?: string;
  /** Error information if operation failed */
  error?: AaveError;
}

/**
 * User's position in a specific asset
 */
export interface AssetPosition {
  /** Asset address */
  asset: string;
  /** Asset symbol (e.g., USDC, ETH) */
  symbol: string;
  /** Asset name */
  name: string;
  /** Number of decimals for the asset */
  decimals: number;
  /** aToken address for this asset */
  aTokenAddress: string;
  /** Stable debt token address */
  stableDebtTokenAddress: string;
  /** Variable debt token address */
  variableDebtTokenAddress: string;
  
  /** Supply position */
  supplied: {
    /** Amount supplied (in asset decimals) */
    amount: BigNumber;
    /** aToken balance */
    aTokenBalance: BigNumber;
    /** Current supply APY */
    supplyAPY: BigNumber;
    /** Value in USD */
    valueUSD: BigNumber;
  };
  
  /** Borrow position */
  borrowed: {
    /** Stable rate debt amount */
    stableDebt: BigNumber;
    /** Variable rate debt amount */
    variableDebt: BigNumber;
    /** Total debt amount */
    totalDebt: BigNumber;
    /** Current stable borrow APY */
    stableBorrowAPY: BigNumber;
    /** Current variable borrow APY */
    variableBorrowAPY: BigNumber;
    /** Value in USD */
    valueUSD: BigNumber;
  };
  
  /** Collateral status */
  isCollateral: boolean;
  /** Can be used as collateral */
  canBeCollateral: boolean;
  /** Asset can be borrowed */
  canBorrow: boolean;
  /** Stable rate borrowing is enabled */
  stableBorrowEnabled: boolean;
}

/**
 * Simple asset position for getUserPosition
 */
export interface SimplePosition {
  /** Asset symbol */
  asset: string;
  /** Amount supplied */
  suppliedAmount: BigNumber;
  /** Variable debt amount */
  borrowedAmountVariable: BigNumber;
  /** Stable debt amount */
  borrowedAmountStable: BigNumber;
  /** Supply APY */
  supplyAPY: number;
  /** Variable borrow APY */
  variableBorrowAPY: number;
  /** Stable borrow APY */
  stableBorrowAPY: number;
  /** Is used as collateral */
  isCollateral: boolean;
  /** Liquidation threshold */
  liquidationThreshold: number;
  /** Loan to value ratio */
  ltv: number;
}

/**
 * Complete user position across all assets
 */
export interface UserPosition {
  /** User's wallet address */
  userAddress: string;
  /** Total collateral in ETH */
  totalCollateralETH: BigNumber;
  /** Total debt in ETH */
  totalDebtETH: BigNumber;
  /** Available to borrow in ETH */
  availableBorrowsETH: BigNumber;
  /** Current liquidation threshold */
  currentLiquidationThreshold: number;
  /** Loan to value ratio */
  ltv: number;
  /** Health factor */
  healthFactor: BigNumber;
  /** Individual asset positions */
  positions: SimplePosition[];
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Market data for a specific asset
 */
export interface MarketData {
  /** Asset symbol */
  asset: string;
  /** aToken address */
  aTokenAddress: string;
  /** Stable debt token address */
  stableDebtTokenAddress: string;
  /** Variable debt token address */
  variableDebtTokenAddress: string;
  /** Underlying asset address */
  underlyingAsset: string;
  /** Asset decimals */
  decimals: number;
  /** Supply APY */
  supplyAPY: number;
  /** Variable borrow APY */
  variableBorrowAPY: number;
  /** Stable borrow APY */
  stableBorrowAPY: number;
  /** Total supply */
  totalSupply: BigNumber;
  /** Total borrowed */
  totalBorrow: BigNumber;
  /** Utilization rate */
  utilizationRate: number;
  /** Loan to value ratio */
  ltv: number;
  /** Liquidation threshold */
  liquidationThreshold: number;
  /** Liquidation bonus */
  liquidationBonus: number;
  /** Reserve factor */
  reserveFactor: number;
  /** Price in USD */
  priceInUSD: BigNumber;
  /** Is active */
  isActive: boolean;
  /** Is frozen */
  isFrozen: boolean;
  /** Is paused */
  isPaused: boolean;
  /** Supply cap */
  supplyCap: BigNumber;
  /** Borrow cap */
  borrowCap: BigNumber;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Aave V3 reserve configuration data
 */
export interface ReserveConfigurationData {
  /** Decimals of the underlying asset */
  decimals: BigNumber;
  /** Loan to value ratio */
  ltv: BigNumber;
  /** Liquidation threshold */
  liquidationThreshold: BigNumber;
  /** Liquidation bonus */
  liquidationBonus: BigNumber;
  /** Reserve factor */
  reserveFactor: BigNumber;
  /** Whether the reserve can be used as collateral */
  usageAsCollateralEnabled: boolean;
  /** Whether borrowing is enabled */
  borrowingEnabled: boolean;
  /** Whether stable rate borrowing is enabled */
  stableBorrowRateEnabled: boolean;
  /** Whether the reserve is active */
  isActive: boolean;
  /** Whether the reserve is frozen */
  isFrozen: boolean;
}

/**
 * Aave V3 reserve data from the protocol
 */
export interface ReserveData {
  /** Configuration data */
  configuration: ReserveConfigurationData;
  /** Current liquidity rate */
  liquidityRate: BigNumber;
  /** Current stable borrow rate */
  stableBorrowRate: BigNumber;
  /** Current variable borrow rate */
  variableBorrowRate: BigNumber;
  /** Liquidity index */
  liquidityIndex: BigNumber;
  /** Variable borrow index */
  variableBorrowIndex: BigNumber;
  /** aToken address */
  aTokenAddress: string;
  /** Stable debt token address */
  stableDebtTokenAddress: string;
  /** Variable debt token address */
  variableDebtTokenAddress: string;
  /** Interest rate strategy address */
  interestRateStrategyAddress: string;
  /** Available liquidity */
  availableLiquidity: BigNumber;
  /** Total stable debt */
  totalStableDebt: BigNumber;
  /** Total variable debt */
  totalVariableDebt: BigNumber;
  /** Total principal stable debt */
  principalStableDebt: BigNumber;
  /** Average stable rate */
  averageStableRate: BigNumber;
  /** Last update timestamp */
  lastUpdateTimestamp: BigNumber;
}

/**
 * User account data from Aave
 */
export interface UserAccountData {
  /** Total collateral in ETH */
  totalCollateralETH: BigNumber;
  /** Total debt in ETH */
  totalDebtETH: BigNumber;
  /** Available borrows in ETH */
  availableBorrowsETH: BigNumber;
  /** Current liquidation threshold */
  currentLiquidationThreshold: number;
  /** Loan to value ratio */
  ltv: number;
  /** Health factor */
  healthFactor: BigNumber;
}

/**
 * Transaction options for Aave operations
 */
export interface TransactionOptions {
  /** Gas limit for the transaction */
  gasLimit?: BigNumber;
  /** Gas price in wei */
  gasPrice?: BigNumber;
  /** Max fee per gas for EIP-1559 */
  maxFeePerGas?: BigNumber;
  /** Max priority fee per gas for EIP-1559 */
  maxPriorityFeePerGas?: BigNumber;
  /** Transaction value in wei */
  value?: BigNumber;
  /** Nonce for the transaction */
  nonce?: number;
}

/**
 * Common constants used in Aave operations
 */
export const AAVE_CONSTANTS = {
  /** Maximum uint256 value for unlimited approvals/withdrawals */
  MAX_UINT256: new BigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
  /** Number of seconds in a year for APY calculations */
  SECONDS_PER_YEAR: new BigNumber(31536000),
  /** Number of ray units (1e27) used by Aave for rate calculations */
  RAY: new BigNumber('1000000000000000000000000000'),
  /** Number of wei units (1e18) */
  WAD: new BigNumber('1000000000000000000'),
  /** Percentage multiplier (100 for percentage) */
  PERCENTAGE_FACTOR: new BigNumber(10000),
} as const;

/**
 * Helper type for operation parameters
 */
export type OperationParams = SupplyParams | WithdrawParams | BorrowParams | RepayParams;

/**
 * Helper type for operation results
 */
export type OperationResult = SupplyResult | WithdrawResult | BorrowResult | RepayResult;

/**
 * Type guard to check if error is AaveError
 */
export function isAaveError(error: any): error is AaveError {
  return error instanceof AaveError;
}

/**
 * Type guard to check if rate mode is valid
 */
export function isValidInterestRateMode(mode: any): mode is InterestRateMode {
  return mode === InterestRateMode.STABLE || mode === InterestRateMode.VARIABLE;
}