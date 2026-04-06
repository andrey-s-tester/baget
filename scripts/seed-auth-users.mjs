import { PrismaClient, UserRole } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  /** Если true — при upsert обновлять и passwordHash (иначе пароли, заданные вручную, сохраняются после повторного seed) */
  const forcePassword =
    process.env.AUTH_SEED_FORCE_PASSWORD === "1" ||
    process.env.AUTH_SEED_FORCE_PASSWORD === "true";
  const basePassword = process.env.AUTH_SEED_PASSWORD || "admin123";
  /** Отдельный владелец для восстановления после потери БД / пользователей */
  const recoveryPassword =
    process.env.AUTH_RECOVERY_PASSWORD || "RecoverYanak2026!";
  const users = [
    { email: "owner@yanak.local", role: UserRole.owner, name: "Owner" },
    {
      email: "recover@yanak.local",
      role: UserRole.owner,
      name: "Восстановление доступа",
      passwordOverride: recoveryPassword
    },
    { email: "admin@yanak.local", role: UserRole.admin, name: "Admin" },
    { email: "manager@yanak.local", role: UserRole.manager, name: "Manager" },
    { email: "worker@yanak.local", role: UserRole.worker, name: "Worker" }
  ];

  for (const user of users) {
    const pwd = user.passwordOverride ?? basePassword;
    const hash = hashPassword(pwd);
    const row = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: true,
        passwordHash: hash
      },
      update: {
        role: user.role,
        name: user.name,
        isActive: true,
        ...(forcePassword
          ? { passwordHash: hash }
          : {})
      },
      select: { id: true }
    });
    await prisma.employee.upsert({
      where: { userId: row.id },
      create: { userId: row.id },
      update: {}
    });
  }

  console.log("Seeded auth users:");
  console.log(
    users
      .map((u) => `- ${u.email} (${u.role})${u.passwordOverride ? " [свой пароль восстановления]" : ""}`)
      .join("\n")
  );
  const pwdNote = forcePassword
    ? " (AUTH_SEED_FORCE_PASSWORD=1 — пароли обновлены)"
    : " (существующие пароли не менялись; задать AUTH_SEED_FORCE_PASSWORD=1 чтобы принудительно)";
  console.log(`Общий пароль (кроме recover): ${basePassword}${pwdNote}`);
  console.log(`Пароль recover@yanak.local: ${recoveryPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
