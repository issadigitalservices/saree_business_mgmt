# SareeDesk — Firebase starter

## Included
- Firebase Email/Password sign-in
- Admin and staff profile access using `users/{uid}`
- Dashboard, Add Item, Inventory, Sales, Reports, View Sales and OPEX
- INR currency formatting
- Firestore transaction for stock deduction on a sale
- Firestore rules in `firestore.rules`

## First setup
1. Firebase Authentication → Email/Password must be enabled.
2. Firestore Database → Rules: publish the supplied `firestore.rules`.
3. Ensure the admin document exists at `users/ADMIN_UID` with `role: "admin"` and `active: true`.
4. Create each staff login at Firebase Authentication → Users → Add user. Copy its UID.
5. Sign in as admin → Staff → enter staff UID and email to activate it.
6. Open the folder in VS Code and use Live Server. Do not open `index.html` directly from File Explorer.
7. Deploy to GitHub Pages after local testing.

## Notes
- Firestore collections are created automatically when the first record is added.
- Product image upload, multi-product invoices, printable receipts, returns, tax/GST and date-filtered reports are not included in this starter yet.
- Staff permissions are broad in this starter (product/sale create and update; expense create only). Tighten field-level validation and test with a separate staff account before real business use.
- Do not add Firebase service-account private keys to this frontend project. The web config is designed for client-side Firebase SDK use.
