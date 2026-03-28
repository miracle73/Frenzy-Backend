-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('salon', 'stylist');

-- CreateEnum
CREATE TYPE "PaymentDepositStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentRemainingStatus" AS ENUM ('pending', 'authorized', 'captured', 'failed');

-- CreateEnum
CREATE TYPE "PaymentPayoutStatus" AS ENUM ('pending', 'released', 'withdrawn');

-- CreateEnum
CREATE TYPE "SubaccountStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "bookingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isGroupBooking" BOOLEAN NOT NULL DEFAULT false,
    "groupBookingId" TEXT,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL,
    "remainingAmount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "providerAmount" DOUBLE PRECISION NOT NULL,
    "depositStatus" "PaymentDepositStatus" NOT NULL DEFAULT 'pending',
    "remainingStatus" "PaymentRemainingStatus" NOT NULL DEFAULT 'pending',
    "payoutStatus" "PaymentPayoutStatus" NOT NULL DEFAULT 'pending',
    "paystackDepositRef" TEXT,
    "paystackRemainingRef" TEXT,
    "authorizationCode" TEXT,
    "subaccountCode" TEXT,
    "depositPaidAt" TIMESTAMP(3),
    "remainingCapturedAt" TIMESTAMP(3),
    "serviceCompletedAt" TIMESTAMP(3),
    "payoutReleasedAt" TIMESTAMP(3),
    "payoutWithdrawnAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subaccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" "ProviderType" NOT NULL,
    "paystackSubaccountCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "status" "SubaccountStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subaccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaystackWebhookEvent" (
    "id" TEXT NOT NULL,
    "paystackEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaystackWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paystackDepositRef_key" ON "Payment"("paystackDepositRef");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_providerId_idx" ON "Payment"("providerId");

-- CreateIndex
CREATE INDEX "Payment_paystackDepositRef_idx" ON "Payment"("paystackDepositRef");

-- CreateIndex
CREATE UNIQUE INDEX "Subaccount_userId_key" ON "Subaccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subaccount_paystackSubaccountCode_key" ON "Subaccount"("paystackSubaccountCode");

-- CreateIndex
CREATE INDEX "Subaccount_userId_idx" ON "Subaccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackWebhookEvent_paystackEventId_key" ON "PaystackWebhookEvent"("paystackEventId");
