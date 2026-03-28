-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('customer', 'salon', 'stylist');

-- CreateEnum
CREATE TYPE "StylistStatus" AS ENUM ('active', 'inactive', 'suspended', 'pending_approval');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "temp" JSONB,
    "otp" TEXT,
    "accountType" "AccountType" NOT NULL,
    "accessToken" TEXT,
    "verifyStatus" BOOLEAN NOT NULL DEFAULT false,
    "profileImgUrl" TEXT,
    "phoneNumber" TEXT,
    "referralCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "business_name" TEXT,
    "business_logo" TEXT,
    "business_banner" TEXT,
    "website_link" TEXT,
    "stylist_count" INTEGER NOT NULL DEFAULT 0,
    "full_address" TEXT,
    "state" TEXT,
    "city" TEXT,
    "area" TEXT,
    "about" TEXT,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "reminder_48h_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_96h_sent" BOOLEAN NOT NULL DEFAULT false,
    "services" JSONB,
    "openHours" JSONB,
    "business_gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bankDetails" JSONB,
    "wallet" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stylist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "bio" TEXT,
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience" JSONB,
    "portfolio" JSONB,
    "imageGallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannerImage" TEXT,
    "availability" JSONB,
    "pricing" JSONB,
    "location" JSONB,
    "ratings" JSONB,
    "reviews" JSONB,
    "earnings" JSONB,
    "status" "StylistStatus" NOT NULL DEFAULT 'pending_approval',
    "bankDetails" JSONB,
    "wallet" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stylist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_userId_key" ON "Salon"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_email_key" ON "Salon"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Stylist_userId_key" ON "Stylist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Stylist_email_key" ON "Stylist"("email");

-- CreateIndex
CREATE INDEX "Stylist_status_idx" ON "Stylist"("status");

-- AddForeignKey
ALTER TABLE "Salon" ADD CONSTRAINT "Salon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stylist" ADD CONSTRAINT "Stylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
