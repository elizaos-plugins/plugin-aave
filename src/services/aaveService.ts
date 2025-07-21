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
  UiPoolDataProvider,
  UiIncentiveDataProvider,
  ChainId,
  ERC20Service,
  ERC20_2612Service,
} from '@aave/contract-helpers';
import { AaveV3Base, AaveV3BaseSepolia } from '@bgd-labs/aave-address-book';
import {
  formatReserves,
  formatUserSummary,
  formatUserSummaryAndIncentives,
  formatReservesAndIncentives,
  FormatReserveUSDResponse,
  FormatUserSummaryResponse,
  calculateHealthFactorFromBalancesBigUnits,
} from '@aave/math-utils';
import { marketDataProviderContract } from '../utils/contracts';

import {
  AaveService as IAaveService,
  UserAccountData,
  AavePosition,
  ReserveData,
  SupplyResult,
  BorrowResult,
  RepayResult,
  WithdrawResult,
  RateSwitchResult,
  CollateralResult,
  eModeResult,
  FlashLoanResult,
  eModeCategory,
  InterestRateMode,
  AaveAssetPosition,
  AaveConfig,
} from '../types';

export class AaveService implements IAaveService {
  static readonly serviceType: ServiceType = ServiceType.AGENT;

  private runtime: IAgentRuntime;
  private pool: Pool | null = null;
  private publicClient: any;
  private walletClient: any;
  private account: any;
  private userAddress: Address | null = null;
  private cachedAccountData: UserAccountData | null = null;
  private lastHealthFactorUpdate: number = 0;
  private config: AaveConfig;
  private poolDataProvider: UiPoolDataProvider | null = null;
  private incentiveDataProvider: UiIncentiveDataProvider | null = null;
  private erc20Service: ERC20Service | null = null;
  private erc20PermitService: ERC20_2612Service | null = null;
  private reservesCache: FormatReserveUSDResponse[] = [];
  private reserveIncentivesCache: any[] = [];
  private lastDataUpdate: number = 0;
  private cacheUpdateInterval: number = 60000; // 1 minute

  constructor() {
    this.config = {
      network: 'base',
      rpcUrl: '',
      aavePoolAddress: '',
      aaveDataProviderAddress: '',
      healthFactorThreshold: 1.5,
      maxGasPrice: new BigNumber(50).times(1e9), // 50 gwei
      retryAttempts: 3,
      monitoringInterval: 60000, // 1 minute
      flashLoanFeeThreshold: 0.1, // 0.1%
    };
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // Load configuration from environment
    const network = runtime.getSetting('AAVE_NETWORK') || 'base';
    const rpcUrl = runtime.getSetting('BASE_RPC_URL');
    const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');

    if (!rpcUrl) {
      throw new Error('BASE_RPC_URL is required for Aave plugin');
    }

    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY is required for Aave plugin');
    }

    // Set up chain and addresses based on network
    const chain = network === 'base-sepolia' ? baseSepolia : base;
    const addresses = network === 'base-sepolia' ? AaveV3BaseSepolia : AaveV3Base;

    this.config = {
      ...this.config,
      network: network as 'base' | 'base-sepolia',
      rpcUrl,
      aavePoolAddress: addresses.POOL,
      aaveDataProviderAddress: addresses.AAVE_PROTOCOL_DATA_PROVIDER,
    };

    // Initialize clients
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

    // Initialize Aave contracts
    this.pool = new Pool(this.walletClient, {
      POOL: addresses.POOL,
      POOL_DATA_PROVIDER: addresses.POOL_DATA_PROVIDER,
      WETH_GATEWAY: addresses.WETH_GATEWAY,
    });

    // Initialize data providers
    this.poolDataProvider = new UiPoolDataProvider({
      uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
      provider: this.publicClient,
      chainId: chain.id as ChainId,
    });

    this.incentiveDataProvider = new UiIncentiveDataProvider({
      uiIncentiveDataProviderAddress: addresses.UI_INCENTIVE_DATA_PROVIDER,
      provider: this.publicClient,
      chainId: chain.id as ChainId,
    });

    // Initialize ERC20 services
    this.erc20Service = new ERC20Service(this.publicClient);
    this.erc20PermitService = new ERC20_2612Service(this.publicClient);

