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
import { FlashLoanActionParams } from '../types';

const flashLoanTemplate = `You are an AI assistant helping users execute flash loans on Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the flash loan parameters from the user's request:
- Assets: Array of tokens to flash loan (e.g., ["USDC", "ETH"])
- Amounts: Array of amounts corresponding to each asset
- Receiver address: Optional custom receiver contract
- Params: Optional encoded parameters for the receiver

Note: Flash loans must be repaid within the same transaction with a 0.05% fee.

Respond with the extracted parameters in JSON format:
{
  "assets": ["string"],
  "amounts": ["string"],
  "receiverAddress": "string (optional)",
  "params": "string (optional)"
}

Make sure to wrap your JSON response in triple backticks with 'json' marker.`;

const flashLoanResponseTemplate = `Flash Loan Information:

{{#if success}}
⚡ Flash loan parameters prepared:

Assets: {{assets}}
Amounts: {{amounts}}
Total fees: {{totalFees}}

⚠️ Important: Flash loans require a custom receiver contract that implements the IFlashLoanReceiver interface.

To execute a flash loan:
1. Deploy a receiver contract that implements executeOperation()
2. The contract must repay the loan + fees within the same transaction
3. Use the receiver contract address when calling the flash loan

Example use cases:
- Arbitrage between DEXs
- Collateral swapping
- Self-liquidation
- Debt refinancing

Would you like help creating a flash loan receiver contract for your use case?
{{else}}
❌ Flash loan preparation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

function getErrorSuggestions(error: Error): string[] {
  const message = error.message.toLowerCase();
  const suggestions: string[] = [];

  if (message.includes('receiver')) {
    suggestions.push('Flash loans require a custom receiver contract');
    suggestions.push('The contract must implement IFlashLoanReceiver interface');
    suggestions.push('Consider using existing flash loan frameworks');
  }
  if (message.includes('arrays must have')) {
    suggestions.push('Provide the same number of assets and amounts');
    suggestions.push('Example: 2 assets need 2 amounts');
  }
  if (message.includes('not supported')) {
    suggestions.push('Check if the asset is available on Aave V3');
    suggestions.push('Ensure sufficient liquidity exists for the flash loan');
  }

  return suggestions;
}

export const flashLoanAction: Action = {
  name: 'AAVE_FLASH_LOAN',
  description: 'Execute flash loans on Aave V3 (requires custom receiver contract)',

  validate: (runtime: IAgentRuntime, message: Memory): boolean => {
    const text = message.content.text.toLowerCase();
    return (text.includes('flash loan') || text.includes('flashloan')) && text.includes('aave');
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
        template: flashLoanTemplate,
      });

      // Generate response to extract parameters
      const extractionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        stopSequences: [],
      });

      // Parse JSON from response
      const extractedParams = parseJSONObjectFromText(extractionResponse);

      if (!extractedParams || !extractedParams.assets || !extractedParams.amounts) {
        throw new Error('Could not parse flash loan parameters from message');
      }

      const params: FlashLoanActionParams = {
        assets: extractedParams.assets.map((a: string) => a.toUpperCase()),
        amounts: extractedParams.amounts,
        receiverAddress: extractedParams.receiverAddress,
        params: extractedParams.params,
      };

      // Validate arrays have same length
      if (params.assets.length !== params.amounts.length) {
        throw new Error('Assets and amounts arrays must have the same length');
      }

      // Calculate total fees (0.05% for Aave V3)
      const flashLoanFee = 0.0005; // 0.05%
      const fees = params.amounts.map((amount) =>
        new BigNumber(amount).times(flashLoanFee).toFixed(6)
      );
      const totalFeesFormatted = params.assets.map((asset, i) => `${fees[i]} ${asset}`).join(', ');

      // Note: Actual flash loan execution requires a receiver contract
      // This is a preparatory action that helps users understand requirements

      // Generate response
      const responseContext = composePrompt({
        state,
        template: flashLoanResponseTemplate,
        success: true,
        assets: params.assets.join(', '),
        amounts: params.amounts.map((a, i) => `${a} ${params.assets[i]}`).join(', '),
        totalFees: totalFeesFormatted,
      });

      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: responseContext,
        stopSequences: [],
      });

      if (callback) {
        await callback({
          text: response,
          actions: ['AAVE_FLASH_LOAN'],
          data: {
            assets: params.assets,
            amounts: params.amounts,
            fees,
            flashLoanFee: `${flashLoanFee * 100}%`,
          },
        });
      }

      return true;
    } catch (error: any) {
      const errorContext = composePrompt({
        state,
        template: flashLoanResponseTemplate,
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
          actions: ['AAVE_FLASH_LOAN'],
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'I want to flash loan 10000 USDC from Aave' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll help you prepare a flash loan for 10000 USDC from Aave V3. Note that you'll need a receiver contract.",
          action: 'AAVE_FLASH_LOAN',
        },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Flash loan 5 ETH and 10000 USDC for arbitrage' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll prepare the flash loan parameters for 5 ETH and 10000 USDC for your arbitrage strategy.",
          action: 'AAVE_FLASH_LOAN',
        },
      },
    ],
  ],
};
