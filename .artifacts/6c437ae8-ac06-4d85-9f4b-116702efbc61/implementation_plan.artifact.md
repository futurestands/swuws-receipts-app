# Implementation Plan: Sidebar Branding Refinement

This plan aims to improve the legibility of the sidebar branding by splitting "SWUWS Collection Portal" into two lines and removing the long organizational subtitle that was difficult to read.

## Proposed Changes

### 1. Refactor AppShell Sidebar Header

#### [MODIFY] [app-shell.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/components/layout/app-shell.tsx)
- Update the desktop sidebar header to display "SWUWS COLLECTION" on the first line and "PORTAL" on the second line.
- Increase font sizes and tracking for better professional appearance.
- Remove the "SOUTHWESTERN UMBRELLA OF WATER AND SANITATION" subtitle from the desktop sidebar.
- Apply similar changes to the Mobile Drawer (Sheet) and the Mobile-view top bar header for consistency.

## Verification Plan

### Manual Verification
1. Inspect the sidebar in desktop view.
   - **Verify**: The text "SWUWS COLLECTION" and "PORTAL" are visible on separate lines.
   - **Verify**: The long subtitle is gone.
   - **Verify**: The text fits within the sidebar width without truncation.
2. Inspect the mobile drawer.
   - **Verify**: Consistent branding layout.
3. Inspect the top bar on mobile devices.
   - **Verify**: Consistent branding layout.
