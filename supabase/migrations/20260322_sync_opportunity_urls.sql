-- ─── Sync opportunity URLs and active status from default-opportunities.ts ───
-- This migration updates all account_opportunities rows to match the current
-- canonical URL and is_active values from default-opportunities.ts.
-- Matches on (name, program, stage) which has a unique constraint.
-- Run this once after deploying the updated default-opportunities.ts.

-- ── Program A ─────────────────────────────────────────────────────────────────

-- Experian Boost
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.experian.com/credit/score-boost/',
    apply_url      = 'https://www.experian.com/credit/score-boost/',
    is_active      = true
WHERE name = 'Experian Boost' AND program = 'program_a';

-- Self Credit Builder Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.self.inc',
    apply_url      = 'https://www.self.inc',
    is_active      = true
WHERE name = 'Self Credit Builder Account' AND program = 'program_a';

-- Secured Discover it® Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.discover.com/credit-cards/secured-credit-card/',
    apply_url      = 'https://www.discover.com/credit-cards/secured-credit-card/',
    is_active      = true
WHERE name = 'Secured Discover it® Card' AND program = 'program_a';

-- Chase Ink Business Unlimited®
UPDATE public.account_opportunities
SET learn_more_url = 'https://creditcards.chase.com/business-credit-cards/ink/unlimited',
    apply_url      = 'https://creditcards.chase.com/business-credit-cards/ink/unlimited',
    is_active      = true
WHERE name = 'Chase Ink Business Unlimited®' AND program = 'program_a';

-- Chase Ink Business Cash®
UPDATE public.account_opportunities
SET learn_more_url = 'https://creditcards.chase.com/business-credit-cards/ink/cash',
    apply_url      = 'https://creditcards.chase.com/business-credit-cards/ink/cash',
    is_active      = true
WHERE name = 'Chase Ink Business Cash®' AND program = 'program_a';

-- U.S. Bank Business Triple Cash Rewards Visa®
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.usbank.com/business-banking/business-credit-cards/business-triple-cash-back-credit-card.html',
    apply_url      = 'https://www.usbank.com/business-banking/business-credit-cards/business-triple-cash-back-credit-card.html',
    is_active      = true
WHERE name = 'U.S. Bank Business Triple Cash Rewards Visa®' AND program = 'program_a';

-- Bank of America Business Advantage Unlimited Cash
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.bankofamerica.com/smallbusiness/credit-cards/products/unlimited-cash-rewards-business-credit-card/',
    apply_url      = 'https://www.bankofamerica.com/smallbusiness/credit-cards/products/unlimited-cash-rewards-business-credit-card/',
    is_active      = true
WHERE name = 'Bank of America Business Advantage Unlimited Cash' AND program = 'program_a';

-- Capital One Spark Cash Plus
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/',
    apply_url      = 'https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/',
    is_active      = true
WHERE name = 'Capital One Spark Cash Plus' AND program = 'program_a';

-- Wells Fargo Signify Business Cash Card (Active - correct URL)
UPDATE public.account_opportunities
SET learn_more_url = 'https://creditcards.wellsfargo.com/business-credit-cards/signify-business-cash-card/',
    apply_url      = 'https://apply.wellsfargo.com/getting_started?product_code=BD&subproduct_code=BCMC',
    is_active      = true
WHERE name = 'Wells Fargo Signify Business Cash Card' AND program = 'program_a';

-- PNC Visa Business Credit Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.pnc.com/en/small-business/borrowing/business-credit-cards.html',
    apply_url      = 'https://lending.pnc.com/bcnr',
    is_active      = true
WHERE name = 'PNC Visa Business Credit Card' AND program = 'program_a';

-- Chase Ink Business Preferred®
UPDATE public.account_opportunities
SET learn_more_url = 'https://creditcards.chase.com/business-credit-cards/ink/preferred',
    apply_url      = 'https://creditcards.chase.com/business-credit-cards/ink/preferred',
    is_active      = true
WHERE name = 'Chase Ink Business Preferred®' AND program = 'program_a';

-- American Express Blue Business Cash™
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-cash-credit-card/',
    apply_url      = 'https://www.americanexpress.com/en-us/campaigns/small-business/credit-cards/blue-business-cash/explore-now/',
    is_active      = true
