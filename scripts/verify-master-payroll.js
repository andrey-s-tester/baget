const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

function round2(n) {
  return Math.round(n * 100) / 100;
}

function masterSalary(pool, base, share, k) {
  return round2(Math.max(0, base) + round2(Math.max(0, pool) * (Math.max(0, Math.min(100, share)) / 100) * Math.max(0, k)));
}

async function main() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const pricing = await db.pricingConfig.findFirst({ select: { assemblyPrice: true } });
  const fallbackAssembly = pricing ? Number(pricing.assemblyPrice) : 750;

  const rules = await db.salaryMasterAlgorithm.findMany({
    select: {
      userId: true,
      baseAmount: true,
      masterSharePercent: true,
      complexityMultiplier: true,
      user: { select: { email: true, name: true, role: true } }
    }
  });

  const readyOrders = await db.order.findMany({
    where: { status: "ready", createdAt: { gte: from, lte: to } },
    select: {
      id: true,
      breakdownJson: true,
      tasks: { select: { employee: { select: { userId: true } } } }
    }
  });

  const poolByUser = {};
  for (const o of readyOrders) {
    const b = o.breakdownJson || {};
    const assembly = Number(b.assembly ?? b.assemblyPrice ?? fallbackAssembly) || 0;
    const glass = Number(b.glass ?? 0) || 0;
    const backing = Number(b.backing ?? 0) || 0;
    const pool = round2(assembly + glass + backing);
    if (pool <= 0) continue;
    const assigned = Array.from(
      new Set((o.tasks || []).map((t) => t.employee && t.employee.userId).filter(Boolean))
    );
    if (assigned.length === 0) continue;
    const per = pool / assigned.length;
    for (const uid of assigned) poolByUser[uid] = (poolByUser[uid] || 0) + per;
  }

  const rows = rules
    .map((r) => {
      const pool = round2(poolByUser[r.userId] || 0);
      return {
        userId: r.userId,
        email: r.user.email,
        name: r.user.name,
        role: r.user.role,
        base: Number(r.baseAmount),
        share: Number(r.masterSharePercent),
        k: Number(r.complexityMultiplier),
        pool,
        salary: masterSalary(pool, Number(r.baseAmount), Number(r.masterSharePercent), Number(r.complexityMultiplier))
      };
    })
    .filter((r) => r.pool > 0 || r.salary > 0)
    .sort((a, b) => b.salary - a.salary);

  const withGlass = readyOrders.filter((o) => Number((o.breakdownJson || {}).glass || 0) > 0).length;
  const withBacking = readyOrders.filter((o) => Number((o.breakdownJson || {}).backing || 0) > 0).length;

  console.log(
    JSON.stringify(
      {
        period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
        readyOrders: readyOrders.length,
        readyOrdersWithGlass: withGlass,
        readyOrdersWithBacking: withBacking,
        mastersCalculated: rows.length,
        rows: rows.slice(0, 10)
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

