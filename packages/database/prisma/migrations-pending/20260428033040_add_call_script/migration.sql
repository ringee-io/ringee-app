-- CreateTable
CREATE TABLE "CallScript" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallScriptSection" (
    "id" UUID NOT NULL,
    "scriptId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallScriptSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallScript_userId_idx" ON "CallScript"("userId");

-- CreateIndex
CREATE INDEX "CallScript_organizationId_idx" ON "CallScript"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CallScript_userId_organizationId_key" ON "CallScript"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "CallScriptSection_scriptId_idx" ON "CallScriptSection"("scriptId");

-- CreateIndex
CREATE INDEX "CallScriptSection_scriptId_position_idx" ON "CallScriptSection"("scriptId", "position");

-- AddForeignKey
ALTER TABLE "CallScript" ADD CONSTRAINT "CallScript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallScript" ADD CONSTRAINT "CallScript_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallScriptSection" ADD CONSTRAINT "CallScriptSection_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "CallScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
