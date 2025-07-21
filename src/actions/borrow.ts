import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  composePrompt,
  parseJSONObjectFromText,
  ModelClass,
  ModelType,
} from '@elizaos/core';
import { z } from 'zod';
import BigNumber from 'bignumber.js';
import { AaveService, WalletService } from '../services';
import { BorrowParams, InterestRateMode } from '../types';

const borrowTemplate = `You are an AI assistant helping users borrow assets from Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the borrow parameters from the user's request:
- Asset: The token to borrow (e.g., USDC, ETH, DAI)
- Amount: The amount to borrow
- Rate mode: 'stable' or 'variable' (default: variable)

Note: User must have sufficient collateral to maintain a healthy position.

Respond with the extracted parameters in JSON format:
{
  "asset": "string",
  "amount": "string",
  "interestRateMode": "stable" | "variable"
}

Make sure to wrap your JSON response in triple backticks with 'json' marker.`;

const borrowResponseTemplate = `Based on the borrow operation:

{{#if success}}
✅ Successfully borrowed {{amount}} {{asset}} from Aave V3!

Transaction hash: {{transactionHash}}
Interest rate mode: {{rateMode}}
Current rate: {{rate}}%
Health factor: {{healthFactor}}

Your debt position:
- Borrowed amount: {{amount}} {{asset}}
- Interest rate: {{rate}}% ({{rateMode}})
- Health factor: {{healthFactor}} {{healthStatus}}

{{#if healthWarning}}
⚠️ Warning: Your health factor is below 1.5. Consider supplying more collateral or repaying some debt to avoid liquidation.
{{/if}}
{{else}}
❌ Borrow operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

function getHealthFactorStatus(healthFactor: BigNumber): string {
  if (healthFactor.lt(1.1)) return '🔴 CRITICAL';
  if (healthFactor.lt(1.5)) return '🟡 RISKY';
  if (healthFactor.lt(2)) return '🟢 MODERATE';
  if (healthFactor.lt(3)) return '🟢 SAFE';
  return '🟢 VERY SAFE';
}

function getErrorSuggestions(error: Error): string[] {
  const message = error.message.toLowerCase();
  const suggestions: string[] = [];

  if (message.includes('health factor')) {
    suggestions.push('Supply more collateral to improve your health factor');
    suggestions.push('Try borrowing a smaller amount');
    suggestions.push('Consider repaying existing debt first');
  }
  if (message.includes('no borrowing capacity')) {
    suggestions.push('You need to supply assets as collateral first');
    suggestions.push('Enable existing supplies as collateral');
  }
  if (message.includes('not supported')) {
    suggestions.push('Check if the asset is available for borrowing on Aave V3');
    suggestions.push('Try borrowing USDC, ETH, or DAI');
  }
  if (message.includes('stable rate')) {
    suggestions.push('Stable rate may not be available for all assets');
    suggestions.push('Try using variable rate instead');
  }

  return suggestions;
}

export const borrowAction: Action = {
  name: 'AAVE_BORROW',
  description: 'Borrow assets from Aave V3 lending protocol',

  validate: (runtime: IAgentRuntime, message: Memory): boolean => {
    const text = message.content.text.toLowerCase();
    return (
      text.includes('borrow') &&
      (text.includes('aave') || text.includes('loan') || text.includes('from aave'))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      // Initialize services
      const aaveService = runtime.getService('aave') as AaveService;
      const walletService = runtime.getService('wallet') as WalletService;

      if (!aaveService || !walletService) {
        throw new Error('Required services not found');
      }

      // Compose context for parameter extraction
      const context = composePrompt({
        state,
        template: borrowTemplate,
      });

      // Generate response to extract parameters
      const extractionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        stopSequences: [],
      });

      // Parse JSON from response
      const extractedParams = parseJSONObjectFromText(extractionResponse);

      if (!extractedParams || !extractedParams.asset || !extractedParams.amount) {
        throw new Error('Could not parse borrow parameters from message');
      }

      const params: BorrowParams = {
        asset: extractedParams.asset.toUpperCase(),
        amount: extractedParams.amount,
        interestRateMode: extractedParams.interestRateMode || 'variable',
      };

      // Get user address
      const userAddress = await walletService.getAddress();

      // Check user's position and health factor
      const position = await aaveService.getUserPosition(userAddress);
      const accountData = await aaveService.getUserAccountData(userAddress);

      // Convert health factor to readable format
      const healthFactor = new BigNumber(accountData.healthFactor.toString()).dividedBy(1e18);

      if (healthFactor.lt(1.2)) {
        throw new Error(
          `Health factor ${healthFactor.toFixed(2)} is too low. Supply more collateral before borrowing.`
        );
      }

      // Check available borrow capacity
      const availableBorrows = new BigNumber(accountData.availableBorrowsETH.toString()).dividedBy(
        1e18
      );
      if (availableBorrows.eq(0)) {
        throw new Error('No borrowing capacity. Supply collateral first.');
      }

      // Execute borrow operation
      const interestRateMode =
        params.interestRateMode === 'stable' ? InterestRateMode.STABLE : InterestRateMode.VARIABLE;

      const result = await aaveService.borrow(
        params.asset,
        new BigNumber(params.amount),
        interestRateMode,
        0 // referral code
      );

      // Format health factor for display
      const newHealthFactor = new BigNumber(result.healthFactor.toString()).dividedBy(1e18);
      const healthStatus = getHealthFactorStatus(newHealthFactor);
      const healthWarning = newHealthFactor.lt(1.5);

      // Generate response
      const responseContext = composePrompt({
        state,
        template: borrowResponseTemplate,
        success: true,
        amount: params.amount,
        asset: params.asset,
        transactionHash: result.transactionHash,
        rateMode: params.interestRateMode,
        rate: result.rate.toFixed(2),
        healthFactor: newHealthFactor.toFixed(2),
        healthStatus,
        healthWarning,
      });

      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: responseContext,
        stopSequences: [],
      });

      if (callback) {
        await callback({
          text: response,
          actions: ['AAVE_BORROW'],
        });
      }

      return true;
    } catch (error: any) {
      const errorContext = composePrompt({
        state,
        template: borrowResponseTemplate,
        success: false,
        error: error.message,
        suggestions: getErrorSuggestions(error),
      });

      const errorResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: errorContext,
        stopSequences: [],
      });

      if (callback) {
        await callback({
          text: errorResponse,
          actions: ['AAVE_BORROW'],
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'I want to borrow 500 USDC from Aave with variable rate' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll help you borrow 500 USDC from Aave V3 with a variable interest rate.",
          action: 'AAVE_BORROW',
        },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Borrow 0.1 ETH from Aave using stable rate' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll process your request to borrow 0.1 ETH from Aave V3 with a stable interest rate.",
          action: 'AAVE_BORROW',
        },
      },
    ],
  ],
};
