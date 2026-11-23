ALTER TABLE "AgentSession" ADD COLUMN "eventStreamId" UUID;
-- Legacy callbacks never stored their source attempt/revision. Keep them
-- unkeyed rather than infer an identity from mutable scheduling fields.
ALTER TABLE "CallbackTask" ADD COLUMN "creationKey" TEXT;
CREATE UNIQUE INDEX "CallbackTask_creationKey_key" ON "CallbackTask"("creationKey");
