-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('requested', 'initiated', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'payout_release_credit';

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'requested',
    "transferCode" TEXT,
    "recipientCode" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_providerId_idx" ON "WithdrawalRequest"("providerId");
