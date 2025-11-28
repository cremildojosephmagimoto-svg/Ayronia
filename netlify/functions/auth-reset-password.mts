import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface ResetPasswordData {
  email: string;
  code: string;
  newPassword: string;
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

interface PasswordResetData {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
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

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data: ResetPasswordData = await req.json();

    if (!data.email || !data.code || !data.newPassword) {
      return new Response(
        JSON.stringify({ error: "Email, código e nova senha são obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (data.newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "A nova senha deve ter pelo menos 6 caracteres" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const usersStore = getStore("users");
    const resetStore = getStore("password-reset-codes");
    const sessionsStore = getStore("sessions");

    const normalizedEmail = data.email.toLowerCase().trim();

    // Get reset data
    const resetData: PasswordResetData | null = await resetStore.get(
      `reset:${normalizedEmail}`,
      { type: "json" }
    );

    if (!resetData) {
      return new Response(
        JSON.stringify({
          error: "Código de recuperação inválido ou expirado. Por favor, solicite um novo código.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check max attempts (5 attempts)
    if (resetData.attempts >= 5) {
      await resetStore.delete(`reset:${normalizedEmail}`);
      return new Response(
        JSON.stringify({
          error: "Número máximo de tentativas excedido. Por favor, solicite um novo código.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check expiration
    if (Date.now() > resetData.expiresAt) {
      await resetStore.delete(`reset:${normalizedEmail}`);
      return new Response(
        JSON.stringify({
          error: "Código expirado. Por favor, solicite um novo código.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify code
    if (resetData.code !== data.code) {
      // Increment attempts
      resetData.attempts += 1;
      await resetStore.setJSON(`reset:${normalizedEmail}`, resetData);

      const remainingAttempts = 5 - resetData.attempts;
      return new Response(
        JSON.stringify({
          error: `Código incorreto. ${remainingAttempts} tentativa(s) restante(s).`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get user
    const user: User | null = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Utilizador não encontrado" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update password
    const newPasswordHash = await hashPassword(data.newPassword);
    user.passwordHash = newPasswordHash;
    await usersStore.setJSON(`user:${normalizedEmail}`, user);

    // Delete reset code
    await resetStore.delete(`reset:${normalizedEmail}`);

    // Create new session
    const sessionToken = crypto.randomUUID();
    const session: Session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    await sessionsStore.setJSON(`session:${sessionToken}`, session);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Senha alterada com sucesso!",
        sessionToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error resetting password:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao redefinir a senha",
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
  path: "/api/auth/reset-password",
};
