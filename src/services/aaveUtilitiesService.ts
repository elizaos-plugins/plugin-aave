import { IAgentRuntime, ServiceType } from '@elizaos/core';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  Address,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

import {
  Pool,
  PoolBundle,
  UiPoolDataProvider,
  UiIncentiveDataProvider,
  ChainId,
  ERC20Service,
  ERC20_2612Service,
  InterestRate,
} from '@aave/contract-helpers';

import { AaveV3Base, AaveV3BaseSepolia } from '@bgd-labs/aave-address-book';

import {
  formatReserves,
  formatUserSummary,
  formatUserSummaryAndIncentives,
  formatReservesAndIncentives,
  calculateHealthFactorFromBalancesBigUnits,
  FormatReserveUSDResponse,
  FormatUserSummaryResponse,
} from '@aave/math-utils';

interface AaveMarketData {
  reserves: any;
  userReserves: any;
  reserveIncentives: any[];
  userIncentives: any;
  formattedReserves: FormatReserveUSDResponse[];
  userSummary: FormatUserSummaryResponse;
}

interface PermitSignatureData {
  types: any;
  domain: any;
  message: any;
  primaryType: string;
  deadline: number;
}

interface TransactionBundle {
  txData: any;
  gasEstimate: bigint;
  description: string;
}

export class AaveUtilitiesService {
  static readonly serviceType: ServiceType = ServiceType.AGENT;

  private runtime: IAgentRuntime;
  private publicClient: any;
  private walletClient: any;
  private account: any;
  private userAddress: Address | null = null;

  // Contract helpers
  private poolBundle: PoolBundle | null = null;
  private poolDataProvider: UiPoolDataProvider | null = null;
  private incentiveDataProvider: UiIncentiveDataProvider | null = null;
  private erc20Service: ERC20Service | null = null;
  private erc20PermitService: ERC20_2612Service | null = null;

  // Configuration
  private config: {
    network: 'base' | 'base-sepolia';
    rpcUrl: string;
    chainId: number;
    addresses: any;
  };

  // Data caching
  private marketDataCache: AaveMarketData | null = null;
  private lastCacheUpdate: number = 0;
  private cacheValidityPeriod: number = 30000; // 30 seconds
  private healthFactorCache: number = 0;
  private healthFactorCacheTime: number = 0;

  constructor() {
    this.config = {
      network: 'base',
      rpcUrl: '',
      chainId: 8453,
      addresses: AaveV3Base,
    };
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // Load configuration
    const network = runtime.getSetting('AAVE_NETWORK') || 'base';
    const rpcUrl = runtime.getSetting('BASE_RPC_URL');
    const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');

    if (!rpcUrl) {
      throw new Error('BASE_RPC_URL is required for Aave Utilities Service');
    }

    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY is required for Aave Utilities Service');
    }

    // Set up network configuration
    const chain = network === 'base-sepolia' ? baseSepolia : base;
    const addresses = network === 'base-sepolia' ? AaveV3BaseSepolia : AaveV3Base;

    this.config = {
      network: network as 'base' | 'base-sepolia',
      rpcUrl,
      chainId: chain.id,
      addresses,
    };

