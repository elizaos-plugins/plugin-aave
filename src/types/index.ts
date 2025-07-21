import { Address, Hash, Hex } from 'viem';
import { Service, Action, Provider, Evaluator, Memory, IAgentRuntime, Plugin } from '@elizaos/core';
import BigNumber from 'bignumber.js';

// Type exports for better compatibility
export type { Address, Hash, Hex };
export { BigNumber };

/**
 * Aave V3 User Account Data
 */
export interface UserAccountData {
    totalCollateralETH: BigNumber;
    totalDebtETH: BigNumber;
    availableBorrowsETH: BigNumber;
    currentLiquidationThreshold: BigNumber;
    ltv: BigNumber;
    healthFactor: BigNumber;
}

/**
 * Aave Position Data
 */
export interface AavePosition {
    supplies: AaveAssetPosition[];
    borrows: AaveAssetPosition[];
    healthFactor: number;
    totalCollateralETH: BigNumber;
    totalDebtETH: BigNumber;
    availableBorrowsETH: BigNumber;
    currentLTV: number;
    liquidationThreshold: number;
    eModeCategory: number;
    eModeEnabled: boolean;
}

/**
 * Individual Asset Position
 */
export interface AaveAssetPosition {
    asset: string;
    symbol: string;
    balance: BigNumber;
    apy: number;
    isCollateral: boolean;
    interestRateMode?: InterestRateMode;
    stableRate?: number;
    variableRate?: number;
}

/**
 * Interest Rate Mode Enum
 */
export enum InterestRateMode {
    NONE = 0,
    STABLE = 1,
    VARIABLE = 2,
}

/**
 * Flash Loan Parameters
 */
export interface FlashLoanParams {
    assets: string[];
    amounts: BigNumber[];
    modes: number[];
    onBehalfOf: string;
    params: string;
    referralCode: number;
}

/**
 * Flash Loan Result
 */
export interface FlashLoanResult {
    transactionHash: string;
    totalFees: BigNumber;
    executionResult: any;
    gasUsed: BigNumber;
}

/**
 * eMode Category Data
 */
export interface eModeCategory {
    id: number;
    ltv: number;
    liquidationThreshold: number;
    liquidationBonus: number;
    priceSource: string;
    label: string;
}

/**
 * eMode Operation Result
 */
export interface eModeResult {
    transactionHash: string;
    categoryId: number;
    enabled: boolean;
    ltvImprovement: number;
    liquidationThresholdImprovement: number;
}

/**
 * Supply Operation Result
 */
export interface SupplyResult {
    transactionHash: string;
    asset: string;
    amount: BigNumber;
    aTokenBalance: BigNumber;
    apy: number;
    collateralEnabled: boolean;
}

/**
 * Borrow Operation Result
 */
export interface BorrowResult {
    transactionHash: string;
    asset: string;
    amount: BigNumber;
    interestRateMode: InterestRateMode;
    rate: number;
    healthFactor: BigNumber;
}

/**
 * Repay Operation Result
 */
export interface RepayResult {
    transactionHash: string;
    asset: string;
    amount: BigNumber;
    remainingDebt: BigNumber;
    healthFactor: BigNumber;
}

/**
 * Withdraw Operation Result
 */
export interface WithdrawResult {
    transactionHash: string;
    asset: string;
    amount: BigNumber;
    remainingSupply: BigNumber;
    healthFactor: BigNumber;
}

/**
 * Rate Switch Operation Result
 */
export interface RateSwitchResult {
    transactionHash: string;
    asset: string;
    newRateMode: InterestRateMode;
    newRate: number;
    previousRate: number;
    projectedSavings: BigNumber;
}

/**
 * Collateral Management Result
 */
export interface CollateralResult {
    transactionHash: string;
    asset: string;
    enabled: boolean;
    healthFactorBefore: BigNumber;
    healthFactorAfter: BigNumber;
    availableBorrowsChange: BigNumber;
}

/**
 * Reserve Data from Aave Protocol
 */
export interface ReserveData {
    underlyingAsset: string;
    symbol: string;
    decimals: number;
    liquidityRate: BigNumber;
    stableBorrowRate: BigNumber;
    variableBorrowRate: BigNumber;
    utilizationRate: BigNumber;
    totalLiquidity: BigNumber;
    availableLiquidity: BigNumber;
    totalStableDebt: BigNumber;
    totalVariableDebt: BigNumber;
    liquidityIndex: BigNumber;
    variableBorrowIndex: BigNumber;
    lastUpdateTimestamp: number;
    usageAsCollateralEnabled: boolean;
    ltv: number;
    liquidationThreshold: number;
    liquidationBonus: number;
    reserveFactor: number;
    aTokenAddress: string;
    stableDebtTokenAddress: string;
    variableDebtTokenAddress: string;
}

/**
 * Aave Plugin Configuration
 */
export interface AaveConfig {
    network: 'base' | 'base-sepolia';
    rpcUrl: string;
    aavePoolAddress: string;
    aaveDataProviderAddress: string;
    healthFactorThreshold: number;
    maxGasPrice: BigNumber;
    retryAttempts: number;
    monitoringInterval: number;
    flashLoanFeeThreshold: number;
}

/**
 * Aave Error Response
 */
