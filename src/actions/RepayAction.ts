import { 
    Action, 
    IAgentRuntime, 
    Memory, 
    State, 
    HandlerCallback,
    composeContext,
    generateObject,
    ModelClass
} from '@elizaos/core';
import { z } from 'zod';
import BigNumber from 'bignumber.js';
import { AaveService, WalletService } from '../services';
import { RepayParams, InterestRateMode } from '../types';

const repayTemplate = `You are an AI assistant helping users repay debt on Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the repay parameters from the user's request:
- Asset: The token to repay (e.g., USDC, ETH, DAI)
- Amount: The amount to repay (use "-1" for repaying all debt)
- Rate mode: 'stable' or 'variable' (must match the borrow rate mode)

Respond with the extracted parameters in JSON format.`;

const repayResponseTemplate = `Based on the repay operation:

{{#if success}}
✅ Successfully repaid {{amount}} {{asset}} to Aave V3!

Transaction hash: {{transactionHash}}
Remaining debt: {{remainingDebt}} {{asset}}
Health factor: {{healthFactor}} {{healthStatus}}

{{#if fullyRepaid}}
🎉 Congratulations! You have fully repaid your {{asset}} debt.
{{else}}
You still owe {{remainingDebt}} {{asset}}.
{{/if}}

Your position is now {{#if healthImproved}}safer{{else}}unchanged{{/if}} with a health factor of {{healthFactor}}.
{{else}}
❌ Repay operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

export class RepayAction implements Action {
    name = 'AAVE_REPAY';
    description = 'Repay borrowed assets to Aave V3 lending protocol';
    
    validate(runtime: IAgentRuntime, message: Memory): boolean {
        const text = message.content.text.toLowerCase();
        return text.includes('repay') && 
               (text.includes('aave') || text.includes('debt') || text.includes('loan'));
    }

    async handler(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> {
        try {
            // Initialize services
            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet') as WalletService;
            
            if (!aaveService || !walletService) {
                throw new Error('Required services not found');
            }

            // Compose context for parameter extraction
            const context = composeContext({
                state,
                template: repayTemplate,
                currentMessage: message.content.text,
                recentMessages: state?.recentMessagesStr || ''
            });

            // Extract parameters using AI
            const paramsSchema = z.object({
                asset: z.string().describe('The token symbol to repay'),
                amount: z.string().describe('The amount to repay, or "-1" to repay all'),
                rateMode: z.enum(['stable', 'variable']).describe('Interest rate mode of the debt')
            });

            const extractedParams = await generateObject({
                runtime,
                context,
                schema: paramsSchema,
                modelClass: ModelClass.LARGE
            });

            const params: RepayParams = {
                asset: extractedParams.data.asset.toUpperCase(),
                amount: extractedParams.data.amount,
                rateMode: extractedParams.data.rateMode
            };

            // Get user address
            const userAddress = await walletService.getAddress();

            // Get current position to determine the correct rate mode
            const position = await aaveService.getUserPosition(userAddress);
            const borrowPosition = position.borrows.find(
                b => b.asset.toUpperCase() === params.asset
            );

            if (!borrowPosition) {
                throw new Error(`No active ${params.asset} borrow position found`);
            }

            // Determine the correct interest rate mode
            const interestRateMode = borrowPosition.interestRateMode || 
                (params.rateMode === 'stable' ? InterestRateMode.STABLE : InterestRateMode.VARIABLE);

            // Check if repaying all
            const isRepayingAll = params.amount === '-1';
            const repayAmount = isRepayingAll 
                ? new BigNumber(-1) 
                : new BigNumber(params.amount);

            // If not repaying all, check wallet balance
            if (!isRepayingAll) {
                const balance = await walletService.getBalance(params.asset);
                if (balance.lt(repayAmount)) {
                    throw new Error(`Insufficient balance. You have ${balance.toString()} ${params.asset}`);
                }
            }

            // Get health factor before repay
            const accountDataBefore = await aaveService.getUserAccountData(userAddress);
            const healthFactorBefore = new BigNumber(accountDataBefore.healthFactor.toString()).dividedBy(1e18);

            // Execute repay operation
            const result = await aaveService.repay(
                params.asset,
                repayAmount,
                interestRateMode
            );

            // Format results
            const newHealthFactor = new BigNumber(result.healthFactor.toString()).dividedBy(1e18);
            const healthStatus = this.getHealthFactorStatus(newHealthFactor);
            const healthImproved = newHealthFactor.gt(healthFactorBefore);
            const fullyRepaid = result.remainingDebt.eq(0);

            // Generate response
            const responseContext = composeContext({
                state,
                template: repayResponseTemplate,
                success: true,
                amount: isRepayingAll ? 'all' : params.amount,
                asset: params.asset,
                transactionHash: result.transactionHash,
                remainingDebt: result.remainingDebt.toFixed(6),
                healthFactor: newHealthFactor.toFixed(2),
                healthStatus,
                healthImproved,
                fullyRepaid
            });

            const response = await runtime.processTemplate(responseContext);

            if (callback) {
                callback({
                    text: response,
                    action: this.name,
                    data: result
                });
            }

            return true;
        } catch (error: any) {
            const errorContext = composeContext({
                state,
                template: repayResponseTemplate,
                success: false,
                error: error.message,
                suggestions: this.getErrorSuggestions(error)
            });

            const response = await runtime.processTemplate(errorContext);

            if (callback) {
                callback({
                    text: response,
                    action: this.name,
                    error: error.message
                });
            }

            return false;
        }
    }

    examples = [
        [
            {
                user: 'user',
                content: { text: 'I want to repay 200 USDC of my Aave debt' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll help you repay 200 USDC to reduce your debt on Aave V3.',
                    action: 'AAVE_REPAY'
                }
            }
        ],
        [
            {
                user: 'user',
                content: { text: 'Repay all my ETH debt on Aave' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll process the full repayment of your ETH debt on Aave V3.',
                    action: 'AAVE_REPAY'
                }
            }
        ]
    ];

    private getHealthFactorStatus(healthFactor: BigNumber): string {
        if (healthFactor.lt(1.1)) return '🔴 CRITICAL';
        if (healthFactor.lt(1.5)) return '🟡 RISKY';
        if (healthFactor.lt(2)) return '🟢 MODERATE';
        if (healthFactor.lt(3)) return '🟢 SAFE';
        return '🟢 VERY SAFE';
    }

    private getErrorSuggestions(error: Error): string[] {
        const message = error.message.toLowerCase();
        const suggestions: string[] = [];

        if (message.includes('insufficient balance')) {
            suggestions.push('Check your wallet balance');
            suggestions.push('Try repaying a smaller amount');
            suggestions.push('Consider using "-1" to repay the exact debt amount');
        }
        if (message.includes('no active') || message.includes('borrow position')) {
            suggestions.push('Check your active borrow positions');
            suggestions.push('Make sure you have an outstanding debt for this asset');
        }
        if (message.includes('approval')) {
            suggestions.push('The token approval will be handled automatically');
            suggestions.push('Ensure you have enough ETH for gas fees');
        }

        return suggestions;
    }
}