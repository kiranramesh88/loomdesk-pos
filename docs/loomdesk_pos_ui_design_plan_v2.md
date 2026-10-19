# LoomDesk POS — Frontend UI/UX Design Plan

**Purpose:** A React-focused, high-quality interface plan for the textile and retail POS interview assignment. This document is the frontend source of truth for implementation and review.

**Design principle:** Make frequent work feel effortless. Keep screens visually quiet, use clear hierarchy, show only the information needed for the current decision, and make every state understandable. A cashier should not need to “learn the software” to complete a sale; an owner should be able to understand the store's performance at a glance.

## 1. Frontend experience goals

1. **Low cognitive load:** avoid dense dashboards, excessive card nesting, decorative charts, and competing primary actions.
2. **Fast repeated tasks:** keep search, item selection, quantity controls, bill totals, and payment actions consistently placed.
3. **Trustworthy information:** figures need labels, date ranges, and clear definitions. A return, stock adjustment, or payment should have a visible status and traceable reference.
4. **Progressive disclosure:** show a concise list first; reveal full details in a focused detail page, side panel, or modal.
5. **Consistent behaviour:** the same statuses, form controls, confirmation patterns, and spacing rules should be shared across modules.
6. **Accessibility:** keyboard focus, readable contrast, labels, error text, and usable touch targets are first-class requirements, not polish added at the end.
7. **Mobile is a complete admin experience:** use a dedicated mobile route and mobile interaction patterns, not just a narrow desktop sidebar.

## 2. Visual direction

### Product character

Quietly premium, precise, calm, and operational. It should feel closer to a carefully designed business application than an e-commerce storefront or a flashy portfolio dashboard. Use restrained colour and use colour to communicate meaning: primary action, success, warning, or error.

### Suggested design tokens

| Token | Value / rule | Usage |
|---|---|---|
| App background | `#F5F7FB` | Large empty workspace areas |
| Surface | `#FFFFFF` | Panels, forms, tables, menus |
| Primary text | `#172337` | Titles, totals, body copy |
| Secondary text | `#778297` | Descriptions, metadata, hints |
| Borders | `#E7EBF2` | Quiet component separation |
| Primary action | `#3159D9` | Main CTA, selected navigation, key links |
| Success | `#168765` on pale green | Paid, active, completed states |
| Warning | Dark amber on pale amber | Low stock, attention required |
| Error | Deep red on pale red | Validation, failed actions, blocked state |
| Corner radius | 8–12 px | Controls, panels, buttons; keep consistent |
| Spacing | 4 px base scale | 4, 8, 12, 16, 20, 24, 32 px |
| Typography | Inter or system sans-serif | Predictable, legible work UI |
| Motion | 120–180 ms for small transitions | Hover, popover, drawer; respect reduced-motion |

Use one primary filled button per visual group. Secondary actions should be outlined or text buttons. Avoid using blue as a background on every card. Cards should be separated by whitespace and a light border, not heavy shadows. Keep headings medium-weight rather than oversized.

### Typography hierarchy

- Page title: 22–26 px desktop, 19–22 px mobile; semibold/bold.
- Panel title: 13–15 px; semibold.
- Body: 13–14 px where space allows.
- Table rows and dense metadata: 12–13 px, but do not shrink crucial text to make a crowded table fit.
- Hints / timestamps: 11–12 px with adequate contrast.
- Money totals: tabular numbers and consistent currency formatting (`₹48,620.00` where paise matter, or `₹48,620` for summaries).

## 3. Information architecture

### Admin desktop navigation

1. Overview
2. Products
3. Inventory
4. Transactions
5. Returns
6. Suppliers
7. Staff & access
8. Reports & insights
9. Settings (supporting area)

Keep the sidebar fixed on wide desktop. Active navigation gets a quiet tinted background and clear active indicator. Group major workflow areas separately from setup/support items if the menu grows.

### Billing portal navigation

