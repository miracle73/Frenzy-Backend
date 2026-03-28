-- CreateTable
CREATE TABLE "ServiceDiscount" (
    "id" TEXT NOT NULL,
    "serviceKeyword" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDiscount_serviceKeyword_key" ON "ServiceDiscount"("serviceKeyword");
