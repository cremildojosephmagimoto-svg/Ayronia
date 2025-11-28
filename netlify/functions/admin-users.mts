import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { User, Session, UserRole } from "./shared/types.mts";

// Helper function to check if user is admin or supervisor
async function checkAdminAccess(req: Request): Promise<{ authorized: boolean; session?: Session; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  const sessionToken = authHeader?.replace("Bearer ", "");

  if (!sessionToken) {
    return { authorized: false, error: "Sessão não encontrada" };
  }

  const sessionsStore = getStore("sessions");
  const session: Session | null = await sessionsStore.get(`session:${sessionToken}`, { type: "json" });

  if (!session) {
    return { authorized: false, error: "Sessão inválida" };
  }

  if (Date.now() > session.expiresAt) {
    await sessionsStore.delete(`session:${sessionToken}`);
    return { authorized: false, error: "Sessão expirada" };
  }

  // Only admins can manage users
  if (session.role !== 'administrador') {
    return { authorized: false, error: "Acesso não autorizado. Apenas administradores podem gerir utilizadores." };
  }

  return { authorized: true, session };
}

export default async (req: Request, context: Context) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Check admin access
  const accessCheck = await checkAdminAccess(req);
  if (!accessCheck.authorized) {
    return new Response(
      JSON.stringify({ error: accessCheck.error }),
      { status: 403, headers: corsHeaders }
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const userEmail = pathParts.length > 3 ? decodeURIComponent(pathParts[3]) : null;

  try {
    // GET /api/admin/users - List all users
    if (req.method === "GET" && !userEmail) {
      const usersStore = getStore("users");

      // Get all users from the store
      // Note: Netlify Blobs doesn't have a native list function, so we'll use list with prefix
      const usersList = await usersStore.list({ prefix: "user:" });

      const users: Array<Omit<User, 'passwordHash'>> = [];

      for (const item of usersList.blobs) {
        const user: User | null = await usersStore.get(item.key, { type: "json" });
        if (user) {
          // Don't expose password hash
          const { passwordHash, ...safeUser } = user;
          users.push(safeUser);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          users,
          total: users.length,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // GET /api/admin/users/:email - Get a specific user
    if (req.method === "GET" && userEmail) {
      const usersStore = getStore("users");
      const normalizedEmail = userEmail.toLowerCase().trim();
      const user: User | null = await usersStore.get(`user:${normalizedEmail}`, { type: "json" });

      if (!user) {
        return new Response(
          JSON.stringify({ error: "Utilizador não encontrado" }),
          { status: 404, headers: corsHeaders }
        );
      }

      const { passwordHash, ...safeUser } = user;
      return new Response(
        JSON.stringify({ success: true, user: safeUser }),
        { status: 200, headers: corsHeaders }
      );
    }

    // PUT /api/admin/users/:email - Update user role
    if (req.method === "PUT" && userEmail) {
      const data = await req.json();
      const { role } = data as { role?: UserRole };

      if (!role) {
        return new Response(
          JSON.stringify({ error: "O campo 'role' é obrigatório" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const validRoles: UserRole[] = ['cliente', 'administrador', 'supervisor', 'entregador'];
      if (!validRoles.includes(role)) {
        return new Response(
          JSON.stringify({ error: "Role inválido. Valores permitidos: cliente, administrador, supervisor, entregador" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const usersStore = getStore("users");
      const normalizedEmail = userEmail.toLowerCase().trim();
      const user: User | null = await usersStore.get(`user:${normalizedEmail}`, { type: "json" });

      if (!user) {
        return new Response(
          JSON.stringify({ error: "Utilizador não encontrado" }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Update the user role
      user.role = role;
      await usersStore.setJSON(`user:${normalizedEmail}`, user);

      const { passwordHash, ...safeUser } = user;
      return new Response(
        JSON.stringify({
          success: true,
          message: `Role do utilizador atualizado para '${role}'`,
          user: safeUser,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error in admin users endpoint:", error);
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
  path: ["/api/admin/users", "/api/admin/users/*"],
};
