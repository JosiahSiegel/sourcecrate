/**
 * Sponsors Page JavaScript
 *
 * Populates the sponsors page with current sponsor data,
 * displays funding goals, and handles interactive elements.
 */

import {
  SPONSORS_DATA,
  calculateStats,
  getSponsorsByTier,
  getGoalProgress
} from './sponsors-data.js';

// Initialize page on load
document.addEventListener('DOMContentLoaded', () => {
  updateStatsDisplay();
  updateFundingGoals();
  renderSponsors();
});

/**
 * Update hero stats display
 */
function updateStatsDisplay() {
  const stats = calculateStats();

  const sponsorCountEl = document.getElementById('sponsor-count');
  const monthlyRevenueEl = document.getElementById('monthly-revenue');
  const devHoursEl = document.getElementById('dev-hours');

  if (sponsorCountEl) {
    sponsorCountEl.textContent = stats.totalSponsors;
  }

  if (monthlyRevenueEl) {
    monthlyRevenueEl.textContent = `$${stats.monthlyRevenue}`;
  }

  if (devHoursEl) {
    devHoursEl.textContent = `${stats.devHoursPerMonth}hrs`;
  }
}

/**
 * Update funding goals progress bars
 */
function updateFundingGoals() {
  // Goal 1: Part-time development
  const goal1 = getGoalProgress('part-time');
  if (goal1) {
    updateGoalDisplay(1, goal1);
  }

  // Goal 2: Full-time development
  const goal2 = getGoalProgress('full-time');
  if (goal2) {
    updateGoalDisplay(2, goal2);
  }
}

/**
 * Update individual goal display
 */
function updateGoalDisplay(goalNumber, goalData) {
  const currentEl = document.getElementById(`goal-${goalNumber}-current`);
  const fillEl = document.getElementById(`goal-${goalNumber}-fill`);

  if (currentEl) {
    currentEl.textContent = `$${goalData.current}`;
  }

  if (fillEl) {
    fillEl.style.width = `${goalData.percentage}%`;

    // Add completion class if achieved
    if (goalData.achieved) {
      fillEl.classList.add('completed');
    }
  }
}

/**
 * Render sponsors grid
 */
function renderSponsors() {
  const sponsorsGrid = document.getElementById('sponsors-grid');
  if (!sponsorsGrid) return;

  const byTier = getSponsorsByTier();
  const allSponsors = [
    ...byTier.institution,
    ...byTier.researcher,
    ...byTier.professional,
    ...byTier.supporter
  ];

  if (allSponsors.length === 0) {
    // Keep "Be the first sponsor" message
    return;
  }

  // Clear placeholder
  sponsorsGrid.innerHTML = '';

  // Render each sponsor
  allSponsors.forEach(sponsor => {
    const card = createSponsorCard(sponsor);
    sponsorsGrid.appendChild(card);
  });
}

/**
 * Create sponsor card HTML element
 */
function createSponsorCard(sponsor) {
  const card = document.createElement('div');
  card.className = `sponsor-card ${sponsor.tier}`;

  const tierBadges = {
    institution: '🏛️',
    researcher: '⭐',
    professional: '🏆',
    supporter: '💝'
  };

  const tierNames = {
    institution: 'Institutional Sponsor',
    researcher: 'Researcher Sponsor',
    professional: 'Professional Sponsor',
    supporter: 'Supporter'
  };

  card.innerHTML = `
    <div class="sponsor-header">
      ${sponsor.avatar ? `<img src="${sponsor.avatar}" alt="${sponsor.name}" class="sponsor-avatar">` : ''}
      <div class="sponsor-info">
        <h3 class="sponsor-name">${escapeHtml(sponsor.name)}</h3>
        <div class="sponsor-tier-badge">
          <span class="tier-icon">${tierBadges[sponsor.tier]}</span>
          <span class="tier-name">${tierNames[sponsor.tier]}</span>
        </div>
      </div>
    </div>
    ${sponsor.bio ? `<p class="sponsor-bio">${escapeHtml(sponsor.bio)}</p>` : ''}
    <div class="sponsor-footer">
      ${sponsor.website ? `<a href="${escapeHtml(sponsor.website)}" target="_blank" rel="noopener" class="sponsor-link">Visit Website →</a>` : ''}
      <span class="sponsor-since">Since ${formatDate(sponsor.since)}</span>
    </div>
  `;

  return card;
}

/**
 * Format date (YYYY-MM to Month YYYY)
 */
function formatDate(dateStr) {
  if (!dateStr) return '';

  const [year, month] = dateStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monthNum = parseInt(month, 10) - 1;
  return `${monthNames[monthNum]} ${year}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';

  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Handle FAQ accordion interaction
 */
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', (e) => {
    if (item.open) {
      // Close other open items (optional: remove for multiple open)
      document.querySelectorAll('.faq-item').forEach(other => {
        if (other !== item && other.open) {
          other.removeAttribute('open');
        }
      });
    }
  });
});

/**
 * Smooth scroll for anchor links
 */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;

    e.preventDefault();
    const target = document.querySelector(href);

    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});