The cashier should primarily live in one checkout workspace. Keep the top bar limited to store/register state, logged-in cashier, and a way to return to admin only when that role is allowed. Avoid exposing all admin destinations inside the normal cashier workflow.

### Mobile admin navigation

Direct application route: **`/admin/mobile/`**.

Use a dedicated mobile shell with a compact header, scrollable content, and bottom navigation for **Overview**, **Products**, **Bills**, and **More**. The More area provides Inventory, Returns, Suppliers, Staff & access, Reports, and Settings. Make all required admin functionality reachable from this layout. Detail and edit tasks can open full-screen pages or bottom sheets. On mobile, replace wide record tables with stacked rows/cards where possible.

## 4. Shared screen patterns

### Page header

A consistent header should include a page title, one short sentence describing the purpose, and at most one primary action plus a small number of contextual secondary actions. On a small viewport, actions can stack below the title. Do not place a long paragraph above the working area.

### Search and filters

Put search near the content it filters. Use clear placeholder examples such as “Search product name, SKU or barcode…”. Frequently used filters can be visible as chips/selects; advanced filters go in a popover or collapsible row. Show active filters and provide a visible “Clear” action.

### Data tables

Tables need clear headers, consistent row height, restrained separators, right-aligned numeric amounts, and a stable location for row actions. Use meaningful empty states and loading skeletons. For mobile, show the most important details in a card and put less-used metadata in the detail view. Never solve mobile overflow by making the entire page wider than the viewport.

### Forms

Use labels above controls, explain optional fields, and show validation next to the field that needs attention. Split complex forms into sensible visual sections. Preserve user-entered values after a validation failure. Clearly distinguish Cancel from Save. Confirm destructive or financially significant actions.

### Drawers and dialogs

Use a dialog for focused tasks such as add/edit a product, adjust stock, choose a variant, or confirm payment. Use a full detail route or side panel for richer records. On small screens, dialogs become full-screen sheets with a clearly reachable close/back action. Escape closes non-destructive dialogs; focus remains in the dialog and returns to the triggering control when closed.

### Feedback states

Every API-backed screen needs loading, empty, error, success, and permission-denied states. Keep toasts short; do not use a toast as the only place for an important validation error. On failed saves, preserve entered values and show a retry path. Disable repeated submission while a request is pending.

## 5. Feature-by-feature design specification

## 5.1 Admin overview

**User question:** “How is the store doing, and what needs my attention?”

### Layout

- Page heading with selected date range and a compact “Export” action.
- Four summary cards: Net sales today, Bills completed, Average bill value, and Low-stock variants. Optional small comparison text is only shown when comparison data exists.
- Main content row: a sales trend panel on the left and a payment-method breakdown on the right.
- Lower row: recent transactions and items requiring stock attention.

### Interaction rules

- A date range selector updates all date-dependent KPIs and charts together.
- Clicking a low-stock item opens its inventory record.
- Clicking a recent invoice opens the transaction details.
- Clicking a KPI may open the associated filtered report, but the card must not imply a more precise definition than the underlying query supports.

### Visual rules

- Use one primary trend line, faint gridlines, and restrained labels. No 3D charts, excessive gradients, or unnecessary animation.
- Always display the date range and a clear metric label.
- Use status colours only where a status is actionable.

### Data states

- First-use empty state explains that the dashboard will populate after the first sale.
- Loading state uses skeletons with the same shape as the final layout.
- If one report call fails, preserve the rest of the dashboard and show a local retry state for that panel.

## 5.2 Product catalogue

**User question:** “Can I find and maintain a product quickly?”

### List view

- Header: “Products” and “Add product”.
- Search by name, SKU, or barcode; filters for category, availability, and stock state.
- Table columns: Product, SKU, Category, Price, Stock, Status, Actions.
- Product cell contains a thumbnail/neutral placeholder, product name, and a small secondary detail.
- Stock state uses text as well as colour: In stock, Low stock, Out of stock.

