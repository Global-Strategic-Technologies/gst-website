/**
 * TechPar - Signal card copy
 *
 * 5 stages x 6 zones = 30 combinations of headline and body text.
 * Validated at build time against `SignalCopyMapSchema`.
 */

import type { Stage, Zone, SignalCopy } from '../../schemas/techpar';

export type { SignalCopy };

const signalCopyData: Record<Stage, Record<Zone, SignalCopy>> = {
  seed: {
    underinvest: {
      headline: 'Possible underinvestment.',
      body: 'Very lean technology spend at seed stage can constrain engineering velocity, product reliability, and the ability to scale when growth accelerates.',
    },
    ahead: {
      headline: 'Efficient for seed stage.',
      body: 'Below the healthy band. Strong margin profile, though watch for reliability and velocity constraints as you push for growth.',
    },
    healthy: {
      headline: 'Normal for this stage.',
      body: 'Technology spend is within the expected range for a pre-Series A company. Focus on architecture that scales as revenue grows.',
    },
    above: {
      headline: 'High, but not uncommon.',
      body: 'Above the upper range, though seed-stage investment ahead of revenue is expected. Monitor whether the ratio converges as ARR grows.',
    },
    elevated: {
      headline: 'Watch the trajectory.',
      body: 'Significantly above range. Not alarming if revenue is scaling fast. The ratio should decline quarter over quarter.',
    },
    critical: {
      headline: 'Technology drag at seed stage.',
      body: 'This level of spend relative to early revenue warrants a structural review of engineering efficiency and architecture choices.',
    },
  },
  series_a: {
    underinvest: {
      headline: 'Possible underinvestment.',
      body: 'Engineering velocity, platform reliability, and scaling capacity may be constrained. Examine whether technology spend aligns with roadmap ambition.',
    },
    ahead: {
      headline: 'Efficient for Series A.',
      body: 'Below the healthy band. Strong margin position, provided product reliability and scaling capacity are not being compromised.',
    },
    healthy: {
      headline: 'Within healthy range.',
      body: 'Spend is well-calibrated for a Series A company. As ARR scales, this ratio should continue to improve without active intervention.',
    },
    above: {
      headline: 'Above benchmark. Watch the trend.',
      body: 'Above the healthy range but not unusual for a scaling company. The concern is whether the ratio is improving as revenue grows.',
    },
    elevated: {
      headline: 'Elevated. Convergence expected.',
      body: 'Persistently high technology spend at this stage often signals architectural inefficiency. If the ratio is not declining with revenue growth, structural work may be needed.',
    },
    critical: {
      headline: 'Structural review warranted.',
      body: 'At this level, technology spend is a meaningful drag on the path to profitability. An architectural and operational review should be prioritized.',
    },
  },
  series_bc: {
    underinvest: {
      headline: 'Below minimum threshold.',
      body: 'Low technology spend may constrain platform scalability and reliability. Deferred investment at this stage often surfaces as production incidents at scale.',
    },
    ahead: {
      headline: 'Technology cost advantage.',
      body: 'Running lean relative to benchmark. Ensure this reflects genuine efficiency rather than deferred reliability or scalability investment.',
    },
    healthy: {
      headline: 'Well-calibrated for this stage.',
      body: 'Spend sits inside the healthy range. Maintain discipline as headcount and engineering complexity scale.',
    },
    above: {
      headline: 'Above benchmark. Opportunity to optimize.',
      body: 'The window to address structural inefficiency is now, before the cost baseline sets at scale.',
    },
    elevated: {
      headline: 'Value creation risk.',
      body: 'Persistently elevated spend at this stage will compound toward exit. Architectural inefficiency that is addressable now becomes expensive technical debt later.',
    },
    critical: {
      headline: 'Material drag on the path to profitability.',
      body: 'Technology at this percentage is a significant obstacle to the EBITDA profile that drives Series B\u2013C valuations.',
    },
  },
  pe: {
    underinvest: {
      headline: 'Below minimum threshold.',
      body: 'While efficient, this level may indicate deferred investment that will surface as reliability risk or technical debt in a sell-side process.',
    },
    ahead: {
      headline: 'Efficient. Margin advantage.',
      body: 'Technology spend is below the benchmark range, contributing positively to EBITDA. Verify this reflects genuine optimization and not deferred investment.',
    },
    healthy: {
      headline: 'Within benchmark range.',
      body: 'Spend supports a clean technology narrative in any sell-side or IC process.',
    },
    above: {
      headline: 'Above benchmark. Quantifiable impact.',
      body: 'Every point above 40% reduces EBITDA directly. The cumulative drag over a hold period, and its exit value translation, are significant.',
    },
    elevated: {
      headline: 'Value creation priority.',
      body: 'Technology optimization is among the highest-return value creation initiatives available. The dollar impact compounds across the hold period.',
    },
    critical: {
      headline: 'Material exit value drag.',
      body: 'Technology at this percentage is a significant detractor in any valuation model. This needs to be addressed as a financial priority.',
    },
  },
  enterprise: {
    underinvest: {
      headline: 'Below minimum threshold.',
      body: 'At enterprise scale this may reflect aggressive cost reduction with implications for platform reliability, SLA delivery, and roadmap execution capacity.',
    },
    ahead: {
      headline: 'Strong technology efficiency.',
      body: 'Running well below the healthy range. Healthy at enterprise scale, provided this reflects genuine efficiency and not infrastructure debt accumulation.',
    },
    healthy: {
      headline: 'Within healthy range for enterprise.',
      body: 'Spend is well-calibrated. Technology efficiency at this level supports strong EBITDA margins.',
    },
    above: {
      headline: 'Above enterprise benchmark.',
      body: 'Likely reflects legacy architecture, multi-cloud complexity, or deferred rationalization work.',
    },
    elevated: {
      headline: 'Structural review warranted.',
      body: 'Technology spend represents a meaningful EBITDA drag relative to enterprise peers. A rationalization roadmap should be a near-term priority.',
    },
    critical: {
      headline: 'Significant efficiency gap.',
      body: 'Technology at this percentage is an outlier for enterprise scale. A structural review of architecture, vendor contracts, and operational practices is overdue.',
    },
  },
};

// Validated at build time via unit tests. Type assertion avoids shipping Zod to client bundles.
export const SIGNAL_COPY = signalCopyData as Record<Stage, Record<Zone, SignalCopy>>;
