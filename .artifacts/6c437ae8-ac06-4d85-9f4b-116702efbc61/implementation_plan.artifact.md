# Implementation Plan: User Password Management with Email Integration

This plan introduces self-service password management for users, including real email-based password resets via an integrated email service.

## User Review Required

> [!IMPORTANT]
> **Email Service Configuration**: I am proposing to integrate **Resend** (or a similar modern provider).
> - You will need to provide an `RESEND_API_KEY` in your `.env` file to activate real emails.
> - Until the key is provided, the system will log the "Email Content" to the server console for development testing.
>
> **Standardized Flow**: This will switch from the "Internal Request" model to a standard **"Reset Link via Email"** model, which is much more secure and scales better.

## Proposed Changes

---

### 1. Email Infrastructure

#### [NEW] [email-service.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/email-service.ts)
- Create a centralized service to handle sending emails.
- Implementation: Uses a placeholder if `RESEND_API_KEY` is missing, otherwise uses the provider's API.
- Functions: `sendPasswordResetEmail(email, url)`, `sendVerificationEmail(email, url)`.

#### [MODIFY] [auth.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/auth.ts)
- Configure `better-auth` to use the new email service.
- Enable `emailVerification` and `passwordReset` plugins.

---

### 2. Self-Service Password Change (Dashboard)

#### [NEW] [account-page](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/account/page.tsx)
- Create a new "Account Settings" page for logged-in users.
- Features:
  - **Change Password Form**: Requires current password + new password.
  - **Security Audit**: Logs the password change event.

#### [MODIFY] [nav-config.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/nav-config.ts)
- Add "Account" to the "Primary" navigation section for all users.

---

### 3. Password Reset Flow (Public)

#### [MODIFY] [login-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/login/login-form.tsx)
- Replace the "Ask an administrator" text with a functional "Forgot Password?" link.

#### [NEW] [forgot-password-page](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/login/forgot-password/page.tsx)
- A public page where users can enter their email.
- Action: Triggers the `better-auth` password reset flow, which sends an email via `email-service.ts`.

#### [NEW] [reset-password-page](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/login/reset-password/page.tsx)
- The page users land on when they click the link in their email.
- Features: Form to enter a new password using the secure token from the URL.

---

### 4. Enterprise Hardening

#### [MODIFY] [rate-limit.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/rate-limit.ts)
- Ensure "Forgot Password" requests are strictly rate-limited to 5 per hour per email to prevent email-bombing attacks.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure all new routes and actions are correctly integrated.

### Manual Verification
1. **Change Password**: Log in, go to /dashboard/account, change password, and verify.
2. **Forgot Password**:
    - Go to /login, click "Forgot Password", enter a valid user email.
    - Check the server logs (console) to see the generated reset URL.
    - Navigate to that URL and successfully set a new password.
