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
import { eModeParams } from '../types';

const eModeTemplate = `You are an AI assistant helping users manage efficiency mode (eMode) on Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the eMode parameters from the user's request:
- Category ID: 0 to disable, 1 for stablecoins, 2 for ETH-correlated assets
- Enable: true to enable eMode, false to disable (sets categoryId to 0)

eMode categories:
- Category 0: Disabled (standard mode)
- Category 1: Stablecoins (USDC, DAI, etc.) - up to 97% LTV
- Category 2: ETH-correlated (ETH, wETH, stETH) - up to 90% LTV

Respond with the extracted parameters in JSON format:
{
  "categoryId": 0 | 1 | 2,
  "enable": boolean
}

Make sure to wrap your JSON response in triple backticks with 'json' marker.`;

const eModeResponseTemplate = `Based on the efficiency mode operation:

{{#if success}}
✅ Successfully {{#if enabled}}enabled{{else}}disabled{{/if}} efficiency mode!

Transaction hash: {{transactionHash}}

{{#if enabled}}
eMode Category: {{categoryLabel}} (ID: {{categoryId}})

Improvements achieved:
- LTV: +{{ltvImprovement}}% (better borrowing power)
- Liquidation threshold: +{{liquidationThresholdImprovement}}% (safer position)

You can now borrow more efficiently with {{categoryLabel}} assets.
{{else}}
eMode has been disabled. You are now in standard mode.
Your LTV and liquidation thresholds have returned to default values.
{{/if}}

{{#if recommendation}}
💡 {{recommendation}}
{{/if}}
{{else}}
❌ Efficiency mode operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

function getCategoryLabel(categoryId: number): string {
  switch (categoryId) {
    case 0:
      return 'Disabled';
    case 1:
      return 'Stablecoins';
    case 2:
      return 'ETH-correlated';
    default:
      return `Category ${categoryId}`;
  }
}

function checkAssetCompatibility(position: any, categoryId: number): string[] {
  const incompatible: string[] = [];

  const allAssets = [
    ...position.supplies.map((s: any) => s.symbol),
    ...position.borrows.map((b: any) => b.symbol),
  ];

  for (const asset of allAssets) {
    if (categoryId === 1) {
      // Stablecoin category
      if (!['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD'].includes(asset)) {
        incompatible.push(asset);
      }
    } else if (categoryId === 2) {
      // ETH category
      if (!['ETH', 'WETH', 'stETH', 'wstETH', 'rETH'].includes(asset)) {
        incompatible.push(asset);
      }
    }
  }

  return [...new Set(incompatible)]; // Remove duplicates
}

function geteModeRecommendation(categoryId: number, position: any): string {
  if (categoryId === 0) {
    return 'Standard mode provides flexibility to supply and borrow any supported assets.';
  } else if (categoryId === 1) {
    return 'Stablecoin eMode is ideal for maximizing stablecoin borrowing with up to 97% LTV.';
  } else if (categoryId === 2) {
    return 'ETH eMode is perfect for leveraged ETH strategies with up to 90% LTV.';
  }
  return '';
}

function getErrorSuggestions(error: Error): string[] {
  const message = error.message.toLowerCase();
  const suggestions: string[] = [];

  if (message.includes('incompatible assets')) {
    suggestions.push('You have assets that are not compatible with this eMode category');
    suggestions.push('Consider switching all positions to compatible assets first');
    suggestions.push('Category 1 is for stablecoins only (USDC, DAI, etc.)');
    suggestions.push('Category 2 is for ETH-correlated assets only (ETH, stETH, etc.)');
  }
  if (message.includes('already')) {
    suggestions.push('The efficiency mode is already set as requested');
    suggestions.push('No change is needed');
  }
  if (message.includes('cannot enable')) {
    suggestions.push('Check your current positions for compatibility');
    suggestions.push('You may need to close incompatible positions first');
  }

  return suggestions;
}

export const eModeAction: Action = {
  name: 'AAVE_EMODE',
  description: 'Manage efficiency mode (eMode) settings on Aave V3',

  validate: (runtime: IAgentRuntime, message: Memory): boolean => {
    const text = message.content.text.toLowerCase();
    return (
      (text.includes('emode') ||
        text.includes('efficiency mode') ||
        text.includes('e mode') ||
        text.includes('e-mode')) &&
      text.includes('aave')
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
        template: eModeTemplate,
      });

      // Generate response to extract parameters
      const extractionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        stopSequences: [],
      });

      // Parse JSON from response
      const extractedParams = parseJSONObjectFromText(extractionResponse);

      if (
        !extractedParams ||
        extractedParams.categoryId === undefined ||
        extractedParams.enable === undefined
      ) {
        throw new Error('Could not parse eMode parameters from message');
      }

      // Handle enable/disable logic
      const categoryId = extractedParams.enable ? extractedParams.categoryId : 0;

      const params: eModeParams = {
        categoryId,
        enable: categoryId !== 0,
      };

      // Get user address
      const userAddress = await walletService.getAddress();

      // Get current position to check compatibility
      const position = await aaveService.getUserPosition(userAddress);

      // Check if already in desired state
      if (position.eModeCategory === params.categoryId) {
        const modeText =
          params.categoryId === 0 ? 'disabled' : `set to category ${params.categoryId}`;
        throw new Error(`Efficiency mode is already ${modeText}`);
      }

      // Validate asset compatibility for eMode categories
      if (params.categoryId > 0) {
        const incompatibleAssets = checkAssetCompatibility(position, params.categoryId);
        if (incompatibleAssets.length > 0) {
          throw new Error(
            `Cannot enable eMode category ${params.categoryId}. Incompatible assets: ${incompatibleAssets.join(', ')}`
          );
        }
      }

      // Execute eMode change
      const result = await aaveService.setUserEMode(params.categoryId);

      // Get category label
      const categoryLabel = getCategoryLabel(params.categoryId);

      // Generate recommendation
      const recommendation = geteModeRecommendation(params.categoryId, position);

      // Generate response
      const responseContext = composePrompt({
        state,
        template: eModeResponseTemplate,
        success: true,
        enabled: result.enabled,
        categoryId: result.categoryId,
        categoryLabel,
        transactionHash: result.transactionHash,
        ltvImprovement: result.ltvImprovement.toFixed(0),
        liquidationThresholdImprovement: result.liquidationThresholdImprovement.toFixed(0),
        recommendation,
      });

      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: responseContext,
        stopSequences: [],
      });

      if (callback) {
        await callback({
          text: response,
          actions: ['AAVE_EMODE'],
          data: result,
        });
      }

      return true;
    } catch (error: any) {
      const errorContext = composePrompt({
        state,
        template: eModeResponseTemplate,
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
          actions: ['AAVE_EMODE'],
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'Enable efficiency mode for stablecoins on Aave' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll enable efficiency mode category 1 (stablecoins) to maximize your capital efficiency.",
          action: 'AAVE_EMODE',
        },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Disable eMode on Aave' },
      },
      {
        user: 'assistant',
        content: {
          text: "I'll disable efficiency mode and return your position to standard mode.",
          action: 'AAVE_EMODE',
        },
      },
    ],
  ],
};
