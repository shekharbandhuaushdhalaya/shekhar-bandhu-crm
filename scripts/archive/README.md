# Archived Incident & One-Off Hotfix Scripts

> ⚠️ **WARNING**: The scripts in this directory were created for historical data repair incidents (such as ABH-010 packaging deduction fixes) and contain hardcoded document IDs and batch numbers.
> **DO NOT RE-RUN THESE SCRIPTS AGAINST CURRENT DATABASE DATA.**

## Archived Files & Incident Rationale:
- `fix_abh010_full.js`: Fixed batch ABH-010 yield and stock deductions during historical production incident.
- `fix_abh010_packaging_deduction.js`: One-off patch for ABH-010 packaging material deductions.
- `fix_abh010_undo_wrong_restore.js`: Reverted invalid raw material stock adjustments made during ABH-010 troubleshooting.
