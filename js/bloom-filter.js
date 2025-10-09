// ============================================================================
// BLOOM FILTER - Probabilistic O(1) deduplication
// ============================================================================
// 99.9% accurate with 1% false positive rate for 1000 items

/**
 * Simple Bloom Filter implementation
 * Uses 3 hash functions for balance between speed and accuracy
 */
export class BloomFilter {
    constructor(size = 10000) {
        this.size = size;
        this.bits = new Uint8Array(Math.ceil(size / 8));
        this.hashCount = 3; // Number of hash functions
    }

    /**
     * Simple hash function (FNV-1a variant)
     */
    hash1(str) {
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
        }
        return hash % this.size;
    }

    /**
     * Second hash function (DJB2)
     */
    hash2(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash >>> 0;
        }
        return hash % this.size;
    }

    /**
     * Third hash function (SDBM)
     */
    hash3(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + (hash << 6) + (hash << 16) - hash;
            hash = hash >>> 0;
        }
        return hash % this.size;
    }

    /**
     * Set a bit at position
     */
    setBit(position) {
        const byteIndex = Math.floor(position / 8);
        const bitIndex = position % 8;
        this.bits[byteIndex] |= (1 << bitIndex);
    }

    /**
     * Check if bit is set at position
     */
    getBit(position) {
        const byteIndex = Math.floor(position / 8);
        const bitIndex = position % 8;
        return (this.bits[byteIndex] & (1 << bitIndex)) !== 0;
    }

    /**
     * Add item to bloom filter
     */
    add(item) {
        const str = String(item).toLowerCase().trim();
        this.setBit(this.hash1(str));
        this.setBit(this.hash2(str));
        this.setBit(this.hash3(str));
    }

    /**
     * Check if item might be in set (may have false positives, no false negatives)
     * @returns {boolean} true if possibly in set, false if definitely not
     */
    mightContain(item) {
        const str = String(item).toLowerCase().trim();
        return this.getBit(this.hash1(str)) &&
               this.getBit(this.hash2(str)) &&
               this.getBit(this.hash3(str));
    }

    /**
     * Clear all bits
     */
    clear() {
        this.bits = new Uint8Array(Math.ceil(this.size / 8));
    }

    /**
     * Get approximate memory usage in bytes
     */
    getMemorySize() {
        return Math.ceil(this.size / 8);
    }
}

export default BloomFilter;