### Add/edit flow

The product form should be grouped into Product information, Pricing & tax, Variants, and Inventory. For this textile use case, size and colour should be modelled as stock-tracked variants, not only as one free-text description. Each variant row should show size, colour, SKU/barcode, selling price (if it can differ), and stock quantity. Use a clear “Add variant” action rather than creating an enormous form by default.

### Form behaviour

- Validate required name, SKU, price and configured tax information.
- Detect duplicate SKUs and barcodes on the server and show a useful message.
- Use a confirm dialog before archive/deactivation.
- Avoid allowing edits to change historical receipt data; sold lines retain a snapshot of the price, name/SKU and tax details at the time of sale.

### Detail view

Provide a product summary, active variants, stock levels, recent stock movements, and edit action. Keep cost price and margin data restricted to appropriate roles.

## 5.3 Inventory

**User question:** “What stock do we have, and why did it change?”

### Layout

- Summary: tracked variants, low-stock count, out-of-stock count.
- Search and filters by category, low stock, out of stock, and stock movement type.
- Table/card rows: variant, SKU, on-hand quantity, reorder level, last movement, status.
- “Adjust stock” action launches a focused form.

### Adjustment form

Ask for the exact variant, adjustment type (add, remove, set counted quantity), quantity, and reason. Show current quantity and resulting quantity before confirmation. Require a reason for stock removal or correction. Reject negative final stock unless an explicitly designed business rule permits it.

### History

A stock-movement detail should show movement type, quantity delta, linked sale/return/purchase reference if one exists, actor, timestamp, and reason. Production data changes should create a stock movement; a direct inline edit of stock is not sufficient auditability.

## 5.4 Transactions

**User question:** “Find an invoice and understand what happened.”

### List view

- Search by invoice ID or customer.
- Filters: date range, payment method, cashier, and status.
- Columns: Invoice, Date/time, Customer, Cashier, Payment method, Total, Status, Actions.
- Amounts are right-aligned; status uses consistent badges.

### Transaction detail

Use a readable invoice-like layout rather than another dense table. Show invoice number, status, date/time, cashier, customer, line items, quantities, discounts, tax breakdown, total, payment records, and linked returns. Actions can include print/reprint and view associated return. Do not offer “Edit completed bill” as a normal action.

### Safety states

Void/cancel operations should require a reason, permission check and explicit confirmation. The UI should explain if a payment is recorded manually, not gateway-verified.

## 5.5 Returns and exchanges

**User question:** “Can I process this return safely and explain its effect?”

### Return creation flow

1. Search or scan the original invoice.
2. Show eligible line items and quantities, including quantities already returned.
3. Choose item(s) and return quantity.
4. Choose reason and disposition: back to sellable stock, damaged, or inspection hold.
5. Show calculated refund and refund method, then review before confirming.
6. Present a return reference and links to the original invoice.

### Guardrails

- Maximum return quantity is calculated from sold quantity less previously accepted returns.
- Refund amount is calculated from the original transaction values, not today's catalogue price.
- Restocking happens only when the selected disposition allows it.
- The original sale stays immutable; a distinct return record and refund/payment record are created.

### List view

Show return reference, source invoice, customer, reason, quantity, refund amount, stock disposition, status, date and actions. Make pending/review-required cases visually distinct without alarming colour on every row.

## 5.6 Suppliers

**User question:** “Who supplies us, and what do we owe them?”

### List view

- Supplier name, category, contact, recorded balance due, status and actions.
- Search by supplier name or contact; status/category filters.
- Clearly label the figure as a recorded balance if it is calculated from purchases and supplier-payment entries.

### Supplier profile

Contact information at the top, followed by tabs or sections for Activity, Purchases/receipts, Payments and Statement. Show a running balance with references and dates. If purchase ordering is outside the initial scope, do not show fake “Order management” functionality; label it as a future capability only in documentation.