WHERE name = 'American Express Blue Business Cash™' AND program = 'program_a';

-- American Express Blue Business Plus®
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-plus-credit-card/',
    apply_url      = 'https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-plus-credit-card/',
    is_active      = true
WHERE name = 'American Express Blue Business Plus®' AND program = 'program_a';

-- Wells Fargo Business Platinum Credit Card (DISCONTINUED)
UPDATE public.account_opportunities
SET learn_more_url = 'https://creditcards.wellsfargo.com',
    apply_url      = NULL,
    is_active      = false
WHERE name = 'Wells Fargo Business Platinum Credit Card' AND program = 'program_a';

-- Nav Business Credit Monitoring (Program A)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.nav.com',
    apply_url      = 'https://www.nav.com/pricing/',
    is_active      = true
WHERE name = 'Nav Business Credit Monitoring' AND program = 'program_a';

-- ── Program B — Foundation ────────────────────────────────────────────────────

-- Dun & Bradstreet D-U-N-S Registration
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.dnb.com/duns-number.html',
    apply_url      = 'https://www.dnb.com/en-us/smb/duns/get-a-duns.html',
    is_active      = true
WHERE name = 'Dun & Bradstreet D-U-N-S Registration' AND program = 'program_b';

-- Experian Business Credit Profile
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.experian.com/small-business/business-credit-report.jsp',
    apply_url      = 'https://www.experian.com/small-business/establish-business-credit',
    is_active      = true
WHERE name = 'Experian Business Credit Profile' AND program = 'program_b';

-- Equifax Small Business Credit Monitor
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.equifax.com/business/products/',
    apply_url      = 'https://www.equifax.com/business/products/',
    is_active      = true
WHERE name = 'Equifax Small Business Credit Monitor' AND program = 'program_b';

-- eCredable Business Lift
UPDATE public.account_opportunities
SET learn_more_url = 'https://ecredable.com/products/ecredable-business-lift',
    apply_url      = 'https://ecredable.com/products/ecredable-business-lift',
    is_active      = true
WHERE name = 'eCredable Business Lift' AND program = 'program_b';

-- ── Program B — Store Credit ──────────────────────────────────────────────────

-- Uline Net 30 Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.uline.com',
    apply_url      = 'https://www.uline.com',
    is_active      = true
WHERE name = 'Uline Net 30 Account' AND program = 'program_b';

-- Quill.com Net 30 Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.quill.com',
    apply_url      = 'https://www.quill.com',
    is_active      = true
WHERE name = 'Quill.com Net 30 Account' AND program = 'program_b';

-- Grainger Net 30 Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.grainger.com',
    apply_url      = 'https://www.grainger.com/content/small-business-center',
    is_active      = true
WHERE name = 'Grainger Net 30 Account' AND program = 'program_b';

-- Amazon Business Prime (REMOVED — does not report)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Amazon Business Prime — Net 30' AND program = 'program_b';

-- Summa Office Supplies (DISABLED — site unreachable)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Summa Office Supplies Net 30' AND program = 'program_b';

-- Crown Office Supplies Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.crownofficesupplies.com',
    apply_url      = 'https://crownofficesupplies.com/net30-application/',
    is_active      = true
WHERE name = 'Crown Office Supplies Net 30' AND program = 'program_b';

-- Pilot Flying J Business Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.pilotflyingj.com',
    apply_url      = 'https://www.pilotflyingj.com',
    is_active      = true
WHERE name = 'Pilot Flying J Business Account' AND program = 'program_b';

-- The CEO Creative Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://theceocreative.com',
    apply_url      = 'https://theceocreative.com/business-net-30-account/',
    is_active      = true
WHERE name = 'The CEO Creative Net 30' AND program = 'program_b';

-- Shirtsy Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://shirtsy.com',
    apply_url      = 'https://shirtsy.com',
    is_active      = true
WHERE name = 'Shirtsy Net 30' AND program = 'program_b';

-- Wise Business Account (REMOVED)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Wise Business Account' AND program = 'program_b';

-- Zoro Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.zoro.com',
    apply_url      = 'https://www.zoro.com/sign-in/register/business/',
    is_active      = true
