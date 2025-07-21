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
import { RateSwitchParams, InterestRateMode } from '../types';

const rateSwitchTemplate = `You are an AI assistant helping users switch interest rate modes on Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the rate switch parameters from the user's request:
- Asset: The borrowed token to switch rates for (e.g., USDC, ETH, DAI)
- Target rate mode: 'stable' or 'variable'

Note: Users can switch between stable and variable interest rates on their borrows.

Respond with the extracted parameters in JSON format.`;

const rateSwitchResponseTemplate = `Based on the rate switch operation:

{{#if success}}
✅ Successfully switched {{asset}} interest rate to {{newRateMode}} mode!

Transaction hash: {{transactionHash}}

Rate change summary:
- Previous rate: {{previousRate}}% ({{previousMode}})
- New rate: {{newRate}}% ({{newRateMode}})
- Rate difference: {{rateDifference}}%

{{#if savings}}
💰 Projected annual savings: {{projectedSavings}} {{asset}}
{{else}}
📈 This will cost an additional {{projectedCost}} {{asset}} annually
{{/if}}

{{#if recommendation}}
💡 {{recommendation}}
{{/if}}
{{else}}
❌ Rate switch operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

export class RateSwitchAction implements Action {
    name = 'AAVE_RATE_SWITCH';
    description = 'Switch between stable and variable interest rates on Aave V3 borrows';
    
    validate(runtime: IAgentRuntime, message: Memory): boolean {
        const text = message.content.text.toLowerCase();
        return (text.includes('switch') && text.includes('rate')) || 
               (text.includes('change') && text.includes('rate')) &&
               (text.includes('aave') || text.includes('stable') || text.includes('variable'));
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
                template: rateSwitchTemplate,
                currentMessage: message.content.text,
                recentMessages: state?.recentMessagesStr || ''
            });

            // Extract parameters using AI
            const paramsSchema = z.object({
                asset: z.string().describe('The borrowed token symbol'),
                targetRateMode: z.enum(['stable', 'variable']).describe('Target interest rate mode')
            });

            const extractedParams = await generateObject({
                runtime,
                context,
                schema: paramsSchema,
                modelClass: ModelClass.LARGE
            });

            const params: RateSwitchParams = {
                asset: extractedParams.data.asset.toUpperCase(),
                targetRateMode: extractedParams.data.targetRateMode
            };

            // Get user address
            const userAddress = await walletService.getAddress();

            // Get current position to check borrow
            const position = await aaveService.getUserPosition(userAddress);
            const borrowPosition = position.borrows.find(
                b => b.asset.toUpperCase() === params.asset
            );

            if (!borrowPosition) {
                throw new Error(`No active ${params.asset} borrow position found`);
            }

            // Check current rate mode
            const currentMode = borrowPosition.interestRateMode;
            const targetMode = params.targetRateMode === 'stable' 
                ? InterestRateMode.STABLE 
                : InterestRateMode.VARIABLE;

            if (currentMode === targetMode) {
                throw new Error(`Your ${params.asset} borrow is already in ${params.targetRateMode} rate mode`);
            }

            // Get current rates for comparison
            const currentRate = currentMode === InterestRateMode.STABLE 
                ? borrowPosition.stableRate! 
                : borrowPosition.variableRate!;

            // Execute rate switch
            const result = await aaveService.swapBorrowRateMode(
                params.asset,
                targetMode
            );

            // Calculate rate difference and savings
            const rateDifference = new BigNumber(result.newRate).minus(result.previousRate);
            const savings = result.projectedSavings.gt(0);
            
            // Generate recommendation based on rate change
            const recommendation = this.getRateRecommendation(
                params.targetRateMode,
                result.newRate,
                result.previousRate
            );

            // Generate response
            const responseContext = composeContext({
                state,
                template: rateSwitchResponseTemplate,
                success: true,
                asset: params.asset,
                transactionHash: result.transactionHash,
                previousRate: result.previousRate.toFixed(2),
                previousMode: currentMode === InterestRateMode.STABLE ? 'stable' : 'variable',
                newRate: result.newRate.toFixed(2),
                newRateMode: params.targetRateMode,
                rateDifference: Math.abs(rateDifference.toNumber()).toFixed(2),
                savings,
                projectedSavings: savings ? result.projectedSavings.abs().toFixed(2) : undefined,
                projectedCost: !savings ? result.projectedSavings.abs().toFixed(2) : undefined,
                recommendation
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
                template: rateSwitchResponseTemplate,
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
                content: { text: 'Switch my USDC borrow to stable rate on Aave' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll help you switch your USDC borrow from variable to stable interest rate on Aave V3.',
                    action: 'AAVE_RATE_SWITCH'
                }
            }
        ],
        [
            {
                user: 'user',
                content: { text: 'Change my ETH loan to variable rate' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll process the rate switch for your ETH borrow to variable rate mode.',
                    action: 'AAVE_RATE_SWITCH'
                }
            }
        ]
    ];

    private getRateRecommendation(targetMode: string, newRate: number, previousRate: number): string {
        if (targetMode === 'stable') {
            return 'Stable rates provide predictability but may be higher than variable rates in low volatility periods.';
        } else {
            if (newRate < previousRate) {
                return 'Variable rates are currently lower and can save you money, but may increase with market conditions.';
            } else {
                return 'Variable rates are currently higher but may decrease if market rates fall.';
            }
        }
    }

    private getErrorSuggestions(error: Error): string[] {
        const message = error.message.toLowerCase();
        const suggestions: string[] = [];

        if (message.includes('no active') || message.includes('borrow position')) {
            suggestions.push('You need an active borrow to switch rates');
            suggestions.push('Check your current borrow positions');
        }
        if (message.includes('already in')) {
            suggestions.push('Your borrow is already in the requested rate mode');
            suggestions.push('No rate switch is needed');
        }
        if (message.includes('stable rate')) {
            suggestions.push('Stable rate may not be available for all assets');
            suggestions.push('Some markets only support variable rates');
        }
        if (message.includes('cooldown')) {
            suggestions.push('There may be a cooldown period between rate switches');
            suggestions.push('Try again later');
        }

        return suggestions;
    }
}