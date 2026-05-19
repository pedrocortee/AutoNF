import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { plans } from "../drizzle/schema.ts";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function seedPlans() {
  try {
    // Create connection
    const connection = await mysql.createConnection(DATABASE_URL);
    const db = drizzle(connection);

    console.log("Seeding plans...");

    // Define plans
    const plansToSeed = [
      {
        name: "Starter",
        description: "Perfeito para começar com até 50 notas fiscais por mês",
        pricePerMonth: 25000, // R$ 250.00 em centavos
        maxInvoicesPerMonth: 50,
        features: JSON.stringify([
          "Até 50 notas fiscais/mês",
          "Suporte por email",
          "Dashboard básico",
          "Histórico de 3 meses",
        ]),
        displayOrder: 1,
      },
      {
        name: "Professional",
        description: "Para empresas em crescimento com até 200 notas fiscais por mês",
        pricePerMonth: 40000, // R$ 400.00 em centavos
        maxInvoicesPerMonth: 200,
        features: JSON.stringify([
          "Até 200 notas fiscais/mês",
          "Suporte prioritário",
          "Relatórios avançados",
          "Histórico ilimitado",
          "Webhooks para integrações",
          "API REST",
        ]),
        displayOrder: 2,
      },
      {
        name: "Enterprise",
        description: "Para grandes empresas com necessidades ilimitadas",
        pricePerMonth: 99900, // R$ 999.00 em centavos
        maxInvoicesPerMonth: 999999,
        features: JSON.stringify([
          "Notas fiscais ilimitadas",
          "Suporte 24/7 dedicado",
          "Relatórios customizados",
          "Histórico ilimitado",
          "Webhooks avançados",
          "API REST completa",
          "Multi-tenant",
          "SSO/LDAP",
          "SLA garantido",
        ]),
        displayOrder: 3,
      },
    ];

    // Delete existing plans
    await db.delete(plans);

    // Insert plans
    for (const plan of plansToSeed) {
      await db.insert(plans).values(plan);
      console.log(`✓ Created plan: ${plan.name}`);
    }

    console.log("\n✅ Plans seeded successfully!");
    await connection.end();
  } catch (error) {
    console.error("Error seeding plans:", error);
    process.exit(1);
  }
}

seedPlans();
