/*
  Warnings:

  - You are about to drop the column `styleImageUrl` on the `Booking` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "styleImageUrl",
ADD COLUMN     "styleImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