    // Initialize blockchain clients
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.userAddress = this.account.address;

    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    });

    // Initialize Aave contract helpers
    await this.initializeContractHelpers();

    console.log(`AaveUtilitiesService initialized for ${network} network`);
  }

  private async initializeContractHelpers(): Promise<void> {
    const { addresses } = this.config;

    // Initialize Pool Bundle for transaction building
    this.poolBundle = new PoolBundle(this.publicClient, {
      POOL: addresses.POOL,
      WETH_GATEWAY: addresses.WETH_GATEWAY,
    });

    // Initialize data providers
    this.poolDataProvider = new UiPoolDataProvider({
      uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
      provider: this.publicClient,
      chainId: this.config.chainId as ChainId,
    });

    this.incentiveDataProvider = new UiIncentiveDataProvider({
      uiIncentiveDataProviderAddress: addresses.UI_INCENTIVE_DATA_PROVIDER,
      provider: this.publicClient,
      chainId: this.config.chainId as ChainId,
    });

    // Initialize ERC20 services
    this.erc20Service = new ERC20Service(this.publicClient);
    this.erc20PermitService = new ERC20_2612Service(this.publicClient);
  }

  // ============================================================================
  // DATA FETCHING AND FORMATTING
  // ============================================================================

  async getMarketData(user?: string): Promise<AaveMarketData> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.marketDataCache && now - this.lastCacheUpdate < this.cacheValidityPeriod) {
      return this.marketDataCache;
    }

    if (!this.poolDataProvider || !this.incentiveDataProvider) {
      throw new Error('Contract helpers not initialized');
    }

    try {
      const userToFetch = user || this.userAddress;
      if (!userToFetch) {
        throw new Error('No user address provided or available');
      }

      // Fetch all required data
      const [reserves, userReserves, reserveIncentives, userIncentives] = await Promise.all([
        this.poolDataProvider.getReservesHumanized({
          lendingPoolAddressProvider: this.config.addresses.POOL_ADDRESSES_PROVIDER,
        }),
        this.poolDataProvider.getUserReservesHumanized({
          lendingPoolAddressProvider: this.config.addresses.POOL_ADDRESSES_PROVIDER,
          user: userToFetch,
        }),
        this.incentiveDataProvider.getReservesIncentivesDataHumanized({
          lendingPoolAddressProvider: this.config.addresses.POOL_ADDRESSES_PROVIDER,
        }),
        this.incentiveDataProvider.getUserReservesIncentivesDataHumanized({
          lendingPoolAddressProvider: this.config.addresses.POOL_ADDRESSES_PROVIDER,
          user: userToFetch,
        }),
      ]);

      // Format data using Aave math utils
      const currentTimestamp = dayjs().unix();
      const reservesArray = reserves.reservesData;
      const baseCurrencyData = reserves.baseCurrencyData;
      const userReservesArray = userReserves.userReserves;
      const userEModeCategoryId = userReserves.userEmodeCategoryId;

      // Format reserves with incentives
      const formattedReserves = formatReservesAndIncentives({
        reserves: reservesArray,
        currentTimestamp,
        marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
        marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        reserveIncentives,
      });

      // Format user summary with incentives
      const userSummary = formatUserSummaryAndIncentives({
        currentTimestamp,
        marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
        userReserves: userReservesArray,
        formattedReserves,
        userEmodeCategoryId: userEModeCategoryId,
        reserveIncentives,
        userIncentives,
      });

      // Cache the formatted data
      this.marketDataCache = {
        reserves,
        userReserves,
        reserveIncentives,
        userIncentives,
        formattedReserves,
        userSummary,
      };
      this.lastCacheUpdate = now;

      return this.marketDataCache;
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      throw error;
    }
  }

  async getReserveAnalytics(asset: string): Promise<{
    reserve: FormatReserveUSDResponse;
    utilization: number;
    totalLiquidity: BigNumber;
    totalBorrowed: BigNumber;
    availableLiquidity: BigNumber;
    incentiveAPR: number;
  }> {
    const marketData = await this.getMarketData();
    const reserve = marketData.formattedReserves.find(
      (r) =>
        r.underlyingAsset.toLowerCase() === asset.toLowerCase() ||
        r.symbol.toLowerCase() === asset.toLowerCase()
    );

    if (!reserve) {
      throw new Error(`Reserve not found for asset ${asset}`);
    }

    // Calculate analytics
    const totalLiquidity = new BigNumber(reserve.totalLiquidity);
    const totalBorrowed = new BigNumber(reserve.totalDebt);
    const availableLiquidity = new BigNumber(reserve.availableLiquidity);
    const utilization = totalLiquidity.gt(0)
      ? totalBorrowed.div(totalLiquidity).toNumber() * 100
      : 0;

    // Calculate total incentive APR
    const supplyIncentives = reserve.aIncentivesData || [];
    const borrowIncentives = reserve.vIncentivesData || [];
    const incentiveAPR = [
      ...supplyIncentives.map((i: any) => Number(i.incentiveAPR) || 0),
      ...borrowIncentives.map((i: any) => Number(i.incentiveAPR) || 0),
    ].reduce((sum, apr) => sum + apr, 0);

    return {
      reserve,
      utilization,
      totalLiquidity,
      totalBorrowed,
      availableLiquidity,
      incentiveAPR,
    };
  }

  async getUserAnalytics(user?: string): Promise<{
    summary: FormatUserSummaryResponse;
    healthFactorStatus: string;
    liquidationRisk: number;
    netAPY: number;
    totalIncentives: BigNumber;
    borrowCapacity: BigNumber;
    leverageRatio: number;
  }> {
    const marketData = await this.getMarketData(user);
    const { userSummary } = marketData;

    // Health factor analysis
    const healthFactor = Number(userSummary.healthFactor);
    const healthFactorStatus = this.getHealthFactorStatus(healthFactor);

    // Liquidation risk (percentage until liquidation)
    const liquidationRisk =
      healthFactor > 1 ? Math.max(0, ((healthFactor - 1) / healthFactor) * 100) : 100;

    // Calculate net APY (weighted supply APY - weighted borrow APY)
    const totalSupplyValue = new BigNumber(userSummary.totalLiquidityUSD);
    const totalBorrowValue = new BigNumber(userSummary.totalBorrowsUSD);
    const netAPY = this.calculateNetAPY(userSummary.userReservesData);

    // Total claimable incentives
    const totalIncentives = new BigNumber(userSummary.totalClaimableUSD || '0');

    // Available borrowing capacity
    const borrowCapacity = new BigNumber(userSummary.availableBorrowsUSD);

    // Leverage ratio (total position value / equity)
    const equity = totalSupplyValue.minus(totalBorrowValue);
    const leverageRatio = equity.gt(0) ? totalSupplyValue.div(equity).toNumber() : 1;

    return {
      summary: userSummary,
      healthFactorStatus,
      liquidationRisk,
      netAPY,
      totalIncentives,
      borrowCapacity,
      leverageRatio,
    };
  }

  // ============================================================================
  // TRANSACTION BUILDING
  // ============================================================================

  async buildSupplyTransaction(
    user: string,
    reserve: string,
    amount: string,
    onBehalfOf?: string
  ): Promise<TransactionBundle> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const txData = await this.poolBundle.supplyTxBuilder.generateTxData({
        user,
        reserve,
        amount,
        onBehalfOf: onBehalfOf || user,
      });

      const gasEstimate = await this.estimateGas(txData);

      return {
        txData,
        gasEstimate,
        description: `Supply ${amount} of ${reserve}`,
      };
    } catch (error) {
      throw new Error(`Failed to build supply transaction: ${error}`);
    }
  }

  async buildSupplyWithPermitTransaction(
    user: string,
    reserve: string,
    amount: string,
    deadline: number,
    signature: string,
    onBehalfOf?: string
  ): Promise<TransactionBundle> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const txData = await this.poolBundle.supplyTxBuilder.generateTxData({
        user,
        reserve,
        amount,
        onBehalfOf: onBehalfOf || user,
        useOptimizedPath: true, // Use permit path
        deadline,
        signature,
      });

      const gasEstimate = await this.estimateGas(txData);

      return {
        txData,
        gasEstimate,
        description: `Supply ${amount} of ${reserve} with permit`,
      };
    } catch (error) {
      throw new Error(`Failed to build supply with permit transaction: ${error}`);
    }
  }

  async buildBorrowTransaction(
    user: string,
    reserve: string,
    amount: string,
    interestRateMode: InterestRate,
    onBehalfOf?: string
  ): Promise<TransactionBundle> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const txData = await this.poolBundle.borrowTxBuilder.generateTxData({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf: onBehalfOf || user,
      });

      const gasEstimate = await this.estimateGas(txData);

      return {
        txData,
        gasEstimate,
        description: `Borrow ${amount} of ${reserve} at ${interestRateMode === InterestRate.Stable ? 'stable' : 'variable'} rate`,
      };
    } catch (error) {
      throw new Error(`Failed to build borrow transaction: ${error}`);
    }
  }

  async buildRepayTransaction(
    user: string,
    reserve: string,
    amount: string,
    interestRateMode: InterestRate,
    onBehalfOf?: string
  ): Promise<TransactionBundle> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const txData = await this.poolBundle.repayTxBuilder.generateTxData({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf: onBehalfOf || user,
      });

      const gasEstimate = await this.estimateGas(txData);

      return {
        txData,
        gasEstimate,
        description: `Repay ${amount === '-1' ? 'all' : amount} of ${reserve}`,
      };
    } catch (error) {
      throw new Error(`Failed to build repay transaction: ${error}`);
    }
  }

  async buildWithdrawTransaction(
    user: string,
    reserve: string,
    amount: string,
    onBehalfOf?: string
  ): Promise<TransactionBundle> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const txData = await this.poolBundle.withdrawTxBuilder.generateTxData({
        user,
        reserve,
        amount,
        onBehalfOf: onBehalfOf || user,
      });

      const gasEstimate = await this.estimateGas(txData);

      return {
        txData,
        gasEstimate,
        description: `Withdraw ${amount === '-1' ? 'all' : amount} of ${reserve}`,
      };
    } catch (error) {
      throw new Error(`Failed to build withdraw transaction: ${error}`);
    }
  }

  // ============================================================================
  // PERMIT SIGNATURE HANDLING
  // ============================================================================

  async generatePermitSignatureRequest(
    user: string,
    token: string,
    amount: string
  ): Promise<PermitSignatureData> {
    if (!this.erc20Service || !this.erc20PermitService) {
      throw new Error('ERC20 services not initialized');
    }

    try {
      const spender = this.config.addresses.POOL;

      // Get token data for EIP712 domain
      const { name } = await this.erc20Service.getTokenData(token);
      const chainId = this.config.chainId;

      // Get current nonce
      const nonce = await this.erc20PermitService.getNonce({
        token,
        owner: user,
      });

      // Set deadline (1 hour from now)
      const deadline = Math.floor(Date.now() / 1000 + 3600);

      // Create EIP712 typed data
      const domain = {
        name,
        version: '1',
        chainId,
        verifyingContract: token,
      };

      const types = {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const message = {
        owner: user,
        spender,
        value: amount,
        nonce,
        deadline,
      };

      return {
        types,
        domain,
        message,
        primaryType: 'Permit',
        deadline,
      };
    } catch (error) {
      throw new Error(`Failed to generate permit signature request: ${error}`);
    }
  }

  async getApprovedAmount(user: string, token: string): Promise<BigNumber> {
    if (!this.poolBundle) {
      throw new Error('Pool bundle not initialized');
    }

    try {
      const approvedAmount = await this.poolBundle.supplyTxBuilder.getApprovedAmount({
        user,
        token,
      });

      return new BigNumber(approvedAmount.toString());
    } catch (error) {
      throw new Error(`Failed to get approved amount: ${error}`);
    }
  }

  // ============================================================================
  // CALCULATIONS AND ANALYTICS
  // ============================================================================

  async calculateHealthFactor(
    totalCollateralETH: string,
    totalBorrowsETH: string,
    currentLiquidationThreshold: string
  ): Promise<string> {
    return calculateHealthFactorFromBalancesBigUnits(
      totalCollateralETH,
      totalBorrowsETH,
      currentLiquidationThreshold
    );
  }

  calculateLiquidationPrice(
    collateralAmount: BigNumber,
    borrowAmount: BigNumber,
    collateralPrice: BigNumber,
    liquidationThreshold: number
  ): BigNumber {
    if (collateralAmount.eq(0) || liquidationThreshold === 0) {
      return new BigNumber(0);
    }

    // Liquidation occurs when: (collateral * price * threshold) = debt
    // So liquidation price = debt / (collateral * threshold)
    return borrowAmount.div(collateralAmount.times(liquidationThreshold / 100));
  }

  calculateMaxBorrowAmount(
    collateralValue: BigNumber,
    currentDebt: BigNumber,
    ltv: number,
    assetPrice: BigNumber
  ): BigNumber {
    const maxTotalDebt = collateralValue.times(ltv / 100);
    const remainingCapacity = maxTotalDebt.minus(currentDebt);
    return BigNumber.max(remainingCapacity.div(assetPrice), new BigNumber(0));
  }

  calculateYieldFarming(
    supplyAPY: number,
    borrowAPY: number,
    supplyIncentiveAPR: number,
    borrowIncentiveAPR: number,
    leverageRatio: number
  ): {
    netAPY: number;
    totalSupplyYield: number;
    totalBorrowCost: number;
    leveragedYield: number;
  } {
    const totalSupplyYield = supplyAPY + supplyIncentiveAPR;
    const totalBorrowCost = borrowAPY - borrowIncentiveAPR;
    const netAPY = totalSupplyYield - totalBorrowCost;
    const leveragedYield = totalSupplyYield * leverageRatio - totalBorrowCost * (leverageRatio - 1);

    return {
      netAPY,
      totalSupplyYield,
      totalBorrowCost,
      leveragedYield,
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async estimateGas(txData: any): Promise<bigint> {
    try {
      return await this.publicClient.estimateGas({
        ...txData,
        account: this.account.address,
      });
    } catch (error) {
      console.error('Gas estimation failed:', error);
      return BigInt(300000); // Default fallback
    }
  }

  private getHealthFactorStatus(healthFactor: number): string {
    if (healthFactor < 1) return 'LIQUIDATABLE';
    if (healthFactor < 1.05) return 'CRITICAL';
    if (healthFactor < 1.2) return 'VERY_RISKY';
    if (healthFactor < 1.5) return 'RISKY';
    if (healthFactor < 2) return 'MODERATE';
    if (healthFactor < 3) return 'SAFE';
    return 'VERY_SAFE';
  }

  private calculateNetAPY(userReserves: any[]): number {
    let weightedSupplyAPY = 0;
    let weightedBorrowAPY = 0;
    let totalSupplyValue = 0;
    let totalBorrowValue = 0;

    userReserves.forEach((reserve) => {
      const supplyBalance = Number(reserve.underlyingBalance);
      const borrowBalance = Number(reserve.totalBorrows);
      const supplyValueUSD = Number(reserve.underlyingBalanceUSD);
      const borrowValueUSD = Number(reserve.totalBorrowsUSD);

      if (supplyBalance > 0) {
        // Include both base APY and incentive APR
        const baseSupplyAPY = Number(reserve.reserve?.supplyAPY || 0);
        const incentiveAPR = this.calculateReserveIncentiveAPR(reserve, 'supply');
        const totalSupplyAPY = baseSupplyAPY + incentiveAPR;

        weightedSupplyAPY += totalSupplyAPY * supplyValueUSD;
        totalSupplyValue += supplyValueUSD;
      }

      if (borrowBalance > 0) {
        // Borrow cost is positive, incentives reduce the cost
        const baseBorrowAPY = Number(reserve.reserve?.variableBorrowAPY || 0);
        const incentiveAPR = this.calculateReserveIncentiveAPR(reserve, 'borrow');
        const netBorrowCost = baseBorrowAPY - incentiveAPR; // Incentives reduce borrow cost

        weightedBorrowAPY += netBorrowCost * borrowValueUSD;
        totalBorrowValue += borrowValueUSD;
      }
    });

    const avgSupplyAPY = totalSupplyValue > 0 ? weightedSupplyAPY / totalSupplyValue : 0;
    const avgBorrowAPY = totalBorrowValue > 0 ? weightedBorrowAPY / totalBorrowValue : 0;

    return avgSupplyAPY - avgBorrowAPY;
  }

  private calculateReserveIncentiveAPR(userReserve: any, type: 'supply' | 'borrow'): number {
    const reserve = userReserve.reserve;
    if (!reserve) return 0;

    const incentives =
      type === 'supply' ? reserve.aIncentivesData || [] : reserve.vIncentivesData || [];

    return incentives.reduce((total: number, incentive: any) => {
      return total + (Number(incentive.incentiveAPR) || 0);
    }, 0);
  }

  async clearCache(): Promise<void> {
    this.marketDataCache = null;
    this.lastCacheUpdate = 0;
    this.healthFactorCache = 0;
    this.healthFactorCacheTime = 0;
  }

  async refreshMarketData(): Promise<AaveMarketData> {
    this.marketDataCache = null;
    this.lastCacheUpdate = 0;
    return this.getMarketData();
  }

  // Health monitoring
  async monitorHealthFactor(user?: string, callback?: (hf: number) => void): Promise<void> {
    const userToMonitor = user || this.userAddress;
    if (!userToMonitor) return;

    try {
      const analytics = await this.getUserAnalytics(userToMonitor);
      const healthFactor = Number(analytics.summary.healthFactor);

      // Cache the health factor
      this.healthFactorCache = healthFactor;
      this.healthFactorCacheTime = Date.now();

      if (callback) {
        callback(healthFactor);
      }

      // Log warnings for low health factors
      if (healthFactor < 1.5 && healthFactor > 0) {
        console.warn(`⚠️ Health Factor Warning: ${healthFactor.toFixed(3)} - Risk of liquidation!`);
      }
    } catch (error) {
      console.error('Health factor monitoring error:', error);
    }
  }

  getCachedHealthFactor(): { value: number; timestamp: number } | null {
    if (this.healthFactorCacheTime === 0) return null;

    return {
      value: this.healthFactorCache,
      timestamp: this.healthFactorCacheTime,
    };
  }

  // Validation helpers
  isValidAmount(amount: string): boolean {
    try {
      const bn = new BigNumber(amount);
      return bn.isFinite() && bn.gt(0);
    } catch {
      return false;
    }
  }

  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // Market insights
  async getMarketInsights(): Promise<{
    totalValueLocked: BigNumber;
    totalBorrowed: BigNumber;
    averageSupplyAPY: number;
    averageBorrowAPY: number;
    topReservesByLiquidity: Array<{ symbol: string; liquidity: BigNumber; apy: number }>;
    topReservesByAPY: Array<{ symbol: string; apy: number; liquidity: BigNumber }>;
  }> {
    const marketData = await this.getMarketData();

    let totalValueLocked = new BigNumber(0);
    let totalBorrowed = new BigNumber(0);
    let totalSupplyWeighted = 0;
    let totalBorrowWeighted = 0;
    let totalSupplyValue = 0;
    let totalBorrowValue = 0;

    const reserves = marketData.formattedReserves.map((reserve) => {
      const liquidity = new BigNumber(reserve.totalLiquidity);
      const borrowed = new BigNumber(reserve.totalDebt);
      const supplyAPY = Number(reserve.supplyAPY) * 100;
      const borrowAPY = Number(reserve.variableBorrowAPY) * 100;
      const liquidityUSD = liquidity.times(reserve.priceInUSD);
      const borrowedUSD = borrowed.times(reserve.priceInUSD);

      totalValueLocked = totalValueLocked.plus(liquidityUSD);
      totalBorrowed = totalBorrowed.plus(borrowedUSD);

      totalSupplyWeighted += supplyAPY * liquidityUSD.toNumber();
      totalBorrowWeighted += borrowAPY * borrowedUSD.toNumber();
      totalSupplyValue += liquidityUSD.toNumber();
      totalBorrowValue += borrowedUSD.toNumber();

      return {
        symbol: reserve.symbol,
        liquidity: liquidityUSD,
        borrowed: borrowedUSD,
        apy: supplyAPY,
        borrowAPY,
      };
    });

    const averageSupplyAPY = totalSupplyValue > 0 ? totalSupplyWeighted / totalSupplyValue : 0;
    const averageBorrowAPY = totalBorrowValue > 0 ? totalBorrowWeighted / totalBorrowValue : 0;

    // Sort reserves by liquidity and APY
    const topReservesByLiquidity = reserves
      .sort((a, b) => b.liquidity.comparedTo(a.liquidity))
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        liquidity: r.liquidity,
        apy: r.apy,
      }));

    const topReservesByAPY = reserves
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        apy: r.apy,
        liquidity: r.liquidity,
      }));

    return {
      totalValueLocked,
      totalBorrowed,
      averageSupplyAPY,
      averageBorrowAPY,
      topReservesByLiquidity,
      topReservesByAPY,
    };
  }

  // Risk analysis
  async analyzePositionRisk(user?: string): Promise<{
    riskScore: number; // 0-100, where 100 is highest risk
    riskFactors: string[];
    recommendations: string[];
    liquidationBuffer: number; // Days until liquidation at current rates
    diversificationScore: number;
  }> {
    const userToAnalyze = user || this.userAddress;
    if (!userToAnalyze) {
      throw new Error('No user address provided');
    }

    const analytics = await this.getUserAnalytics(userToAnalyze);
    const { summary } = analytics;

    let riskScore = 0;
    const riskFactors: string[] = [];
    const recommendations: string[] = [];

    // Health factor risk (40% weight)
    const healthFactor = Number(summary.healthFactor);
    if (healthFactor < 1.1) {
      riskScore += 40;
      riskFactors.push('Critical health factor - liquidation imminent');
      recommendations.push('Add collateral or repay debt immediately');
    } else if (healthFactor < 1.5) {
      riskScore += 30;
      riskFactors.push('Low health factor - high liquidation risk');
      recommendations.push('Improve health factor by adding collateral');
    } else if (healthFactor < 2) {
      riskScore += 15;
      riskFactors.push('Moderate health factor risk');
    }

    // Leverage risk (25% weight)
    const leverageRatio = analytics.leverageRatio;
    if (leverageRatio > 5) {
      riskScore += 25;
      riskFactors.push('Very high leverage');
      recommendations.push('Consider reducing leverage');
    } else if (leverageRatio > 3) {
      riskScore += 15;
      riskFactors.push('High leverage');
    } else if (leverageRatio > 2) {
      riskScore += 8;
      riskFactors.push('Moderate leverage');
    }

    // Diversification risk (20% weight)
    const diversificationScore = this.calculateDiversificationScore(summary.userReservesData);
    if (diversificationScore < 0.3) {
      riskScore += 20;
      riskFactors.push('Poor diversification');
      recommendations.push('Diversify across more assets');
    } else if (diversificationScore < 0.6) {
      riskScore += 10;
      riskFactors.push('Limited diversification');
    }

    // Interest rate risk (15% weight)
    const netAPY = analytics.netAPY;
    if (netAPY < -10) {
      riskScore += 15;
      riskFactors.push('Negative yield - high borrowing costs');
      recommendations.push('Consider switching to stable rates or reducing borrows');
    } else if (netAPY < -5) {
      riskScore += 8;
      riskFactors.push('Low or negative yield');
    }

    // Calculate liquidation buffer
    const liquidationBuffer = this.calculateLiquidationBuffer(healthFactor, netAPY);

    return {
      riskScore: Math.min(riskScore, 100),
      riskFactors,
      recommendations,
      liquidationBuffer,
      diversificationScore,
    };
  }

  private calculateDiversificationScore(userReserves: any[]): number {
    if (userReserves.length === 0) return 0;

    const totalValue = userReserves.reduce((sum, reserve) => {
      return sum + Number(reserve.underlyingBalanceUSD || 0) + Number(reserve.totalBorrowsUSD || 0);
    }, 0);

    if (totalValue === 0) return 0;

    // Calculate Herfindahl-Hirschman Index (HHI) for diversification
    let hhi = 0;
    userReserves.forEach((reserve) => {
      const reserveValue =
        Number(reserve.underlyingBalanceUSD || 0) + Number(reserve.totalBorrowsUSD || 0);
      const marketShare = reserveValue / totalValue;
      hhi += marketShare * marketShare;
    });

    // Convert HHI to diversification score (1 - HHI, normalized)
    return Math.max(0, 1 - hhi);
  }

  private calculateLiquidationBuffer(healthFactor: number, netAPY: number): number {
    if (healthFactor >= 10) return Infinity; // Effectively no liquidation risk
    if (healthFactor <= 1) return 0; // Already at liquidation

    // Estimate days until liquidation based on health factor decline rate
    // This is a simplified model - actual liquidation depends on price movements
    const healthFactorBuffer = healthFactor - 1;
    const dailyDeclineRate = Math.abs(netAPY) / 365 / 100; // Convert APY to daily rate

    if (dailyDeclineRate === 0) return Infinity;

    return healthFactorBuffer / dailyDeclineRate;
  }

  // Strategy recommendations
  async getStrategyRecommendations(user?: string): Promise<{
    leverageOpportunities: Array<{
      asset: string;
      action: string;
      expectedAPY: number;
      riskLevel: string;
      description: string;
    }>;
    yieldOptimizations: Array<{
      from: string;
      to: string;
      expectedGain: number;
      description: string;
    }>;
    riskReductions: Array<{
      action: string;
      impact: string;
      priority: 'high' | 'medium' | 'low';
      description: string;
    }>;
  }> {
    const marketData = await this.getMarketData(user);
    const analytics = await this.getUserAnalytics(user);
    const riskAnalysis = await this.analyzePositionRisk(user);

    const leverageOpportunities: any[] = [];
    const yieldOptimizations: any[] = [];
    const riskReductions: any[] = [];

    // Analyze leverage opportunities
    if (analytics.healthFactorStatus === 'SAFE' || analytics.healthFactorStatus === 'VERY_SAFE') {
      marketData.formattedReserves
        .filter((reserve) => Number(reserve.supplyAPY) > Number(reserve.variableBorrowAPY))
        .forEach((reserve) => {
          const netAPY = (Number(reserve.supplyAPY) - Number(reserve.variableBorrowAPY)) * 100;
          if (netAPY > 2) {
            // Only recommend if net APY > 2%
            leverageOpportunities.push({
              asset: reserve.symbol,
              action: `Borrow ${reserve.symbol} and supply to earn spread`,
              expectedAPY: netAPY,
              riskLevel: analytics.leverageRatio > 2 ? 'high' : 'medium',
              description: `Supply APY (${(Number(reserve.supplyAPY) * 100).toFixed(2)}%) exceeds borrow APY (${(Number(reserve.variableBorrowAPY) * 100).toFixed(2)}%)`,
            });
          }
        });
    }

    // Analyze yield optimizations
    analytics.summary.userReservesData.forEach((userReserve) => {
      if (Number(userReserve.underlyingBalance) > 0) {
        // Find better yield opportunities
        const currentAPY = Number(userReserve.reserve?.supplyAPY || 0) * 100;
        const betterReserves = marketData.formattedReserves
          .filter((r) => r.symbol !== userReserve.reserve?.symbol)
          .filter((r) => Number(r.supplyAPY) * 100 > currentAPY + 1) // At least 1% better
          .sort((a, b) => Number(b.supplyAPY) - Number(a.supplyAPY))
          .slice(0, 3);

        betterReserves.forEach((reserve) => {
          const gainAPY = Number(reserve.supplyAPY) * 100 - currentAPY;
          yieldOptimizations.push({
            from: userReserve.reserve?.symbol || 'unknown',
            to: reserve.symbol,
            expectedGain: gainAPY,
            description: `Switch from ${currentAPY.toFixed(2)}% to ${(Number(reserve.supplyAPY) * 100).toFixed(2)}% APY`,
          });
        });
      }
    });

    // Risk reduction recommendations
    if (riskAnalysis.riskScore > 70) {
      riskReductions.push({
        action: 'Reduce position size',
        impact: 'Significantly lower liquidation risk',
        priority: 'high' as const,
        description: 'Consider reducing leverage by repaying some debt',
      });
    }

    if (analytics.healthFactorStatus === 'RISKY' || analytics.healthFactorStatus === 'VERY_RISKY') {
      riskReductions.push({
        action: 'Add collateral',
        impact: 'Improve health factor',
        priority: 'high' as const,
        description: 'Supply additional assets to increase collateral ratio',
      });
    }

    if (riskAnalysis.diversificationScore < 0.5) {
      riskReductions.push({
        action: 'Diversify holdings',
        impact: 'Reduce concentration risk',
        priority: 'medium' as const,
        description: 'Spread positions across more assets',
      });
    }

    return {
      leverageOpportunities,
      yieldOptimizations,
      riskReductions,
    };
  }

  // Cleanup and shutdown
  async shutdown(): Promise<void> {
    await this.clearCache();
    console.log('AaveUtilitiesService shut down');
  }
}
