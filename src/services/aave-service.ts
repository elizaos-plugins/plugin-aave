import { Service, IAgentRuntime, elizaLogger } from '@elizaos/core';
import { Pool, UiPoolDataProvider } from '@aave/contract-helpers';
import { 
  formatReserves, 
  formatUserSummary,
  valueToBigNumber,
  BigNumberValue,
} from '@aave/math-utils';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import { resolveChainContext, resolveRpcUrl, ChainContext } from '../utils/chain-resolver.js';
import { SupportedChain, getChainConfig } from '../types/chains.js';

import {
  AaveConfig,
  AaveError,
  AaveErrorCode,
  SupplyParams,
  SupplyResult,
  WithdrawParams,
  WithdrawResult,
  BorrowParams,
  BorrowResult,
  RepayParams,
  RepayResult,
  UserPosition,
  MarketData,
  UserAccountData,
  InterestRateMode,
} from '../types/index.js';

import {
  validateSupplyParams,
  validateWithdrawParams,
  validateBorrowParams,
  validateRepayParams,
  validateAddress,
  parseAmount,
  isMaxAmount,
} from '../utils/simple-validation.js';

import { handleError } from '../utils/error-handler.js';

export class AaveService extends Service {
  static serviceType = 'aave';

  private provider!: ethers.providers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private poolService?: Pool;
  private uiPoolDataProvider?: UiPoolDataProvider;
  private chainContext!: ChainContext;
  private isInitialized = false;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    // Chain context will be resolved during initialization
  }

  get description(): string {
    return 'Aave V3 Protocol service for lending, borrowing, and DeFi operations';
  }

  get capabilityDescription(): string {
    const currentChain = this.chainContext?.config?.name || 'Multiple chains';
    return `Supports Aave V3 lending operations on ${currentChain}: supply, withdraw, borrow, repay with aTokens and variable/stable rates`;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    try {
      elizaLogger.info('Initializing Aave V3 multi-chain service...');

      // Get chain configuration from environment (default to ethereum)
      const targetChain = runtime.getSetting('AAVE_CHAIN') || 'ethereum';
      elizaLogger.info(`Initializing for chain: ${targetChain}`);

      // Resolve chain context (config + contract addresses)
      this.chainContext = resolveChainContext(targetChain);
      elizaLogger.info(`Chain context resolved: ${this.chainContext.config.name} (Chain ID: ${this.chainContext.config.chainId})`);

      // Get RPC URL with user override support
      const customRpcUrl = runtime.getSetting('AAVE_RPC_URL') || runtime.getSetting('RPC_URL');
      const rpcUrl = resolveRpcUrl(this.chainContext, customRpcUrl);
      elizaLogger.info(`Using RPC URL: ${rpcUrl.replace(/\/\/.*@/, '//***@')}`); // Hide API keys in logs

      // Get wallet configuration
      const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');

      // Initialize provider for the target chain
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      // Initialize signer if private key provided
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
        elizaLogger.info(`Wallet connected: ${this.signer.address} on ${this.chainContext.config.name}`);
        
        // Verify network matches expected chain ID
        const network = await this.provider.getNetwork();
        if (network.chainId !== this.chainContext.config.chainId) {
          elizaLogger.warn(`Network mismatch: RPC reports chain ID ${network.chainId}, expected ${this.chainContext.config.chainId}`);
        }
      }

      // Initialize Aave contract helpers with chain-specific addresses
      const poolConfig: any = {
        POOL: this.chainContext.addresses.POOL,
      };
      
      if (this.chainContext.addresses.WETH_GATEWAY) {
        poolConfig.WETH_GATEWAY = this.chainContext.addresses.WETH_GATEWAY;
      }
      
      this.poolService = new Pool(this.provider, poolConfig);

      // Only initialize UI pool data provider if address is available
      if (this.chainContext.addresses.UI_POOL_DATA_PROVIDER) {
        this.uiPoolDataProvider = new UiPoolDataProvider({
          uiPoolDataProviderAddress: this.chainContext.addresses.UI_POOL_DATA_PROVIDER,
          provider: this.provider,
          chainId: this.chainContext.config.chainId,
        });
      }

      // Verify connection and contract availability
      await this.verifyConnection();

      this.isInitialized = true;
      elizaLogger.info(`Aave V3 service initialized successfully on ${this.chainContext.config.name}`);
      elizaLogger.info(`Available assets: ${this.chainContext.config.popularAssets.join(', ')}`);

    } catch (error) {
      elizaLogger.error('Failed to initialize Aave service:', error);
      throw new AaveError(
        `Failed to initialize Aave V3 service: ${error instanceof Error ? error.message : String(error)}`,
        AaveErrorCode.INITIALIZATION_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { 
          targetChain: runtime.getSetting('AAVE_CHAIN'),
          originalError: error 
        }
      );
    }
  }

  private async verifyConnection(): Promise<void> {
    try {
      // Test connection by fetching reserves data using chain-specific addresses
      if (!this.uiPoolDataProvider) {
        elizaLogger.warn(`UI Pool Data Provider not available on ${this.chainContext.config.name} - some features may be limited`);
        return;
      }
      
      const reservesData = await this.uiPoolDataProvider.getReservesHumanized({
        lendingPoolAddressProvider: this.chainContext.addresses.POOL_ADDRESSES_PROVIDER,
      });
      
      if (!reservesData || reservesData.reservesData.length === 0) {
        throw new Error('No reserves data received from Aave V3 contracts');
      }

      elizaLogger.info(`Connected to Aave V3 on ${this.chainContext.config.name} - found ${reservesData.reservesData.length} reserves`);
      
      // Log some popular assets if available
      const availableAssets = reservesData.reservesData.map(r => r.symbol).slice(0, 5);
      elizaLogger.info(`Sample available assets: ${availableAssets.join(', ')}`);
      
    } catch (error) {
      elizaLogger.error('Connection verification failed:', error);
      throw new AaveError(
        `Failed to verify Aave V3 connection on ${this.chainContext.config.name}`,
        AaveErrorCode.CONNECTION_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        {
          chain: this.chainContext.config.name,
          chainId: this.chainContext.config.chainId,
          poolAddress: this.chainContext.addresses.POOL
        }
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.poolService) {
      throw new AaveError(
        'Aave service not initialized',
        AaveErrorCode.SERVICE_NOT_INITIALIZED
      );
    }
  }

  private ensureSigner(): void {
    if (!this.signer) {
      throw new AaveError(
        'Wallet not connected - private key required for transactions',
        AaveErrorCode.WALLET_NOT_CONNECTED
      );
    }
  }

  async supply(params: SupplyParams): Promise<SupplyResult> {
    try {
      this.ensureInitialized();
      this.ensureSigner();

      const validatedParams = validateSupplyParams(params);
      const amount = parseAmount(validatedParams.amount).toString();
      const userAddress = validatedParams.user;

      elizaLogger.info(`Supplying ${amount} ${validatedParams.asset} for ${userAddress}`);

      // Get asset address from reserves data
      const reserveData = await this.getReserveData(validatedParams.asset);
      
      // Use Pool service to generate supply transaction
      const supplyTxs = await this.poolService!.supply({
        user: userAddress,
        reserve: reserveData.underlyingAsset,
        amount,
        onBehalfOf: userAddress,
      });

      if (supplyTxs.length === 0) {
        throw new AaveError(
          'Failed to generate supply transaction',
          AaveErrorCode.TRANSACTION_GENERATION_FAILED
        );
      }

      // Execute transactions (approval + supply)
      let approvalTxHash: string | undefined;
      let supplyTxHash: string;

      for (const tx of supplyTxs) {
        // Convert Aave transaction to ethers format
        const ethersTransaction = {
          to: (tx as any).to,
          data: (tx as any).data,
          value: (tx as any).value || '0',
          gasLimit: (tx as any).gasLimit,
        };
        
        const txResponse = await this.signer!.sendTransaction(ethersTransaction);
        const receipt = await txResponse.wait();

        if (tx.txType === 'ERC20_APPROVAL') {
          approvalTxHash = receipt!.transactionHash;
          elizaLogger.info(`Token approval completed: ${approvalTxHash}`);
        } else {
          supplyTxHash = receipt!.transactionHash;
          elizaLogger.info(`Supply transaction completed: ${supplyTxHash}`);
        }
      }

      // Get updated position data
      const accountData = await this.getUserAccountData(userAddress);
      
      // Calculate aTokens received (approximately equal to amount supplied for most assets)
      const aTokensReceived = new BigNumber(amount);

      return {
        success: true,
        transactionHash: supplyTxHash!,
        suppliedAmount: new BigNumber(amount),
        aTokenAmount: aTokensReceived,
        newATokenBalance: aTokensReceived, // Simplified - would need to query actual balance
        gasUsed: new BigNumber('0'), // Would need to calculate from receipt
      };

    } catch (error) {
      elizaLogger.error('Supply operation failed:', error);
      const processedError = handleError(error instanceof Error ? error : new Error(String(error)), 'supply', params);
      throw new AaveError(
        processedError.userMessage,
        AaveErrorCode.SUPPLY_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'supply', params }
      );
    }
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    try {
      this.ensureInitialized();
      this.ensureSigner();

      const validatedParams = validateWithdrawParams(params);
      const userAddress = validatedParams.user;

      elizaLogger.info(`Withdrawing ${validatedParams.amount} ${validatedParams.asset} for ${userAddress}`);

      // Get asset address from reserves data
      const reserveData = await this.getReserveData(validatedParams.asset);
      
      // Handle max withdrawal
      let amount: string;
      if (isMaxAmount(validatedParams.amount)) {
        amount = '-1'; // Aave helper uses -1 for max
      } else {
        amount = parseAmount(validatedParams.amount).toString();
      }

      // Use Pool service to generate withdraw transaction
      const withdrawTxs = await this.poolService!.withdraw({
        user: userAddress,
        reserve: reserveData.underlyingAsset,
        amount,
        onBehalfOf: userAddress,
      });

      if (withdrawTxs.length === 0) {
        throw new AaveError(
          'Failed to generate withdraw transaction',
          AaveErrorCode.TRANSACTION_GENERATION_FAILED
        );
      }

      // Execute transaction
      const tx = withdrawTxs[0];
      const ethersTransaction = {
        to: (tx as any).to,
        data: (tx as any).data,
        value: (tx as any).value || '0',
        gasLimit: (tx as any).gasLimit,
      };
      
      const txResponse = await this.signer!.sendTransaction(ethersTransaction);
      const receipt = await txResponse.wait();
      const withdrawTxHash = receipt!.transactionHash;

      elizaLogger.info(`Withdraw transaction completed: ${withdrawTxHash}`);

      // Get updated position data
      const accountData = await this.getUserAccountData(userAddress);
      
      // For now, return the requested amount (would need to parse logs for exact amount)
      const amountWithdrawn = isMaxAmount(validatedParams.amount) 
        ? new BigNumber(amount)
        : parseAmount(validatedParams.amount);

      return {
        success: true,
        transactionHash: withdrawTxHash,
        amountWithdrawn,
        remainingATokenBalance: new BigNumber(0), // Would need to query aToken contract
        newHealthFactor: accountData.healthFactor.toNumber(),
        gasUsed: new BigNumber(receipt!.gasUsed.toString()),
      };

    } catch (error) {
      elizaLogger.error('Withdraw operation failed:', error);
      const processedError = handleError(error instanceof Error ? error : new Error(String(error)), 'withdraw', params);
      throw new AaveError(
        processedError.userMessage,
        AaveErrorCode.WITHDRAW_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'withdraw', params }
      );
    }
  }

  async borrow(params: BorrowParams): Promise<BorrowResult> {
    try {
      this.ensureInitialized();
      this.ensureSigner();

      const validatedParams = validateBorrowParams(params);
      const amount = parseAmount(validatedParams.amount).toString();
      const userAddress = validatedParams.user;
      const rateMode = validatedParams.interestRateMode;

      elizaLogger.info(`Borrowing ${amount} ${validatedParams.asset} for ${userAddress}`);

      // Get asset address from reserves data
      const reserveData = await this.getReserveData(validatedParams.asset);

      // Use Pool service to generate borrow transaction
      const borrowTxs = await this.poolService!.borrow({
        user: userAddress,
        reserve: reserveData.underlyingAsset,
        amount,
        interestRateMode: (rateMode === InterestRateMode.STABLE ? 1 : 2) as any,
        onBehalfOf: userAddress,
      });

      if (borrowTxs.length === 0) {
        throw new AaveError(
          'Failed to generate borrow transaction',
          AaveErrorCode.TRANSACTION_GENERATION_FAILED
        );
      }

      // Execute transaction
      const tx = borrowTxs[0];
      const ethersTransaction = {
        to: (tx as any).to,
        data: (tx as any).data,
        value: (tx as any).value || '0',
        gasLimit: (tx as any).gasLimit,
      };
      
      const txResponse = await this.signer!.sendTransaction(ethersTransaction);
      const receipt = await txResponse.wait();
      const borrowTxHash = receipt!.transactionHash;

      elizaLogger.info(`Borrow transaction completed: ${borrowTxHash}`);

      // Get updated position data
      const accountData = await this.getUserAccountData(userAddress);
      
      // Get current borrow APY
      const borrowAPY = rateMode === InterestRateMode.VARIABLE 
        ? Number(reserveData.variableBorrowAPY)
        : Number(reserveData.stableBorrowAPY);

      return {
        success: true,
        transactionHash: borrowTxHash,
        amountBorrowed: new BigNumber(amount),
        interestRateMode: rateMode,
        currentBorrowAPY: borrowAPY,
        newHealthFactor: accountData.healthFactor.toNumber(),
        gasUsed: new BigNumber(receipt!.gasUsed.toString()),
      };

    } catch (error) {
      elizaLogger.error('Borrow operation failed:', error);
      const processedError = handleError(error instanceof Error ? error : new Error(String(error)), 'borrow', params);
      throw new AaveError(
        processedError.userMessage,
        AaveErrorCode.BORROW_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'borrow', params }
      );
    }
  }

  async repay(params: RepayParams): Promise<RepayResult> {
    try {
      this.ensureInitialized();
      this.ensureSigner();

      const validatedParams = validateRepayParams(params);
      const userAddress = validatedParams.user;
      const rateMode = validatedParams.interestRateMode;

      elizaLogger.info(`Repaying ${validatedParams.amount} ${validatedParams.asset} for ${userAddress}`);

      // Get asset address from reserves data
      const reserveData = await this.getReserveData(validatedParams.asset);
      
      // Handle max repayment
      let amount: string;
      if (isMaxAmount(validatedParams.amount)) {
        amount = '-1'; // Aave helper uses -1 for max
      } else {
        amount = parseAmount(validatedParams.amount).toString();
      }

      // Use Pool service to generate repay transaction
      const repayTxs = await this.poolService!.repay({
        user: userAddress,
        reserve: reserveData.underlyingAsset,
        amount,
        interestRateMode: (rateMode === InterestRateMode.STABLE ? 1 : 2) as any,
        onBehalfOf: userAddress,
      });

      if (repayTxs.length === 0) {
        throw new AaveError(
          'Failed to generate repay transaction',
          AaveErrorCode.TRANSACTION_GENERATION_FAILED
        );
      }

      // Execute transactions (approval + repay)
      let approvalTxHash: string | undefined;
      let repayTxHash: string;

      for (const tx of repayTxs) {
        // Convert Aave transaction to ethers format
        const ethersTransaction = {
          to: (tx as any).to,
          data: (tx as any).data,
          value: (tx as any).value || '0',
          gasLimit: (tx as any).gasLimit,
        };
        
        const txResponse = await this.signer!.sendTransaction(ethersTransaction);
        const receipt = await txResponse.wait();

        if (tx.txType === 'ERC20_APPROVAL') {
          approvalTxHash = receipt!.transactionHash;
          elizaLogger.info(`Token approval completed: ${approvalTxHash}`);
        } else {
          repayTxHash = receipt!.transactionHash;
          elizaLogger.info(`Repay transaction completed: ${repayTxHash}`);
        }
      }

      // Get updated position data
      const accountData = await this.getUserAccountData(userAddress);
      
      // For now, return the requested amount (would need to parse logs for exact amount)
      const amountRepaid = isMaxAmount(validatedParams.amount) 
        ? new BigNumber(amount === '-1' ? '0' : amount)
        : parseAmount(validatedParams.amount);

      return {
        success: true,
        transactionHash: repayTxHash!,
        amountRepaid,
        interestRateMode: rateMode,
        remainingDebt: accountData.totalDebtETH,
        newHealthFactor: accountData.healthFactor.toNumber(),
        gasUsed: new BigNumber('0'), // Would need to calculate from receipt
        approvalTransactionHash: approvalTxHash,
      };

    } catch (error) {
      elizaLogger.error('Repay operation failed:', error);
      const processedError = handleError(error instanceof Error ? error : new Error(String(error)), 'repay', params);
      throw new AaveError(
        processedError.userMessage,
        AaveErrorCode.REPAY_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'repay', params }
      );
    }
  }

  async getUserPosition(userAddress: string): Promise<UserPosition> {
    try {
      this.ensureInitialized();
      
      if (!this.uiPoolDataProvider) {
        throw new AaveError(
          'UI Pool Data Provider not available on this chain - cannot fetch user positions',
          AaveErrorCode.UNSUPPORTED_OPERATION
        );
      }
      
      const validatedAddress = validateAddress(userAddress);
      
      // Get user reserves data
      const userReservesData = await this.uiPoolDataProvider.getUserReservesHumanized({
        lendingPoolAddressProvider: this.chainContext.addresses.POOL_ADDRESSES_PROVIDER,
        user: validatedAddress,
      });

      const reservesData = await this.uiPoolDataProvider.getReservesHumanized({
        lendingPoolAddressProvider: this.chainContext.addresses.POOL_ADDRESSES_PROVIDER,
      });

      // Format the data using Aave's math utils
      const formattedPoolReserves = formatReserves({
        reserves: reservesData.reservesData,
        currentTimestamp: Date.now() / 1000,
        marketReferencePriceInUsd: reservesData.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        marketReferenceCurrencyDecimals: reservesData.baseCurrencyData.marketReferenceCurrencyDecimals,
      });

      const userSummary = formatUserSummary({
        currentTimestamp: Date.now() / 1000,
        marketReferencePriceInUsd: reservesData.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        marketReferenceCurrencyDecimals: reservesData.baseCurrencyData.marketReferenceCurrencyDecimals,
        userReserves: userReservesData.userReserves,
        formattedReserves: formattedPoolReserves,
        userEmodeCategoryId: userReservesData.userEmodeCategoryId,
      });

      // Convert to our format
      const positions = userReservesData.userReserves
        .filter((reserve: any) => 
          reserve.scaledATokenBalance !== '0' || 
          reserve.scaledVariableDebt !== '0' || 
          reserve.principalStableDebt !== '0'
        )
        .map((reserve: any) => {
          const poolReserve = formattedPoolReserves.find(
            (r: any) => r.underlyingAsset.toLowerCase() === reserve.underlyingAsset.toLowerCase()
          );

          return {
            asset: poolReserve?.symbol || 'Unknown',
            suppliedAmount: new BigNumber(reserve.scaledATokenBalance || '0'),
            borrowedAmountVariable: new BigNumber(reserve.scaledVariableDebt || '0'),
            borrowedAmountStable: new BigNumber(reserve.principalStableDebt || '0'),
            supplyAPY: Number(poolReserve?.supplyAPY || '0'),
            variableBorrowAPY: Number(poolReserve?.variableBorrowAPY || '0'),
            stableBorrowAPY: Number(poolReserve?.variableBorrowAPY || '0'), // Use variableBorrowAPY since stableBorrowAPY doesn't exist
            isCollateral: reserve.usageAsCollateralEnabled,
            liquidationThreshold: Number(poolReserve?.reserveLiquidationThreshold || '0') / 10000,
            ltv: Number(poolReserve?.baseLTVasCollateral || '0') / 10000,
          };
        });

      return {
        userAddress: validatedAddress,
        totalCollateralETH: new BigNumber(userSummary.totalCollateralUSD),
        totalDebtETH: new BigNumber(userSummary.totalBorrowsUSD),
        availableBorrowsETH: new BigNumber(userSummary.availableBorrowsUSD),
        currentLiquidationThreshold: Number(userSummary.currentLiquidationThreshold),
        ltv: Number((userSummary as any).currentLtv || (userSummary as any).totalLTV || 0),
        healthFactor: new BigNumber(userSummary.healthFactor),
        positions,
        lastUpdated: Date.now(),
      };

    } catch (error) {
      elizaLogger.error('Failed to get user position:', error);
      throw new AaveError(
        'Failed to fetch user position',
        AaveErrorCode.DATA_FETCH_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { userAddress }
      );
    }
  }

  async getUserAccountData(userAddress: string): Promise<UserAccountData> {
    try {
      this.ensureInitialized();

      // Use the formatted user position data which is more comprehensive
      const position = await this.getUserPosition(userAddress);

      return {
        totalCollateralETH: position.totalCollateralETH,
        totalDebtETH: position.totalDebtETH,
        availableBorrowsETH: position.availableBorrowsETH,
        currentLiquidationThreshold: position.currentLiquidationThreshold,
        ltv: position.ltv,
        healthFactor: position.healthFactor,
      };

    } catch (error) {
      elizaLogger.error('Failed to get user account data:', error);
      throw new AaveError(
        'Failed to fetch user account data',
        AaveErrorCode.DATA_FETCH_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        { userAddress }
      );
    }
  }

  async getMarketData(): Promise<MarketData[]> {
    this.ensureInitialized();
    try {
      
      if (!this.uiPoolDataProvider) {
        throw new AaveError(
          'UI Pool Data Provider not available on this chain - cannot fetch market data',
          AaveErrorCode.UNSUPPORTED_OPERATION
        );
      }

      const reservesData = await this.uiPoolDataProvider.getReservesHumanized({
        lendingPoolAddressProvider: this.chainContext.addresses.POOL_ADDRESSES_PROVIDER,
      });

      const formattedReserves = formatReserves({
        reserves: reservesData.reservesData,
        currentTimestamp: Date.now() / 1000,
        marketReferencePriceInUsd: reservesData.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        marketReferenceCurrencyDecimals: reservesData.baseCurrencyData.marketReferenceCurrencyDecimals,
      });

      return formattedReserves.map((reserve: any) => ({
        asset: reserve.symbol,
        aTokenAddress: reserve.aTokenAddress,
        stableDebtTokenAddress: reserve.stableDebtTokenAddress,
        variableDebtTokenAddress: reserve.variableDebtTokenAddress,
        underlyingAsset: reserve.underlyingAsset,
        decimals: reserve.decimals,
        supplyAPY: Number(reserve.supplyAPY),
        variableBorrowAPY: Number(reserve.variableBorrowAPY), 
        stableBorrowAPY: Number(reserve.stableBorrowAPY),
        totalSupply: new BigNumber(reserve.totalLiquidity),
        totalBorrow: new BigNumber(reserve.totalDebt),
        utilizationRate: Number(reserve.utilizationRate),
        ltv: Number(reserve.baseLTVasCollateral) / 100,
        liquidationThreshold: Number(reserve.liquidationThreshold) / 100,
        liquidationBonus: Number(reserve.liquidationBonus) / 100,
        reserveFactor: Number(reserve.reserveFactor) / 100,
        priceInUSD: new BigNumber(reserve.priceInUSD || '0'),
        isActive: reserve.isActive,
        isFrozen: reserve.isFrozen,
        isPaused: reserve.isPaused,
        supplyCap: new BigNumber(reserve.supplyCap || '0'),
        borrowCap: new BigNumber(reserve.borrowCap || '0'),
        lastUpdated: Date.now(),
      }));

    } catch (error) {
      elizaLogger.error('Failed to get market data:', error);
      throw new AaveError(
        'Failed to fetch market data',
        AaveErrorCode.DATA_FETCH_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        {}
      );
    }
  }

  private async getReserveData(asset: string): Promise<any> {
    const marketData = await this.getMarketData();
    const assetData = marketData.find(m => 
      m.asset.toLowerCase() === asset.toLowerCase() ||
      m.underlyingAsset.toLowerCase() === asset.toLowerCase()
    );
    
    if (!assetData) {
      throw new AaveError(
        `Asset not found in market data: ${asset}`,
        AaveErrorCode.ASSET_NOT_FOUND,
        undefined,
        { asset }
      );
    }

    return assetData;
  }

  async stop(): Promise<void> {
    elizaLogger.info('Stopping Aave service...');
    this.isInitialized = false;
  }
}