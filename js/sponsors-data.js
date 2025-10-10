/**
 * Sponsor Data Management
 *
 * Manually updated sponsor information. In the future, this could be
 * fetched from GitHub Sponsors API, but for now we manage it manually
 * to maintain 100% client-side architecture.
 *
 * Update this file after receiving new sponsorships or when sponsors
 * change tiers/cancel.
 */

export const SPONSORS_DATA = {
  // Last manual update
  lastUpdated: '2025-01-15',

  // Summary statistics
  stats: {
    totalSponsors: 0,
    monthlyRevenue: 0,
    devHoursPerMonth: 0
  },

  // Featured sponsors (opt-in public recognition)
  featured: [
    // Example sponsor structure:
    // {
    //   name: 'Dr. Jane Smith',
    //   tier: 'professional', // supporter, professional, researcher, institution
    //   avatar: 'https://avatars.githubusercontent.com/u/12345',
    //   website: 'https://janesmith.com',
    //   bio: 'Computational biologist researching protein folding',
    //   since: '2025-01',
    //   visible: true
    // }
  ],

  // Anonymous sponsors (count only)
  anonymous: {
    supporter: 0,
    professional: 0,
    researcher: 0,
    institution: 0
  },

  // Funding goals
  goals: [
    {
      id: 'part-time',
      name: 'Part-Time Development',
      description: '30-50 hours of development time per month',
      target: 500,
      features: ['Citation graphs', 'Related papers', 'Author following']
    },
    {
      id: 'full-time',
      name: 'Full-Time Development',
      description: '160 hours of development time per month',
      target: 3000,
      features: ['Faster releases', 'Better support', 'Experimental features']
    }
  ]
};

/**
 * Calculate total sponsors and revenue from data
 */
export function calculateStats() {
  const tierPrices = {
    supporter: 3,
    professional: 5,
    researcher: 10,
    institution: 30
  };

  let totalSponsors = 0;
  let monthlyRevenue = 0;

  // Count featured sponsors
  SPONSORS_DATA.featured.forEach(sponsor => {
    if (sponsor.visible) {
      totalSponsors++;
      monthlyRevenue += tierPrices[sponsor.tier] || 0;
    }
  });

  // Count anonymous sponsors
  Object.entries(SPONSORS_DATA.anonymous).forEach(([tier, count]) => {
    totalSponsors += count;
    monthlyRevenue += (tierPrices[tier] || 0) * count;
  });

  // Calculate approximate dev hours (assume $15/hour)
  const devHoursPerMonth = Math.round(monthlyRevenue / 15 * 10) / 10;

  return {
    totalSponsors,
    monthlyRevenue,
    devHoursPerMonth
  };
}

/**
 * Get sponsors grouped by tier
 */
export function getSponsorsByTier() {
  const byTier = {
    institution: [],
    researcher: [],
    professional: [],
    supporter: []
  };

  SPONSORS_DATA.featured
    .filter(s => s.visible)
    .forEach(sponsor => {
      if (byTier[sponsor.tier]) {
        byTier[sponsor.tier].push(sponsor);
      }
    });

  return byTier;
}

/**
 * Get funding goal progress
 */
export function getGoalProgress(goalId) {
  const stats = calculateStats();
  const goal = SPONSORS_DATA.goals.find(g => g.id === goalId);

  if (!goal) return null;

  const percentage = Math.min(100, Math.round((stats.monthlyRevenue / goal.target) * 100));

  return {
    ...goal,
    current: stats.monthlyRevenue,
    percentage,
    achieved: stats.monthlyRevenue >= goal.target
  };
}

/**
 * Example: How to add a new sponsor manually
 *
 * 1. Add to featured array if they opt-in for public recognition:
 *
 * SPONSORS_DATA.featured.push({
 *   name: 'Dr. John Doe',
 *   tier: 'professional',
 *   avatar: 'https://avatars.githubusercontent.com/u/67890',
 *   website: 'https://johndoe.org',
 *   bio: 'Machine learning researcher',
 *   since: '2025-02',
 *   visible: true
 * });
 *
 * 2. Or increment anonymous count:
 *
 * SPONSORS_DATA.anonymous.professional++;
 *
 * 3. Update lastUpdated date
 *
 * SPONSORS_DATA.lastUpdated = '2025-02-01';
 */
