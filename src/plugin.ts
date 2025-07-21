import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { createDefaultConfig } from './config';
import { 
    SupplyAction, 
    BorrowAction, 
    RepayAction, 
    WithdrawAction, 
    RateSwitchAction, 
    CollateralManagementAction, 
    eModeAction, 
    FlashLoanAction 
} from './actions';
import { AaveService, WalletService } from './services';
import { HealthFactorProvider, PositionContextProvider } from './providers';
import { InterestOptimizationEvaluator, EfficiencyModeEvaluator } from './evaluators';

/**
 * Configuration schema for the Aave plugin
 */
const configSchema = z.object({
    BASE_RPC_URL: z
        .string()
        .url('BASE_RPC_URL must be a valid URL')
        .min(1, 'BASE_RPC_URL is required'),
    WALLET_PRIVATE_KEY: z
        .string()
        .min(1, 'WALLET_PRIVATE_KEY is required')
        .optional(),
    HEALTH_FACTOR_ALERT: z
        .string()
        .transform((val) => parseFloat(val))
        .refine((val) => val > 1, 'HEALTH_FACTOR_ALERT must be greater than 1')
        .default('1.5'),
    FLASH_LOAN_MAX_FEE: z
        .string()
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0 && val <= 1, 'FLASH_LOAN_MAX_FEE must be between 0 and 1')
        .default('0.1'),
    AAVE_NETWORK: z
        .enum(['base', 'base-sepolia'])
        .default('base'),
});

/**
 * Aave V3 Plugin for ElizaOS
 * 
 * Provides comprehensive DeFi functionality including:
 * - Lending and borrowing
 * - Flash loans
 * - Rate switching
 * - Collateral management
 * - Efficiency mode (eMode)
 * - Health factor monitoring
 */
export const aavePlugin: Plugin = {
    name: 'aave',
    description: 'Aave V3 DeFi plugin for lending, borrowing, flash loans, and advanced DeFi operations',

    config: {
        BASE_RPC_URL: process.env.BASE_RPC_URL,
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
        HEALTH_FACTOR_ALERT: process.env.HEALTH_FACTOR_ALERT || '1.5',
        FLASH_LOAN_MAX_FEE: process.env.FLASH_LOAN_MAX_FEE || '0.1',
        AAVE_NETWORK: process.env.AAVE_NETWORK || 'base',
    },

    async init(config: Record<string, string>): Promise<void> {
        logger.info('Initializing Aave V3 plugin...');

        try {
            const validatedConfig = await configSchema.parseAsync(config);

            // Set validated environment variables
            for (const [key, value] of Object.entries(validatedConfig)) {
                if (value !== undefined) {
                    process.env[key] = String(value);
                }
            }

            // Create and store Aave configuration
            const aaveConfig = createDefaultConfig(
                validatedConfig.AAVE_NETWORK,
                validatedConfig.BASE_RPC_URL
            );

            // Override with custom values
            aaveConfig.healthFactorThreshold = validatedConfig.HEALTH_FACTOR_ALERT;
            aaveConfig.flashLoanFeeThreshold = validatedConfig.FLASH_LOAN_MAX_FEE;

            logger.info(`Aave plugin initialized for network: ${aaveConfig.network}`);
            logger.info(`Health factor alert threshold: ${aaveConfig.healthFactorThreshold}`);
            logger.info(`Flash loan max fee: ${aaveConfig.flashLoanFeeThreshold}%`);

        } catch (error) {
            if (error instanceof z.ZodError) {
                const errorMessages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
                throw new Error(`Invalid Aave plugin configuration: ${errorMessages.join(', ')}`);
            }
            throw error;
        }
    },

    actions: [
        new SupplyAction(),
        new BorrowAction(),
        new RepayAction(),
        new WithdrawAction(),
        new RateSwitchAction(),
        new CollateralManagementAction(),
        new eModeAction(),
        new FlashLoanAction()
    ],

    services: [
        AaveService,
        WalletService
    ],

    providers: [
        new HealthFactorProvider(),
        new PositionContextProvider()
    ],

    evaluators: [
        new InterestOptimizationEvaluator(),
        new EfficiencyModeEvaluator()
    ],
};

export default aavePlugin;