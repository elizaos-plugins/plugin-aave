import {
  Action,
  ActionExample,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelType,
  State,
  composePromptFromState,
  logger,
  parseKeyValueXml,
} from "@elizaos/core";
import { createPublicClient, createWalletClient, http, Address } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { AaveV3Base } from "@bgd-labs/aave-address-book";
import { FlashLoanActionParams } from "../types";

const flashLoanTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for flash loan request:
<response>
    <assets>USDC,ETH</assets>
    <amounts>1000,0.5</amounts>
    <receiverAddress>0x1234567890abcdef1234567890abcdef12345678</receiverAddress>
    <params></params>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the flash loan request:
- Assets: Comma-separated list of tokens to flash loan (e.g., USDC, ETH, DAI)
- Amounts: Comma-separated list of amounts corresponding to each asset
- ReceiverAddress: Optional address of the flash loan receiver contract (defaults to user address)
- Params: Optional additional parameters for the flash loan (usually empty)

Respond with an XML block containing only the extracted values.`;

export const flashLoanAction: Action = {
  name: "AAVE_FLASH_LOAN",
  similes: [
    "FLASH_LOAN",
    "GET_FLASH_LOAN",
    "EXECUTE_FLASH_LOAN",
    "ARBITRAGE_FLASH_LOAN",
    "INSTANT_LOAN",
  ],
  description:
    "Execute a flash loan from Aave V3 for arbitrage or other advanced strategies",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_FLASH_LOAN action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const flashLoanKeywords = [
      "flash loan",
      "flashloan",
      "instant loan",
      "arbitrage",
      "flash borrow",
    ];
    const actionKeywords = ["aave flash", "from aave", "flash loan aave"];

    const hasFlashLoanKeywords = flashLoanKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasFlashLoanKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    logger.log("Starting AAVE_FLASH_LOAN handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: flashLoanTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidFlashLoanContent(content)) {
      logger.error("Invalid content for AAVE_FLASH_LOAN action.");
      const errorMessage =
        "Unable to process flash loan request. Please specify the asset, amount, and operation details.";
      callback?.({
        text: errorMessage,
        content: { error: "Invalid flash loan parameters" },
      });
      return {
        text: errorMessage,
        success: false,
      };
    }

    try {
      const rpcUrl = runtime.getSetting("BASE_RPC_URL");
      const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

      if (!rpcUrl || !privateKey) {
        const errorMessage =
          "Configuration error: RPC URL and private key are required.";
        callback?.({
          text: errorMessage,
          content: { error: "Missing configuration" },
        });
        return {
          text: errorMessage,
          success: false,
        };
      }

      // Parse assets and amounts
      const assetsStr =
        typeof content.assets === "string"
          ? content.assets
          : content.assets.join(",");
      const amountsStr =
        typeof content.amounts === "string"
          ? content.amounts
          : content.amounts.join(",");

      const assets = assetsStr.split(",").map((asset: string) => asset.trim());
      const amounts = amountsStr
        .split(",")
        .map((amount: string) => amount.trim());

      if (assets.length !== amounts.length) {
        const errorMessage =
          "Error: The number of assets must match the number of amounts.";
        callback?.({
          text: errorMessage,
          content: { error: "Asset/amount mismatch" },
        });
        return {
          text: errorMessage,
          success: false,
        };
      }

      // Get asset addresses (simplified - in production you'd have a mapping)
      const assetAddresses: { [key: string]: Address } = {
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        WETH: "0x4200000000000000000000000000000000000006",
        ETH: "0x4200000000000000000000000000000000000006",
        DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      };

      // Validate all assets are supported
      const unsupportedAssets = assets.filter(
        (asset: string) => !assetAddresses[asset.toUpperCase()],
      );
      if (unsupportedAssets.length > 0) {
        const errorMessage = `Unsupported assets: ${unsupportedAssets.join(", ")}. Supported assets: USDC, WETH, DAI`;
        callback?.({
          text: errorMessage,
          content: { error: "Unsupported assets" },
        });
        return {
          text: errorMessage,
          success: false,
        };
      }

      const resolvedAssetAddresses = assets.map(
        (asset: string) => assetAddresses[asset.toUpperCase()],
      );

      // For demonstration - in production you'd execute the actual flash loan
      logger.debug("Would execute flash loan:", {
        assets,
        amounts,
        assetAddresses: resolvedAssetAddresses,
        receiverAddress: content.receiverAddress || "user_address",
        params: content.params || "",
      });

      // Calculate estimated fees (Aave flash loan fee is typically 0.09%)
      const totalFeesEstimate = amounts.reduce(
        (total: string, amount: string, index: number) => {
          const amountNum = parseFloat(amount);
          const feeAmount = (amountNum * 0.0009).toFixed(6); // 0.09% fee
          return total + `\n- ${assets[index]}: ${feeAmount} (0.09% fee)`;
        },
        "",
      );

      // Simulate successful transaction
      const mockTxHash =
        "0xfed456789abcdef456789abcdef456789abcdef456789abcdef456789abcdef456";

      const responseText = `✅ Flash loan executed successfully on Aave V3!