### Form behaviour

Supplier contact form must not directly edit a calculated outstanding balance. Financial changes should be represented by purchase/credit/payment entries, not by typing over a total.

## 5.7 Staff and access

**User question:** “Who can do what, and who performed the action?”

### List view

Name, login/email, role, account status, last activity (if reliably available), and actions. Filters should distinguish active and inactive users.

### Role experience

- **Admin:** management pages and permitted sensitive actions.
- **Cashier:** billing workflow and only their allowed transaction actions.
- **Senior cashier (optional):** restricted approvals such as discounts or selected returns, if implemented end-to-end.

Avoid adding dozens of configurable permissions unless the backend enforces them. Every hidden UI option must have a matching API permission check. Account deactivation should not delete historical sales or audit records.

### Add/edit flow

Capture identity, login, role and status. Use an invite/setup flow or a secure credential reset mechanism in production. Never display or store a readable existing password in the interface.

## 5.8 Ledger and reports

**User question:** “What happened financially over this period?”

### Report library

A simple list/grid of report types: Sales summary, Sales by product, Sales by staff, Payment methods, Returns & refunds, Inventory valuation, Low-stock report, Supplier statement, and Tax summary where implemented.

### Report workspace

- Date range and appropriate filters near the top.
- A small row of metric summaries.
- A chart only when it explains a trend.
- A data table with sortable columns and export action.
- Label exclusions, status treatment, and metric definitions where ambiguity is possible.

### Financial consistency

- “Gross sales”, “discounts”, “returns/refunds”, and “net sales” need documented definitions.
- Do not count an unconfirmed payment as collected revenue.
- Use original transaction values for historical reports.
- Call this an operational ledger unless a proper double-entry ledger is actually implemented.
- All numbers must come from real API/database results, not front-end constants.

## 5.9 Billing / checkout portal

**User question:** “Can I sell the correct item with the fewest steps, without making a mistake?”

### Desktop layout

A focused two-column workspace:

- **Left / wider catalog area:** search and barcode field, category chips, product grid/list, variant selection.
- **Right / stable bill panel:** selected customer or walk-in label, line items, quantity controls, discount action, subtotal, tax, total, and Continue to payment button.

Keep the total and checkout CTA visible when the bill is long. Do not make the cashier hunt for the total at the bottom of a long page. Product cards should be restrained and informative: product name, price and availability, not giant decorative images.

### Checkout steps

1. **Find:** search by product name, SKU, or barcode.
2. **Choose:** select size/colour or variant; show available stock.
3. **Build bill:** quantity can be incremented/decremented inline; remove uses a distinct action and undo if appropriate.
4. **Review:** make discounts, tax and grand total explicit. Do not bury financial changes in a hidden menu.
5. **Take payment:** show the due amount prominently, then supported payment methods and amount received/change when relevant.
6. **Success:** show invoice number, payment method, total, Print receipt and New sale actions.

### Important interaction decisions

- Empty cart has a helpful empty state and no enabled checkout button.
- Search results have a no-match state and a way to clear the query.
- Out-of-stock items are clearly marked and cannot be added.
- Variant and stock limits are validated before adding and again on server checkout.
- Keyboard support: focus search shortcut, Enter to select a result where predictable, Escape to close dialogs, and visible focus rings.
- Avoid unnecessary page navigation during a single bill.

### Receipt print UI

Design a clean thermal receipt preview with store details, invoice number, date/time, cashier, line items, quantity/price, discount, tax breakdown, payment information and total. Use a dedicated print stylesheet so the UI chrome is not printed. Provide reprint from transaction details.

### Payment honesty

If the app only records a manually confirmed cash/UPI/card payment, label that behaviour accurately. A real UPI/card gateway integration needs a verified provider response; an “Order successful” animation is not proof of payment.

## 5.10 Mobile Admin Portal

**Mandatory route:** `/admin/mobile/`.

