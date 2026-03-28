-- CreateEnum
CREATE TYPE "PaymentCheckoutStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "PaymentCheckout" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "groupBookingId" TEXT,
    "bookingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientCheckoutId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentCheckoutStatus" NOT NULL DEFAULT 'pending',
    "paystackReference" TEXT,
    "paystackAuthorizationUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCheckout_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "checkoutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckout_paystackReference_key" ON "PaymentCheckout"("paystackReference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckout_customerId_clientCheckoutId_key" ON "PaymentCheckout"("customerId", "clientCheckoutId");

-- CreateIndex
CREATE INDEX "PaymentCheckout_groupBookingId_idx" ON "PaymentCheckout"("groupBookingId");

-- CreateIndex
CREATE INDEX "PaymentCheckout_customerId_status_idx" ON "PaymentCheckout"("customerId", "status");

-- CreateIndex
CREATE INDEX "Payment_checkoutId_idx" ON "Payment"("checkoutId");

-- AddForeignKey
ALTER TABLE "PaymentCheckout" ADD CONSTRAINT "PaymentCheckout_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PaymentCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
