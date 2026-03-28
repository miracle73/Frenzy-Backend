-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('unpaid', 'partial', 'paid', 'refunded');

-- CreateEnum
CREATE TYPE "BookingServiceType" AS ENUM ('salon', 'home_service');

-- CreateEnum
CREATE TYPE "BookingCancelledBy" AS ENUM ('customer', 'stylist', 'salon', 'admin');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salonId" TEXT,
    "stylistId" TEXT,
    "providerType" "ProviderType" NOT NULL,
    "serviceType" "BookingServiceType" NOT NULL,
    "services" JSONB NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "totalDuration" INTEGER NOT NULL,
    "transportFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "location" JSONB,
    "customerPhone" TEXT,
    "preferredDate" TIMESTAMP(3) NOT NULL,
    "preferredTime" TEXT NOT NULL,
    "actualDate" TIMESTAMP(3),
    "actualTime" TEXT,
    "notes" TEXT,
    "styleImageUrl" TEXT,
    "isGroupBooking" BOOLEAN NOT NULL DEFAULT false,
    "groupBookingId" TEXT,
    "personName" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'unpaid',
    "paymentMethod" TEXT,
    "cancellationReason" TEXT,
    "cancelledBy" "BookingCancelledBy",
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rating" JSONB,
    "stylistNotes" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_customerId_status_idx" ON "Booking"("customerId", "status");

-- CreateIndex
CREATE INDEX "Booking_stylistId_preferredDate_idx" ON "Booking"("stylistId", "preferredDate");

-- CreateIndex
CREATE INDEX "Booking_salonId_preferredDate_idx" ON "Booking"("salonId", "preferredDate");

-- CreateIndex
CREATE INDEX "Booking_status_preferredDate_idx" ON "Booking"("status", "preferredDate");

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_groupBookingId_idx" ON "Booking"("groupBookingId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_stylistId_fkey" FOREIGN KEY ("stylistId") REFERENCES "Stylist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
