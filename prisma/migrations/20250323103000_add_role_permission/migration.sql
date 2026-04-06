-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_unique" ON "RolePermission"("role", "key");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
