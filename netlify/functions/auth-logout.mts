import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const sessionToken = authHeader?.replace("Bearer ", "");

    if (sessionToken) {
      const sessionsStore = getStore("sessions");
      await sessionsStore.delete(`session:${sessionToken}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Logout efectuado com sucesso",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during logout:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar o logout",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/auth/logout",
};
