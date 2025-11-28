import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface Session {
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const sessionToken = authHeader?.replace("Bearer ", "");

    if (!sessionToken) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          error: "Sessão não encontrada",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const sessionsStore = getStore("sessions");
    const session: Session | null = await sessionsStore.get(
      `session:${sessionToken}`,
      { type: "json" }
    );

    if (!session) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          error: "Sessão inválida",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (Date.now() > session.expiresAt) {
      await sessionsStore.delete(`session:${sessionToken}`);
      return new Response(
        JSON.stringify({
          authenticated: false,
          error: "Sessão expirada",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          id: session.userId,
          name: session.name,
          email: session.email,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error checking auth status:", error);
    return new Response(
      JSON.stringify({
        authenticated: false,
        error: "Erro ao verificar autenticação",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/auth/status",
};
