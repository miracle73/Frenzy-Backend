-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('deposit_pending_credit', 'withdrawal_debit', 'refund_debit');

-- CreateTable
CREATE TABLE "PaymentLedger" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "providerId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentLedger_providerId_idx" ON "PaymentLedger"("providerId");

-- CreateIndex
CREATE INDEX "PaymentLedger_paymentId_idx" ON "PaymentLedger"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLedger_paymentId_entryType_key" ON "PaymentLedger"("paymentId", "entryType");

-- AddForeignKey
ALTER TABLE "PaymentLedger" ADD CONSTRAINT "PaymentLedger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
