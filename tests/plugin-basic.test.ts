import { describe, it, expect } from 'bun:test';
import {
  supplyAction,
  borrowAction,
  repayAction,
  withdrawAction,
  rateSwitchAction,
  collateralManagementAction,
  eModeAction,
  flashLoanAction,
} from '../src/actions';

describe('Aave Plugin Basic Structure', () => {
  describe('individual action objects', () => {
    const actions = [
      { name: 'supplyAction', action: supplyAction, expectedName: 'AAVE_SUPPLY' },
      { name: 'borrowAction', action: borrowAction, expectedName: 'AAVE_BORROW' },
      { name: 'repayAction', action: repayAction, expectedName: 'AAVE_REPAY' },
      { name: 'withdrawAction', action: withdrawAction, expectedName: 'AAVE_WITHDRAW' },
      { name: 'rateSwitchAction', action: rateSwitchAction, expectedName: 'AAVE_RATE_SWITCH' },
      {
        name: 'collateralManagementAction',
        action: collateralManagementAction,
        expectedName: 'AAVE_COLLATERAL_MANAGEMENT',
      },
      { name: 'eModeAction', action: eModeAction, expectedName: 'AAVE_EMODE' },
      { name: 'flashLoanAction', action: flashLoanAction, expectedName: 'AAVE_FLASH_LOAN' },
    ];

    actions.forEach(({ name, action, expectedName }) => {
      describe(name, () => {
        it('should be a plain object with correct structure', () => {
          expect(typeof action).toBe('object');
          expect(action.constructor).toBe(Object);
          expect(action.name).toBe(expectedName);
          expect(typeof action.description).toBe('string');
          expect(typeof action.validate).toBe('function');
          expect(typeof action.handler).toBe('function');
          expect(Array.isArray(action.examples)).toBe(true);
        });

        it('should have valid examples structure', () => {
          expect(action.examples).toBeArray();
          expect(action.examples.length).toBeGreaterThan(0);

          action.examples.forEach((example) => {
            expect(example).toBeArray();
            expect(example.length).toBe(2);

            const [userMessage, assistantMessage] = example;
            expect(userMessage.user).toBe('user');
            expect(userMessage.content).toHaveProperty('text');

            expect(assistantMessage.user).toBe('assistant');
            expect(assistantMessage.content).toHaveProperty('text');
            expect(assistantMessage.content).toHaveProperty('action');
            expect(assistantMessage.content.action).toBe(expectedName);
          });
        });

        it('validate function should work correctly', () => {
          const mockRuntime = {};

          // Test with relevant message
          const relevantMessage = {
            content: { text: getRelevantText(expectedName) },
          };
          const result = action.validate(mockRuntime as any, relevantMessage as any);
          expect(typeof result).toBe('boolean');

          // Test with irrelevant message
          const irrelevantMessage = {
            content: { text: 'This is completely unrelated to Aave or DeFi' },
          };
          const irrelevantResult = action.validate(mockRuntime as any, irrelevantMessage as any);
          expect(typeof irrelevantResult).toBe('boolean');
        });

        it('should have non-empty description', () => {
          expect(action.description.length).toBeGreaterThan(0);
          expect(action.description).toContain('Aave');
        });
      });
    });
  });

  describe('action consistency', () => {
    const allActions = [
      supplyAction,
      borrowAction,
      repayAction,
      withdrawAction,
      rateSwitchAction,
      collateralManagementAction,
      eModeAction,
      flashLoanAction,
    ];

    it('should have unique action names', () => {
      const actionNames = allActions.map((action) => action.name);
      const uniqueNames = new Set(actionNames);
      expect(uniqueNames.size).toBe(actionNames.length);
    });

    it('should all have AAVE_ prefix in names', () => {
      allActions.forEach((action) => {
        expect(action.name).toStartWith('AAVE_');
      });
    });

    it('should all have descriptions containing Aave', () => {
      allActions.forEach((action) => {
        expect(action.description).toContain('Aave');
      });
    });

    it('should all have at least one example', () => {
      allActions.forEach((action) => {
        expect(action.examples.length).toBeGreaterThan(0);
      });
    });

    it('should all be plain objects (not class instances)', () => {
      allActions.forEach((action) => {
        expect(typeof action).toBe('object');
        expect(action.constructor).toBe(Object);
        // Ensure it's not a class instance
        expect(action.constructor.name).toBe('Object');
      });
    });
  });

  describe('action validation patterns', () => {
    it('supplyAction should validate supply-related messages', () => {
      const mockRuntime = {};

      expect(
        supplyAction.validate(
          mockRuntime as any,
          {
            content: { text: 'I want to supply 1000 USDC to Aave' },
          } as any
        )
      ).toBe(true);

      expect(
        supplyAction.validate(
          mockRuntime as any,
          {
            content: { text: 'Supply ETH and lend' },
          } as any
        )
      ).toBe(true);

      expect(
        supplyAction.validate(
          mockRuntime as any,
          {
            content: { text: 'I want to borrow money' },
          } as any
        )
      ).toBe(false);
    });

    it('borrowAction should validate borrow-related messages', () => {
      const mockRuntime = {};

      expect(
        borrowAction.validate(
          mockRuntime as any,
          {
            content: { text: 'I want to borrow 500 USDC from Aave' },
          } as any
        )
      ).toBe(true);

      expect(
        borrowAction.validate(
          mockRuntime as any,
          {
            content: { text: 'Take a loan from Aave' },
          } as any
        )
      ).toBe(false);

      expect(
        borrowAction.validate(
          mockRuntime as any,
          {
            content: { text: 'I want to supply tokens' },
          } as any
        )
      ).toBe(false);
    });

    it('flashLoanAction should validate flash loan messages', () => {
      const mockRuntime = {};

      expect(
        flashLoanAction.validate(
          mockRuntime as any,
          {
            content: { text: 'I want a flash loan from Aave' },
          } as any
        )
      ).toBe(true);

      expect(
        flashLoanAction.validate(
          mockRuntime as any,
          {
            content: { text: 'flashloan 10000 USDC from Aave' },
          } as any
        )
      ).toBe(true);

      expect(
        flashLoanAction.validate(
          mockRuntime as any,
          {
            content: { text: 'regular loan please' },
          } as any
        )
      ).toBe(false);
    });
  });
});

// Helper function to get relevant text for each action type
function getRelevantText(actionName: string): string {
  switch (actionName) {
    case 'AAVE_SUPPLY':
      return 'I want to supply USDC to Aave';
    case 'AAVE_BORROW':
      return 'I want to borrow ETH from Aave';
    case 'AAVE_REPAY':
      return 'I want to repay my debt on Aave';
    case 'AAVE_WITHDRAW':
      return 'I want to withdraw my funds from Aave';
    case 'AAVE_RATE_SWITCH':
      return 'I want to switch my rate from stable to variable on Aave';
    case 'AAVE_COLLATERAL_MANAGEMENT':
      return 'I want to enable my USDC as collateral on Aave';
    case 'AAVE_EMODE':
      return 'I want to enable efficiency mode on Aave';
    case 'AAVE_FLASH_LOAN':
      return 'I want to take a flash loan from Aave';
    default:
      return 'Aave related message';
  }
}
