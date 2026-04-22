export const PRESETS: Record<string, { label: string; description: string; yaml: string }> = {
  invoice: {
    label: 'Invoice',
    description: 'Supplier, customer, totals, tax, payment terms',
    yaml: `name: "Supplier invoice"
description: "Standard invoice extraction covering supplier, customer, line items, totals, and tax."
instructions: |
  - invoice_number should be the supplier's reference, not any internal PO number.
  - Currency codes use ISO 4217 (USD, AUD, GBP, EUR). If the currency is shown as a symbol only,
    infer from locale cues (e.g. "AUD" from ABN, address, or "GST" mention).
  - Strip currency symbols and thousand separators from numeric fields.

fields:
  - name: invoice_number
    type: string
    required: true
    description: "Supplier's invoice reference number."
  - name: invoice_date
    type: date
    required: true
  - name: due_date
    type: date
  - name: supplier_name
    type: string
    required: true
  - name: supplier_tax_id
    type: string
    description: "Supplier ABN, VAT number, or equivalent tax ID."
  - name: customer_name
    type: string
  - name: customer_address
    type: string
  - name: currency
    type: string
    description: "ISO 4217 currency code."
  - name: subtotal
    type: number
  - name: tax_amount
    type: number
  - name: total_amount
    type: number
    required: true
  - name: line_item_count
    type: integer
    description: "Number of line items on the invoice."
  - name: payment_terms
    type: string
    description: "Payment terms (e.g. 'Net 30', '7 days')."
`,
  },
  bank_statement: {
    label: 'Bank statement',
    description: 'Account details, period, balances, totals',
    yaml: `name: "Bank statement"
description: "Generic bank statement extraction: account details, period, balances, and transaction aggregates."
instructions: |
  - account_number_last4 only. Never capture the full account number.
  - Strip currency symbols and thousand separators from numeric fields.
  - If the statement covers a partial period or was re-issued, add a warning.

fields:
  - name: institution_name
    type: string
    required: true
  - name: account_holder_name
    type: string
    required: true
  - name: account_number_last4
    type: string
    description: "Last 4 digits of account number only."
  - name: account_type
    type: string
    description: "e.g. 'Everyday', 'Savings', 'Offset', 'Credit Card'."
  - name: statement_period_start
    type: date
    required: true
  - name: statement_period_end
    type: date
    required: true
  - name: opening_balance
    type: number
  - name: closing_balance
    type: number
    required: true
  - name: total_credits
    type: number
  - name: total_debits
    type: number
  - name: transaction_count
    type: integer
  - name: currency
    type: string
    description: "ISO 4217 currency code."
`,
  },
  business_directory: {
    label: 'Business directory',
    description: 'Business listing: name, contact, address, website',
    yaml: `name: "Business directory entry"
description: "Extract business listings from directory PDFs: trade shows, association member lists, yellow-page style catalogs."
instructions: |
  - If a PDF contains multiple business entries, extract the primary/featured one unless the user has batched per-entry.
  - Phone numbers: output in international format where country can be inferred (e.g. +61 3 9123 4567). Otherwise keep original.
  - website should be a full URL including scheme (https://).

fields:
  - name: business_name
    type: string
    required: true
  - name: business_type
    type: string
    description: "Industry or category label as listed in the directory."
  - name: contact_name
    type: string
  - name: phone
    type: string
  - name: email
    type: string
  - name: website
    type: string
  - name: street_address
    type: string
  - name: city
    type: string
    required: true
  - name: state
    type: string
  - name: postcode
    type: string
  - name: country
    type: string
  - name: description_blurb
    type: string
    description: "Short description or tagline as shown in the directory."
`,
  },
  mortgage_document: {
    label: 'AU mortgage document',
    description: 'Payslips, bank statements, tax returns, ATO notices',
    yaml: `name: "Australian mortgage application document"
description: >
  Unified extraction schema for mortgage broker document packs: payslips, bank statements,
  tax returns (ATO Notices of Assessment), and employment letters.
instructions: |
  - document_type: classify as one of payslip, bank_statement, tax_return, ato_notice, employment_letter, other.
  - All dollar amounts are Australian dollars. Strip "$" and thousand separators.
  - For bank statements, closing_balance = the final balance on the statement period.
  - For payslips, gross_income_ytd is year-to-date gross from the payslip summary area.
  - Employer and lender names keep original casing.
  - If a document is partially illegible (scan quality), lower _confidence and add a warning per affected field.

fields:
  - name: document_type
    type: string
    required: true
    enum: [payslip, bank_statement, tax_return, ato_notice, employment_letter, other]
  - name: client_name
    type: string
    required: true
  - name: document_date
    type: date
  - name: period_start
    type: date
  - name: period_end
    type: date
  - name: employer_name
    type: string
  - name: gross_income_period
    type: number
  - name: gross_income_ytd
    type: number
  - name: net_income_period
    type: number
  - name: tax_paid_period
    type: number
  - name: institution_name
    type: string
  - name: account_number_last4
    type: string
    description: "Last 4 digits only. Never capture the full number."
  - name: opening_balance
    type: number
  - name: closing_balance
    type: number
  - name: total_credits
    type: number
  - name: total_debits
    type: number
  - name: recurring_commitments
    type: array
    item_type: string
  - name: taxable_income
    type: number
  - name: tax_assessed
    type: number
  - name: refund_or_liability
    type: number
  - name: financial_year
    type: string
    description: "Financial year (e.g. '2024-25')."
`,
  },
};
