// Design System Constants — Premium Light & Dark Themes (Atlassian inspired)

export const LightColors = {
  bg: {
    primary: '#f4f5f7',     // Atlassian light background
    secondary: '#ffffff',   // White panels
    card: '#ffffff',
    cardHover: '#fafbfc',
  },
  border: '#dfe1e6',        // Muted gray borders
  text: {
    primary: '#172b4d',     // Atlassian deep navy gray
    secondary: '#5e6c84',   // Medium slate gray
    muted: '#8993a4',       // Muted gray
  },
  primary: '#9C2A0E',       // Terracotta
  primaryLight: 'rgba(156, 42, 14, 0.08)',
  success: '#36b37e',       // Atlassian Green
  successLight: 'rgba(54, 179, 126, 0.08)',
  warning: '#ffab00',       // Atlassian Yellow
  warningLight: 'rgba(255, 171, 0, 0.08)',
  danger: '#ff5630',        // Atlassian Red
  dangerLight: 'rgba(255, 86, 48, 0.08)',
  info: '#00b8d9',          // Atlassian Teal
  infoLight: 'rgba(0, 184, 217, 0.08)',
  purple: '#6554c0',        // Atlassian Purple
  pipeline: {
    lead: '#9C2A0E',
    contacted: '#00b8d9',
    proposal: '#ffab00',
    negotiation: '#6554c0',
    won: '#36b37e',
    lost: '#ff5630',
  },
};

export const DarkColors = {
  bg: {
    primary: '#07090e',     // Midnight charcoal
    secondary: '#0f131a',   // Dark panel blue-gray
    card: '#161b22',        // Slate card background
    cardHover: '#1f242c',
  },
  border: 'rgba(255, 255, 255, 0.08)',
  text: {
    primary: '#f0f6fc',     // Near white
    secondary: '#8b949e',   // Cool gray
    muted: '#484f58',       // Dark slate gray
  },
  primary: '#ff6b4a',       // Vibrant Terracotta Light
  primaryLight: 'rgba(255, 107, 74, 0.15)',

  success: '#30a46c',       // Muted green
  successLight: 'rgba(48, 164, 108, 0.1)',
  warning: '#e3b341',       // Muted yellow
  warningLight: 'rgba(227, 179, 65, 0.1)',
  danger: '#f85149',        // Muted red
  dangerLight: 'rgba(248, 81, 73, 0.1)',
  info: '#38bdf8',          // Electric cyan
  infoLight: 'rgba(56, 189, 248, 0.1)',
  purple: '#bc8cff',        // Neon lavender
  pipeline: {
    lead: '#58a6ff',
    contacted: '#38bdf8',
    proposal: '#e3b341',
    negotiation: '#bc8cff',
    won: '#30a46c',
    lost: '#f85149',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 30,
};

export const Shadows = {
  card: {
    boxShadow: '0px 4px 12px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  header: {
    boxShadow: '0px 2px 6px rgba(0,0,0,0.03)',
    elevation: 2,
  },
  hover: {
    boxShadow: '0px 8px 16px rgba(0,0,0,0.08)',
    elevation: 5,
  }
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
