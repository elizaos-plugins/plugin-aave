import { describe, it, expect, beforeEach } from 'bun:test';
import { supplyAction, withdrawAction, borrowAction, repayAction } from '../src/actions/index.js';
import { createMockMessage, createTestRuntime, TestData, TestHelpers } from './test-config.js';
import { InterestRateMode } from '../src/types/index.js';

describe('Aave Actions', () => {
  let mockRuntime: any;
  
  beforeEach(() => {
    mockRuntime = createTestRuntime();
  });

  describe('Supply Action', () => {
    it('should validate supply commands correctly', async () => {
      for (const command of TestData.validSupplyCommands) {
        const message = createMockMessage(command);
        const isValid = await supplyAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid commands', async () => {
      for (const command of TestData.invalidCommands) {
        const message = createMockMessage(command);
        const isValid = await supplyAction.validate(mockRuntime, message);
        expect(isValid).toBe(false);
      }
    });

    it('should have correct action properties', () => {
      expect(supplyAction.name).toBe('SUPPLY_TO_AAVE');
      expect(supplyAction.description.toLowerCase()).toContain('supply');
      expect(supplyAction.examples).toBeDefined();
      expect(supplyAction.examples.length).toBeGreaterThan(0);
    });

    it('should have working examples', async () => {
      // Test that examples pass validation
      for (const example of supplyAction.examples) {
        const userMessage = example[0];
        if (userMessage?.content?.text) {
          const message = createMockMessage(userMessage.content.text);
          const isValid = await supplyAction.validate(mockRuntime, message);
          expect(isValid).toBe(true);
        }
      }
    });
  });

  describe('Withdraw Action', () => {
    it('should validate withdraw commands correctly', async () => {
      for (const command of TestData.validWithdrawCommands) {
        const message = createMockMessage(command);
        const isValid = await withdrawAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid commands', async () => {
      for (const command of TestData.invalidCommands) {
        const message = createMockMessage(command);
        const isValid = await withdrawAction.validate(mockRuntime, message);
        expect(isValid).toBe(false);
      }
    });

    it('should handle max withdrawal commands', async () => {
      const maxCommands = [
        'withdraw all USDC',
        'withdraw maximum ETH',
        'take out everything',
      ];
      
      for (const command of maxCommands) {
        const message = createMockMessage(command);
        const isValid = await withdrawAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('Borrow Action', () => {
    it('should validate borrow commands correctly', async () => {
      for (const command of TestData.validBorrowCommands) {
        const message = createMockMessage(command);
        const isValid = await borrowAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should detect interest rate modes', async () => {
      const stableCommands = [
        'borrow 1000 USDC stable rate',
        'borrow 0.5 ETH with stable interest',
        'take stable loan of 500 DAI',
      ];
      
      const variableCommands = [
        'borrow 1000 USDC variable rate',
        'borrow 0.5 ETH variable',
        'take loan of 500 DAI',
      ];
      
      for (const command of stableCommands) {
        const message = createMockMessage(command);
        const isValid = await borrowAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
      
      for (const command of variableCommands) {
        const message = createMockMessage(command);
        const isValid = await borrowAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should have correct similes', () => {
      const expectedSimiles = [
        'BORROW_FROM_AAVE',
        'AAVE_LOAN',
        'TAKE_LOAN',
        'BORROW_ASSET',
        'DEFI_BORROW'
      ];
      
      for (const simile of expectedSimiles) {
        expect(borrowAction.similes).toContain(simile);
      }
    });
  });

  describe('Repay Action', () => {
    it('should validate repay commands correctly', async () => {
      for (const command of TestData.validRepayCommands) {
        const message = createMockMessage(command);
        const isValid = await repayAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should handle full repayment commands', async () => {
      const fullRepayCommands = [
        'repay all USDC debt',
        'pay back everything',
        'repay maximum DAI variable',
        'pay off all stable ETH debt',
      ];
      
      for (const command of fullRepayCommands) {
        const message = createMockMessage(command);
        const isValid = await repayAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should have correct similes', () => {
      const expectedSimiles = [
        'REPAY_TO_AAVE',
        'AAVE_REPAYMENT',
        'PAY_BACK',
        'REPAY_DEBT',
        'DEFI_REPAY',
        'PAYBACK_LOAN'
      ];
      
      for (const simile of expectedSimiles) {
        expect(repayAction.similes).toContain(simile);
      }
    });
  });

  describe('Cross-Action Validation', () => {
    it('should not cross-validate between different actions', async () => {
      // Supply commands should not validate for borrow action
      for (const command of TestData.validSupplyCommands) {
        const message = createMockMessage(command);
        const borrowValid = await borrowAction.validate(mockRuntime, message);
        expect(borrowValid).toBe(false);
      }
      
      // Borrow commands should not validate for repay action
      for (const command of TestData.validBorrowCommands) {
        const message = createMockMessage(command);
        const repayValid = await repayAction.validate(mockRuntime, message);
        expect(repayValid).toBe(false);
      }
    });

    it('should all reject completely invalid commands', async () => {
      const invalidCommand = 'this is not a defi command at all';
      const message = createMockMessage(invalidCommand);
      
      const actions = [supplyAction, withdrawAction, borrowAction, repayAction];
      
      for (const action of actions) {
        const isValid = await action.validate(mockRuntime, message);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Action Structure Validation', () => {
    const actions = [
      { name: 'supplyAction', action: supplyAction },
      { name: 'withdrawAction', action: withdrawAction },
      { name: 'borrowAction', action: borrowAction },
      { name: 'repayAction', action: repayAction },
    ];

    for (const { name, action } of actions) {
      describe(name, () => {
        it('should have required properties', () => {
          expect(action.name).toBeDefined();
          expect(action.description).toBeDefined();
          expect(action.validate).toBeDefined();
          expect(action.handler).toBeDefined();
          expect(action.examples).toBeDefined();
        });

        it('should have valid examples structure', () => {
          expect(Array.isArray(action.examples)).toBe(true);
          expect(action.examples.length).toBeGreaterThan(0);
          
          for (const example of action.examples) {
            expect(Array.isArray(example)).toBe(true);
            expect(example.length).toBeGreaterThanOrEqual(2);
            
            // Check user message structure
            const userMsg = example[0];
            expect(userMsg).toBeDefined();
            expect(userMsg.content).toBeDefined();
            expect(userMsg.content.text).toBeDefined();
            
            // Check assistant response structure
            const assistantMsg = example[1];
            expect(assistantMsg).toBeDefined();
            expect(assistantMsg.content).toBeDefined();
            expect(assistantMsg.content.text).toBeDefined();
          }
        });

        it('should have similes if defined', () => {
          if (action.similes) {
            expect(Array.isArray(action.similes)).toBe(true);
            expect(action.similes.length).toBeGreaterThan(0);
            
            for (const simile of action.similes) {
              expect(typeof simile).toBe('string');
              expect(simile.length).toBeGreaterThan(0);
            }
          }
        });
      });
    }
  });
});