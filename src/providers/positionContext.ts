import {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
  logger,
} from "@elizaos/core";
import BigNumber from "bignumber.js";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { AaveV3Base } from "@bgd-labs/aave-address-book";

export const positionContextProvider: Provider = {
  name: "positionContextProvider",
  description:
    "Provides current Aave V3 position context including supplies, borrows, and health metrics",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<ProviderResult> => {
    logger.debug("positionContextProvider::get");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const walletAddress = runtime.getSetting("WALLET_ADDRESS");

    if (!rpcUrl) {
      logger.error("BASE_RPC_URL not configured");
      return {
        text: "Position data unavailable - RPC URL not configured",
        data: { error: "RPC URL required" },
      };
    }

    if (!walletAddress) {
      logger.debug(
        "positionContextProvider: No wallet address configured, returning neutral context",
      );
      return {
        text: "Position data available when wallet address is provided",
        data: { provider: "positionContextProvider", status: "neutral" },
      };
    }

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      // Get user account data from Aave Pool
      const poolAddress = AaveV3Base.POOL;
      const userData = await publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "user", type: "address" },
            ],
            name: "getUserAccountData",
            outputs: [
              {
                internalType: "uint256",
                name: "totalCollateralETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalDebtETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "availableBorrowsETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "currentLiquidationThreshold",
                type: "uint256",
              },
              { internalType: "uint256", name: "ltv", type: "uint256" },
              {
                internalType: "uint256",
                name: "healthFactor",
                type: "uint256",
              },
            ],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "getUserAccountData",
        args: [walletAddress as `0x${string}`],
      });

      const [
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
      ] = userData as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

      // Convert to readable format
      const totalCollateralBN = new BigNumber(
        totalCollateralETH.toString(),
      ).dividedBy(1e18);
      const totalDebtBN = new BigNumber(totalDebtETH.toString()).dividedBy(
        1e18,
      );
      const availableBorrowsBN = new BigNumber(
        availableBorrowsETH.toString(),
      ).dividedBy(1e18);
      const healthFactorBN = new BigNumber(healthFactor.toString()).dividedBy(
        1e18,
      );

      // Calculate current LTV
      const currentLTV = totalCollateralBN.gt(0)
        ? totalDebtBN.dividedBy(totalCollateralBN).times(100)
        : new BigNumber(0);

      // Format health factor
      const healthFactorFormatted = healthFactorBN.isFinite()
        ? healthFactorBN.toFixed(2)
        : "∞";

      // Determine position status
      let positionStatus = "No Position";
      if (totalCollateralBN.gt(0) && totalDebtBN.gt(0)) {
        positionStatus = "Active Lending & Borrowing";
      } else if (totalCollateralBN.gt(0)) {
        positionStatus = "Lending Only";
      } else if (totalDebtBN.gt(0)) {
        positionStatus = "Borrowing Only";
      }

      // Create position summary
      let positionSummary = `Aave V3 Position Summary:

Status: ${positionStatus}
Total Collateral: ${totalCollateralBN.toFixed(4)} ETH
Total Debt: ${totalDebtBN.toFixed(4)} ETH
Available Borrows: ${availableBorrowsBN.toFixed(4)} ETH
Current LTV: ${currentLTV.toFixed(1)}%
Health Factor: ${healthFactorFormatted}`;

      // Add recommendations based on position
      const recommendations: string[] = [];

      if (totalCollateralBN.eq(0) && totalDebtBN.eq(0)) {
        recommendations.push(
          "No active position - consider supplying assets to earn yield",
        );
        recommendations.push(
          "Start with stable assets like USDC for lower risk",
        );
      } else if (totalDebtBN.eq(0)) {
        recommendations.push(
          "Consider borrowing against your collateral if you need liquidity",
        );
        recommendations.push(
          "Monitor supply APY rates for optimization opportunities",
        );
      } else if (healthFactorBN.lt(1.5) && healthFactorBN.isFinite()) {
        recommendations.push(
          "⚠️ Health factor is low - consider adding collateral or repaying debt",
        );
        recommendations.push("Monitor position closely to avoid liquidation");
      } else {
        recommendations.push(
          "Position looks healthy - monitor rates for optimization",
        );
        if (availableBorrowsBN.gt(0)) {
          recommendations.push(
            `You can still borrow up to ${availableBorrowsBN.toFixed(4)} ETH`,
          );
        }
      }

      if (recommendations.length > 0) {
        positionSummary += `\n\nRecommendations:\n${recommendations.map((r) => `- ${r}`).join("\n")}`;
      }

      return {
        text: positionSummary,
        data: {
          address: walletAddress,
          status: positionStatus.toLowerCase().replace(/\s+/g, "_"),
          totalCollateral: totalCollateralBN.toNumber(),
          totalDebt: totalDebtBN.toNumber(),
          availableBorrows: availableBorrowsBN.toNumber(),
          currentLTV: currentLTV.toNumber(),
          healthFactor: healthFactorBN.isFinite()
            ? healthFactorBN.toNumber()
            : null,
          recommendations,
          hasSupplies: totalCollateralBN.gt(0),
          hasBorrows: totalDebtBN.gt(0),
          liquidationThreshold: new BigNumber(
            currentLiquidationThreshold.toString(),
          )
            .dividedBy(10000)
            .times(100)
            .toNumber(),
        },
        values: {
          totalCollateral: totalCollateralBN.toNumber(),
          totalDebt: totalDebtBN.toNumber(),
          availableBorrows: availableBorrowsBN.toNumber(),
          currentLTV: currentLTV.toNumber(),
          healthFactor: healthFactorBN.isFinite()
            ? healthFactorBN.toNumber()
            : null,
          utilizationRate: totalCollateralBN.gt(0)
            ? totalDebtBN.dividedBy(totalCollateralBN).toNumber()
            : 0,
        },
      };
    } catch (error) {
      logger.error("positionContextProvider: Error fetching position data:", {
        error: error instanceof Error ? error.message : String(error),
        address: walletAddress,
        rpcUrl,
      });
      return {
        text: "Position data temporarily unavailable",
        data: {
          provider: "positionContextProvider",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          address: walletAddress,
        },
      };
    }
  },
};