The route should render a first-class responsive admin experience, using the same backend and permissions as desktop. The demo preview inside the provided HTML file is a visual prototype; the production React app should use proper application routes rather than relying on an overlay preview.

### Screen model

- Compact brand/header and notification affordance.
- Overview screen with two-column KPI cards, recent bills, and low-stock alerts.
- Bottom navigation: Overview, Products, Bills, More.
- More menu: Inventory, Returns, Suppliers, Staff & access, Reports, Settings.
- Forms open as full-screen sheets or mobile-friendly pages.
- List rows use card-like hierarchy: primary label, useful metadata, right-aligned amount/status/action.

### Mobile quality rules

- 360 px wide viewport must work without horizontal page overflow.
- Table columns should become compact cards rather than tiny text.
- Controls should have a comfortable touch area (aim for approximately 44 px high for frequent actions).
- Keep important actions visible without requiring precise tapping near the phone edges.
- All required sections must be reachable; the More menu cannot be a dead-end placeholder.
- Test the direct URL, browser refresh, back navigation, create/edit forms, details and error states on the deployed site.

## 6. React component system

Create shared components early so the visual quality remains consistent as page count grows.

### Application shell

- `AdminLayout`
- `AdminSidebar`
- `AdminTopbar`
- `PageHeader`
- `MobileAdminLayout`
- `MobileBottomNavigation`
- `BillingLayout`

### Shared UI primitives

- `Button` (primary, secondary, ghost, danger, loading)
- `IconButton` (with accessible label)
- `Input`, `SearchInput`, `Select`, `DateRangePicker`
- `Badge` / `StatusBadge`
- `DataTable` with empty/loading/error state slots
- `SummaryCard`
- `Panel`
- `Dialog` / `Drawer` / `BottomSheet`
- `ConfirmActionDialog`
- `EmptyState`, `ErrorState`, `Skeleton`
- `ToastRegion` / inline field error
- `MoneyValue`, `DateTimeValue`
- `Pagination` (if API results are paginated)

### Feature components

- Products: `ProductTable`, `ProductForm`, `VariantEditor`, `StockStatus`, `ProductDetail`
- Inventory: `InventoryList`, `StockAdjustmentForm`, `StockMovementList`
- Sales: `TransactionTable`, `TransactionDetail`, `ReceiptPreview`
- Returns: `ReturnWizard`, `EligibleReturnLine`, `RefundSummary`, `ReturnDetail`
- Suppliers: `SupplierTable`, `SupplierForm`, `SupplierStatement`
- Staff: `StaffTable`, `StaffForm`, `RoleBadge`
- Reports: `ReportFilters`, `KpiRow`, `SalesTrendChart`, `ReportTable`, `ExportAction`
- Billing: `CatalogSearch`, `CategoryChips`, `ProductGrid`, `VariantPicker`, `BillPanel`, `QuantityControl`, `PaymentDialog`, `CheckoutSuccess`

Do not build one giant component with inline JSX for every screen. Each feature page should compose shared primitives with a small number of focused feature components.

## 7. State management and data flow

Recommended stack for a frontend-focused submission: React + TypeScript + Vite, React Router, Tailwind CSS, and a consistent component library such as shadcn/ui. Use TanStack Query for API-backed server state. Use local component state for dialogs, temporary filters, variant selection, and other ephemeral interactions. A small context/store can hold the current bill if needed.

### Rules

- URL/query parameters should represent shareable search filters/date range where useful.
- The API is the source of truth for product availability, prices, roles, saved sales and report values.
- Invalidate or update relevant queries after successful mutations: a sale updates transaction lists and inventory; a return updates return lists, relevant stock and reports; a staff-role update refreshes current permissions/session state appropriately.
- Use optimistic updates only for low-risk actions and roll them back on failure. Do not pretend a financial action succeeded before the server confirms it.
- Keep loading and error states near the affected component. Avoid replacing the entire interface with a blank screen for a failed card request.