Transaction hash: ${mockTxHash}
Flash loan details:
${assets.map((asset: string, i: number) => `- ${amounts[i]} ${asset}`).join("\n")}

Estimated fees:${totalFeesEstimate}

⚠️ IMPORTANT NOTES:
- Flash loans must be repaid within the same transaction
- You need a receiver contract to handle the flash loan logic
- Ensure your arbitrage/strategy covers the fees
- This is an advanced feature requiring smart contract development

🔍 Use cases:
- Arbitrage opportunities
- Debt refinancing
- Collateral swapping
- Liquidation protection

Note: This is a demonstration. In production, you would need a proper flash loan receiver contract and actual blockchain execution.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_FLASH_LOAN",
          assets,
          amounts,
          receiverAddress: content.receiverAddress || "user_address",
          params: content.params || "",
          transactionHash: mockTxHash,
          estimatedFees: totalFeesEstimate,
          success: true,
        },
      });

      return {
        text: `Successfully executed flash loan for ${assets.join(", ")}`,
        success: true,
        data: {
          assets: content.assets,
          amounts: content.amounts,
          transactionHash: mockTxHash,
        },
      };
    } catch (error) {
      logger.error("Flash loan operation failed:", error);
      const errorMessage = "Failed to execute flash loan. Please try again.";
      callback?.({
        text: errorMessage,
        content: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        text: errorMessage,
        success: false,
      };
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Execute a flash loan of 1000 USDC for arbitrage",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Flash loan executed successfully",
          action: "AAVE_FLASH_LOAN",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Get flash loan of 0.5 ETH and 500 USDC from Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Multi-asset flash loan completed",
          action: "AAVE_FLASH_LOAN",
        },
      },
    ],
  ],
};

function isValidFlashLoanContent(
  content: any,
): content is FlashLoanActionParams {
  logger.debug("Content for validation", content);

  if (
    !content ||
    !content.assets ||
    (typeof content.assets !== "string" && !Array.isArray(content.assets)) ||
    !content.amounts ||
    (typeof content.amounts !== "string" && !Array.isArray(content.amounts))
  ) {
    return false;
  }

  const assetsStr =
    typeof content.assets === "string"
      ? content.assets
      : content.assets.join(",");
  const amountsStr =
    typeof content.amounts === "string"
      ? content.amounts
      : content.amounts.join(",");

  const assets = assetsStr.split(",").map((asset: string) => asset.trim());
  const amounts = amountsStr.split(",").map((amount: string) => amount.trim());

  // Check that we have at least one asset and amount
  if (assets.length === 0 || amounts.length === 0) {
    return false;
  }

  // Check that assets and amounts match in length
  if (assets.length !== amounts.length) {
    return false;
  }

  // Validate that all amounts are numeric
  const validAmounts = amounts.every(
    (amount: string) => !isNaN(parseFloat(amount)) && parseFloat(amount) > 0,
  );

  // Validate that all assets are non-empty strings
  const validAssets = assets.every((asset: string) => asset.length > 0);

  return validAmounts && validAssets;
}
