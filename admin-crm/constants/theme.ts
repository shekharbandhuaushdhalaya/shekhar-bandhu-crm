import type { TextStyle } from 'react-native';

// Official Brand Design System for Shekhar Bandhu Aushdhalaya
export const LightColors = {
  bg: {
    primary: '#F9F6F5',
    secondary: '#FFFFFF',
    card: '#FFFFFF',
    cardHover: '#F6F2F1',
  },
  border: '#EBE2E0',
  text: {
    primary: '#2B1A18',
    secondary: '#695552',
    muted: '#816F6D',
  },
  primary: '#AB3323', // rgba(171, 51, 35, 1)
  primaryLight: 'rgba(171, 51, 35, 0.08)',
  success: '#2B7A4B',
  successLight: 'rgba(43, 122, 75, 0.10)',
  warning: '#9C753A',
  warningLight: 'rgba(156, 117, 58, 0.10)',
  danger: '#D32F2F',
  dangerLight: 'rgba(211, 47, 47, 0.10)',
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
  },
  border: 'rgba(238, 226, 224, 0.10)',
  text: {
    primary: '#F4EDED',
    secondary: '#B8AAA7',
    muted: '#9E908D',
  },
  primary: '#D45443',
  primaryLight: 'rgba(171, 51, 35, 0.18)',
  success: '#5FB37B',
  successLight: 'rgba(95, 179, 123, 0.12)',
  warning: '#B58A4A',
  warningLight: 'rgba(181, 138, 74, 0.15)',
  danger: '#F44336',
  dangerLight: 'rgba(244, 67, 54, 0.15)',
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

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const ControlHeight = { input: 44, buttonSm: 40, buttonMd: 44 };

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24 };

export const Shadows = {
  card: { boxShadow: '0px 1px 2px rgba(43,26,24,0.06), 0px 8px 20px rgba(43,26,24,0.05)', elevation: 2 },
  header: { boxShadow: '0px 1px 6px rgba(39, 56, 47, 0.03)', elevation: 1 },
  hover: { boxShadow: '0px 2px 4px rgba(43,26,24,0.08), 0px 10px 24px rgba(43,26,24,0.09)', elevation: 3 },
  floating: { boxShadow: '0px 6px 14px rgba(0,0,0,0.18)', elevation: 12 },
  modal: { boxShadow: '0px 10px 15px rgba(0,0,0,0.2)', elevation: 10 },
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

export const getStatusTone = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral' => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'delivered':
    case 'completed':
    case 'fulfilled':
    case 'paid':
    case 'posted':
    case 'won':
    case 'active':
      return 'success';
    case 'processing':
    case 'pending':
    case 'draft':
      return 'warning';
    case 'cancelled':
    case 'lost':
    case 'rejected':
      return 'danger';
    case 'shipped':
    case 'in_transit':
    case 'dispatched':
      return 'primary';
    case 'new':
    case 'open':
      return 'info';
    default:
      return 'neutral';
  }
};


// Named font weights are bundled locally, so offline and native rendering match web.
export const Typography = {
  display: { fontFamily: 'Manrope_800', fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.4 },
  h1: { fontFamily: 'Manrope_800', fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
  h2: { fontFamily: 'Manrope_800', fontSize: 17, lineHeight: 22, fontWeight: '800' },
  h3: { fontFamily: 'Manrope_700', fontSize: 15, lineHeight: 20, fontWeight: '700' },
  body: { fontFamily: 'Inter_500', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  bodySm: { fontFamily: 'Inter_500', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontFamily: 'Inter_600', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  eyebrow: { fontFamily: 'Inter_800', fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export function withAlpha(color: string, alpha = 0.1): string {
  const hex = color.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  return rgb ? `rgba(${rgb[1].split(',').slice(0, 3).join(',')},${alpha})` : color;
}
