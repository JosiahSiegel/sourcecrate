// ============================================================================
// BLOOM FILTER TESTS - Unit tests for probabilistic deduplication
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BloomFilter } from '../../js/bloom-filter.js';

describe('BloomFilter', () => {
    let bloomFilter;

    beforeEach(() => {
        bloomFilter = new BloomFilter(1000);
    });

    describe('constructor', () => {
        it('should create a bloom filter with correct size', () => {
            expect(bloomFilter.size).toBe(1000);
            expect(bloomFilter.hashCount).toBe(3);
        });

        it('should initialize bit array with correct byte size', () => {
            const expectedBytes = Math.ceil(1000 / 8);
            expect(bloomFilter.bits.length).toBe(expectedBytes);
        });

        it('should initialize all bits to zero', () => {
            for (let i = 0; i < bloomFilter.bits.length; i++) {
                expect(bloomFilter.bits[i]).toBe(0);
            }
        });
    });

    describe('hash functions', () => {
        it('should generate different hashes for same input', () => {
            const testStr = 'test-string';
            const hash1 = bloomFilter.hash1(testStr);
            const hash2 = bloomFilter.hash2(testStr);
            const hash3 = bloomFilter.hash3(testStr);

            expect(hash1).not.toBe(hash2);
            expect(hash2).not.toBe(hash3);
            expect(hash1).not.toBe(hash3);
        });

        it('should return consistent hashes for same input', () => {
            const testStr = 'consistent-test';

            expect(bloomFilter.hash1(testStr)).toBe(bloomFilter.hash1(testStr));
            expect(bloomFilter.hash2(testStr)).toBe(bloomFilter.hash2(testStr));
            expect(bloomFilter.hash3(testStr)).toBe(bloomFilter.hash3(testStr));
        });

        it('should return hashes within valid range', () => {
            const testStr = 'range-test';

            expect(bloomFilter.hash1(testStr)).toBeGreaterThanOrEqual(0);
            expect(bloomFilter.hash1(testStr)).toBeLessThan(bloomFilter.size);

            expect(bloomFilter.hash2(testStr)).toBeGreaterThanOrEqual(0);
            expect(bloomFilter.hash2(testStr)).toBeLessThan(bloomFilter.size);

            expect(bloomFilter.hash3(testStr)).toBeGreaterThanOrEqual(0);
            expect(bloomFilter.hash3(testStr)).toBeLessThan(bloomFilter.size);
        });
    });

    describe('bit operations', () => {
        it('should set and get bits correctly', () => {
            bloomFilter.setBit(10);
            expect(bloomFilter.getBit(10)).toBe(true);
        });

        it('should handle multiple bit sets independently', () => {
            bloomFilter.setBit(5);
            bloomFilter.setBit(50);
            bloomFilter.setBit(500);

            expect(bloomFilter.getBit(5)).toBe(true);
            expect(bloomFilter.getBit(50)).toBe(true);
            expect(bloomFilter.getBit(500)).toBe(true);
            expect(bloomFilter.getBit(6)).toBe(false);
        });

        it('should not affect adjacent bits', () => {
            bloomFilter.setBit(100);

            expect(bloomFilter.getBit(99)).toBe(false);
            expect(bloomFilter.getBit(100)).toBe(true);
            expect(bloomFilter.getBit(101)).toBe(false);
        });
    });

    describe('add and mightContain', () => {
        it('should return false for items not added', () => {
            expect(bloomFilter.mightContain('not-added')).toBe(false);
        });

        it('should return true for items that were added', () => {
            bloomFilter.add('test-item');
            expect(bloomFilter.mightContain('test-item')).toBe(true);
        });

        it('should handle multiple items', () => {
            const items = ['item1', 'item2', 'item3', 'item4'];

            items.forEach(item => bloomFilter.add(item));

            items.forEach(item => {
                expect(bloomFilter.mightContain(item)).toBe(true);
            });
        });

        it('should be case-insensitive', () => {
            bloomFilter.add('Test-Item');
            expect(bloomFilter.mightContain('test-item')).toBe(true);
            expect(bloomFilter.mightContain('TEST-ITEM')).toBe(true);
        });

        it('should trim whitespace', () => {
            bloomFilter.add('  spaced-item  ');
            expect(bloomFilter.mightContain('spaced-item')).toBe(true);
        });

        it('should handle DOI strings', () => {
            const doi = '10.1234/test.2024.001';
            bloomFilter.add(doi);
            expect(bloomFilter.mightContain(doi)).toBe(true);
        });

        it('should handle numeric strings', () => {
            bloomFilter.add('12345');
            expect(bloomFilter.mightContain('12345')).toBe(true);
        });
    });

    describe('clear', () => {
        it('should reset all bits to zero', () => {
            bloomFilter.add('item1');
            bloomFilter.add('item2');
            bloomFilter.add('item3');

            bloomFilter.clear();

            expect(bloomFilter.mightContain('item1')).toBe(false);
            expect(bloomFilter.mightContain('item2')).toBe(false);
            expect(bloomFilter.mightContain('item3')).toBe(false);
        });

        it('should allow re-adding items after clear', () => {
            bloomFilter.add('test');
            bloomFilter.clear();
            bloomFilter.add('test');

            expect(bloomFilter.mightContain('test')).toBe(true);
        });
    });

    describe('getMemorySize', () => {
        it('should return correct byte size', () => {
            const expectedSize = Math.ceil(1000 / 8);
            expect(bloomFilter.getMemorySize()).toBe(expectedSize);
        });

        it('should match actual bit array size', () => {
            expect(bloomFilter.getMemorySize()).toBe(bloomFilter.bits.length);
        });
    });

    describe('false positive rate', () => {
        it('should have low false positive rate for reasonable item count', () => {
            const bf = new BloomFilter(10000);
            const itemsToAdd = 1000;
            const itemsToTest = 1000;
            let falsePositives = 0;

            // Add items with prefix 'added-'
            for (let i = 0; i < itemsToAdd; i++) {
                bf.add(`added-${i}`);
            }

            // Test items with prefix 'not-added-'
            for (let i = 0; i < itemsToTest; i++) {
                if (bf.mightContain(`not-added-${i}`)) {
                    falsePositives++;
                }
            }

            const falsePositiveRate = falsePositives / itemsToTest;

            // Should be less than 5% false positive rate
            expect(falsePositiveRate).toBeLessThan(0.05);
        });
    });

    describe('edge cases', () => {
        it('should handle empty strings', () => {
            bloomFilter.add('');
            expect(bloomFilter.mightContain('')).toBe(true);
        });

        it('should handle very long strings', () => {
            const longString = 'x'.repeat(10000);
            bloomFilter.add(longString);
            expect(bloomFilter.mightContain(longString)).toBe(true);
        });

        it('should handle special characters', () => {
            const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
            bloomFilter.add(special);
            expect(bloomFilter.mightContain(special)).toBe(true);
        });

        it('should handle unicode characters', () => {
            const unicode = '你好世界 🌍 ñ é ü';
            bloomFilter.add(unicode);
            expect(bloomFilter.mightContain(unicode)).toBe(true);
        });
    });
});
