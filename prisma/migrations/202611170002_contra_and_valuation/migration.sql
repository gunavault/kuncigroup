-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "is_contra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_lots" ADD COLUMN     "value" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE chart_of_accounts DROP CONSTRAINT normal_balance_category;
ALTER TABLE chart_of_accounts ADD CONSTRAINT normal_balance_category CHECK (
 (category IN ('ASET','BEBAN') AND ((NOT is_contra AND normal_balance='DEBIT') OR (is_contra AND normal_balance='KREDIT'))) OR
 (category IN ('KEWAJIBAN','EKUITAS','PENDAPATAN') AND ((NOT is_contra AND normal_balance='KREDIT') OR (is_contra AND normal_balance='DEBIT'))));
ALTER TABLE stock_lots ADD CONSTRAINT stock_value_nonnegative CHECK(value>=0);
