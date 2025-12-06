import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { User, UserRole, Session } from "./shared/types.mts";

// Initial admin emails - these users will automatically receive admin role upon registration
const INITIAL_ADMIN_EMAILS: string[] = [
  "cremildojosephmagimoto@gmail.com",
];

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
  role?: UserRole;
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
    const data: RegisterData = await req.json();

    if (!data.name || !data.email || !data.phone || !data.password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (data.password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const usersStore = getStore("users");
    const sessionsStore = getStore("sessions");

    const normalizedEmail = data.email.toLowerCase().trim();
    const existingUser = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Este email já está registado" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password);

    // Check if email is in initial admin list, otherwise default to 'cliente'
    const isInitialAdmin = INITIAL_ADMIN_EMAILS.some(
      adminEmail => adminEmail.toLowerCase().trim() === normalizedEmail
    );
    const userRole: UserRole = isInitialAdmin ? 'administrador' : 'cliente';

    // User is verified immediately without OTP
    const user: User = {
      id: userId,
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone.trim(),
      passwordHash,
      verified: true,
      role: userRole,
      createdAt: new Date().toISOString(),
    };

    await usersStore.setJSON(`user:${normalizedEmail}`, user);

    // Create session automatically - user is logged in after registration
    const sessionToken = generateSessionToken();
    const session: Session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    await sessionsStore.setJSON(`session:${sessionToken}`, session);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta criada com sucesso!",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        sessionToken,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during registration:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar o registo",
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
  path: "/api/auth/register",
};
