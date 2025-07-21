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
import { WithdrawParams } from '../types';

const withdrawTemplate = `You are an AI assistant helping users withdraw assets from Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the withdraw parameters from the user's request:
- Asset: The token to withdraw (e.g., USDC, ETH, DAI)
- Amount: The amount to withdraw (use "-1" for withdrawing all)

Note: Withdrawals must maintain a safe health factor if the user has active borrows.

Respond with the extracted parameters in JSON format.`;

const withdrawResponseTemplate = `Based on the withdraw operation:

{{#if success}}
✅ Successfully withdrew {{amount}} {{asset}} from Aave V3!

Transaction hash: {{transactionHash}}
Remaining supplied: {{remainingSupply}} {{asset}}
Health factor: {{healthFactor}} {{healthStatus}}

{{#if fullyWithdrawn}}
You have withdrawn all your {{asset}} from Aave.
{{else}}
You still have {{remainingSupply}} {{asset}} supplied to Aave earning {{apy}}% APY.
{{/if}}

{{#if healthWarning}}
⚠️ Warning: Your health factor is {{healthFactor}}. Consider your collateral requirements carefully.
{{/if}}
{{else}}
❌ Withdraw operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

export class WithdrawAction implements Action {
    name = 'AAVE_WITHDRAW';
    description = 'Withdraw supplied assets from Aave V3 lending protocol';
    
    validate(runtime: IAgentRuntime, message: Memory): boolean {
        const text = message.content.text.toLowerCase();
        return text.includes('withdraw') && 
               (text.includes('aave') || text.includes('from aave'));
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
                template: withdrawTemplate,
                currentMessage: message.content.text,
                recentMessages: state?.recentMessagesStr || ''
            });

            // Extract parameters using AI
            const paramsSchema = z.object({
                asset: z.string().describe('The token symbol to withdraw'),
                amount: z.string().describe('The amount to withdraw, or "-1" to withdraw all')
            });

            const extractedParams = await generateObject({
                runtime,
                context,
                schema: paramsSchema,
                modelClass: ModelClass.LARGE
            });

            const params: WithdrawParams = {
                asset: extractedParams.data.asset.toUpperCase(),
                amount: extractedParams.data.amount
            };

            // Get user address
            const userAddress = await walletService.getAddress();

            // Get current position
            const position = await aaveService.getUserPosition(userAddress);
            const supplyPosition = position.supplies.find(
                s => s.asset.toUpperCase() === params.asset
            );

            if (!supplyPosition) {
                throw new Error(`No active ${params.asset} supply position found`);
            }

            // Check if withdrawing all
            const isWithdrawingAll = params.amount === '-1';
            const withdrawAmount = isWithdrawingAll 
                ? new BigNumber(-1) 
                : new BigNumber(params.amount);

            // If user has borrows, check health factor impact
            if (position.borrows.length > 0) {
                const currentHealthFactor = position.healthFactor;
                if (currentHealthFactor < 1.5) {
                    throw new Error(`Health factor ${currentHealthFactor.toFixed(2)} is too low for withdrawal. Repay debt first.`);
                }
            }

            // Execute withdraw operation
            const result = await aaveService.withdraw(
                params.asset,
                withdrawAmount,
                userAddress
            );

            // Get updated position for APY
            const updatedPosition = await aaveService.getUserPosition(userAddress);
            const updatedSupply = updatedPosition.supplies.find(
                s => s.asset.toUpperCase() === params.asset
            );

            // Format results
            const newHealthFactor = new BigNumber(result.healthFactor.toString()).dividedBy(1e18);
            const healthStatus = this.getHealthFactorStatus(newHealthFactor);
            const healthWarning = position.borrows.length > 0 && newHealthFactor.lt(1.5);
            const fullyWithdrawn = result.remainingSupply.eq(0);

            // Generate response
            const responseContext = composeContext({
                state,
                template: withdrawResponseTemplate,
                success: true,
                amount: isWithdrawingAll ? 'all' : params.amount,
                asset: params.asset,
                transactionHash: result.transactionHash,
                remainingSupply: result.remainingSupply.toFixed(6),
                healthFactor: newHealthFactor.toFixed(2),
                healthStatus,
                healthWarning,
                fullyWithdrawn,
                apy: updatedSupply?.apy.toFixed(2) || '0'
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
                template: withdrawResponseTemplate,
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
                content: { text: 'I want to withdraw 500 USDC from Aave' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll help you withdraw 500 USDC from your Aave V3 supply position.',
                    action: 'AAVE_WITHDRAW'
                }
            }
        ],
        [
            {
                user: 'user',
                content: { text: 'Withdraw all my ETH from Aave' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll process the withdrawal of all your ETH from Aave V3.',
                    action: 'AAVE_WITHDRAW'
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

        if (message.includes('health factor')) {
            suggestions.push('Your withdrawal would make your position unsafe');
            suggestions.push('Try withdrawing a smaller amount');
            suggestions.push('Consider repaying some debt first');
        }
        if (message.includes('no active') || message.includes('supply position')) {
            suggestions.push('Check your supplied assets on Aave');
            suggestions.push('You can only withdraw assets you have supplied');
        }
        if (message.includes('insufficient')) {
            suggestions.push('You may be trying to withdraw more than supplied');
            suggestions.push('Check your current supply balance');
        }

        return suggestions;
    }
}