import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const groups = await prisma.frameProfile.groupBy({
    by: ["catalogSource"],
    _count: true
  });
  console.log("По источникам:", groups);
  const optom = await prisma.frameProfile.count({ where: { catalogSource: "baget_optom_ua" } });
  console.log("baget_optom_ua всего:", optom);
} finally {
  await prisma.$disconnect();
}