    // Start health factor monitoring
    this.startHealthFactorMonitoring();
  }

  private startHealthFactorMonitoring(): void {
    setInterval(async () => {
      try {
        await this.updateHealthFactorCache();

        if (this.cachedAccountData && this.cachedAccountData.healthFactor) {
          const hf = new BigNumber(this.cachedAccountData.healthFactor.toString()).dividedBy(1e18);

          if (hf.lt(this.config.healthFactorThreshold)) {
            console.warn(
              `⚠️ Health Factor Alert: ${hf.toFixed(2)} is below threshold ${this.config.healthFactorThreshold}`
            );
          }
        }
      } catch (error) {
        console.error('Health factor monitoring error:', error);
      }
    }, this.config.monitoringInterval);
  }

  async supply(
    asset: string,
    amount: BigNumber,
    onBehalfOf: string,
    referralCode: number = 0
  ): Promise<SupplyResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get asset details
      const reserveData = await this.getReserveData(asset);
      const decimals = reserveData.decimals;

      // Convert amount to proper decimals
      const amountInWei = parseUnits(amount.toString(), decimals);

      // Check if we need to approve the asset
      await this.ensureApproval(asset, this.config.aavePoolAddress, amountInWei);

      // Execute supply transaction
      const tx = await this.pool.supply({
        user: this.userAddress,
        reserve: asset as Address,
        amount: amountInWei.toString(),
        onBehalfOf: (onBehalfOf || this.userAddress) as Address,
        referralCode,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated balances
      const position = await this.getUserPosition(this.userAddress);
      const assetPosition = position.supplies.find(
        (s) => s.asset.toLowerCase() === asset.toLowerCase()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset,
        amount,
        aTokenBalance: assetPosition?.balance || new BigNumber(0),
        apy: assetPosition?.apy || 0,
        collateralEnabled: assetPosition?.isCollateral || false,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'supply');
    }
  }

  async borrow(
    asset: string,
    amount: BigNumber,
    interestRateMode: InterestRateMode,
    referralCode: number = 0
  ): Promise<BorrowResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Check health factor before borrowing
      const accountData = await this.getUserAccountData(this.userAddress);
      const currentHF = new BigNumber(accountData.healthFactor.toString()).dividedBy(1e18);

      if (currentHF.lt(this.config.healthFactorThreshold)) {
        throw new Error(`Health factor ${currentHF.toFixed(2)} is too low for borrowing`);
      }

      // Get asset details
      const reserveData = await this.getReserveData(asset);
      const decimals = reserveData.decimals;

      // Convert amount to proper decimals
      const amountInWei = parseUnits(amount.toString(), decimals);

      // Execute borrow transaction
      const tx = await this.pool.borrow({
        user: this.userAddress,
        reserve: asset as Address,
        amount: amountInWei.toString(),
        interestRateMode,
        referralCode,
        onBehalfOf: this.userAddress,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated account data
      const newAccountData = await this.getUserAccountData(this.userAddress);
      const position = await this.getUserPosition(this.userAddress);
      const borrowPosition = position.borrows.find(
        (b) => b.asset.toLowerCase() === asset.toLowerCase()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset,
        amount,
        interestRateMode,
        rate:
          interestRateMode === InterestRateMode.STABLE
            ? borrowPosition?.stableRate || 0
            : borrowPosition?.variableRate || 0,
        healthFactor: newAccountData.healthFactor,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'borrow');
    }
  }

  async repay(
    asset: string,
    amount: BigNumber,
    interestRateMode: InterestRateMode
  ): Promise<RepayResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get asset details
      const reserveData = await this.getReserveData(asset);
      const decimals = reserveData.decimals;

      // Convert amount to proper decimals (-1 means repay all)
      const amountInWei = amount.eq(-1)
        ? BigInt(2) ** BigInt(256) - BigInt(1) // max uint256 for repaying all
        : parseUnits(amount.toString(), decimals);

      // Check if we need to approve the asset
      await this.ensureApproval(asset, this.config.aavePoolAddress, amountInWei);

      // Execute repay transaction
      const tx = await this.pool.repay({
        user: this.userAddress,
        reserve: asset as Address,
        amount: amountInWei.toString(),
        interestRateMode,
        onBehalfOf: this.userAddress,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated position
      const accountData = await this.getUserAccountData(this.userAddress);
      const position = await this.getUserPosition(this.userAddress);
      const borrowPosition = position.borrows.find(
        (b) => b.asset.toLowerCase() === asset.toLowerCase()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset,
        amount,
        remainingDebt: borrowPosition?.balance || new BigNumber(0),
        healthFactor: accountData.healthFactor,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'repay');
    }
  }

  async withdraw(asset: string, amount: BigNumber, to: string): Promise<WithdrawResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get asset details
      const reserveData = await this.getReserveData(asset);
      const decimals = reserveData.decimals;

      // Convert amount to proper decimals (-1 means withdraw all)
      const amountInWei = amount.eq(-1)
        ? BigInt(2) ** BigInt(256) - BigInt(1) // max uint256 for withdrawing all
        : parseUnits(amount.toString(), decimals);

      // Execute withdraw transaction
      const tx = await this.pool.withdraw({
        user: this.userAddress,
        reserve: asset as Address,
        amount: amountInWei.toString(),
        to: (to || this.userAddress) as Address,
        aTokenAddress: reserveData.aTokenAddress as Address,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated position
      const accountData = await this.getUserAccountData(this.userAddress);
      const position = await this.getUserPosition(this.userAddress);
      const supplyPosition = position.supplies.find(
        (s) => s.asset.toLowerCase() === asset.toLowerCase()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset,
        amount,
        remainingSupply: supplyPosition?.balance || new BigNumber(0),
        healthFactor: accountData.healthFactor,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'withdraw');
    }
  }

  async swapBorrowRateMode(
    asset: string,
    interestRateMode: InterestRateMode
  ): Promise<RateSwitchResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get current borrow position
      const position = await this.getUserPosition(this.userAddress);
      const borrowPosition = position.borrows.find(
        (b) => b.asset.toLowerCase() === asset.toLowerCase()
      );

      if (!borrowPosition) {
        throw new Error(`No active borrow position for ${asset}`);
      }

      const currentMode = borrowPosition.interestRateMode;
      const previousRate =
        currentMode === InterestRateMode.STABLE
          ? borrowPosition.stableRate || 0
          : borrowPosition.variableRate || 0;

      // Execute rate switch
      const tx = await this.pool.swapBorrowRateMode({
        user: this.userAddress,
        reserve: asset as Address,
        interestRateMode,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated rates
      const updatedPosition = await this.getUserPosition(this.userAddress);
      const updatedBorrow = updatedPosition.borrows.find(
        (b) => b.asset.toLowerCase() === asset.toLowerCase()
      );

      const newRate =
        interestRateMode === InterestRateMode.STABLE
          ? updatedBorrow?.stableRate || 0
          : updatedBorrow?.variableRate || 0;

      // Calculate projected savings (annualized)
      const borrowAmount = borrowPosition.balance;
      const rateDiff = new BigNumber(previousRate).minus(newRate);
      const projectedSavings = borrowAmount.times(rateDiff).dividedBy(100);

      return {
        transactionHash: receipt.transactionHash,
        asset,
        newRateMode: interestRateMode,
        newRate,
        previousRate,
        projectedSavings,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'swapBorrowRateMode');
    }
  }

  async setUserUseReserveAsCollateral(
    asset: string,
    useAsCollateral: boolean
  ): Promise<CollateralResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get health factor before change
      const accountDataBefore = await this.getUserAccountData(this.userAddress);
      const healthFactorBefore = accountDataBefore.healthFactor;
      const availableBorrowsBefore = accountDataBefore.availableBorrowsETH;

      // Execute collateral change
      const tx = await this.pool.setUserUseReserveAsCollateral({
        user: this.userAddress,
        reserve: asset as Address,
        useAsCollateral,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get health factor after change
      const accountDataAfter = await this.getUserAccountData(this.userAddress);
      const healthFactorAfter = accountDataAfter.healthFactor;
      const availableBorrowsAfter = accountDataAfter.availableBorrowsETH;

      const availableBorrowsChange = new BigNumber(availableBorrowsAfter.toString()).minus(
        availableBorrowsBefore.toString()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset,
        enabled: useAsCollateral,
        healthFactorBefore,
        healthFactorAfter,
        availableBorrowsChange,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'setUserUseReserveAsCollateral');
    }
  }

  async setUserEMode(categoryId: number): Promise<eModeResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get current eMode status
      const currentPosition = await this.getUserPosition(this.userAddress);
      const currentCategory = currentPosition.eModeCategory;
      const currentLTV = currentPosition.currentLTV;
      const currentLiqThreshold = currentPosition.liquidationThreshold;

      // Execute eMode change
      const tx = await this.pool.setUserEMode({
        user: this.userAddress,
        categoryId,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated position
      const newPosition = await this.getUserPosition(this.userAddress);
      const newLTV = newPosition.currentLTV;
      const newLiqThreshold = newPosition.liquidationThreshold;

      const ltvImprovement = newLTV - currentLTV;
      const liquidationThresholdImprovement = newLiqThreshold - currentLiqThreshold;

      return {
        transactionHash: receipt.transactionHash,
        categoryId,
        enabled: categoryId !== 0,
        ltvImprovement,
        liquidationThresholdImprovement,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'setUserEMode');
    }
  }

  async flashLoan(
    receiverAddress: string,
    assets: string[],
    amounts: BigNumber[],
    modes: number[],
    params: string
  ): Promise<FlashLoanResult> {
    // Note: Flash loan implementation would require a custom receiver contract
    // This is a placeholder for the actual implementation
    throw new Error('Flash loan functionality requires a custom receiver contract implementation');
  }

  async getUserAccountData(user: string): Promise<UserAccountData> {
    if (!this.publicClient) {
      throw new Error('AaveService not initialized');
    }

    try {
      const protocolDataProvider = marketDataProviderContract(
        this.config.aaveDataProviderAddress,
        this.publicClient
      );

      const data = await protocolDataProvider.read.getUserAccountData([user as Address]);

      return {
        totalCollateralETH: BigInt(data[0]),
        totalDebtETH: BigInt(data[1]),
        availableBorrowsETH: BigInt(data[2]),
        currentLiquidationThreshold: BigInt(data[3]),
        ltv: BigInt(data[4]),
        healthFactor: BigInt(data[5]),
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'getUserAccountData');
    }
  }

  async getReserveData(asset: string): Promise<ReserveData> {
    if (!this.poolDataProvider) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Get reserves data
      const reserves = await this.poolDataProvider.getReservesHumanized({
        lendingPoolAddressProvider: this.config.aavePoolAddress,
      });

      const reserve = reserves.reservesData.find(
        (r) => r.underlyingAsset.toLowerCase() === asset.toLowerCase()
      );

      if (!reserve) {
        throw new Error(`Reserve not found for asset ${asset}`);
      }

      return {
        underlyingAsset: reserve.underlyingAsset,
        symbol: reserve.symbol,
        decimals: reserve.decimals,
        liquidityRate: new BigNumber(reserve.liquidityRate),
        stableBorrowRate: new BigNumber(reserve.stableBorrowRate),
        variableBorrowRate: new BigNumber(reserve.variableBorrowRate),
        utilizationRate: new BigNumber(reserve.borrowUsageRatio || 0),
        totalLiquidity: new BigNumber(reserve.totalScaledVariableDebt || 0),
        availableLiquidity: new BigNumber(reserve.availableLiquidity),
        totalStableDebt: new BigNumber(reserve.totalPrincipalStableDebt),
        totalVariableDebt: new BigNumber(reserve.totalScaledVariableDebt),
        liquidityIndex: new BigNumber(reserve.liquidityIndex),
        variableBorrowIndex: new BigNumber(reserve.variableBorrowIndex),
        lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
        usageAsCollateralEnabled: reserve.usageAsCollateralEnabled,
        ltv: Number(reserve.baseLTVasCollateral) / 10000,
        liquidationThreshold: Number(reserve.reserveLiquidationThreshold) / 10000,
        liquidationBonus: Number(reserve.reserveLiquidationBonus) / 10000 - 1,
        reserveFactor: Number(reserve.reserveFactor) / 10000,
        aTokenAddress: reserve.aTokenAddress,
        stableDebtTokenAddress: reserve.stableDebtTokenAddress,
        variableDebtTokenAddress: reserve.variableDebtTokenAddress,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'getReserveData');
    }
  }

  async getUserPosition(user: string): Promise<AavePosition> {
    if (!this.poolDataProvider || !this.incentiveDataProvider) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Check if we need to update cache
      const now = Date.now();
      if (now - this.lastDataUpdate > this.cacheUpdateInterval) {
        await this.updateReservesCache();
      }

      // Get user reserves and incentives data
      const [userReserves, reserveIncentives, userIncentives] = await Promise.all([
        this.poolDataProvider.getUserReservesHumanized({
          lendingPoolAddressProvider: this.config.aavePoolAddress,
          user,
        }),
        this.incentiveDataProvider.getReservesIncentivesDataHumanized({
          lendingPoolAddressProvider: this.config.aavePoolAddress,
        }),
        this.incentiveDataProvider.getUserReservesIncentivesDataHumanized({
          lendingPoolAddressProvider: this.config.aavePoolAddress,
          user,
        }),
      ]);

      const currentTimestamp = dayjs().unix();
      const userReservesArray = userReserves.userReserves;
      const userEModeCategoryId = userReserves.userEmodeCategoryId;

      // Use cached formatted reserves or format them if cache is empty
      const formattedReserves =
        this.reservesCache.length > 0 ? this.reservesCache : await this.getFormattedReserves();

      // Format user summary with incentives
      const userSummary = formatUserSummaryAndIncentives({
        currentTimestamp,
        marketReferencePriceInUsd: formattedReserves[0]?.priceInMarketReferenceCurrency || '1',
        marketReferenceCurrencyDecimals: 8, // Standard for ETH markets
        userReserves: userReservesArray,
        formattedReserves,
        userEmodeCategoryId: userEModeCategoryId,
        reserveIncentives,
        userIncentives,
      });

      // Build position data with incentives
      const supplies: AaveAssetPosition[] = [];
      const borrows: AaveAssetPosition[] = [];

      userSummary.userReservesData.forEach((userReserve) => {
        const reserve = formattedReserves.find(
          (r) => r.underlyingAsset.toLowerCase() === userReserve.underlyingAsset.toLowerCase()
        );

        if (!reserve) return;

        // Add supply position with incentive APR
        if (Number(userReserve.underlyingBalance) > 0) {
          const incentiveAPR = this.calculateIncentiveAPR(
            userReserve.underlyingAsset,
            reserveIncentives,
            'deposit'
          );
          const totalAPY = Number(reserve.supplyAPY) + incentiveAPR;

          supplies.push({
            asset: userReserve.underlyingAsset,
            symbol: reserve.symbol,
            balance: new BigNumber(userReserve.underlyingBalance),
            apy: totalAPY * 100,
            isCollateral: userReserve.usageAsCollateralEnabledOnUser,
            incentiveAPR: incentiveAPR * 100,
          });
        }

        // Add borrow position with incentive APR
        if (Number(userReserve.totalBorrows) > 0) {
          const incentiveAPR = this.calculateIncentiveAPR(
            userReserve.underlyingAsset,
            reserveIncentives,
            'borrow'
          );
          const netBorrowRate =
            Number(userReserve.stableBorrows) > 0
              ? Number(reserve.stableBorrowAPY) - incentiveAPR
              : Number(reserve.variableBorrowAPY) - incentiveAPR;

          borrows.push({
            asset: userReserve.underlyingAsset,
            symbol: reserve.symbol,
            balance: new BigNumber(userReserve.totalBorrows),
            apy: netBorrowRate * 100,
            isCollateral: false,
            interestRateMode:
              Number(userReserve.stableBorrows) > 0
                ? InterestRateMode.STABLE
                : InterestRateMode.VARIABLE,
            stableRate: (Number(reserve.stableBorrowAPY) - incentiveAPR) * 100,
            variableRate: (Number(reserve.variableBorrowAPY) - incentiveAPR) * 100,
            incentiveAPR: incentiveAPR * 100,
          });
        }
      });

      return {
        supplies,
        borrows,
        healthFactor: Number(userSummary.healthFactor),
        totalCollateralETH: new BigNumber(userSummary.totalCollateralUSD),
        totalDebtETH: new BigNumber(userSummary.totalBorrowsUSD),
        availableBorrowsETH: new BigNumber(userSummary.availableBorrowsUSD),
        currentLTV: Number(userSummary.currentLoanToValue),
        liquidationThreshold: Number(userSummary.currentLiquidationThreshold),
        eModeCategory: userEModeCategoryId,
        eModeEnabled: userEModeCategoryId !== 0,
        totalClaimableRewards: Number(userSummary.totalClaimableUSD || '0'),
        netWorth: Number(userSummary.netWorthUSD),
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'getUserPosition');
    }
  }

  async getEModeCategories(): Promise<eModeCategory[]> {
    // Note: This would require additional contract calls to get eMode categories
    // For now, returning common eMode categories
    return [
      {
        id: 1,
        ltv: 97,
        liquidationThreshold: 98,
        liquidationBonus: 1,
        priceSource: '0x0',
        label: 'Stablecoins',
      },
      {
        id: 2,
        ltv: 90,
        liquidationThreshold: 93,
        liquidationBonus: 2,
        priceSource: '0x0',
        label: 'ETH correlated',
      },
    ];
  }

  getCachedAccountData(): UserAccountData | null {
    return this.cachedAccountData;
  }

  async updateHealthFactorCache(): Promise<void> {
    if (!this.userAddress) return;

    try {
      this.cachedAccountData = await this.getUserAccountData(this.userAddress);
      this.lastHealthFactorUpdate = Date.now();
    } catch (error) {
      console.error('Failed to update health factor cache:', error);
    }
  }

  private async ensureApproval(token: string, spender: string, amount: bigint): Promise<void> {
    const erc20ABI = [
      {
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ];

    const allowance = await this.publicClient.readContract({
      address: token as Address,
      abi: erc20ABI,
      functionName: 'allowance',
      args: [this.userAddress, spender as Address],
    });

    if (allowance < amount) {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: token as Address,
        abi: erc20ABI,
        functionName: 'approve',
        args: [spender as Address, amount],
      });

      const hash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash });
    }
  }

  private async updateReservesCache(): Promise<void> {
    if (!this.poolDataProvider || !this.incentiveDataProvider) {
      return;
    }

    try {
      const [reserves, reserveIncentives] = await Promise.all([
        this.poolDataProvider.getReservesHumanized({
          lendingPoolAddressProvider: this.config.aavePoolAddress,
        }),
        this.incentiveDataProvider.getReservesIncentivesDataHumanized({
          lendingPoolAddressProvider: this.config.aavePoolAddress,
        }),
      ]);

      const currentTimestamp = dayjs().unix();

      // Format reserves with incentives
      this.reservesCache = formatReservesAndIncentives({
        reserves: reserves.reservesData,
        currentTimestamp,
        marketReferenceCurrencyDecimals: reserves.baseCurrencyData.marketReferenceCurrencyDecimals,
        marketReferencePriceInUsd: reserves.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        reserveIncentives,
      });

      this.reserveIncentivesCache = reserveIncentives;
      this.lastDataUpdate = Date.now();
    } catch (error) {
      console.error('Failed to update reserves cache:', error);
    }
  }

  private async getFormattedReserves(): Promise<FormatReserveUSDResponse[]> {
    if (!this.poolDataProvider) {
      throw new Error('Pool data provider not initialized');
    }

    const reserves = await this.poolDataProvider.getReservesHumanized({
      lendingPoolAddressProvider: this.config.aavePoolAddress,
    });

    const currentTimestamp = dayjs().unix();

    return formatReserves({
      reserves: reserves.reservesData,
      currentTimestamp,
      marketReferenceCurrencyDecimals: reserves.baseCurrencyData.marketReferenceCurrencyDecimals,
      marketReferencePriceInUsd: reserves.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    });
  }

  private calculateIncentiveAPR(
    asset: string,
    incentives: any[],
    type: 'deposit' | 'borrow'
  ): number {
    if (!incentives || incentives.length === 0) return 0;

    const assetIncentives = incentives.find(
      (i) => i.underlyingAsset.toLowerCase() === asset.toLowerCase()
    );

    if (!assetIncentives) return 0;

    // Sum up all incentive APRs for the given type
    const relevantIncentives =
      type === 'deposit'
        ? assetIncentives.aIncentivesData || []
        : assetIncentives.vIncentivesData || [];

    return relevantIncentives.reduce((total: number, incentive: any) => {
      return total + (Number(incentive.incentiveAPR) || 0);
    }, 0);
  }

  async generateSupplyWithPermit(
    user: string,
    reserve: string,
    amount: BigNumber,
    deadline: number,
    signature: string,
    onBehalfOf?: string,
    referralCode: number = 0
  ): Promise<SupplyResult> {
    if (!this.pool || !this.userAddress) {
      throw new Error('AaveService not initialized');
    }

    try {
      // Execute supply with permit transaction
      const tx = await this.pool.supplyWithPermit({
        user: this.userAddress,
        reserve: reserve as Address,
        amount: amount.toString(),
        onBehalfOf: (onBehalfOf || this.userAddress) as Address,
        deadline,
        signature,
        referralCode,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      // Get updated balances
      const position = await this.getUserPosition(this.userAddress);
      const assetPosition = position.supplies.find(
        (s) => s.asset.toLowerCase() === reserve.toLowerCase()
      );

      return {
        transactionHash: receipt.transactionHash,
        asset: reserve,
        amount,
        aTokenBalance: assetPosition?.balance || new BigNumber(0),
        apy: assetPosition?.apy || 0,
        collateralEnabled: assetPosition?.isCollateral || false,
      };
    } catch (error: any) {
      throw this.handleAaveError(error, 'supplyWithPermit');
    }
  }

  async generatePermitSignatureRequest(
    user: string,
    token: string,
    amount: BigNumber
  ): Promise<any> {
    if (!this.erc20Service || !this.erc20PermitService) {
      throw new Error('ERC20 services not initialized');
    }

    try {
      const spender = this.config.aavePoolAddress;

      // Get token name for EIP712 domain
      const { name } = await this.erc20Service.getTokenData(token);
      const { chainId } = await this.publicClient.getChainId();

      // Get nonce for the owner and token
      const nonce = await this.erc20PermitService.getNonce({
        token,
        owner: user,
      });

      // Set deadline (1 hour from now)
      const deadline = Math.floor(Date.now() / 1000 + 3600);

      // EIP712 type data structure for the permit
      const typeData = {
        types: {
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
        },
        primaryType: 'Permit',
        domain: {
          name,
          version: '1',
          chainId,
          verifyingContract: token,
        },
        message: {
          owner: user,
          spender,
          value: amount.toString(),
          nonce,
          deadline,
        },
      };

      return { typeData, deadline };
    } catch (error: any) {
      throw this.handleAaveError(error, 'generatePermitSignatureRequest');
    }
  }

  async calculateHealthFactor(
    totalCollateralETH: BigNumber,
    totalBorrowsETH: BigNumber,
    currentLiquidationThreshold: BigNumber
  ): Promise<string> {
    return calculateHealthFactorFromBalancesBigUnits(
      totalCollateralETH.toString(),
      totalBorrowsETH.toString(),
      currentLiquidationThreshold.toString()
    );
  }

  private handleAaveError(error: any, operation: string): Error {
    console.error(`Aave ${operation} error:`, error);

    // Parse common Aave errors
    const errorMessage = error.message || error.toString();

    if (errorMessage.includes('HEALTH_FACTOR')) {
      return new Error('Operation would result in unsafe health factor');
    }
    if (errorMessage.includes('INSUFFICIENT_COLLATERAL')) {
      return new Error('Insufficient collateral for this operation');
    }
    if (errorMessage.includes('NO_ACTIVE_RESERVE')) {
      return new Error('Asset is not supported in Aave market');
    }
    if (errorMessage.includes('INVALID_AMOUNT')) {
      return new Error('Invalid amount specified');
    }

    return new Error(`Aave ${operation} failed: ${errorMessage}`);
  }
}