WHERE name = 'Zoro Net 30' AND program = 'program_b';

-- DigiKey Business Account (REMOVED)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'DigiKey Business Account' AND program = 'program_b';

-- CDW Business Credit Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.cdw.com',
    apply_url      = 'https://www.cdw.com/content/cdw/en/services/financing.html',
    is_active      = true
WHERE name = 'CDW Business Credit Account' AND program = 'program_b';

-- Office Depot Business Account (fixed URL — old .do URL was broken)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.officedepot.com',
    apply_url      = 'https://www.officedepot.com/l/business-solutions/business-credit',
    is_active      = true
WHERE name = 'Office Depot Business Account' AND program = 'program_b';

-- Staples Business Credit Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.staples.com',
    apply_url      = 'https://www.staples.com/sbd/cre/marketing/business_account/apply.html',
    is_active      = true
WHERE name = 'Staples Business Credit Account' AND program = 'program_b';

-- Lowe's Business Credit
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.lowes.com/l/Credit/business-credit-center',
    apply_url      = 'https://www.lowes.com/l/Credit/business-credit-center',
    is_active      = true
WHERE name = 'Lowe''s Business Credit' AND program = 'program_b';

-- Home Depot Commercial Account (Net-30) — FIXED URL
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.homedepot.com/c/credit-center',
    apply_url      = 'https://www.homedepotcredit.com/business/commercial-account',
    is_active      = true
WHERE name = 'Home Depot Commercial Account (Net-30)' AND program = 'program_b';

-- Home Depot Commercial Revolving Charge — FIXED URL
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.homedepot.com/c/credit-center',
    apply_url      = 'https://www.homedepotcredit.com/business/commercial-revolving-charge',
    is_active      = true
WHERE name = 'Home Depot Commercial Revolving Charge' AND program = 'program_b';

-- Home Depot Project Loan — FIXED URL
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.homedepot.com/c/credit-center',
    apply_url      = 'https://www.homedepotcredit.com/business/project-loan',
    is_active      = true
WHERE name = 'Home Depot Project Loan' AND program = 'program_b';

-- SupplyWorks (Home Depot Pro) Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.supplyworks.com',
    apply_url      = 'https://www.supplyworks.com',
    is_active      = true
WHERE name = 'SupplyWorks (Home Depot Pro) Net 30' AND program = 'program_b';

-- NAMYNOT Net 30
UPDATE public.account_opportunities
SET learn_more_url = 'https://namynot.com/net-30/',
    apply_url      = 'https://namynot.com/net-30/business-credit-application/',
    is_active      = true
WHERE name = 'NAMYNOT Net 30' AND program = 'program_b';

-- Wise Business Plans Net 30 (different from Wise Business Account)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.wisebusinessplans.com',
    apply_url      = 'https://www.wisebusinessplans.com',
    is_active      = true
WHERE name = 'Wise Business Plans Net 30' AND program = 'program_b';

-- Ohana Office Products (DISABLED — site unreachable)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Ohana Office Products Net 30' AND program = 'program_b';

-- The Red Spectrum (DISABLED — product pages 404)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'The Red Spectrum Net 30' AND program = 'program_b';

-- Ferguson Commercial Credit (NEEDS MANUAL REVIEW)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Ferguson Commercial Credit Account' AND program = 'program_b';

-- ABC Supply (NEEDS MANUAL REVIEW)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'ABC Supply Commercial Account' AND program = 'program_b';

-- 84 Lumber (NEEDS MANUAL REVIEW)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = '84 Lumber Commercial Credit' AND program = 'program_b';

-- Menards (NEEDS MANUAL REVIEW)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Menards BIG Card / Business Account' AND program = 'program_b';

-- Tiger Direct (DISCONTINUED)
UPDATE public.account_opportunities
SET learn_more_url = NULL,
    apply_url      = NULL,
    is_active      = false
WHERE name = 'Tiger Direct Business Account' AND program = 'program_b';

-- ── Program B — Fleet & Gas ───────────────────────────────────────────────────

-- WEX Fleet Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.wexinc.com/solutions/fleet-cards/',
    apply_url      = 'https://www.wexinc.com/solutions/fleet-cards/',
    is_active      = true
