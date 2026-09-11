// Official Brand Design System for Shekhar Bandhu Aushdhalaya
export const LightColors = {
  bg: {
    primary: '#F7F9F7',
    secondary: '#FFFFFF',
    card: '#FFFFFF',
    cardHover: '#F4F7F4',
  },
  border: '#E4EAE5',
  text: {
    primary: '#1A2920',
    secondary: '#55695E',
    muted: '#819388',
  },
  primary: '#1A3F24',
  primaryLight: 'rgba(26, 63, 36, 0.10)',
  success: '#2B7A4B',
  successLight: 'rgba(43, 122, 75, 0.10)',
  warning: '#B58A4A',
  warningLight: 'rgba(181, 138, 74, 0.10)',
  danger: '#B8645A',
  dangerLight: 'rgba(184, 100, 90, 0.10)',
  info: '#3B7E8C',
  infoLight: 'rgba(59, 126, 140, 0.10)',
  purple: '#6E5C8C',
  pipeline: {
    lead: '#1A3F24',
    contacted: '#3B7E8C',
    proposal: '#B58A4A',
    negotiation: '#6E5C8C',
    won: '#2B7A4B',
    lost: '#B8645A',
  },
};

export const DarkColors = {
  bg: {
    primary: '#0F1712',
    secondary: '#15211A',
    card: '#1B2A21',
    cardHover: '#23362A',
  },
  border: 'rgba(226, 238, 230, 0.10)',
  text: {
    primary: '#EDF4EF',
    secondary: '#A9B8AF',
    muted: '#718078',
  },
  primary: '#4E9365',
  primaryLight: 'rgba(78, 147, 101, 0.14)',
  success: '#5FB37B',
  successLight: 'rgba(95, 179, 123, 0.12)',
  warning: '#D0AA67',
  warningLight: 'rgba(208, 170, 103, 0.12)',
  danger: '#D8897F',
  dangerLight: 'rgba(216, 137, 127, 0.12)',
  info: '#64A6B5',
  infoLight: 'rgba(100, 166, 181, 0.12)',
  purple: '#9886B8',
  pipeline: {
    lead: '#4E9365',
    contacted: '#64A6B5',
    proposal: '#D0AA67',
    negotiation: '#9886B8',
    won: '#5FB37B',
    lost: '#D8897F',
  },
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24 };

export const Shadows = {
  card: { boxShadow: '0px 2px 10px rgba(39, 56, 47, 0.04)', elevation: 1 },
  header: { boxShadow: '0px 1px 6px rgba(39, 56, 47, 0.03)', elevation: 1 },
  hover: { boxShadow: '0px 5px 14px rgba(39, 56, 47, 0.07)', elevation: 2 },
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
