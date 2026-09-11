// Calm, accessible design system for the CRM
export const LightColors = {
  bg: {
    primary: '#F7F9F7',
    secondary: '#FFFFFF',
    card: '#FFFFFF',
    cardHover: '#F4F7F4',
  },
  border: '#E4EAE5',
  text: {
    primary: '#26332D',
    secondary: '#617068',
    muted: '#8A9890',
  },
  primary: '#58796C',
  primaryLight: 'rgba(88, 121, 108, 0.10)',
  success: '#4F8A6A',
  successLight: 'rgba(79, 138, 106, 0.10)',
  warning: '#B58A4A',
  warningLight: 'rgba(181, 138, 74, 0.10)',
  danger: '#B8645A',
  dangerLight: 'rgba(184, 100, 90, 0.10)',
  info: '#5C8490',
  infoLight: 'rgba(92, 132, 144, 0.10)',
  purple: '#786C91',
  pipeline: {
    lead: '#58796C',
    contacted: '#5C8490',
    proposal: '#B58A4A',
    negotiation: '#786C91',
    won: '#4F8A6A',
    lost: '#B8645A',
  },
};

export const DarkColors = {
  bg: {
    primary: '#111714',
    secondary: '#171E1A',
    card: '#1C2520',
    cardHover: '#243029',
  },
  border: 'rgba(226, 238, 230, 0.10)',
  text: {
    primary: '#EDF4EF',
    secondary: '#A9B8AF',
    muted: '#718078',
  },
  primary: '#91B4A5',
  primaryLight: 'rgba(145, 180, 165, 0.14)',
  success: '#79B58E',
  successLight: 'rgba(121, 181, 142, 0.12)',
  warning: '#D0AA67',
  warningLight: 'rgba(208, 170, 103, 0.12)',
  danger: '#D8897F',
  dangerLight: 'rgba(216, 137, 127, 0.12)',
  info: '#82AEB9',
  infoLight: 'rgba(130, 174, 185, 0.12)',
  purple: '#A99BC1',
  pipeline: {
    lead: '#91B4A5',
    contacted: '#82AEB9',
    proposal: '#D0AA67',
    negotiation: '#A99BC1',
    won: '#79B58E',
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
