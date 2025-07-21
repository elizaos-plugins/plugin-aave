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
import { SupplyParams } from '../types';

const supplyTemplate = `You are an AI assistant helping users supply assets to Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the supply parameters from the user's request:
- Asset: The token to supply (e.g., USDC, ETH, DAI)
- Amount: The amount to supply
- Enable as collateral: Whether to enable the asset as collateral (default: true)

Respond with the extracted parameters in JSON format:
{
  "asset": "string",
  "amount": "string",
  "enableCollateral": boolean
}

Make sure to wrap your JSON response in triple backticks with 'json' marker.`;

const supplyResponseTemplate = `Based on the supply operation:

{{#if success}}
✅ Successfully supplied {{amount}} {{asset}} to Aave V3!

Transaction hash: {{transactionHash}}
aToken balance: {{aTokenBalance}} {{asset}}
Current APY: {{baseAPY}}% {{#if incentiveAPR}}(+{{incentiveAPR}}% incentives){{/if}}
Total effective APY: {{totalAPY}}%
Collateral enabled: {{collateralEnabled}}

{{#if gasUsed}}Gas used: {{gasUsed}} ({{gasCostUSD}} USD){{/if}}

Your {{asset}} is now earning {{totalAPY}}% APY.
{{#if collateralEnabled}}You can use this as collateral for borrowing.{{/if}}

{{#if permitUsed}}
🔥 Gasless transaction completed using permit signature!
{{/if}}

{{#if recommendedActions}}
Recommendations:
{{#each recommendedActions}}
- {{this}}
{{/each}}
{{/if}}
{{else}}
❌ Supply operation failed: {{error}}

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

  if (message.includes('insufficient balance')) {
    suggestions.push('Check your wallet balance');
    suggestions.push('Try supplying a smaller amount');
  }
  if (message.includes('not supported')) {
    suggestions.push('Check if the asset is supported on Aave V3');
    suggestions.push('Try supplying USDC, ETH, or DAI');
  }
  if (message.includes('approval')) {
    suggestions.push('The token approval will be handled automatically');
    suggestions.push('Consider using permit signatures for gasless transactions');
    suggestions.push('Ensure you have enough ETH for gas fees');
  }
  if (message.includes('permit')) {
    suggestions.push('Permit signature failed - falling back to regular approval');
    suggestions.push('Make sure your wallet supports EIP-2612 permits');
  }
  if (message.includes('gas')) {
    suggestions.push('Consider using permit signatures to reduce gas costs');
    suggestions.push('Wait for lower gas prices or use Layer 2 solutions');
  }

  return suggestions;
}

export const supplyAction: Action = {
  name: 'AAVE_SUPPLY',
  description: 'Supply assets to Aave V3 lending protocol',

  validate: (runtime: IAgentRuntime, message: Memory): boolean => {
    const text = message.content.text.toLowerCase();
    return (
      text.includes('supply') &&
      (text.includes('aave') || text.includes('lend') || text.includes('deposit'))
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
        template: supplyTemplate,
      });

      // Generate response to extract parameters
      const extractionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        stopSequences: [],
      });

      // Parse JSON from response
      const extractedParams = parseJSONObjectFromText(extractionResponse);

      if (!extractedParams || !extractedParams.asset || !extractedParams.amount) {
        throw new Error('Could not parse supply parameters from message');
      }

      const params: SupplyParams = {
        asset: extractedParams.asset.toUpperCase(),
        amount: extractedParams.amount,
        enableCollateral: extractedParams.enableCollateral !== false, // default to true
      };

      // Get user address
      const userAddress = await walletService.getAddress();

      // Check wallet balance
      const balance = await walletService.getBalance(params.asset);
      const supplyAmount = new BigNumber(params.amount);

      if (balance.lt(supplyAmount)) {
        throw new Error(`Insufficient balance. You have ${balance.toString()} ${params.asset}`);
      }

      // Execute supply operation
      const result = await aaveService.supply(
        params.asset,
        supplyAmount,
        userAddress,
        0 // referral code
      );

      // Enable as collateral if requested
      if (params.enableCollateral && !result.collateralEnabled) {
        await aaveService.setUserUseReserveAsCollateral(params.asset, true);
        result.collateralEnabled = true;
      }

      // Calculate enhanced APY information
      const baseAPY = result.apy;
      const incentiveAPR = 0; // TODO: Add incentive calculation
      const totalAPY = baseAPY + incentiveAPR;

      // Generate response
      const responseContext = composePrompt({
        state,
        template: supplyResponseTemplate,
        success: true,
        amount: params.amount,
        asset: params.asset,
        transactionHash: result.transactionHash,
        aTokenBalance: result.aTokenBalance.toFixed(6),
        baseAPY: baseAPY.toFixed(2),
        incentiveAPR: incentiveAPR > 0 ? incentiveAPR.toFixed(2) : null,
        totalAPY: totalAPY.toFixed(2),
        collateralEnabled: result.collateralEnabled,
      });

      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: responseContext,
        stopSequences: [],
      });

      if (callback) {
        await callback({
          text: response,
          actions: ['AAVE_SUPPLY'],
          data: result,
        });
      }

      return true;
    } catch (error: any) {
      const errorContext = composePrompt({
        state,
        template: supplyResponseTemplate,
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
          actions: ['AAVE_SUPPLY'],
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'I want to supply 1000 USDC to Aave' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll help you supply 1000 USDC to Aave V3. Let me process this transaction for you.",
          action: 'AAVE_SUPPLY',
        },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Supply 0.5 ETH to Aave as collateral' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll supply 0.5 ETH to Aave V3 and enable it as collateral for borrowing.",
          action: 'AAVE_SUPPLY',
        },
      },
    ],
  ],
};
