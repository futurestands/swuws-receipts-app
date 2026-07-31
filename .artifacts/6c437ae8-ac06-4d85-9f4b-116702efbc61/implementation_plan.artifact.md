# Fix Delivery Modal Visibility for Mobile

This plan fixes the visibility issues of the delivery modal (specifically the Print button) and optimizes the layout for mobile phone screens.

## User Review Required

> [!IMPORTANT]
> I will be switching from custom "brand-blue" classes to standard Tailwind/Shadcn classes (like `primary`) to ensure consistent visibility and theme support. I will also unify the modal into a single professional card layout which works better on small mobile screens.

## Proposed Changes

### Styling & Theme

#### [MODIFY] [globals.css](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/globals.css)
- Register `brand-blue`, `brand-green`, etc., in the `@theme` block so Tailwind can recognize them as utility classes (e.g., `bg-brand-blue`).
- Add a `--brand-blue-dark` variant for the button shadows.

### Frontend (Components)

#### [MODIFY] [reading-entry-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/components/billing/reading-entry-form.tsx)
- **Unify Modal UI**: Instead of transparent backgrounds and floating cards, use a single solid Card inside the `DialogContent`. This provides a cleaner look on mobile.
- **Button Contrast**: Change the "PRINT NOW" button to use `bg-primary` (which is already configured as the brand blue) to ensure it is fully visible.
- **Mobile Optimization**:
    - Adjust `DialogContent` to fit full-width on very small screens.
    - Ensure the "Amount Due" text doesn't overflow on small devices.
    - Make sure the "Close" button is easy to tap.
- **Fix "No phone provided"**: Ensure the text color is distinct enough to be readable even if no phone is present.

---

## Verification Plan

### Manual Verification
1. Open the portal on a device (or use browser dev tools mobile emulator).
2. Capture a reading and observe the modal.
3. Verify that:
    - The modal has a solid white background.
    - The "PRINT NOW" button is clearly blue with white text.
    - The "SEND SMS" button is clearly green with white text.
    - No content is cut off on a 375px wide screen (iPhone SE size).
