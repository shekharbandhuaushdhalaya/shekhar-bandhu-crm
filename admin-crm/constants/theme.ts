// Official Brand Design System for Shekhar Bandhu Aushdhalaya
export const LightColors = {
  bg: {
    primary: '#F9F6F5',
    secondary: '#FFFFFF',
    card: '#FFFFFF',
    cardHover: '#F6F2F1',
    elevated: '#FFFFFF',
    subtle: '#F6F0EF',
  },
  border: '#EBE2E0',
  text: {
    primary: '#2B1A18',
    secondary: '#695552',
    muted: '#93817E',
    inverse: '#FFFFFF',
  },
  primary: '#AB3323', // rgba(171, 51, 35, 1)
  primaryLight: 'rgba(171, 51, 35, 0.08)',
  primarySoft: '#F6ECEB',
  success: '#2B7A4B',
  successLight: 'rgba(43, 122, 75, 0.10)',
  warning: '#B58A4A',
  warningLight: 'rgba(181, 138, 74, 0.10)',
  danger: '#AB3323',
  dangerLight: 'rgba(171, 51, 35, 0.10)',
  info: '#3B7E8C',
  infoLight: 'rgba(59, 126, 140, 0.10)',
  purple: '#6E5C8C',
  pipeline: {
    lead: '#AB3323',
    contacted: '#3B7E8C',
    proposal: '#B58A4A',
    negotiation: '#6E5C8C',
    won: '#2B7A4B',
    lost: '#AB3323',
  },
};

export const DarkColors = {
  bg: {
    primary: '#17100F',
    secondary: '#211715',
    card: '#2A1D1A',
    cardHover: '#362622',
    elevated: '#31221F',
    subtle: '#241917',
  },
  border: 'rgba(238, 226, 224, 0.10)',
  text: {
    primary: '#F4EDED',
    secondary: '#B8AAA7',
    muted: '#80716E',
    inverse: '#17100F',
  },
  primary: '#D45443',
  primaryLight: 'rgba(171, 51, 35, 0.18)',
  primarySoft: '#3E2420',
  success: '#5FB37B',
  successLight: 'rgba(95, 179, 123, 0.12)',
  warning: '#D0AA67',
  warningLight: 'rgba(208, 170, 103, 0.12)',
  danger: '#D45443',
  dangerLight: 'rgba(171, 51, 35, 0.15)',
  info: '#64A6B5',
  infoLight: 'rgba(100, 166, 181, 0.12)',
  purple: '#9886B8',
  pipeline: {
    lead: '#D45443',
    contacted: '#64A6B5',
    proposal: '#D0AA67',
    negotiation: '#9886B8',
    won: '#5FB37B',
    lost: '#D45443',
  },
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 };
export const Radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export const Shadows = {
  card: { boxShadow: '0px 2px 10px rgba(43, 26, 24, 0.04)', elevation: 1 },
  header: { boxShadow: '0px 1px 6px rgba(43, 26, 24, 0.03)', elevation: 1 },
  hover: { boxShadow: '0px 5px 14px rgba(43, 26, 24, 0.07)', elevation: 2 },
  modal: { boxShadow: '0px 18px 50px rgba(35, 18, 16, 0.18)', elevation: 8 },
};

export const Typography = {
  display: 28,
  h1: 24,
  h2: 20,
  h3: 17,
  body: 14,
  bodySmall: 13,
  caption: 11,
};

export type Stage = 'lead' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost';
export const STAGES: Stage[] = ['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
export const getStageColors = (colors: typeof LightColors) => ({
  lead: colors.pipeline.lead,
  contacted: colors.pipeline.contacted,
  proposal: colors.pipeline.proposal,
  negotiation: colors.pipeline.negotiation,
  won: colors.pipeline.won,
  lost: colors.pipeline.lost,
});