export interface AaveErrorResponse {
    code: string;
    message: string;
    details?: any;
    suggestions?: string[];
    healthFactorImpact?: number;
    alternativeActions?: string[];
}

/**
 * Transaction Parameters
 */
export interface TransactionParams {
    gasLimit?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
}

/**
 * Service Interfaces
 */
export interface AaveService extends Service {
    // Service lifecycle
    initialize(runtime: IAgentRuntime): Promise<void>;
    
    // Core lending operations
    supply(asset: string, amount: BigNumber, onBehalfOf: string, referralCode: number): Promise<SupplyResult>;
    borrow(asset: string, amount: BigNumber, interestRateMode: InterestRateMode, referralCode: number): Promise<BorrowResult>;
    repay(asset: string, amount: BigNumber, interestRateMode: InterestRateMode): Promise<RepayResult>;
    withdraw(asset: string, amount: BigNumber, to: string): Promise<WithdrawResult>;
    
    // Advanced operations
    swapBorrowRateMode(asset: string, interestRateMode: InterestRateMode): Promise<RateSwitchResult>;
    setUserUseReserveAsCollateral(asset: string, useAsCollateral: boolean): Promise<CollateralResult>;
    setUserEMode(categoryId: number): Promise<eModeResult>;
    flashLoan(receiverAddress: string, assets: string[], amounts: BigNumber[], modes: number[], params: string): Promise<FlashLoanResult>;
    
    // Data retrieval
    getUserAccountData(user: string): Promise<UserAccountData>;
    getReserveData(asset: string): Promise<ReserveData>;
    getUserPosition(user: string): Promise<AavePosition>;
    getEModeCategories(): Promise<eModeCategory[]>;
    
    // State management
    getCachedAccountData(): UserAccountData | null;
    updateHealthFactorCache(): Promise<void>;
}

/**
 * Wallet Service Interface
 */
export interface WalletService extends Service {
    // Service lifecycle
    initialize(runtime: IAgentRuntime): Promise<void>;
    
    // Wallet operations
    connect(): Promise<void>;
    getAddress(): Promise<string>;
    signTransaction(tx: any): Promise<any>;
    getBalance(token?: string): Promise<BigNumber>;
    
    // Token operations
    approveToken(token: string, spender: string, amount: BigNumber): Promise<string>;
    waitForTransaction(hash: string): Promise<any>;
}

/**
 * Provider Interfaces
 */
export interface PositionContextProvider extends Provider {
    get(runtime: IAgentRuntime, message: Memory): Promise<string>;
}

export interface HealthFactorProvider extends Provider {
    get(runtime: IAgentRuntime, message: Memory): Promise<string>;
}

/**
 * Evaluator Interfaces
 */
export interface EfficiencyModeEvaluator extends Evaluator {
    evaluate(runtime: IAgentRuntime, message: Memory): Promise<number>;
}

export interface InterestOptimizationEvaluator extends Evaluator {
    evaluate(runtime: IAgentRuntime, message: Memory): Promise<number>;
}

/**
 * Action Parameter Interfaces
 */
export interface SupplyParams {
    asset: string;
    amount: string;
    enableCollateral?: boolean;
}

export interface BorrowParams {
    asset: string;
    amount: string;
    rateMode: 'stable' | 'variable';
}

export interface RepayParams {
    asset: string;
    amount: string;
    rateMode: 'stable' | 'variable';
}

export interface WithdrawParams {
    asset: string;
    amount: string;
}

export interface RateSwitchParams {
    asset: string;
    targetRateMode: 'stable' | 'variable';
}

export interface CollateralManagementParams {
    asset: string;
    enable: boolean;
}

export interface eModeParams {
    categoryId: number;
    enable: boolean;
}

export interface FlashLoanActionParams {
    assets: string[];
    amounts: string[];
    receiverAddress?: string;
    params?: string;
}

/**
 * Health Factor Status
 */
export enum HealthFactorStatus {
    CRITICAL = 'CRITICAL', // < 1.1
    RISKY = 'RISKY',       // 1.1 - 1.5
    MODERATE = 'MODERATE', // 1.5 - 2.0
    SAFE = 'SAFE',         // 2.0 - 3.0
    VERY_SAFE = 'VERY_SAFE' // > 3.0
}

/**
 * Utility Types
 */
export interface TokenInfo {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
}

export interface GasEstimate {
    gasLimit: bigint;
    gasPrice: bigint;
    totalCost: bigint;
}

/**
 * Market Data
 */
export interface MarketData {
    totalValueLocked: BigNumber;
    totalBorrowed: BigNumber;
    averageSupplyAPY: number;
    averageBorrowAPY: number;
    utilizationRate: number;
}

/**
 * Notification Types
 */
export interface HealthFactorAlert {
    type: 'health_factor_warning' | 'liquidation_risk';
    currentHealthFactor: number;
    threshold: number;
    suggestedActions: string[];
    urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface RateOptimizationOpportunity {
    asset: string;
    currentRateMode: InterestRateMode;
    currentRate: number;
    suggestedRateMode: InterestRateMode;
    suggestedRate: number;
    potentialSavings: BigNumber;
    recommendation: string;
}

/**
 * Core Plugin Structure
 */
export interface AavePlugin extends Plugin {
    name: string;
    description: string;
    actions: Action[];
    services: Service[];
    providers: Provider[];
    evaluators: Evaluator[];
}