WHERE name = 'WEX Fleet Card' AND program = 'program_b';

-- earnify™fleet Fuel Card (BP/Amoco)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.bp.com/en_us/united-states/home/products-and-services/earnifyfleet.html',
    apply_url      = 'https://apply.wexinc.com/SelfRegister?pgm=earnifyfleet',
    is_active      = true
WHERE name = 'earnify™fleet Fuel Card (BP/Amoco)' AND program = 'program_b';

-- Shell Fleet Solutions Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.businessfleetsolutions.com',
    apply_url      = 'https://www.businessfleetsolutions.com',
    is_active      = true
WHERE name = 'Shell Fleet Solutions Card' AND program = 'program_b';

-- EFS (Electronic Funds Source) Fleet Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.wexinc.com/solutions/fleet-cards/transportation/',
    apply_url      = 'https://www.wexinc.com/solutions/fleet-cards/transportation/',
    is_active      = true
WHERE name = 'EFS (Electronic Funds Source) Fleet Card' AND program = 'program_b';

-- ── Program B — Equipment Financing ──────────────────────────────────────────

-- United Rentals Business Account
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.unitedrentals.com',
    apply_url      = 'https://www.unitedrentals.com/en/accounts/credit-application',
    is_active      = true
WHERE name = 'United Rentals Business Account' AND program = 'program_b';

-- ── Program B — Cash & Revolving ─────────────────────────────────────────────

-- BILL Spend & Expense
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.bill.com/product/spend-and-expense',
    apply_url      = 'https://www.bill.com/product/spend-and-expense',
    is_active      = true
WHERE name = 'BILL Spend & Expense (formerly Divvy)' AND program = 'program_b';

-- Costco Business Credit Card (REMOVED — personal bureaus only)
UPDATE public.account_opportunities
SET apply_url = NULL,
    is_active = false
WHERE name = 'Costco Business Credit Card' AND program = 'program_b';

-- Dell Business Credit
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.dell.com/en-us/lp/dell-business-credit',
    apply_url      = 'https://www.dell.com/en-us/lp/dell-business-credit',
    is_active      = true
WHERE name = 'Dell Business Credit' AND program = 'program_b';

-- Navy Federal Business Solutions Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.navyfederal.org/loans-cards/credit-cards/business.html',
    apply_url      = 'https://www.navyfederal.org/loans-cards/credit-cards/business.html',
    is_active      = true
WHERE name = 'Navy Federal Business Solutions Card' AND program = 'program_b';

-- Capital on Tap Business Credit Card
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.capitalontap.com',
    apply_url      = 'https://www.capitalontap.com/en/',
    is_active      = true
WHERE name = 'Capital on Tap Business Credit Card' AND program = 'program_b';

-- ── Program C ─────────────────────────────────────────────────────────────────

-- Nav Business Credit Monitoring (Premium)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.nav.com',
    apply_url      = 'https://www.nav.com/pricing/',
    is_active      = true
WHERE name = 'Nav Business Credit Monitoring (Premium)' AND program = 'program_c';

-- CreditSafe Business Monitor
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.creditsafe.com/us/',
    apply_url      = 'https://www.creditsafe.com/us/en/solutions/myc.html',
    is_active      = true
WHERE name = 'CreditSafe Business Monitor' AND program = 'program_c';

-- Kabbage (American Express Business Blueprint)
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.americanexpress.com/en-us/business/blueprint/',
    apply_url      = 'https://www.americanexpress.com/en-us/business/blueprint/',
    is_active      = true
WHERE name = 'Kabbage (American Express Business Blueprint)' AND program = 'program_c';

-- Bluevine Business Line of Credit
UPDATE public.account_opportunities
SET learn_more_url = 'https://www.bluevine.com',
    apply_url      = 'https://www.bluevine.com',
    is_active      = true
WHERE name = 'Bluevine Business Line of Credit' AND program = 'program_c';

-- Fundbox Line of Credit
UPDATE public.account_opportunities
SET learn_more_url = 'https://fundbox.com',
    apply_url      = 'https://fundbox.com',
    is_active      = true
WHERE name = 'Fundbox Line of Credit' AND program = 'program_c';
