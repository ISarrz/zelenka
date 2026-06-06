-- Quiet hours (and the morning digest that depended on them) were removed from
-- the product. Drop the two columns that backed them.

ALTER TABLE "User" DROP COLUMN "quietHoursStartMin";
ALTER TABLE "User" DROP COLUMN "quietHoursEndMin";
