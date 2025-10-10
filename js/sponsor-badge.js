/**
 * Sponsor Badge System
 *
 * Honor system implementation - users self-report their sponsor tier
 * and display badges without verification. Based on trust.
 *
 * Stored in localStorage with no server-side validation.
 */

const STORAGE_KEY = 'sourcecrate_sponsor_tier';
const STORAGE_TIMESTAMP_KEY = 'sourcecrate_sponsor_since';

// Tier definitions
const TIERS = {
  supporter: {
    name: 'Supporter',
    icon: '💝',
    label: '💝 Supporter',
    color: '#ff6b9d'
  },
  professional: {
    name: 'Professional',
    icon: '🏆',
    label: '🏆 Professional Sponsor',
    color: '#c961d6'
  },
  researcher: {
    name: 'Researcher',
    icon: '⭐',
    label: '⭐ Researcher Sponsor',
    color: '#ffa500'
  },
  institution: {
    name: 'Institution',
    icon: '🏛️',
    label: '🏛️ Institutional Sponsor',
    color: '#4169e1'
  }
};

export class SponsorBadge {
  constructor() {
    this.tier = this.loadTierFromStorage();
    this.since = this.loadTimestampFromStorage();
  }

  /**
   * Get current sponsor tier
   */
  getTier() {
    return this.tier;
  }

  /**
   * Get tier details
   */
  getTierDetails() {
    if (!this.tier || !TIERS[this.tier]) {
      return null;
    }

    return {
      ...TIERS[this.tier],
      since: this.since
    };
  }

  /**
   * Set sponsor tier (self-reported)
   */
  setTier(tier) {
    if (tier && !TIERS[tier]) {
      console.warn(`Invalid tier: ${tier}`);
      return false;
    }

    this.tier = tier || null;

    if (tier) {
      localStorage.setItem(STORAGE_KEY, tier);

      // Set timestamp if not already set
      if (!this.since) {
        this.since = Date.now();
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, this.since.toString());
      }
    } else {
      // Clearing tier
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      this.since = null;
    }

    this.updateAllBadgeDisplays();
    return true;
  }

  /**
   * Get badge HTML for display
   */
  getBadgeHTML() {
    const details = this.getTierDetails();
    if (!details) return '';

    return `
      <span class="sponsor-badge" data-tier="${this.tier}" style="--badge-color: ${details.color}">
        <span class="badge-icon">${details.icon}</span>
        <span class="badge-label">${details.name}</span>
      </span>
    `;
  }

  /**
   * Get badge text (plain)
   */
  getBadgeText() {
    const details = this.getTierDetails();
    return details ? details.label : '';
  }

  /**
   * Check if user is a sponsor (any tier)
   */
  isSponsor() {
    return this.tier !== null;
  }

  /**
   * Update all badge displays on page
   */
  updateAllBadgeDisplays() {
    const badgeElements = document.querySelectorAll('[data-sponsor-badge]');

    badgeElements.forEach(el => {
      if (this.tier) {
        el.innerHTML = this.getBadgeHTML();
        el.style.display = '';
      } else {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    });

    // Update header badge if exists
    const headerBadge = document.getElementById('user-sponsor-badge');
    if (headerBadge) {
      if (this.tier) {
        headerBadge.innerHTML = this.getBadgeHTML();
        headerBadge.style.display = 'inline-block';
      } else {
        headerBadge.innerHTML = '';
        headerBadge.style.display = 'none';
      }
    }

    // Trigger custom event for other components
    document.dispatchEvent(new CustomEvent('sponsorBadgeUpdated', {
      detail: { tier: this.tier, since: this.since }
    }));
  }

  /**
   * Load tier from localStorage
   */
  loadTierFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && TIERS[stored]) {
      return stored;
    }
    return null;
  }

  /**
   * Load timestamp from localStorage
   */
  loadTimestampFromStorage() {
    const stored = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    return stored ? parseInt(stored, 10) : null;
  }

  /**
   * Get formatted "since" date
   */
  getSinceDate() {
    if (!this.since) return null;

    const date = new Date(this.since);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }
}

// Global instance
export const sponsorBadge = new SponsorBadge();

// Initialize on page load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    sponsorBadge.updateAllBadgeDisplays();
  });
}

/**
 * Utility: Show thank you message after setting tier
 */
export function showSponsorThankYou(tier) {
  const details = TIERS[tier];
  if (!details) return;

  const message = document.createElement('div');
  message.className = 'sponsor-thank-you-toast';
  message.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">🎉</span>
      <div class="toast-text">
        <strong>Thank you for sponsoring SourceCrate!</strong>
        <p>Your ${details.name} badge is now active.</p>
      </div>
      <button class="toast-dismiss" aria-label="Dismiss">✕</button>
    </div>
  `;

  document.body.appendChild(message);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    message.classList.add('fade-out');
    setTimeout(() => message.remove(), 300);
  }, 5000);

  // Manual dismiss
  message.querySelector('.toast-dismiss').addEventListener('click', () => {
    message.classList.add('fade-out');
    setTimeout(() => message.remove(), 300);
  });
}

/**
 * Utility: Check if feature usage milestone reached
 * Used for triggering sponsor prompts
 */
export function checkFeatureMilestone(featureName, currentCount) {
  const milestones = {
    'bulk-download': [10, 25, 50],
    'citation-graph': [5, 15, 30],
    'saved-search': [10, 20],
    'author-following': [5, 10]
  };

  const featureMilestones = milestones[featureName];
  if (!featureMilestones) return null;

  // Find if we just hit a milestone
  for (const milestone of featureMilestones) {
    if (currentCount === milestone) {
      // Check if we already showed this milestone prompt
      const storageKey = `milestone_${featureName}_${milestone}`;
      if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, Date.now().toString());
        return milestone;
      }
    }
  }

  return null;
}

/**
 * Utility: Show milestone prompt
 */
export function showMilestonePrompt(featureName, milestone) {
  // Don't show if user is already a sponsor
  if (sponsorBadge.isSponsor()) return;

  // Don't show more than once per session
  if (sessionStorage.getItem('milestone_prompt_shown')) return;

  const featureNames = {
    'bulk-download': 'bulk downloads',
    'citation-graph': 'citation graph views',
    'saved-search': 'saved searches',
    'author-following': 'author follows'
  };

  const prompt = document.createElement('div');
  prompt.className = 'sponsor-prompt milestone';
  prompt.innerHTML = `
    <div class="prompt-content">
      <span class="prompt-icon">✨</span>
      <div class="prompt-text">
        <strong>You've used ${featureNames[featureName]} ${milestone} times!</strong>
        <p>This feature is sustained by sponsors like you.</p>
      </div>
      <a href="sponsors.html" class="prompt-cta">Support</a>
      <button class="prompt-dismiss" aria-label="Dismiss">✕</button>
    </div>
  `;

  document.body.appendChild(prompt);

  // Mark as shown for this session
  sessionStorage.setItem('milestone_prompt_shown', 'true');

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    prompt.classList.add('fade-out');
    setTimeout(() => prompt.remove(), 300);
  }, 10000);

  // Manual dismiss
  prompt.querySelector('.prompt-dismiss').addEventListener('click', () => {
    prompt.classList.add('fade-out');
    setTimeout(() => prompt.remove(), 300);
  });
}
