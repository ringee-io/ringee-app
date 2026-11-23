-- Historical attempts cannot safely be assigned a reservation from wall-clock
-- timestamps. New attempts persist their winning reservation; legacy held
-- assignments are adopted only after their ownership is checked under locks.
ALTER TABLE "CallAttempt" ADD COLUMN "sessionReservedAt" TIMESTAMP(3);
