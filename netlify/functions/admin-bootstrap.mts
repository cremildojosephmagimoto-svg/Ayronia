import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { User, UserRole } from "./shared/types.mts";

// Define initial admin emails - these users will be granted admin access
const INITIAL_ADMIN_EMAILS: string[] = [
  "cremildojosephmagimoto@gmail.com",
];

export default async (req: Request, context: Context) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const usersStore = getStore("users");
    const results: Array<{ email: string; status: string; message: string }> = [];

    for (const adminEmail of INITIAL_ADMIN_EMAILS) {
      const normalizedEmail = adminEmail.toLowerCase().trim();
      const user: User | null = await usersStore.get(`user:${normalizedEmail}`, { type: "json" });

      if (!user) {
        results.push({
          email: normalizedEmail,
          status: "not_found",
          message: "Utilizador não encontrado. Por favor, registre-se primeiro.",
        });
        continue;
      }

      if (user.role === "administrador") {
        results.push({
          email: normalizedEmail,
          status: "already_admin",
          message: "Utilizador já possui acesso de administrador.",
        });
        continue;
      }

      // Update the user role to administrator
      user.role = "administrador" as UserRole;
      await usersStore.setJSON(`user:${normalizedEmail}`, user);

      results.push({
        email: normalizedEmail,
        status: "success",
        message: "Acesso de administrador concedido com sucesso.",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Processo de bootstrap concluído",
        results,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error in admin bootstrap:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar a solicitação",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/admin/bootstrap",
};