## 8. Accessibility and interaction details

- All controls have accessible names; icons-only buttons have tooltips/labels.
- Use semantic buttons and inputs rather than clickable `div` elements for actions.
- Keyboard users can see focus at all times.
- Do not convey statuses by colour alone; include text such as “Low stock”.
- Maintain readable contrast for muted text and badges.
- Dialogs trap focus, close sensibly, and restore focus to the trigger.
- Inputs use correct types and autocomplete where appropriate.
- Charts have a textual summary or data table alternative.
- Respect `prefers-reduced-motion` and do not animate nonessential dashboard figures continuously.

## 9. Frontend test and review checklist

### Shared shell

- Sidebar active state matches the route.
- Primary buttons, secondary buttons, tooltips and dialogs have consistent behaviour.
- Search, filters and empty/error states are usable via keyboard.

### Billing

- Search by name/SKU; verify no-results state and reset.
- Choose size and colour; add item; adjust quantity and remove it.
- Out-of-stock or over-quantity item cannot be added.
- Bill subtotal, discount, tax and total are clearly displayed.
- Payment dialog shows the due amount and prevents insufficient cash from completing.
- Successful completion shows invoice reference and print flow.
- Refreshing or double-clicking must not create duplicate real payments in production; use backend idempotency as well as front-end pending states.

### Admin

- Products can be searched and edited; validation is inline and understandable.
- Inventory shows low-stock states and adjustment review.
- Transactions open correct details and receipt print layout.
- Returns refer to the original invoice and show amount/disposition before submit.
- Supplier statement keeps financial entries auditable.
- Role restrictions are enforced on the API as well as the UI.
- Reports show metric definitions, selected dates and loading/error states.

### Mobile

- `/admin/mobile/` works by direct URL and after reload.
- Every required admin section is reachable from navigation.
- No horizontal page overflow at 360 × 800 and 390 × 844 CSS pixels.
- Forms, list rows, details and confirmations are usable by touch and keyboard.
- A slow/failing request leaves a useful retry state rather than a blank screen.

### Visual polish pass

- Alignments and spacing are consistent between pages.
- No page has multiple competing filled primary buttons in the same visual group.
- Avoid inconsistent border radii, random shadows and arbitrary colour usage.
- All labels and values fit without clipping at common viewport widths.
- Charts and KPIs communicate useful data rather than merely decorating empty space.
- Test with realistic long product names, large amounts, no transactions, and a high number of rows.

## 10. Implementation order for the frontend

1. Establish design tokens, typography, buttons, form controls, badges, cards, dialogs, tables, empty/loading/error states.
2. Build Admin and Billing application shells, routing, login-state boundaries, and responsive breakpoints.
3. Build the Billing screen early and connect it to the agreed product/search/cart/payment API contract.
4. Build Products and Inventory, establishing the visual patterns used by all other lists and forms.
5. Build Transactions and Returns around invoice-level details and clear financial summaries.
6. Build Suppliers and Staff & access.
7. Build Overview and Reports with real API values and clearly defined metrics.
8. Implement the complete `/admin/mobile/` experience with mobile-specific navigation and adaptive layouts.
9. Run interaction/accessibility/responsive checks, then a final visual consistency pass.

## 11. How to use the companion HTML demo

The companion `reference/loomdesk-ui-reference.html` is a **standalone visual/interaction prototype** for reviewing the proposed direction. It includes admin screens, a cashier checkout, sample product data, basic UI interactions, and a simulated mobile-admin preview. It is useful for discussion of layout, hierarchy, interaction shape and visual tone.

It is not a production POS, React codebase, persistent database or payment integration. Data lives in browser memory and resets on reload. Monetary/tax behaviour is illustrative; the demo uses a visible 5% tax assumption in checkout. Do not present the demo as proof of production-grade accounting or payment processing. Implement and test authoritative rules in the backend before release.
