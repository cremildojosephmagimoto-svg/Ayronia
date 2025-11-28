import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface LoginData {
  email: string;
  password: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  verified: boolean;
  createdAt: string;
}

interface Session {
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data: LoginData = await req.json();

    if (!data.email || !data.password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const usersStore = getStore("users");
    const sessionsStore = getStore("sessions");

    const normalizedEmail = data.email.toLowerCase().trim();
    const user: User | null = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Email ou senha incorretos" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!user.verified) {
      return new Response(
        JSON.stringify({
          error: "Por favor, verifique o seu email antes de fazer login",
          needsVerification: true,
          email: normalizedEmail,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const passwordHash = await hashPassword(data.password);
    if (passwordHash !== user.passwordHash) {
      return new Response(
        JSON.stringify({ error: "Email ou senha incorretos" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const sessionToken = generateSessionToken();
    const session: Session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    await sessionsStore.setJSON(`session:${sessionToken}`, session);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login efectuado com sucesso!",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        sessionToken,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during login:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar o login",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/auth/login",
};
